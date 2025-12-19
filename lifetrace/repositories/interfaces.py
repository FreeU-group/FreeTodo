"""仓库接口定义模块

定义数据访问层的抽象接口，支持依赖注入和单元测试。
"""

from abc import ABC, abstractmethod
from typing import Any


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
