"""认证安全模块 — 密码哈希与 JWT Token 管理"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from jose import JWTError, jwt
from loguru import logger
import bcrypt as _bcrypt

from core.config import settings


def hash_password(password: str) -> str:
    return _bcrypt.hashpw(password.encode(), _bcrypt.gensalt()).decode()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return _bcrypt.checkpw(plain_password.encode(), hashed_password.encode())


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(UTC) + timedelta(minutes=settings.AUTH_ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "token_type": "access"})
    return jwt.encode(to_encode, settings.AUTH_SECRET_KEY, algorithm=settings.AUTH_ALGORITHM)


def create_refresh_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(UTC) + timedelta(days=settings.AUTH_REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "token_type": "refresh"})
    return jwt.encode(to_encode, settings.AUTH_SECRET_KEY, algorithm=settings.AUTH_ALGORITHM)


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(
            token, settings.AUTH_SECRET_KEY, algorithms=[settings.AUTH_ALGORITHM]
        )
    except JWTError:
        logger.debug("JWT decode failed")
        return None
