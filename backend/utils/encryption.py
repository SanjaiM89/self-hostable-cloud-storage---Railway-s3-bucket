from cryptography.fernet import Fernet
import base64
import hashlib
import os

# Get secret key from env or use a default
SECRET_KEY = os.getenv("SECRET_KEY", "supersecretauthkey")

# Fernet requires a 32-byte URL-safe base64-encoded key
def _get_fernet_key(secret: str) -> bytes:
    # Hash the secret to get 32 bytes
    key = hashlib.sha256(secret.encode()).digest()
    # Base64 encode it for Fernet
    return base64.urlsafe_b64encode(key)

_key = _get_fernet_key(SECRET_KEY)
_cipher = Fernet(_key)

def encrypt_id(file_id: int) -> str:
    """Encrypts an integer ID into a url-safe string."""
    # Convert int to bytes
    data = str(file_id).encode()
    return _cipher.encrypt(data).decode()

def decrypt_id(token: str) -> int:
    """Decrypts a token back to an integer ID."""
    try:
        data = _cipher.decrypt(token.encode())
        return int(data.decode())
    except Exception:
        return None
