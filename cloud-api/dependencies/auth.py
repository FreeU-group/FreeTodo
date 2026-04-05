"""认证依赖注入 — 从 Bearer Token 解析当前用户"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_session
from core.security import decode_token
from models.user import User, UserType

security = HTTPBearer()
SecurityDep = Annotated[HTTPAuthorizationCredentials, Depends(security)]
SessionDep = Annotated[AsyncSession, Depends(get_session)]


async def get_current_user(
    credentials: SecurityDep,
    session: SessionDep,
) -> User:
    token = credentials.credentials
    payload = decode_token(token)
    if payload is None:
        raise HTTPException(status_code=401, detail="无效的认证令牌")

    if payload.get("token_type", "access") != "access":
        raise HTTPException(status_code=401, detail="请使用 access_token 进行认证")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="令牌中缺少用户信息")

    user = await session.get(User, user_id)
    if user is None or user.is_deleted:
        raise HTTPException(status_code=401, detail="用户不存在")
    return user


UserDep = Annotated[User, Depends(get_current_user)]


async def verify_admin_user(user: UserDep) -> User:
    if user.user_type != UserType.ADMIN:
        raise HTTPException(status_code=403, detail="需要管理员权限")
    return user


AdminUserDep = Annotated[User, Depends(verify_admin_user)]
