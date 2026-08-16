import os

from cryptography.fernet import Fernet

_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        key = os.environ.get("ENCRYPTION_KEY")
        if not key:
            raise RuntimeError("ENCRYPTION_KEY environment variable is not set")
        try:
            _fernet = Fernet(key.encode())
        except Exception as exc:
            raise RuntimeError(
                "ENCRYPTION_KEY is not a valid Fernet key (must be 32 url-safe base64-encoded bytes)"
            ) from exc
    return _fernet


def encrypt(plaintext: str) -> str:
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    return _get_fernet().decrypt(ciphertext.encode()).decode()
