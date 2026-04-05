"""Profile 管理路由 — 创建、列表、切换、绑定本地工作空间"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.profile_service import (
    ProfileInfo,
    ProfileListData,
    bind_cloud,
    create_profile,
    delete_profile,
    find_profile_by_cloud_user,
    get_active_profile,
    list_profiles,
    switch_profile,
)

router = APIRouter(prefix="/api/v1/profile", tags=["profile"])


class CreateProfileRequest(BaseModel):
    name: str


class SwitchProfileRequest(BaseModel):
    profile_id: str


class BindCloudRequest(BaseModel):
    profile_id: str
    cloud_user_id: str
    cloud_username: str | None = None


class FindByCloudUserRequest(BaseModel):
    cloud_user_id: str


@router.post("/create", response_model=ProfileInfo)
async def api_create_profile(req: CreateProfileRequest) -> ProfileInfo:
    """创建新 Profile（本地安全模式入口）"""
    if not req.name or not req.name.strip():
        raise HTTPException(status_code=400, detail="Profile 名称不能为空")
    return create_profile(req.name.strip())


@router.get("/list", response_model=ProfileListData)
async def api_list_profiles() -> ProfileListData:
    """列出所有 Profile"""
    return list_profiles()


@router.get("/current", response_model=ProfileInfo | None)
async def api_get_current_profile() -> ProfileInfo | None:
    """获取当前激活的 Profile"""
    return get_active_profile()


@router.post("/switch", response_model=ProfileInfo)
async def api_switch_profile(req: SwitchProfileRequest) -> ProfileInfo:
    """切换激活的 Profile"""
    try:
        profile = switch_profile(req.profile_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    _reinitialize_database()
    return profile


@router.post("/bind-cloud", response_model=ProfileInfo)
async def api_bind_cloud(req: BindCloudRequest) -> ProfileInfo:
    """将 Profile 绑定到云端账户（永久）"""
    try:
        return bind_cloud(req.profile_id, req.cloud_user_id, req.cloud_username)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/find-by-cloud-user", response_model=ProfileInfo | None)
async def api_find_by_cloud_user(req: FindByCloudUserRequest) -> ProfileInfo | None:
    """按云端用户 ID 查找本地 Profile"""
    return find_profile_by_cloud_user(req.cloud_user_id)


@router.delete("/{profile_id}")
async def api_delete_profile(profile_id: str) -> dict:
    """删除 Profile"""
    delete_profile(profile_id)
    return {"success": True}


def _reinitialize_database() -> None:
    """Profile 切换后重新初始化数据库连接"""
    try:
        from storage.database import reinitialize_db  # noqa: PLC0415

        reinitialize_db()
    except Exception:
        pass
