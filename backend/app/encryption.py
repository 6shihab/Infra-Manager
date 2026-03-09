import os
import logging
from cryptography.fernet import Fernet
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

class EncryptionService:
    def __init__(self):
        key_str = os.getenv("ENCRYPTION_KEY")
        if not key_str:
            raise RuntimeError(
                "ENCRYPTION_KEY environment variable is not set. "
                "Generate one with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
            )
        self.key = key_str.encode('utf-8')
        self.fernet = Fernet(self.key)

    def encrypt(self, plain_text: str) -> str:
        if not plain_text:
            return plain_text
        return self.fernet.encrypt(plain_text.encode('utf-8')).decode('utf-8')

    def decrypt(self, cipher_text: str) -> str | None:
        if not cipher_text:
            return cipher_text
        try:
            return self.fernet.decrypt(cipher_text.encode('utf-8')).decode('utf-8')
        except Exception as e:
            logger.error("Decryption failed: %s", e)
            return None

# Singleton instance for the app to use
encryption_service = EncryptionService()

# Helper utility to generate a new key string
def generate_new_key():
    return Fernet.generate_key().decode('utf-8')
