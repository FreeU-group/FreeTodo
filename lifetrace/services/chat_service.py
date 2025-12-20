"""Chat 业务逻辑层

处理 Chat 相关的业务逻辑，包含会话管理和消息处理。
会话上下文存储在数据库中，不再使用内存存储。
"""

import json
import uuid
from datetime import datetime
from typing import Any

from lifetrace.repositories.interfaces import IChatRepository
from lifetrace.util.logging_config import get_logger

logger = get_logger()

# 会话上下文的最大消息数量
MAX_CONTEXT_LENGTH = 50


class ChatService:
    """Chat 业务逻辑层"""

    def __init__(self, repository: IChatRepository):
        self.repository = repository

    # ===== 会话 ID 生成 =====

    @staticmethod
    def generate_session_id() -> str:
        """生成新的会话ID"""
        return str(uuid.uuid4())

    # ===== 会话上下文管理（数据库存储） =====

    def create_new_session(self, session_id: str | None = None) -> str:
        """创建新的聊天会话

        Args:
            session_id: 可选的会话ID，如果不提供则自动生成

        Returns:
            会话ID
        """
        if not session_id:
            session_id = self.generate_session_id()

        # 确保会话在数据库中存在
        self.ensure_chat_exists(session_id, chat_type="general")

        # 初始化空上下文
        self.repository.update_chat_context(session_id, json.dumps([]))

        logger.info(f"创建新会话: {session_id}")
        return session_id

    def clear_session_context(self, session_id: str) -> bool:
        """清除会话上下文

        Args:
            session_id: 会话ID

        Returns:
            是否清除成功
        """
        result = self.repository.update_chat_context(session_id, json.dumps([]))
        if result:
            logger.info(f"清除会话上下文: {session_id}")
        return result

    def get_session_context(self, session_id: str) -> list[dict[str, Any]]:
        """获取会话上下文

        Args:
            session_id: 会话ID

        Returns:
            上下文消息列表
        """
        context_json = self.repository.get_chat_context(session_id)
        if context_json:
            try:
                return json.loads(context_json)
            except json.JSONDecodeError:
                logger.warning(f"会话上下文 JSON 解析失败: {session_id}")
                return []
        return []

    def add_to_session_context(self, session_id: str, role: str, content: str):
        """添加消息到会话上下文

        Args:
            session_id: 会话ID
            role: 消息角色（user, assistant, system）
            content: 消息内容
        """
        # 获取当前上下文
        context = self.get_session_context(session_id)

        # 添加新消息
        context.append(
            {
                "role": role,
                "content": content,
                "timestamp": datetime.now().isoformat(),
            }
        )

        # 限制上下文长度，避免数据过大
        if len(context) > MAX_CONTEXT_LENGTH:
            context = context[-MAX_CONTEXT_LENGTH:]

        # 保存到数据库
        self.repository.update_chat_context(session_id, json.dumps(context, ensure_ascii=False))

    # ===== 数据库会话管理 =====

    def create_chat(
        self,
        session_id: str,
        chat_type: str = "event",
        title: str | None = None,
        context_id: int | None = None,
        metadata: str | None = None,
    ) -> dict[str, Any] | None:
        """创建聊天会话（数据库）"""
        return self.repository.create_chat(
            session_id=session_id,
            chat_type=chat_type,
            title=title,
            context_id=context_id,
            metadata=metadata,
        )

    def get_chat_by_session_id(self, session_id: str) -> dict[str, Any] | None:
        """根据 session_id 获取聊天会话"""
        return self.repository.get_chat_by_session_id(session_id)

    def ensure_chat_exists(
        self,
        session_id: str,
        chat_type: str = "event",
        title: str | None = None,
        context_id: int | None = None,
    ) -> dict[str, Any] | None:
        """确保聊天会话存在，如果不存在则创建"""
        chat = self.repository.get_chat_by_session_id(session_id)
        if not chat:
            chat = self.repository.create_chat(
                session_id=session_id,
                chat_type=chat_type,
                title=title,
                context_id=context_id,
            )
            logger.info(f"在数据库中创建会话: {session_id}, 类型: {chat_type}")
        return chat

    def list_chats(
        self,
        chat_type: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """列出聊天会话"""
        return self.repository.list_chats(
            chat_type=chat_type,
            limit=limit,
            offset=offset,
        )

    def update_chat_title(self, session_id: str, title: str) -> bool:
        """更新聊天会话标题"""
        return self.repository.update_chat_title(session_id, title)

    def delete_chat(self, session_id: str) -> bool:
        """删除聊天会话及其所有消息"""
        return self.repository.delete_chat(session_id)

    # ===== 消息管理 =====

    def add_message(
        self,
        session_id: str,
        role: str,
        content: str,
        token_count: int | None = None,
        model: str | None = None,
        metadata: str | None = None,
    ) -> dict[str, Any] | None:
        """添加消息到聊天会话（数据库）"""
        return self.repository.add_message(
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
        """获取聊天会话的消息列表"""
        return self.repository.get_messages(
            session_id=session_id,
            limit=limit,
            offset=offset,
        )

    def get_message_count(self, session_id: str) -> int:
        """获取聊天会话的消息数量"""
        return self.repository.get_message_count(session_id)

    def get_chat_summaries(
        self,
        chat_type: str | None = None,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        """获取聊天会话摘要列表"""
        return self.repository.get_chat_summaries(
            chat_type=chat_type,
            limit=limit,
        )

    # ===== 历史记录 =====

    def get_chat_history(
        self,
        session_id: str | None = None,
        chat_type: str | None = None,
    ) -> dict[str, Any]:
        """获取聊天历史记录"""
        if session_id:
            # 返回指定会话的历史记录
            messages = self.repository.get_messages(session_id)
            return {
                "session_id": session_id,
                "history": messages,
                "message": f"会话 {session_id} 的历史记录",
            }
        else:
            # 返回所有会话的摘要信息
            sessions_info = self.repository.get_chat_summaries(chat_type=chat_type, limit=20)
            return {"sessions": sessions_info, "message": "所有会话摘要"}
