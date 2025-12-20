"""基于 SQLAlchemy 的 Chat 仓库实现

复用现有的 ChatManager 逻辑，提供符合仓库接口的数据访问层。
"""

from typing import Any

from lifetrace.repositories.interfaces import IChatRepository
from lifetrace.storage.chat_manager import ChatManager
from lifetrace.storage.database_base import DatabaseBase


class SqlChatRepository(IChatRepository):
    """基于 SQLAlchemy 的 Chat 仓库实现"""

    def __init__(self, db_base: DatabaseBase):
        # 复用现有的 ChatManager 逻辑
        self._manager = ChatManager(db_base)

    def create_chat(
        self,
        session_id: str,
        chat_type: str = "event",
        title: str | None = None,
        context_id: int | None = None,
        metadata: str | None = None,
    ) -> dict[str, Any] | None:
        return self._manager.create_chat(
            session_id=session_id,
            chat_type=chat_type,
            title=title,
            context_id=context_id,
            metadata=metadata,
        )

    def get_chat_by_session_id(self, session_id: str) -> dict[str, Any] | None:
        return self._manager.get_chat_by_session_id(session_id)

    def list_chats(
        self,
        chat_type: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        return self._manager.list_chats(
            chat_type=chat_type,
            limit=limit,
            offset=offset,
        )

    def update_chat_title(self, session_id: str, title: str) -> bool:
        return self._manager.update_chat_title(session_id, title)

    def delete_chat(self, session_id: str) -> bool:
        return self._manager.delete_chat(session_id)

    def add_message(
        self,
        session_id: str,
        role: str,
        content: str,
        token_count: int | None = None,
        model: str | None = None,
        metadata: str | None = None,
    ) -> dict[str, Any] | None:
        return self._manager.add_message(
            session_id=session_id,
            role=role,
            content=content,
            token_count=token_count,
            model=model,
            metadata=metadata,
        )

    def get_messages(
        self,
        session_id: str,
        limit: int | None = None,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        return self._manager.get_messages(
            session_id=session_id,
            limit=limit,
            offset=offset,
        )

    def get_message_count(self, session_id: str) -> int:
        return self._manager.get_message_count(session_id)

    def get_chat_summaries(
        self,
        chat_type: str | None = None,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        return self._manager.get_chat_summaries(
            chat_type=chat_type,
            limit=limit,
        )

    def get_chat_context(self, session_id: str) -> str | None:
        return self._manager.get_chat_context(session_id)

    def update_chat_context(self, session_id: str, context: str) -> bool:
        return self._manager.update_chat_context(session_id, context)
