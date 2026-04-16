"""
AES-256-GCM encryption for backup files.
Credentials are re-encrypted with a passphrase-derived key for portability.
"""
import base64
import json
import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

_KDF_ITERATIONS = 600_000
_SALT_BYTES = 16
_NONCE_BYTES = 12  # 96-bit nonce for AES-GCM


def generate_salt() -> bytes:
    return os.urandom(_SALT_BYTES)


def derive_key(passphrase: str, salt: bytes) -> bytes:
    """Derive a 32-byte AES key from a passphrase via PBKDF2-SHA256."""
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=_KDF_ITERATIONS,
    )
    return kdf.derive(passphrase.encode("utf-8"))


def encrypt_value(plaintext: str, key: bytes) -> str:
    """AES-256-GCM encrypt a string. Returns base64-encoded nonce+ciphertext."""
    if not plaintext:
        return plaintext
    nonce = os.urandom(_NONCE_BYTES)
    aesgcm = AESGCM(key)
    ct = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
    return base64.b64encode(nonce + ct).decode("utf-8")


def decrypt_value(token: str, key: bytes) -> str:
    """AES-256-GCM decrypt a base64-encoded nonce+ciphertext token."""
    if not token:
        return token
    raw = base64.b64decode(token)
    nonce = raw[:_NONCE_BYTES]
    ct = raw[_NONCE_BYTES:]
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(nonce, ct, None).decode("utf-8")


# Map of entity type → list of sensitive field names to encrypt/decrypt
SENSITIVE_FIELDS: dict[str, list[str]] = {
    "servers": ["password", "ssh_key"],
    "database_engines": ["password"],
    "project_servers": ["password", "ssh_key"],
    "project_databases": ["password"],
    "components": ["custom_fields"],
}


def encrypt_sensitive_fields(record: dict, sensitive_keys: list[str], key: bytes) -> dict:
    """Encrypt specified fields in a record dict for export."""
    result = dict(record)
    for k in sensitive_keys:
        val = result.get(k)
        if val is None:
            continue
        if k == "custom_fields" and isinstance(val, dict):
            result[k] = encrypt_value(json.dumps(val), key)
        elif isinstance(val, str):
            result[k] = encrypt_value(val, key)
    return result


def decrypt_sensitive_fields(record: dict, sensitive_keys: list[str], key: bytes) -> dict:
    """Decrypt specified fields in a record dict during import."""
    result = dict(record)
    for k in sensitive_keys:
        val = result.get(k)
        if val is None:
            continue
        if k == "custom_fields" and isinstance(val, str):
            result[k] = json.loads(decrypt_value(val, key))
        elif isinstance(val, str):
            result[k] = decrypt_value(val, key)
    return result
