"""聊天管理器 - 负责聊天会话和消息相关的数据库操作"""

from datetime import datetime
from typing import Any

from sqlalchemy.exc import SQLAlchemyError

from lifetrace.storage.database_base import DatabaseBase
from lifetrace.storage.models import Chat, Message
from lifetrace.util.logging_config import get_logger

logger = get_logger()

# 聊天标题最大长度
CHAT_TITLE_MAX_LENGTH = 50


class ChatManager:
    """聊天管理类"""

    def __init__(self, db_base: DatabaseBase):
        self.db_base = db_base

    def create_chat(
        self,
        session_id: str,
        chat_type: str = "event",
        title: str | None = None,
        context_id: int | None = None,
        metadata: str | None = None,
    ) -> dict[str, Any] | None:
        """创建聊天会话

        Args:
            session_id: 会话ID（UUID）
            chat_type: 聊天类型（event, project, general, task等）
            title: 会话标题
            context_id: 上下文ID（根据chat_type不同而不同）
            metadata: JSON格式的元数据
        """
        try:
            with self.db_base.get_session() as session:
                chat = Chat(
                    session_id=session_id,
                    chat_type=chat_type,
                    title=title,
                    context_id=context_id,
                    extra_data=metadata,
                )
                session.add(chat)
                session.flush()

                logger.info(f"创建聊天会话: {session_id}, 类型: {chat_type}")
                return {
                    "id": chat.id,
                    "session_id": chat.session_id,
                    "chat_type": chat.chat_type,
                    "title": chat.title,
                    "context_id": chat.context_id,
                    "extra_data": chat.extra_data,
                    "created_at": chat.created_at,
                    "updated_at": chat.updated_at,
                    "last_message_at": chat.last_message_at,
                }
        except SQLAlchemyError as e:
            logger.error(f"创建聊天会话失败: {e}")
            return None

    def get_chat_by_session_id(self, session_id: str) -> dict[str, Any] | None:
        """根据session_id获取聊天会话"""
        try:
            with self.db_base.get_session() as session:
                chat = session.query(Chat).filter_by(session_id=session_id).first()
                if chat:
                    return {
                        "id": chat.id,
                        "session_id": chat.session_id,
                        "chat_type": chat.chat_type,
                        "title": chat.title,
                        "context_id": chat.context_id,
                        "extra_data": chat.extra_data,
                        "created_at": chat.created_at,
                        "updated_at": chat.updated_at,
                        "last_message_at": chat.last_message_at,
                    }
                return None
        except SQLAlchemyError as e:
            logger.error(f"获取聊天会话失败: {e}")
            return None

    def list_chats(
        self,
        chat_type: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """列出聊天会话

        Args:
            chat_type: 聊天类型过滤（可选）
            limit: 返回数量限制
            offset: 偏移量
        """
        try:
            with self.db_base.get_session() as session:
                q = session.query(Chat)

                if chat_type:
                    q = q.filter(Chat.chat_type == chat_type)

                chats = (
                    q.order_by(Chat.last_message_at.desc().nullslast(), Chat.created_at.desc())
                    .offset(offset)
                    .limit(limit)
                    .all()
                )

                return [
                    {
                        "id": c.id,
                        "session_id": c.session_id,
                        "chat_type": c.chat_type,
                        "title": c.title,
                        "context_id": c.context_id,
                        "extra_data": c.extra_data,
                        "created_at": c.created_at,
                        "updated_at": c.updated_at,
                        "last_message_at": c.last_message_at,
                    }
                    for c in chats
                ]
        except SQLAlchemyError as e:
            logger.error(f"列出聊天会话失败: {e}")
            return []

    def update_chat_title(self, session_id: str, title: str) -> bool:
        """更新聊天会话标题"""
        try:
            with self.db_base.get_session() as session:
                chat = session.query(Chat).filter_by(session_id=session_id).first()
                if chat:
                    chat.title = title
                    session.flush()
                    logger.info(f"更新聊天会话标题: {session_id} -> {title}")
                    return True
                return False
        except SQLAlchemyError as e:
            logger.error(f"更新聊天会话标题失败: {e}")
            return False

    def delete_chat(self, session_id: str) -> bool:
        """删除聊天会话及其所有消息"""
        try:
            with self.db_base.get_session() as session:
                chat = session.query(Chat).filter_by(session_id=session_id).first()
                if chat:
                    # 删除该会话的所有消息
                    session.query(Message).filter_by(chat_id=chat.id).delete()
                    # 删除会话
                    session.delete(chat)
                    session.flush()
                    logger.info(f"删除聊天会话: {session_id}")
                    return True
                return False
        except SQLAlchemyError as e:
            logger.error(f"删除聊天会话失败: {e}")
            return False

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
        """添加消息到聊天会话

        Args:
            session_id: 会话ID
            role: 消息角色（user, assistant, system）
            content: 消息内容
            token_count: token数量
            model: 使用的模型
            metadata: JSON格式的元数据
        """
        try:
            with self.db_base.get_session() as session:
                # 获取或创建聊天会话
                chat = session.query(Chat).filter_by(session_id=session_id).first()
                if not chat:
                    # 如果会话不存在，自动创建
                    chat = Chat(
                        session_id=session_id,
                        chat_type="event",  # 默认类型
                    )
                    session.add(chat)
                    session.flush()
                    logger.info(f"自动创建聊天会话: {session_id}")

                # 添加消息
                message = Message(
                    chat_id=chat.id,
                    role=role,
                    content=content,
                    token_count=token_count,
                    model=model,
                    extra_data=metadata,
                )
                session.add(message)

                # 更新会话的最后消息时间
                chat.last_message_at = datetime.now()

                # 如果会话没有标题且这是第一条用户消息，可以设置标题
                if not chat.title and role == "user":
                    # 使用消息内容的前N个字符作为标题
                    chat.title = content[:CHAT_TITLE_MAX_LENGTH] + (
                        "..." if len(content) > CHAT_TITLE_MAX_LENGTH else ""
                    )

                session.flush()

                logger.info(f"添加消息到会话 {session_id}: role={role}")
                return {
                    "id": message.id,
                    "chat_id": message.chat_id,
                    "role": message.role,
                    "content": message.content,
                    "token_count": message.token_count,
                    "model": message.model,
                    "extra_data": message.extra_data,
                    "created_at": message.created_at,
                }
        except SQLAlchemyError as e:
            logger.error(f"添加消息失败: {e}")
            return None

    def get_messages(
        self,
        session_id: str,
        limit: int | None = None,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """获取聊天会话的消息列表

        Args:
            session_id: 会话ID
            limit: 返回数量限制（None表示全部）
            offset: 偏移量
        """
        try:
            with self.db_base.get_session() as session:
                chat = session.query(Chat).filter_by(session_id=session_id).first()
                if not chat:
                    return []

                q = (
                    session.query(Message)
                    .filter_by(chat_id=chat.id)
                    .order_by(Message.created_at.asc())
                )

                if offset > 0:
                    q = q.offset(offset)
                if limit:
                    q = q.limit(limit)

                messages = q.all()

                return [
                    {
                        "id": m.id,
                        "chat_id": m.chat_id,
                        "role": m.role,
                        "content": m.content,
                        "token_count": m.token_count,
                        "model": m.model,
                        "extra_data": m.extra_data,
                        "created_at": m.created_at,
                    }
                    for m in messages
                ]
        except SQLAlchemyError as e:
            logger.error(f"获取消息列表失败: {e}")
            return []

    def get_message_count(self, session_id: str) -> int:
        """获取聊天会话的消息数量"""
        try:
            with self.db_base.get_session() as session:
                chat = session.query(Chat).filter_by(session_id=session_id).first()
                if not chat:
                    return 0

                return session.query(Message).filter_by(chat_id=chat.id).count()
        except SQLAlchemyError as e:
            logger.error(f"获取消息数量失败: {e}")
            return 0

    def get_chat_summaries(
        self,
        chat_type: str | None = None,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        """获取聊天会话摘要列表（包含消息数量）

        Args:
            chat_type: 聊天类型过滤（可选）
            limit: 返回数量限制
        """
        try:
            with self.db_base.get_session() as session:
                q = session.query(Chat)

                if chat_type:
                    q = q.filter(Chat.chat_type == chat_type)

                chats = (
                    q.order_by(Chat.last_message_at.desc().nullslast(), Chat.created_at.desc())
                    .limit(limit)
                    .all()
                )

                summaries = []
                for chat in chats:
                    message_count = session.query(Message).filter_by(chat_id=chat.id).count()
                    summaries.append(
                        {
                            "session_id": chat.session_id,
                            "chat_type": chat.chat_type,
                            "title": chat.title,
                            "context_id": chat.context_id,
                            "created_at": chat.created_at,
                            "last_active": chat.last_message_at or chat.created_at,
                            "message_count": message_count,
                        }
                    )

                return summaries
        except SQLAlchemyError as e:
            logger.error(f"获取聊天会话摘要失败: {e}")
            return []

    # ===== 会话上下文管理 =====

    def get_chat_context(self, session_id: str) -> str | None:
        """获取会话上下文（JSON 字符串）

        Args:
            session_id: 会话ID

        Returns:
            上下文 JSON 字符串，如果不存在则返回 None
        """
        try:
            with self.db_base.get_session() as session:
                chat = session.query(Chat).filter_by(session_id=session_id).first()
                if chat:
                    return chat.context
                return None
        except SQLAlchemyError as e:
            logger.error(f"获取会话上下文失败: {e}")
            return None

    def update_chat_context(self, session_id: str, context: str) -> bool:
        """更新会话上下文

        Args:
            session_id: 会话ID
            context: JSON 格式的上下文字符串

        Returns:
            是否更新成功
        """
        try:
            with self.db_base.get_session() as session:
                chat = session.query(Chat).filter_by(session_id=session_id).first()
                if chat:
                    chat.context = context
                    chat.updated_at = datetime.now()
                    session.flush()
                    return True
                else:
                    # 如果会话不存在，自动创建
                    chat = Chat(
                        session_id=session_id,
                        chat_type="general",
                        context=context,
                    )
                    session.add(chat)
                    session.flush()
                    logger.info(f"自动创建会话并设置上下文: {session_id}")
                    return True
        except SQLAlchemyError as e:
            logger.error(f"更新会话上下文失败: {e}")
            return False
