import os
from cryptography.fernet import Fernet
from dotenv import load_dotenv

load_dotenv()

class EncryptionService:
    def __init__(self):
        # Allow the user to set a key in .env, or generate one in memory if missing (though data will be lost on restart if missing)
        key_str = os.getenv("ENCRYPTION_KEY")
        if not key_str:
            print("WARNING: ENCRYPTION_KEY not found in environment. Generating a temporary key for this session.")
            self.key = Fernet.generate_key()
        else:
            self.key = key_str.encode('utf-8')
            
        try:
            self.fernet = Fernet(self.key)
        except Exception as e:
            print(f"Failed to initialize Fernet encryption. Check your ENCRYPTION_KEY format. Error: {e}")
            self.fernet = None

    def encrypt(self, plain_text: str) -> str:
        if not plain_text or not self.fernet:
            return plain_text
        return self.fernet.encrypt(plain_text.encode('utf-8')).decode('utf-8')

    def decrypt(self, cipher_text: str) -> str:
        if not cipher_text or not self.fernet:
            return cipher_text
        try:
            return self.fernet.decrypt(cipher_text.encode('utf-8')).decode('utf-8')
        except Exception as e:
            # If decryption fails (e.g. key changed or it wasn't encrypted), return original to avoid catastrophic failure
            print(f"WARNING: Decryption failed for a value, returning original. Error: {e}")
            return cipher_text

# Singleton instance for the app to use
encryption_service = EncryptionService()

# Helper utility to generate a new key string
def generate_new_key():
    return Fernet.generate_key().decode('utf-8')
