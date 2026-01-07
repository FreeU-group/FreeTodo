"""仓库接口定义模块

定义数据访问层的抽象接口，支持依赖注入和单元测试。
"""

from abc import ABC, abstractmethod
from datetime import datetime
from typing import Any


class IChatRepository(ABC):
    """Chat 仓库接口"""

    @abstractmethod
    def create_chat(
        self,
        session_id: str,
        chat_type: str = "event",
        title: str | None = None,
        context_id: int | None = None,
        metadata: str | None = None,
    ) -> dict[str, Any] | None:
        """创建聊天会话"""
        pass

    @abstractmethod
    def get_chat_by_session_id(self, session_id: str) -> dict[str, Any] | None:
        """根据 session_id 获取聊天会话"""
        pass

    @abstractmethod
    def list_chats(
        self,
        chat_type: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """列出聊天会话"""
        pass

    @abstractmethod
    def update_chat_title(self, session_id: str, title: str) -> bool:
        """更新聊天会话标题"""
        pass

    @abstractmethod
    def delete_chat(self, session_id: str) -> bool:
        """删除聊天会话及其所有消息"""
        pass

    @abstractmethod
    def add_message(
        self,
        session_id: str,
        role: str,
        content: str,
        token_count: int | None = None,
        model: str | None = None,
        metadata: str | None = None,
    ) -> dict[str, Any] | None:
        """添加消息到聊天会话"""
        pass

    @abstractmethod
    def get_messages(
        self,
        session_id: str,
        limit: int | None = None,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """获取聊天会话的消息列表"""
        pass

    @abstractmethod
    def get_message_count(self, session_id: str) -> int:
        """获取聊天会话的消息数量"""
        pass

    @abstractmethod
    def get_chat_summaries(
        self,
        chat_type: str | None = None,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        """获取聊天会话摘要列表"""
        pass

    @abstractmethod
    def get_chat_context(self, session_id: str) -> str | None:
        """获取会话上下文（JSON 字符串）"""
        pass

    @abstractmethod
    def update_chat_context(self, session_id: str, context: str) -> bool:
        """更新会话上下文

        Args:
            session_id: 会话ID
            context: JSON 格式的上下文字符串

        Returns:
            是否更新成功
        """
        pass


class ITodoRepository(ABC):
    """Todo 仓库接口"""

    @abstractmethod
    def get_by_id(self, todo_id: int) -> dict[str, Any] | None:
        """根据ID获取单个todo"""
        pass

    @abstractmethod
    def list_todos(self, limit: int, offset: int, status: str | None) -> list[dict[str, Any]]:
        """获取todo列表"""
        pass

    @abstractmethod
    def count(self, status: str | None) -> int:
        """统计todo数量"""
        pass

    @abstractmethod
    def create(self, **kwargs) -> int | None:
        """创建todo，返回ID"""
        pass

    @abstractmethod
    def update(self, todo_id: int, **kwargs) -> bool:
        """更新todo"""
        pass

    @abstractmethod
    def delete(self, todo_id: int) -> bool:
        """删除todo"""
        pass

    @abstractmethod
    def reorder(self, items: list[dict[str, Any]]) -> bool:
        """批量重排序"""
        pass


class IJournalRepository(ABC):
    """Journal 仓库接口"""

    @abstractmethod
    def get_by_id(self, journal_id: int) -> dict[str, Any] | None:
        """根据ID获取单个日记"""
        pass

    @abstractmethod
    def list_journals(
        self,
        limit: int,
        offset: int,
        start_date: datetime | None,
        end_date: datetime | None,
    ) -> list[dict[str, Any]]:
        """获取日记列表"""
        pass

    @abstractmethod
    def count(self, start_date: datetime | None, end_date: datetime | None) -> int:
        """统计日记数量"""
        pass

    @abstractmethod
    def create(self, **kwargs) -> int | None:
        """创建日记，返回ID"""
        pass

    @abstractmethod
    def update(self, journal_id: int, **kwargs) -> bool:
        """更新日记"""
        pass

    @abstractmethod
    def delete(self, journal_id: int) -> bool:
        """删除日记"""
        pass


class IEventRepository(ABC):
    """Event 仓库接口"""

    @abstractmethod
    def get_summary(self, event_id: int) -> dict[str, Any] | None:
        """获取单个事件摘要"""
        pass

    @abstractmethod
    def list_events(
        self,
        limit: int,
        offset: int,
        start_date: datetime | None,
        end_date: datetime | None,
        app_name: str | None,
    ) -> list[dict[str, Any]]:
        """获取事件列表"""
        pass

    @abstractmethod
    def count_events(
        self,
        start_date: datetime | None,
        end_date: datetime | None,
        app_name: str | None,
    ) -> int:
        """统计事件数量"""
        pass

    @abstractmethod
    def get_screenshots(self, event_id: int) -> list[dict[str, Any]]:
        """获取事件关联的截图"""
        pass

    @abstractmethod
    def update_summary(self, event_id: int, ai_title: str, ai_summary: str) -> bool:
        """更新事件AI摘要"""
        pass

    @abstractmethod
    def get_events_by_ids(self, event_ids: list[int]) -> list[dict[str, Any]]:
        """批量获取事件"""
        pass


class IOcrRepository(ABC):
    """OCR 仓库接口"""

    @abstractmethod
    def get_results_by_screenshot(self, screenshot_id: int) -> list[dict[str, Any]]:
        """获取截图的OCR结果"""
        pass


class IActivityRepository(ABC):
    """Activity 仓库接口"""

    @abstractmethod
    def get_by_id(self, activity_id: int) -> dict[str, Any] | None:
        """根据ID获取活动"""
        pass

    @abstractmethod
    def get_activities(
        self,
        limit: int,
        offset: int,
        start_date: datetime | None,
        end_date: datetime | None,
    ) -> list[dict[str, Any]]:
        """获取活动列表"""
        pass

    @abstractmethod
    def count_activities(
        self,
        start_date: datetime | None,
        end_date: datetime | None,
    ) -> int:
        """统计活动数量"""
        pass

    @abstractmethod
    def get_activity_events(self, activity_id: int) -> list[int]:
        """获取活动关联的事件ID列表"""
        pass

    @abstractmethod
    def create_activity(
        self,
        start_time: datetime,
        end_time: datetime,
        ai_title: str,
        ai_summary: str,
        event_ids: list[int],
    ) -> int | None:
        """创建活动"""
        pass

    @abstractmethod
    def activity_exists_for_event_id(self, event_id: int) -> bool:
        """检查事件ID是否已关联到活动"""
        pass
