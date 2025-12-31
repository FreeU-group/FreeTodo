"""基于 SQLAlchemy 的 UserPersona 仓库实现

提供用户画像的数据访问层，支持单例模式（只有一条记录）。
"""

import random
from datetime import datetime
from typing import Any

from sqlmodel import select

from lifetrace.repositories.interfaces import IUserPersonaRepository
from lifetrace.storage.database_base import DatabaseBase
from lifetrace.storage.models import UserPersona

# 中性英文名列表，用于生成默认昵称
NEUTRAL_NAMES = [
    "Ellis",
    "Kestrel",
    "Taylor",
    "Morgan",
    "Shay",
    "Riley",
    "Avery",
    "Ciel",
    "Sage",
    "Drew",
    "Blake",
    "Jamie",
    "Skyler",
    "Charlie",
    "Lochlan",
    "Dylan",
    "Cameron",
    "Hayden",
    "Finley",
    "Rowan",
]


def _generate_default_nickname() -> str:
    """生成随机默认昵称"""
    return random.choice(NEUTRAL_NAMES)


class SqlUserPersonaRepository(IUserPersonaRepository):
    """基于 SQLAlchemy 的 UserPersona 仓库实现"""

    def __init__(self, db_base: DatabaseBase):
        self._db_base = db_base

    def get(self) -> dict[str, Any] | None:
        """获取用户画像（不存在则返回 None）"""
        with self._db_base.SessionLocal() as session:
            stmt = select(UserPersona).where(UserPersona.id == 1)
            result = session.exec(stmt).first()
            if result:
                return {
                    "id": result.id,
                    "nickname": result.nickname,
                    "description": result.description,
                    "last_updated": result.last_updated,
                }
            return None

    def get_or_create(self) -> dict[str, Any]:
        """获取用户画像，不存在则自动创建默认记录"""
        with self._db_base.SessionLocal() as session:
            stmt = select(UserPersona).where(UserPersona.id == 1)
            result = session.exec(stmt).first()

            if result:
                return {
                    "id": result.id,
                    "nickname": result.nickname,
                    "description": result.description,
                    "last_updated": result.last_updated,
                }

            # 创建默认记录
            persona = UserPersona(
                id=1,
                nickname=_generate_default_nickname(),
                description=None,
                last_updated=datetime.now(),
            )
            session.add(persona)
            session.commit()
            session.refresh(persona)

            return {
                "id": persona.id,
                "nickname": persona.nickname,
                "description": persona.description,
                "last_updated": persona.last_updated,
            }

    def update(self, **kwargs) -> bool:
        """更新用户画像"""
        with self._db_base.SessionLocal() as session:
            stmt = select(UserPersona).where(UserPersona.id == 1)
            persona = session.exec(stmt).first()

            if not persona:
                # 如果不存在，先创建
                persona = UserPersona(
                    id=1,
                    nickname=kwargs.get("nickname", _generate_default_nickname()),
                    description=kwargs.get("description"),
                    last_updated=datetime.now(),
                )
                session.add(persona)
            else:
                # 更新现有记录
                if "nickname" in kwargs and kwargs["nickname"] is not None:
                    persona.nickname = kwargs["nickname"]
                if "description" in kwargs:
                    persona.description = kwargs["description"]
                persona.last_updated = datetime.now()

            session.commit()
            return True
