"""认证安全模块 — 密码哈希与 JWT Token 管理"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from jose import JWTError, jwt
from passlib.context import CryptContext

from util.logging_config import get_logger
from util.settings import settings

logger = get_logger()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def _get_secret_key() -> str:
    return str(settings.get("auth.secret_key", "freetodo-local-default-secret-key"))


def _get_algorithm() -> str:
    return str(settings.get("auth.algorithm", "HS256"))


def create_access_token(data: dict, *, is_local: bool = False) -> str:
    to_encode = data.copy()
    if is_local:
        expire_days = int(settings.get("auth.local_access_token_expire_days", 30))
        expire = datetime.now(UTC) + timedelta(days=expire_days)
    else:
        expire_minutes = int(settings.get("auth.access_token_expire_minutes", 60))
        expire = datetime.now(UTC) + timedelta(minutes=expire_minutes)
    to_encode.update(
        {
            "exp": expire,
            "auth_mode": "local" if is_local else "cloud",
            "token_type": "access",
        }
    )
    return jwt.encode(to_encode, _get_secret_key(), algorithm=_get_algorithm())


def create_refresh_token(data: dict, *, is_local: bool = False) -> str:
    to_encode = data.copy()
    if is_local:
        expire_days = int(settings.get("auth.local_refresh_token_expire_days", 365))
    else:
        expire_days = int(settings.get("auth.refresh_token_expire_days", 7))
    expire = datetime.now(UTC) + timedelta(days=expire_days)
    to_encode.update(
        {
            "exp": expire,
            "auth_mode": "local" if is_local else "cloud",
            "token_type": "refresh",
        }
    )
    return jwt.encode(to_encode, _get_secret_key(), algorithm=_get_algorithm())


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, _get_secret_key(), algorithms=[_get_algorithm()])
    except JWTError:
        logger.debug("JWT decode failed")
        return None
