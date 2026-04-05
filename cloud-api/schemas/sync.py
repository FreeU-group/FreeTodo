"""同步相关 Pydantic 模型 — WebSocket 消息与 REST 请求/响应"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

# ========== WebSocket 消息 ==========


class SyncInitMessage(BaseModel):
    """设备上线时发送，声明各实体类型的 cursor 位置"""

    type: str = "sync_init"
    cursors: dict[str, int]  # {"todo": 1234, "chat": 567, "message": 890}


class ChangeMessage(BaseModel):
    """单条数据变更"""

    type: str = "change"
    entity_type: str
    entity_id: str
    operation: str  # create / update / delete
    version: int
    data: dict | None = None
    client_ts: str | None = None


class ChangeBatchMessage(BaseModel):
    """离线恢复时批量推送"""

    type: str = "change_batch"
    changes: list[ChangeMessage]


class AckMessage(BaseModel):
    """确认收到变更"""

    type: str = "ack"
    changelog_id: int


# ========== 云端 → 设备 ==========


class SyncCatchupPayload(BaseModel):
    """追赶数据包"""

    entity_type: str
    changes: list[dict]
    cursor: int


class ConflictMessage(BaseModel):
    """冲突通知"""

    type: str = "conflict"
    entity_type: str
    entity_id: str
    server_version: int
    server_data: dict
    resolution: str = "server_wins"


class ChangeAckPayload(BaseModel):
    """变更广播到其他设备"""

    type: str = "change"
    entity_type: str
    entity_id: str
    operation: str
    version: int
    data: dict
    changelog_id: int


# ========== REST 同步端点 ==========


class SyncPushRequest(BaseModel):
    """批量推送本地变更"""

    device_id: str
    changes: list[ChangeMessage]


class SyncPushResponse(BaseModel):
    results: list[dict]
    new_cursor: int


class SyncPullRequest(BaseModel):
    """拉取云端变更"""

    device_id: str
    cursors: dict[str, int]
    limit: int = 100


class SyncPullResponse(BaseModel):
    changes: list[dict]
    cursors: dict[str, int]
    has_more: bool


class SyncStatusResponse(BaseModel):
    device_id: str
    cursors: dict[str, int]
    last_seen_at: datetime | None


class DeviceRegisterRequest(BaseModel):
    device_id: str
    device_name: str | None = None
    device_type: str = "desktop"
    push_token: str | None = None


class DeviceRegisterResponse(BaseModel):
    device_id: str
    registered: bool


class SyncFullRequest(BaseModel):
    """全量同步（首次）"""

    device_id: str
    todos: list[dict] | None = None
    chats: list[dict] | None = None
    messages: list[dict] | None = None
