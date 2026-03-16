/**
 * Local encryption for sensitive fields stored in desktop SQLite.
 * Uses AES-256-GCM with a machine-derived key via PBKDF2.
 */
import * as crypto from 'crypto';
import * as os from 'os';
import { app } from 'electron';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const PBKDF2_ITERATIONS = 100_000;
const ENCRYPTED_PREFIX = '$ENC$';

let _derivedKey: Buffer | null = null;

/** Derive a deterministic encryption key from machine-specific attributes */
function getDerivedKey(): Buffer {
    if (_derivedKey) return _derivedKey;

    // Combine machine-specific values to create a unique seed per installation
    const userDataPath = app.getPath('userData');
    const hostname = os.hostname();
    const username = os.userInfo().username;
    const seed = `infra-manager:${userDataPath}:${hostname}:${username}`;

    // Static salt (acceptable since the seed is already machine-unique)
    const salt = Buffer.from('infra-manager-local-encryption-salt', 'utf-8');
    _derivedKey = crypto.pbkdf2Sync(seed, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
    return _derivedKey;
}

/** Encrypt a plaintext string. Returns prefixed ciphertext or null if input is null/undefined. */
export function encrypt(value: string | null | undefined): string | null {
    if (value === null || value === undefined) return null;
    const key = getDerivedKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
    const encrypted = Buffer.concat([cipher.update(value, 'utf-8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    // Format: $ENC$<iv_hex>:<tag_hex>:<ciphertext_hex>
    return `${ENCRYPTED_PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

/** Decrypt an encrypted string. Returns plaintext, or the original value if not encrypted. */
export function decrypt(value: string | null | undefined): string | null {
    if (value === null || value === undefined) return null;
    if (!value.startsWith(ENCRYPTED_PREFIX)) return value; // Not encrypted — return as-is (legacy data)
    try {
        const payload = value.slice(ENCRYPTED_PREFIX.length);
        const [ivHex, tagHex, ciphertextHex] = payload.split(':');
        const key = getDerivedKey();
        const iv = Buffer.from(ivHex, 'hex');
        const tag = Buffer.from(tagHex, 'hex');
        const ciphertext = Buffer.from(ciphertextHex, 'hex');
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf-8');
    } catch {
        // If decryption fails (e.g., key changed, corrupted data), return null rather than crash
        console.error('[Crypto] Failed to decrypt value — possible key mismatch');
        return null;
    }
}

/** Check whether a value is already encrypted */
export function isEncrypted(value: string | null | undefined): boolean {
    return typeof value === 'string' && value.startsWith(ENCRYPTED_PREFIX);
}
