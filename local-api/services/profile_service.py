"""Profile 管理服务 — 本地工作空间的创建、列表、切换、绑定与旧数据迁移"""

from __future__ import annotations

import json
import shutil
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from pydantic import BaseModel

from util.logging_config import get_logger

logger = get_logger()

PROFILES_FILENAME = "profiles.json"

MIGRATABLE_ITEMS = [
    "lifetrace.db",
    "scheduler.db",
    "screenshots",
    "audio",
    "attachments",
    "vector_db",
    "temp_audio",
    "second_pass_audio",
    "memory",
    "traces",
]


class ProfileInfo(BaseModel):
    """Profile 元信息"""

    id: str
    name: str
    cloud_user_id: str | None = None
    cloud_username: str | None = None
    bound_at: str | None = None
    created_at: str


class ProfileListData(BaseModel):
    """profiles.json 的完整结构"""

    active_profile_id: str | None = None
    profiles: list[ProfileInfo] = []


def _get_data_root() -> Path:
    """获取数据根目录（profiles.json 所在的目录）"""
    from util.base_paths import get_app_root, get_data_directory  # noqa: PLC0415

    base = get_data_directory() or get_app_root()
    return base / "data"


def _profiles_json_path() -> Path:
    return _get_data_root() / PROFILES_FILENAME


def _read_profiles() -> ProfileListData:
    path = _profiles_json_path()
    if not path.exists():
        return ProfileListData()
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        return ProfileListData(**raw)
    except Exception:
        logger.warning("profiles.json 解析失败，返回空列表")
        return ProfileListData()


def _write_profiles(data: ProfileListData) -> None:
    path = _profiles_json_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(data.model_dump(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _profile_dir(profile_id: str) -> Path:
    return _get_data_root() / "profiles" / profile_id


# ========== 公开 API ==========


def create_profile(
    name: str,
    cloud_user_id: str | None = None,
    cloud_username: str | None = None,
) -> ProfileInfo:
    """创建新 Profile 及其数据目录"""
    data = _read_profiles()

    profile = ProfileInfo(
        id=str(uuid4()),
        name=name,
        cloud_user_id=cloud_user_id,
        cloud_username=cloud_username,
        bound_at=_now_iso() if cloud_user_id else None,
        created_at=_now_iso(),
    )

    profile_dir = _profile_dir(profile.id)
    profile_dir.mkdir(parents=True, exist_ok=True)

    data.profiles.append(profile)
    if data.active_profile_id is None:
        data.active_profile_id = profile.id
    _write_profiles(data)

    logger.info("Profile 已创建: id=%s, name=%s", profile.id, profile.name)
    return profile


def list_profiles() -> ProfileListData:
    """列出所有 Profile"""
    return _read_profiles()


def get_active_profile() -> ProfileInfo | None:
    """获取当前激活的 Profile"""
    data = _read_profiles()
    if not data.active_profile_id:
        return None
    for p in data.profiles:
        if p.id == data.active_profile_id:
            return p
    return None


def switch_profile(profile_id: str) -> ProfileInfo:
    """切换激活的 Profile"""
    data = _read_profiles()
    target = None
    for p in data.profiles:
        if p.id == profile_id:
            target = p
            break
    if target is None:
        raise ValueError(f"Profile 不存在: {profile_id}")

    data.active_profile_id = profile_id
    _write_profiles(data)

    from util.base_paths import invalidate_profile_cache  # noqa: PLC0415

    invalidate_profile_cache()

    logger.info("已切换到 Profile: id=%s, name=%s", target.id, target.name)
    return target


def bind_cloud(
    profile_id: str,
    cloud_user_id: str,
    cloud_username: str | None = None,
) -> ProfileInfo:
    """将 Profile 绑定到云端账户（永久，不可逆）"""
    data = _read_profiles()
    target = None
    for p in data.profiles:
        if p.id == profile_id:
            target = p
            break
    if target is None:
        raise ValueError(f"Profile 不存在: {profile_id}")
    if target.cloud_user_id is not None:
        raise ValueError(f"Profile 已绑定云端账户: {target.cloud_user_id}")

    target.cloud_user_id = cloud_user_id
    target.cloud_username = cloud_username
    target.bound_at = _now_iso()
    _write_profiles(data)

    logger.info(
        "Profile 已绑定云端: profile=%s, cloud_user=%s",
        profile_id,
        cloud_user_id,
    )
    return target


def find_profile_by_cloud_user(cloud_user_id: str) -> ProfileInfo | None:
    """按云端用户 ID 查找本地 Profile"""
    data = _read_profiles()
    for p in data.profiles:
        if p.cloud_user_id == cloud_user_id:
            return p
    return None


def update_profile_name(profile_id: str, name: str) -> ProfileInfo:
    """更新 Profile 的显示名称"""
    data = _read_profiles()
    target = None
    for p in data.profiles:
        if p.id == profile_id:
            target = p
            break
    if target is None:
        raise ValueError(f"Profile 不存在: {profile_id}")

    target.name = name
    _write_profiles(data)
    logger.info("Profile 名称已更新: id=%s, name=%s", profile_id, name)
    return target


def delete_profile(profile_id: str) -> None:
    """删除 Profile（移除注册信息及数据目录）"""
    data = _read_profiles()
    data.profiles = [p for p in data.profiles if p.id != profile_id]
    if data.active_profile_id == profile_id:
        data.active_profile_id = data.profiles[0].id if data.profiles else None
    _write_profiles(data)

    profile_dir = _profile_dir(profile_id)
    if profile_dir.exists():
        shutil.rmtree(profile_dir, ignore_errors=True)

    logger.info("Profile 已删除: %s", profile_id)


def ensure_migrated() -> None:
    """旧数据自动迁移：将 data/ 下的平铺数据迁移到 data/profiles/default/

    仅在 profiles.json 不存在且 data/ 下存在 lifetrace.db 时执行。
    """
    profiles_path = _profiles_json_path()
    if profiles_path.exists():
        return

    data_root = _get_data_root()
    old_db = data_root / "lifetrace.db"
    if not old_db.exists():
        return

    logger.info("检测到旧数据布局，开始自动迁移到 Profile 架构...")

    default_id = "default"
    target_dir = data_root / "profiles" / default_id
    target_dir.mkdir(parents=True, exist_ok=True)

    migrated: list[str] = []
    for item_name in MIGRATABLE_ITEMS:
        src = data_root / item_name
        if not src.exists():
            continue
        dst = target_dir / item_name
        if dst.exists():
            continue
        try:
            shutil.move(str(src), str(dst))
            migrated.append(item_name)
        except Exception as exc:
            logger.warning("迁移 %s 失败: %s", item_name, exc)

    profile = ProfileInfo(
        id=default_id,
        name="本地用户",
        created_at=_now_iso(),
    )
    data = ProfileListData(active_profile_id=default_id, profiles=[profile])
    _write_profiles(data)

    logger.info("旧数据迁移完成: 已迁移 %s", migrated)
