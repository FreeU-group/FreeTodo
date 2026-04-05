# 云端数据同步与通知推送

本文档描述 FreeTodo 跨设备数据同步和通知推送的架构设计、模块组成和使用方式。

## 概述

FreeTodo 采用 **本地优先 + 增量同步** 架构。所有数据首先写入本地 SQLite，然后通过 WebSocket 长连接将变更实时推送到 cloud-api，由 cloud-api 分发到用户的其他设备。

核心特性：
- **changelog + cursor** 增量同步协议
- **WebSocket** 实时双向同步 + **REST** 回退
- **version + last-write-wins** 冲突解决
- **多渠道通知推送**（WebSocket / FCM / APNs）
- 离线时本地队列暂存，上线后自动追赶

## 同步实体

| 实体类型 | 本地模型 | 云端模型 | 主键 |
|----------|----------|----------|------|
| todo | `Todo` | `CloudTodo` | `uid` (UUID) |
| chat | `Chat` | `CloudChat` | `session_id` |
| message | `Message` | `CloudMessage` | `uid` (UUID) |

## 数据库表

### Cloud API 新增表

| 表名 | 用途 |
|------|------|
| `sync_devices` | 已注册的同步设备 |
| `sync_changelog` | 变更日志（id 自增即 cursor） |
| `sync_cursors` | 每个设备对每种实体类型的消费位置 |
| `cloud_todos` | 待办云端存储 |
| `cloud_chats` | 聊天会话云端存储 |
| `cloud_messages` | 聊天消息云端存储 |
| `cloud_notifications` | 通知持久化存储 |

### Local API 模型变更

- `Todo`、`Chat`、`Message`：新增 `sync_status`（pending/synced/conflict）和 `cloud_version` 字段
- `Message`：新增 `uid` 字段用于跨设备标识

## 同步协议

### WebSocket 端点

```
WS /api/v1/sync/ws?token={jwt}&device_id={uuid}
```

### 消息类型

**设备 → 云端：**
- `sync_init` — 连接后声明各实体类型的 cursor 位置
- `change` — 单条数据变更
- `change_batch` — 离线恢复时批量推送
- `ack` — 确认收到变更
- `ping` — 心跳保活

**云端 → 设备：**
- `sync_catchup` — 追赶数据包（连接后补发 cursor 之后的变更）
- `change` — 来自其他设备的实时变更
- `conflict` — 冲突通知（附带 server_data）
- `notification` — 通知推送
- `pong` — 心跳响应

### 冲突解决策略

1. **version 匹配** → 无冲突，直接应用，version + 1
2. **version 不匹配** → 比较 `updated_at` 时间戳
   - 设备时间更新 → 应用变更（incoming wins）
   - 云端时间更新 → 拒绝，返回 conflict
3. **删除优先** — 删除操作覆盖更新

## REST 同步端点

用于不支持 WebSocket 的场景或初始全量同步：

| 方法 | 路径 | 用途 |
|------|------|------|
| POST | `/api/v1/sync/push` | 批量推送本地变更 |
| POST | `/api/v1/sync/pull` | 拉取云端变更 |
| GET | `/api/v1/sync/status` | 查询同步状态 |
| POST | `/api/v1/sync/device` | 注册/更新设备 |
| DELETE | `/api/v1/sync/device/{id}` | 注销设备 |
| POST | `/api/v1/sync/full` | 全量同步（首次） |

## 通知推送

### 推送渠道

1. **WebSocket** — 在线桌面/Web 设备实时接收
2. **FCM** — Android 和 Web Push（需配置 Firebase）
3. **APNs** — iOS 推送（需配置 Apple 证书）
4. **离线队列** — 离线设备上线后通过 `sync_catchup` 补发

### 通知端点

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | `/api/v1/notifications` | 获取通知列表 |
| POST | `/api/v1/notifications` | 创建通知并推送 |
| PUT | `/api/v1/notifications/{id}/read` | 标记已读 |
| PUT | `/api/v1/notifications/read-all` | 全部标记已读 |
| DELETE | `/api/v1/notifications/{id}` | 删除通知 |

## 配置

### Local API (`config/default_config.yaml`)

```yaml
sync:
  enabled: false          # 云端登录后自动启用
  ws_url: "ws://127.0.0.1:8000/api/v1/sync/ws"
  reconnect_interval: 5   # 重连间隔（秒）
  max_reconnect_interval: 300
  batch_size: 50
  heartbeat_interval: 30
```

### Cloud API (`.env`)

```
FIREBASE_CREDENTIALS_PATH=   # Firebase 服务账号 JSON 路径
APNS_KEY_PATH=               # APNs 密钥路径
APNS_KEY_ID=
APNS_TEAM_ID=
```

## 代码结构

### Cloud API 新增文件

```
cloud-api/
├── models/
│   ├── sync.py          # SyncDevice, SyncChangelog, SyncCursor
│   ├── todo.py          # CloudTodo
│   ├── chat.py          # CloudChat, CloudMessage
│   └── notification.py  # CloudNotification
├── schemas/
│   └── sync.py          # 同步相关 Pydantic 模型
├── services/
│   ├── sync_service.py  # 核心同步逻辑
│   └── push_service.py  # 多渠道通知推送
└── routers/
    ├── sync.py          # REST 同步端点
    ├── sync_ws.py       # WebSocket 同步端点
    └── notification.py  # 通知端点
```

### Local API 变更

```
local-api/
├── storage/
│   ├── models.py                # Todo/Chat/Message 新增 sync_status, cloud_version, uid
│   └── notification_storage.py  # 新增云端转发逻辑
├── services/
│   ├── sync_client.py           # WebSocket 同步客户端
│   ├── sync_hooks.py            # 同步变更钩子（TodoService/ChatService 调用）
│   ├── todo_service.py          # create/update/delete 后触发同步
│   └── chat_service.py          # create/delete/add_message 后触发同步
└── config/
    └── default_config.yaml      # 新增 sync 配置段
```

## 数据流

1. **本地创建待办** → `TodoService.create_todo()` → 写入 SQLite → `sync_hooks.notify_todo_created()` → `SyncClient.enqueue_change()` → WebSocket 发送到 cloud-api
2. **cloud-api 接收变更** → `sync_service.apply_change()` → 写入 PostgreSQL + `sync_changelog` → 广播到该用户其他设备
3. **其他设备收到变更** → `SyncClient._handle_message()` → 调用注册的 change handler → 更新本地 DB
4. **设备离线** → 变更暂存本地队列 → 上线后 `sync_init` 触发追赶 → cloud-api 返回 `sync_catchup`
