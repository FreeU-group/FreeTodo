"""用户画像服务层

提供用户画像的业务逻辑处理。
"""

from lifetrace.repositories.interfaces import IUserPersonaRepository
from lifetrace.schemas.user_persona import UserPersonaResponse, UserPersonaUpdate
from lifetrace.util.logging_config import get_logger

logger = get_logger()


class UserPersonaService:
    """用户画像服务"""

    def __init__(self, repo: IUserPersonaRepository):
        self._repo = repo

    def get_persona(self) -> UserPersonaResponse:
        """获取用户画像

        如果不存在则自动创建默认记录（随机中性英文昵称）。
        """
        data = self._repo.get_or_create()
        logger.debug(f"获取用户画像: {data.get('nickname')}")
        return UserPersonaResponse(**data)

    def update_persona(self, update_data: UserPersonaUpdate | None) -> UserPersonaResponse:
        """更新用户画像

        Args:
            update_data: 更新数据，可选字段

        Returns:
            更新后的用户画像
        """
        if update_data:
            update_dict = update_data.model_dump(exclude_unset=True)
            if update_dict:
                self._repo.update(**update_dict)
                logger.info(f"更新用户画像: {update_dict}")

        # 返回更新后的数据
        data = self._repo.get_or_create()
        return UserPersonaResponse(**data)
