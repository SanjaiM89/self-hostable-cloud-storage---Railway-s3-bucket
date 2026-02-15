import bcrypt
from datetime import datetime, timedelta
from typing import Optional
from jose import jwt
import os
from dotenv import load_dotenv

load_dotenv()

# Password Hashing - using bcrypt directly to avoid passlib compatibility issues
def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(
        plain_password.encode('utf-8'),
        hashed_password.encode('utf-8')
    )

def get_password_hash(password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')

# RSA Keys
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.backends import default_backend

PRIVATE_KEY_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "certs", "private.pem")
PUBLIC_KEY_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "certs", "public.pem")

def ensure_keys():
    if not os.path.exists(PRIVATE_KEY_PATH):
        os.makedirs(os.path.dirname(PRIVATE_KEY_PATH), exist_ok=True)
        print("Generating RSA Keys...")
        private_key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=2048,
            backend=default_backend()
        )
        pem_private = private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption()
        )
        with open(PRIVATE_KEY_PATH, "wb") as f:
            f.write(pem_private)

        public_key = private_key.public_key()
        pem_public = public_key.public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo
        )
        with open(PUBLIC_KEY_PATH, "wb") as f:
            f.write(pem_public)

ensure_keys()

def get_private_key():
    with open(PRIVATE_KEY_PATH, "rb") as f:
        return f.read()

def get_public_key():
    with open(PUBLIC_KEY_PATH, "rb") as f:
        return f.read()

ALGORITHM = "RS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 30))

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})

    encoded_jwt = jwt.encode(to_encode, get_private_key(), algorithm=ALGORITHM)
    return encoded_jwt

def decode_access_token(token: str):
    return jwt.decode(token, get_public_key(), algorithms=[ALGORITHM])
