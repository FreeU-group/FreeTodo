"""用户画像相关路由"""

from fastapi import APIRouter, Depends, HTTPException

from lifetrace.core.dependencies import get_user_persona_service
from lifetrace.schemas.user_persona import UserPersonaResponse, UserPersonaUpdate
from lifetrace.services.user_persona_service import UserPersonaService
from lifetrace.util.logging_config import get_logger

logger = get_logger()

router = APIRouter(tags=["user-persona"])


@router.get("/api/user-persona", response_model=UserPersonaResponse)
async def get_user_persona(
    service: UserPersonaService = Depends(get_user_persona_service),
):
    """获取用户画像

    如果用户画像不存在，则自动创建一个带有随机昵称的默认记录。
    """
    try:
        return service.get_persona()
    except Exception as e:
        logger.error(f"获取用户画像失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"获取用户画像失败: {str(e)}") from e


@router.put("/api/user-persona", response_model=UserPersonaResponse)
async def update_user_persona(
    update_data: UserPersonaUpdate | None = None,
    service: UserPersonaService = Depends(get_user_persona_service),
):
    """更新用户画像

    可以更新 nickname 和/或 description 字段。
    """
    try:
        return service.update_persona(update_data)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"更新用户画像失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"更新用户画像失败: {str(e)}") from e
