"""认证依赖注入 — 从 Bearer Token 解析当前用户"""

from __future__ import annotations

from typing import TYPE_CHECKING, Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session

from core.dependencies import get_db_base
from core.security import decode_token
from storage.models import User, UserType
from util.logging_config import get_logger

if TYPE_CHECKING:
    from storage.database_base import DatabaseBase

logger = get_logger()

security = HTTPBearer()
SecurityDep = Annotated[HTTPAuthorizationCredentials, Depends(security)]


def _get_session(db_base: DatabaseBase = Depends(get_db_base)) -> Session:
    """获取数据库会话用于认证查询"""
    if db_base.engine is None:
        raise RuntimeError("Database engine is not initialized.")
    return Session(db_base.engine)


async def get_user(
    credentials: SecurityDep,
    db_base: DatabaseBase = Depends(get_db_base),
) -> User:
    """从 Bearer Token 中解析并返回当前登录用户"""
    from fastapi import HTTPException  # noqa: PLC0415

    token = credentials.credentials
    payload = decode_token(token)
    if payload is None:
        raise HTTPException(status_code=401, detail="无效的认证令牌")

    token_type = payload.get("token_type", "access")
    if token_type != "access":
        raise HTTPException(status_code=401, detail="请使用 access_token 进行认证")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="令牌中缺少用户信息")

    with Session(db_base.engine) as session:
        user = session.get(User, user_id)
        if user is None or user.is_deleted:
            raise HTTPException(status_code=401, detail="用户不存在")
        session.expunge(user)
        return user


UserDep = Annotated[User, Depends(get_user)]


async def verify_admin_user(user: UserDep) -> User:
    """验证当前用户是否为管理员"""
    from fastapi import HTTPException  # noqa: PLC0415

    if user.user_type != UserType.ADMIN:
        raise HTTPException(status_code=403, detail="需要管理员权限")
    return user


AdminUserDep = Annotated[User, Depends(verify_admin_user)]
