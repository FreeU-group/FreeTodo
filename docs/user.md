# 用户系统参考文档

> 本文档定义 FreeTodo 的用户系统设计，基于 **Profile（本地工作空间）** 架构。
> 每个 Profile 拥有独立的 SQLite 数据库和文件目录，可选绑定云端账户实现多端同步。
> 本地始终保留完整数据，云端仅作为同步层。

---

## 目录

1. [系统概览](#1-系统概览)
2. [系统架构](#2-系统架构)
3. [技术栈](#3-技术栈)
4. [Profile 数据模型](#4-profile-数据模型)
5. [用户数据模型](#5-用户数据模型)
6. [认证流程](#6-认证流程)
7. [API 接口设计](#7-api-接口设计)
8. [后端实现](#8-后端实现)
9. [前端实现](#9-前端实现)
10. [会员与积分系统](#10-会员与积分系统)
11. [数据同步设计](#11-数据同步设计)
12. [环境变量配置](#12-环境变量配置)
13. [实施路线](#13-实施路线)

---

## 1. 系统概览

### 1.1 核心概念：Profile（本地工作空间）

**Profile** 是 FreeTodo 的数据隔离单元。每个 Profile 拥有独立的 SQLite 数据库、截图、录音、附件等文件目录。一台设备可以有多个 Profile，但同一时刻只有一个处于激活状态。

Profile 有两种状态：

- **standalone**：纯本地模式，数据仅存本地，不依赖网络
- **bound**：已绑定云端账户，联网时自动同步，离线时仍可正常使用

### 1.2 本地模式（Standalone Profile）

- **入口**：登录页面点击「本地安全模式」
- **无需注册**：输入一个名字即可创建 Profile，无需手机号、密码或网络连接
- **本地存储**：所有数据存储在该 Profile 的独立 SQLite 数据库中
- **完整功能**：可使用全部本地功能（任务管理、笔记、日历等）
- **AI 功能**：使用本地配置的 LLM（如 Ollama），不依赖云端
- **单用户**：每个 Profile 内部为单用户设计，默认账户拥有管理员权限
- **可绑定**：随时可在设置页绑定云端账户，本地数据同步到云端

### 1.3 云端模式（Bound Profile）

- **入口**：登录页面点击「云端登录」或「注册」
- **注册**：用户名 + 密码 + 手机号 + 短信验证码注册
- **登录**：支持手机号+短信验证码 / 手机号+密码
- **Profile 关联**：云端认证成功后，自动查找或创建本地 Profile 并与云端账户绑定
- **绑定规则**：一个 Profile 只能绑定一个云端账户，绑定后不可解绑（永久）
- **本地优先**：本地拥有完整数据，云端是副本；断网时照常使用，联网后自动同步
- **多端同步**：同一云端账户可在多台设备上各有一个 bound Profile，通过云端同步数据
- **Token 管理**：JWT 双 Token 机制（access_token + refresh_token）
- **会员系统**：免费/月度/年度三级会员
- **积分系统**：每日积分 + 永久积分，用于 AI 功能消耗

### 1.4 关键规则

| 规则 | 说明 |
|------|------|
| Profile 是一等公民 | 创建即可用，不依赖云端 |
| 每个 Profile 有独立数据空间 | 物理隔离（各自的文件夹 + SQLite） |
| 绑定是可选的 | 不绑定云端也能完整使用 |
| 绑定是永久的 | 一旦绑定云端账户，不可解绑 |
| 一个 Profile 只绑一个云端账户 | 1:1 关系 |
| 云端是同步层 | 本地拥有完整数据，云端是副本 |
| 离线始终可用 | 绑定后断网，照样用本地数据 |
| 切换云端账户 = 切换/新建 Profile | 旧 Profile 不被销毁，只是不再活跃 |

---

## 2. 系统架构

### 2.1 整体架构

```
┌───────────────────────────────────────────────────────────┐
│                        local-web                          │
│              (Next.js / Electron / Tauri)                  │
│                                                           │
│   ┌─────────────────┐      ┌─────────────────────────┐   │
│   │  本地安全模式     │      │  云端登录 / 注册          │   │
│   │  (无需网络)      │      │  (需要网络)               │   │
│   └────────┬────────┘      └───────────┬─────────────┘   │
└────────────┼───────────────────────────┼─────────────────┘
             │ 所有请求                    │ 所有请求
             ▼                            ▼
┌───────────────────────────────────────────────────────────┐
│                       local-api                           │
│                  (FastAPI + SQLite)                        │
│                                                           │
│   ┌─────────────────────────────────────────────────┐     │
│   │          Profile 管理 + 认证 & 路由层             │     │
│   │  ┌──────────────────┐  ┌──────────────────────┐ │     │
│   │  │  本地模式处理      │  │  云端转发代理          │ │     │
│   │  │  (Profile SQLite) │  │  (proxy → cloud-api) │ │     │
│   │  └──────────────────┘  └──────────┬───────────┘ │     │
│   └───────────────────────────────────┼─────────────┘     │
│                                                           │
│   ┌─────────────────────────────────────────────────┐     │
│   │  Profile 数据目录（每个 Profile 独立）              │     │
│   │  ├── profiles/p-abc/lifetrace.db                │     │
│   │  ├── profiles/p-abc/screenshots/                │     │
│   │  └── profiles/p-def/lifetrace.db                │     │
│   └─────────────────────────────────────────────────┘     │
└───────────────────────────────────────┼───────────────────┘
                                        │ HTTP 转发（仅 bound Profile）
                                        ▼
                              ┌─────────────────────┐
                              │     cloud-api        │
                              │ (PostgreSQL + Redis) │
                              │   远程服务器部署       │
                              └─────────────────────┘
```

**核心原则**：`local-web` 始终且仅连接 `local-api`，绝不直接访问 `cloud-api`。

### 2.2 Profile 数据目录结构

```
{data_root}/
├── profiles.json                    # Profile 注册表（全局）
├── profiles/
│   ├── {profile-id}/                # 每个 Profile 独立空间
│   │   ├── lifetrace.db             # 业务数据库
│   │   ├── scheduler.db             # 调度器数据库
│   │   ├── screenshots/             # 截图（设备本地，不同步）
│   │   ├── audio/                   # 录音（设备本地，不同步）
│   │   ├── attachments/             # 附件（同步）
│   │   ├── vector_db/               # 向量库（本地重建）
│   │   └── ...
│   └── {profile-id-2}/
│       └── ...
├── agno/                            # Agno 学习数据（全局共享）
└── logs/                            # 日志（全局共享）
```

### 2.3 模式对比

| 维度 | Standalone Profile | Bound Profile |
|------|-------------------|---------------|
| 网络要求 | 无 | 同步时需要网络，离线可用 |
| 数据存储 | 本地 SQLite（唯一数据源） | 本地 SQLite（完整副本） + 云端（同步副本） |
| 用户认证 | local-api 本地签发 Token | local-api 转发至 cloud-api 认证 |
| 数据读写 | local-api 直接操作 SQLite | local-api 操作 SQLite + 后台同步到云端 |
| AI 服务 | 本地 LLM | 本地 LLM 或云端 LLM |
| 会员升级 | 不支持（需先绑定云端） | 支持 |

### 2.4 云端 API 转发规则

`local-api` 内置 **cloud proxy** 模块，负责将 bound Profile 的请求转发到 `cloud-api`：

1. **前端请求路径不变**：`local-web` 统一请求 `local-api` 的 `/api/v1/*` 路径
2. **模式判断**：`local-api` 根据当前 Profile 的绑定状态决定处理方式
   - standalone：直接操作 Profile 的本地 SQLite
   - bound：操作本地 SQLite + 后台同步到 cloud-api
3. **转发格式**：`local-api` 向 `cloud-api` 发起 HTTP 请求，附带云端 Token
4. **离线降级**：bound Profile 在网络中断时，仅操作本地数据，恢复后自动同步

---

## 3. 技术栈

### 后端（local-api）

| 组件 | 技术 | Standalone | Bound |
|------|------|-----------|-------|
| Web 框架 | FastAPI | 本地服务 | 本地服务 + 云端转发 |
| ORM | SQLModel (SQLAlchemy + Pydantic) | SQLite 驱动 | SQLite + 云端同步 |
| 本地数据库 | SQLite (aiosqlite) | 唯一数据源 | 本地完整副本 |
| 云端数据库 | PostgreSQL | 不使用 | 云端同步副本（cloud-api 侧） |
| 缓存 | 内存字典 / SQLite | 验证码等临时数据 | 本地缓存 |
| 云端缓存 | Redis | 不使用 | 短信验证码（cloud-api 侧） |
| 密码加密 | passlib (bcrypt) | 本地 Token 签发 | 云端认证 |
| JWT | python-jose | 本地签发 | 云端签发，本地缓存 |
| HTTP 转发 | httpx | 不使用 | 转发请求至 cloud-api |
| 短信服务 | 第三方 SDK | 不使用 | cloud-api 侧发送 |
| 文件存储 | 本地文件系统 / MinIO | Profile 本地目录 | 本地 + 云端 MinIO |

### 前端（local-web）

| 组件 | 技术 | 说明 |
|------|------|------|
| 框架 | Next.js 15 + React 19 + TypeScript | SSR/SSG 支持 |
| 样式 | Tailwind CSS 4 + Shadcn UI | 组件库 |
| 状态管理 | Zustand + localStorage | Profile/Auth 全局管理 |
| 国际化 | next-intl | 多语言支持 |
| HTTP 请求 | 自定义 fetcher (基于 fetch) | 统一请求拦截、Token 刷新 |
| Profile 管理 | localStorage (`profile_id`) | 记录当前激活的 Profile |

---

## 4. Profile 数据模型

### 4.1 profiles.json（全局注册表）

`profiles.json` 存放在数据根目录下（与 `profiles/` 目录同级），记录所有 Profile 的元信息：

```json
{
  "active_profile_id": "p-abc-uuid",
  "profiles": [
    {
      "id": "p-abc-uuid",
      "name": "小明的笔记本",
      "cloud_user_id": null,
      "cloud_username": null,
      "bound_at": null,
      "created_at": "2026-04-01T00:00:00Z"
    },
    {
      "id": "p-def-uuid",
      "name": "张三",
      "cloud_user_id": "cloud-user-123",
      "cloud_username": "张三",
      "bound_at": "2026-04-03T10:00:00Z",
      "created_at": "2026-04-03T00:00:00Z"
    }
  ]
}
```

### 4.2 ProfileInfo 数据结构

```python
class ProfileInfo(BaseModel):
    id: str                          # UUID 字符串
    name: str                        # 用户设置的名字
    cloud_user_id: str | None        # 绑定的云端用户 ID（None = standalone）
    cloud_username: str | None       # 云端用户名（用于显示）
    bound_at: str | None             # 绑定时间（ISO 8601）
    created_at: str                  # 创建时间（ISO 8601）
```

### 4.3 Profile 状态判定

```python
def is_standalone(profile: ProfileInfo) -> bool:
    return profile.cloud_user_id is None

def is_bound(profile: ProfileInfo) -> bool:
    return profile.cloud_user_id is not None
```

---

## 5. 用户数据模型

> **SQLite 兼容原则**：本地 SQLite 的表结构与云端 PostgreSQL 保持一致，确保数据可无损同步。
> 设计约束：① 主键使用 `TEXT` 类型的 UUID（避免跨设备 ID 冲突）；② 不使用 PostgreSQL 专有类型（如 ARRAY、JSONB）；③ 时间戳使用 ISO 8601 字符串格式存储。

### 5.1 用户表 (User)

每个 Profile 的 SQLite 中有一个本地用户记录：

```python
class UserType(StrEnum):
    USER = "user"
    ADMIN = "admin"

class AuthMode(StrEnum):
    LOCAL = "local"
    CLOUD = "cloud"

class User(SQLModel, table=True):
    id: str = Field(default_factory=lambda: str(uuid4()), primary_key=True)

    username: str = Field(index=True, max_length=100)
    phone: str | None = Field(default=None, index=True, max_length=20)
    password_hash: str | None = Field(default=None, max_length=256)
    user_type: str = Field(default=UserType.USER, max_length=20)
    auth_mode: str = Field(default=AuthMode.LOCAL, max_length=20)
    cloud_user_id: str | None = Field(default=None, max_length=100)
    avatar_key: str | None = Field(default=None, max_length=500)
    is_dev: bool = Field(default=False)
    last_login_at: datetime | None = Field(default=None)
    is_deleted: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    deleted_at: datetime | None = None
```

### 5.2 会员计划表 (MembershipPlan)

```python
class MembershipType(StrEnum):
    FREE = "free"
    MONTHLY = "monthly"
    YEARLY = "yearly"

class MembershipPlan(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(max_length=50)
    type: str = Field(max_length=20, index=True)
    project_limit: int = Field(default=10)
    note_limit: int = Field(default=50)
    initial_credits: int = Field(default=0)
    daily_refresh_credits: int = Field(default=0)
    price: float = Field(default=0.0)
    currency: str = Field(default="CNY", max_length=10)
    duration_days: int = Field(default=365)
    is_active: bool = Field(default=True)
    description: str | None = None
    is_deleted: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
```

### 5.3 用户会员关系表 (UserMembership)

```python
class UserMembership(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    user_id: str = Field(index=True, max_length=100)
    membership_plan_id: int = Field(index=True)
    start_date: datetime
    end_date: datetime
    is_active: bool = Field(default=True, index=True)
    total_chat_count: int = Field(default=0)
    daily_credits: int = Field(default=0)
    permanent_credits: int = Field(default=0)
    daily_credits_consumed: int = Field(default=0)
    total_credits_consumed: int = Field(default=0)
    total_credits_purchased: int = Field(default=0)
    last_reset_date: datetime
    last_credit_refresh_date: datetime
    is_deleted: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
```

### 5.4 Profile 内默认用户

每个 Profile 首次初始化时，自动创建默认用户：

```python
DEFAULT_USER = User(
    id="{profile_id}",                # 使用 Profile ID 作为用户 ID
    username="{profile_name}",        # 使用 Profile 名称
    phone=None,
    password_hash=None,
    user_type=UserType.ADMIN,
    auth_mode=AuthMode.LOCAL,         # standalone 为 LOCAL，bound 为 CLOUD
    cloud_user_id=None,               # bound 时填入云端用户 ID
)
```

---

## 6. 认证流程

### 6.1 登录页面

用户打开应用后进入登录页面，看到三个入口：

```
┌─────────────────────────────────────────┐
│                                         │
│            FreeTodo 登录                │
│                                         │
│   ┌─────────────────────────────────┐   │
│   │  手机号登录                      │   │
│   │  已有账号，使用验证码登录          │   │
│   └─────────────────────────────────┘   │
│                                         │
│   ┌─────────────────────────────────┐   │
│   │  手机号注册                      │   │
│   │  新用户注册，设置用户名           │   │
│   └─────────────────────────────────┘   │
│                                         │
│              ── 或 ──                    │
│                                         │
│   ┌─────────────────────────────────┐   │
│   │  本地安全模式                    │   │
│   │  离线使用，数据仅存本地           │   │
│   └─────────────────────────────────┘   │
│                                         │
└─────────────────────────────────────────┘
```

### 6.2 本地安全模式登录流程

```
用户点击「本地安全模式」
→ 前端调用 GET /api/v1/profile/list
→ 有 standalone Profile？
  ├── 有 → 直接选中（如果只有一个）或弹出选择列表
  └── 没有 → 弹出输入框让用户输入名字
→ 调用 POST /api/v1/profile/create（如需创建） + POST /auth/local_login
→ 后端创建/激活 Profile → 初始化 SQLite → 创建默认用户
→ 签发本地 JWT Token → 返回 access_token + refresh_token
→ 前端存储 Token + profile_id → 跳转主页
```

### 6.3 云端注册流程

```
用户选择「手机号注册」→ 输入用户名 + 密码 + 手机号 + 验证码
→ 前端请求 local-api POST /auth/send_code
→ local-api 通过 cloud_auth_proxy 转发至 cloud-api → 发送短信验证码
→ 前端请求 local-api POST /auth/register { phone, code, username, password }
→ local-api 通过 cloud_auth_proxy 转发至 cloud-api 完成注册
→ cloud-api 返回云端 Token → local-api 用云端 Token 获取用户信息
→ 自动关联本地 Profile（见 6.3.1）
→ local-api 签发本地 JWT Token（含 profile_id） → 返回给前端
→ 前端存储 Token + profile_id → 跳转主页
```

> **关键设计**：`local-api` 不直接处理验证码和用户注册，所有手机号认证操作
> 通过 `cloud_auth_proxy` 模块转发到 `cloud-api`。网络不可用时返回 503 错误，
> 不提供本地降级。

#### 6.3.1 首次云端注册的本地数据自动关联

当用户首次注册云端账户时，系统按以下优先级查找可复用的本地 Profile：

1. **已绑定该 cloud_user_id 的 Profile**：直接切换激活（通常出现在重复注册场景）
2. **当前激活的 standalone Profile**：优先绑定当前工作空间，保留已有数据
3. **其他 standalone Profile**：绑定第一个找到的未绑定 Profile
4. **均不存在**：创建新的 bound Profile

绑定时自动执行：
- 调用 `bind_cloud` 将 Profile 与云端账户关联（永久不可逆）
- 将 Profile 名称更新为云端用户名
- 将 Profile 中已有的本地默认用户（`User.id == profile_id`）升级为云端用户：
  - `username` → 云端用户名
  - `phone` → 注册手机号
  - `auth_mode` → CLOUD
  - `cloud_user_id` → 云端用户 ID
- 所有已有数据（待办、日记、标签、聊天记录等）自动保留，无需迁移

### 6.4 云端验证码登录流程

```
用户输入手机号 + 验证码
→ 前端请求 local-api POST /auth/verify
→ local-api 通过 cloud_auth_proxy 转发至 cloud-api 验证
→ cloud-api 返回云端 Token → local-api 用云端 Token 获取用户信息
→ 自动关联本地 Profile（逻辑同注册流程 6.3.1）
→ local-api 签发本地 Token（含 profile_id） → 返回给前端
```

### 6.5 已有 Profile 绑定云端账户

```
当前激活：standalone Profile
→ 用户在设置页点击「绑定云端账户」
→ 完成云端注册或登录（获取 cloud_user_id）
→ local-api 更新 profiles.json：该 Profile 的 cloud_user_id = 云端ID
→ Profile 升级为 bound（永久，不可逆）
→ 本地数据全量同步到云端
→ 后续联网时自动增量同步
```

### 6.6 切换云端账户

```
当前激活：Profile A（bound → cloud user X）
→ 用户登出 → 登录页面 → 登录云端 user Y
→ 系统查找本地是否有 cloud_user_id == Y 的 Profile
  ├── 有（Profile B）→ 激活 Profile B → 增量同步
  └── 没有 → 创建新 Profile C → 绑定 cloud user Y → 全量同步
→ Profile A 仍保留在磁盘，只是不再活跃
→ 用户重新登录 cloud user X 时，可直接切回 Profile A
```

### 6.7 Token 设计

| 字段 | 说明 |
|------|------|
| sub | 用户 ID（Profile 内的 User.id） |
| auth_mode | 认证模式（`local` / `cloud`） |
| token_type | `access` / `refresh` |
| exp | 过期时间 |
| 签名算法 | HS256（可配置） |

| Token 类型 | Standalone 有效期 | Bound 有效期 |
|-----------|-----------------|-------------|
| access_token | 30 天 | 60 分钟 |
| refresh_token | 365 天 | 7 天 |

### 6.8 Token 刷新机制

**Standalone Profile**：
```
access_token 过期 → 前端检测 exp
→ 用 refresh_token 请求 /auth/refresh_token
→ local-api 直接验证并签发新 Token
```

**Bound Profile**：
```
access_token 过期 → 前端用 refresh_token 请求 /auth/refresh_token
→ local-api 同时刷新本地 Token 和云端 Token（转发至 cloud-api）
→ 缓存新的云端 Token → 返回新的本地 Token
```

---

## 7. API 接口设计

> 所有接口由 `local-api` 提供。bound Profile 下，`local-api` 将相关请求转发至 `cloud-api`。
> 前端无需感知后端是本地处理还是云端转发，接口路径和响应格式完全一致。

### 7.1 Profile 接口 (`/api/v1/profile`)

| 方法 | 路径 | 说明 | 请求体 |
|------|------|------|--------|
| POST | `/profile/create` | 创建 Profile | `{ name }` |
| GET | `/profile/list` | 列出所有 Profile | - |
| GET | `/profile/current` | 获取当前激活 Profile | - |
| POST | `/profile/switch` | 切换激活的 Profile | `{ profile_id }` |
| POST | `/profile/bind-cloud` | 绑定云端账户（永久） | `{ profile_id, cloud_user_id, cloud_username }` |

### 7.2 认证接口 (`/api/v1/auth`)

| 方法 | 路径 | 说明 | 模式 | 请求体 |
|------|------|------|------|--------|
| POST | `/auth/local_login` | 本地安全模式登录 | 本地 | `{ profile_id? }` |
| POST | `/auth/send_code` | 发送短信验证码 | 云端 | `{ phone, purpose }` |
| POST | `/auth/verify` | 验证码登录 | 云端 | `{ phone, code }` |
| POST | `/auth/register` | 注册 | 云端 | `{ phone, code, username, password }` |
| POST | `/auth/login` | 密码登录 | 云端 | `{ phone, password }` |
| POST | `/auth/reset_password` | 重置密码 | 云端 | `{ phone, code, new_password }` |
| POST | `/auth/refresh_token` | 刷新 Token | 通用 | `{ refresh_token }` |
| GET | `/auth/me` | 获取当前用户资料 | 通用 | - (Header: Bearer Token) |

### 7.3 用户接口 (`/api/v1/user`)

| 方法 | 路径 | 说明 | 模式 | 请求体/参数 |
|------|------|------|------|-------------|
| PUT | `/user/username` | 修改用户名 | 通用 | `{ username }` |
| POST | `/user/avatar` | 上传头像 | 通用 | multipart/form-data |
| GET | `/user/avatar` | 获取头像 | 通用 | - |
| POST | `/user/upgrade` | 升级会员 | 云端 | `{ plan_id }` |
| GET | `/user/usage-stats` | 获取使用统计 | 通用 | - |
| GET | `/user/auth-mode` | 获取当前用户认证模式 | 通用 | - |

### 7.4 请求/响应 Schema

#### Profile 创建

```python
class CreateProfileRequest(BaseModel):
    name: str

class ProfileResponse(BaseModel):
    id: str
    name: str
    cloud_user_id: str | None
    cloud_username: str | None
    bound_at: str | None
    created_at: str
```

#### Profile 列表

```python
class ProfileListResponse(BaseModel):
    active_profile_id: str | None
    profiles: list[ProfileResponse]
```

#### 本地登录响应

```python
class LocalLoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    auth_mode: str = "local"
    user_id: str
    profile_id: str
```

#### Token 响应

```python
class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    auth_mode: str    # "local" 或 "cloud"
    profile_id: str   # 当前激活的 Profile ID
```

#### 用户资料响应

```python
class UserProfileResponse(BaseModel):
    id: str
    username: str
    phone: str | None
    user_type: str
    auth_mode: str
    membership_type: str
    is_dev: bool = False
    avatar_url: str | None = None
    last_login_at: datetime | None
    created_at: datetime
    profile_id: str            # 所属 Profile
    profile_name: str          # Profile 名称
    is_bound: bool             # 是否已绑定云端
```

---

## 8. 后端实现

### 8.1 目录结构

```
local-api/
├── services/
│   ├── profile_service.py         # Profile 管理（创建/列表/切换/绑定/迁移）
│   ├── local_auth_service.py      # 本地认证（适配 Profile）
│   ├── phone_auth_service.py      # 手机号验证码认证（调用 cloud proxy）
│   ├── cloud_auth_proxy.py        # Cloud API 认证代理（httpx 转发）
│   ├── user_account_service.py    # 用户资料查询与修改
│   ├── membership_service.py      # 会员服务
│   └── ...
├── routers/
│   ├── profile.py                 # Profile API 路由
│   ├── auth.py                    # 认证路由
│   ├── user_api.py                # 用户路由
│   └── ...
├── dependencies/
│   └── auth.py                    # 认证依赖（Bearer Token → User）
├── storage/
│   ├── database_base.py           # 数据库管理（支持 Profile 切换）
│   ├── models.py                  # SQLModel 数据模型
│   └── database.py                # 数据库单例
├── core/
│   ├── security.py                # JWT Token 创建与验证
│   ├── dependencies.py            # 依赖注入工厂
│   └── ...
├── schemas/
│   └── auth.py                    # 请求/响应 Schema
├── util/
│   ├── base_paths.py              # 基础路径（感知 active Profile）
│   └── path_utils.py              # 路径工具函数
└── config/
    └── default_config.yaml        # 默认配置
```

### 8.2 Profile 管理服务 (services/profile_service.py)

```python
class ProfileService:
    def create_profile(name: str, cloud_user_id: str | None = None) -> ProfileInfo
    def list_profiles() -> ProfileListData
    def get_active_profile() -> ProfileInfo | None
    def switch_profile(profile_id: str) -> ProfileInfo
    def bind_cloud(profile_id: str, cloud_user_id: str, cloud_username: str) -> ProfileInfo
    def find_profile_by_cloud_user(cloud_user_id: str) -> ProfileInfo | None
    def ensure_migrated() -> None    # 旧数据自动迁移
```

### 8.3 路径层 Profile 感知 (util/base_paths.py)

`get_user_data_dir()` 根据 active Profile 返回对应的数据目录：

```python
def get_user_data_dir() -> Path:
    base = get_data_directory() or get_app_root()
    profile_id = _get_active_profile_id()
    if profile_id:
        return base / "data" / "profiles" / profile_id
    return base / "data"    # 兼容无 Profile 模式
```

下游的 `get_database_path()`、`get_screenshots_dir()`、`get_attachments_dir()` 等函数无需修改，自动跟随 `get_user_data_dir()` 指向正确的 Profile 目录。

### 8.4 数据库支持 Profile 切换 (storage/database_base.py)

`DatabaseBase` 支持通过 `reinitialize()` 方法在 Profile 切换时关闭旧 engine、创建新 engine：

```python
class DatabaseBase:
    def reinitialize(self) -> None:
        """Profile 切换后重新初始化数据库连接"""
        if self.engine:
            self.engine.dispose()
        self._init_database()
```

### 8.5 旧数据迁移

首次启动检测到 `profiles.json` 不存在时，自动迁移：

1. 创建 `data/profiles/default/` 目录
2. 将 `data/lifetrace.db`、`data/screenshots/`、`data/audio/` 等移入 `data/profiles/default/`
3. 生成 `profiles.json`，`active_profile_id = "default"`

迁移在 server 启动前由 `profile_service.ensure_migrated()` 完成。

---

## 9. 前端实现

### 9.1 目录结构

```
local-web/
├── app/login/
│   ├── page.tsx
│   ├── LoginPageEntry.tsx
│   └── LoginPageClient.tsx        # 登录页（含 Profile 创建/选择）
├── components/user/
│   └── user-menu.tsx              # 用户菜单（显示 Profile 信息 + 切换入口）
├── lib/
│   ├── store/
│   │   └── auth-store.ts          # Auth + Profile 状态管理（Zustand）
│   ├── auth/
│   │   ├── auth-mode.ts           # 认证模式管理
│   │   └── token.ts               # Token 管理
│   └── api/
│       └── fetcher.ts             # 统一 HTTP 请求
```

### 9.2 Auth Store (lib/store/auth-store.ts)

```typescript
interface AuthState {
    isAuthenticated: boolean;
    authMode: AuthMode;
    username: string | null;
    profileId: string | null;
    profileName: string | null;

    login: (accessToken: string, refreshToken: string, mode: AuthMode, profileId: string) => void;
    logout: () => void;
    hydrate: () => void;
    fetchProfile: () => Promise<void>;
}
```

### 9.3 登录页面本地模式流程

```typescript
async function handleLocalLogin() {
    // 1. 获取 Profile 列表
    const profiles = await fetch("/api/v1/profile/list").then(r => r.json());
    const standaloneProfiles = profiles.profiles.filter(p => !p.cloud_user_id);

    // 2. 选择或创建 Profile
    let profileId: string;
    if (standaloneProfiles.length === 0) {
        // 弹出输入框让用户设置名字
        const name = await promptProfileName();
        const created = await fetch("/api/v1/profile/create", {
            method: "POST",
            body: JSON.stringify({ name }),
        }).then(r => r.json());
        profileId = created.id;
    } else if (standaloneProfiles.length === 1) {
        profileId = standaloneProfiles[0].id;
    } else {
        // 弹出选择列表
        profileId = await promptSelectProfile(standaloneProfiles);
    }

    // 3. 登录
    const data = await fetch("/api/v1/auth/local_login", {
        method: "POST",
        body: JSON.stringify({ profile_id: profileId }),
    }).then(r => r.json());

    login(data.access_token, data.refresh_token, "local", profileId);
}
```

### 9.4 用户菜单

```typescript
function UserMenu() {
    // 显示：Profile 名称 + 模式标识（本地/云端）
    // 菜单项：切换工作空间、退出登录
}
```

### 9.5 UI 差异：Standalone vs Bound

| UI 元素 | Standalone | Bound |
|---------|-----------|-------|
| 用户菜单标识 | Profile 名称 + 「本地」标签 | Profile 名称 + 「云端」标签 |
| 会员升级入口 | 隐藏 | 显示 |
| 绑定云端账户 | 在设置中显示入口 | 隐藏（已绑定） |
| 数据同步状态 | 不显示 | 显示同步状态指示器 |
| 积分购买 | 隐藏 | 显示 |
| 切换工作空间 | 用户菜单中显示 | 用户菜单中显示 |

---

## 10. 会员与积分系统

### 10.1 会员等级

| 等级 | 类型 | 项目限制 | 积分配置 | 有效期 |
|------|------|---------|---------|--------|
| 免费 | free | 较低 | 注册赠送初始积分 | 1年(自动续) |
| 月度 | monthly | 中等 | 初始积分 + 每日刷新 | 30天 |
| 年度 | yearly | 较高 | 更多初始积分 + 每日刷新 | 365天 |

### 10.2 积分机制

- **每日积分** (`daily_credits`)：每天刷新，当天未用完则过期
- **永久积分** (`permanent_credits`)：购买或赠送获得，永不过期
- **消耗优先级**：优先消耗每日积分，再消耗永久积分
- **积分用途**：AI 对话、语音识别、内容生成等功能

### 10.3 Standalone Profile 会员

Standalone Profile 默认用户自动获得免费会员，功能限制与云端免费用户一致。升级会员需先绑定云端账户。

---

## 11. 数据同步设计

### 11.1 同步分类

| 分类 | 表 | 同步？ | 原因 |
|------|----|--------|------|
| 用户内容 | todos, tags, todo_tag_relations | 同步 | 核心用户数据 |
| 用户内容 | journals, journal_tag_relations | 同步 | 核心用户数据 |
| 用户内容 | attachments, todo_attachment_relations | 同步 | 附件跟随待办 |
| 用户内容 | chats, messages | 同步 | 聊天记录 |
| 用户内容 | automation_tasks | 同步 | 用户配置 |
| 设备感知 | screenshots, ocr_results | 不同步 | 体积大，设备专属 |
| 设备感知 | events, activities | 不同步 | 屏幕追踪，设备专属 |
| 设备感知 | audio_recordings, transcriptions | 不同步 | 体积大，设备专属 |
| 设备感知 | speaker_profiles, speaker_voiceprints | 不同步 | 声纹是设备本地的 |
| 系统内部 | token_usage, agent_plans/runs/steps | 不同步 | 执行日志，设备本地 |
| 关联表 | journal_todo_relations | 同步 | 用户内容关联 |
| 关联表 | journal_activity_relations | 不同步 | activity 是设备本地的 |
| 位置数据 | location_records | 可选同步 | 取决于产品需求 |

### 11.2 同步字段要求

每个需要同步的表必须有：
- `uid`（UUID 字符串）— 全局唯一标识符（`todos` 和 `journals` 已有）
- `updated_at` — 变更检测
- `deleted_at` — 软删除同步

需要补充 `uid` 字段的同步表：`tags`、`messages`、`attachments`、`automation_tasks`。

### 11.3 同步协议

```
推送（Push）：
  本地筛选 updated_at > last_push_at 的记录
  → POST /cloud-api/sync/push { records: [...] }
  → 云端存储，返回确认

拉取（Pull）：
  GET /cloud-api/sync/pull?since={last_pull_at}
  → 云端返回该时间之后的所有变更
  → 本地按 uid 合并（upsert）

冲突策略：
  updated_at 大的赢（last-write-wins）
  同一秒内冲突：云端优先
```

### 11.4 同步时机

| 时机 | 行为 |
|------|------|
| App 启动（联网） | 后台拉取云端变更 |
| 用户操作后 | 防抖 5 秒后推送变更 |
| App 切到前台 | 拉取一次 |
| 定时 | 每 5 分钟增量同步 |
| 手动 | 设置页面「立即同步」按钮 |

---

## 12. 环境变量配置

### 认证相关

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `AUTH_SECRET_KEY` | JWT 签名密钥 | `default-secret` |
| `AUTH_ALGORITHM` | JWT 签名算法 | `HS256` |
| `AUTH_ACCESS_TOKEN_EXPIRE_MINUTES` | Bound 模式 access_token 过期(分) | `60` |
| `AUTH_REFRESH_TOKEN_EXPIRE_DAYS` | Bound 模式 refresh_token 过期(天) | `7` |
| `LOCAL_ACCESS_TOKEN_EXPIRE_DAYS` | Standalone 模式 access_token 过期(天) | `30` |
| `LOCAL_REFRESH_TOKEN_EXPIRE_DAYS` | Standalone 模式 refresh_token 过期(天) | `365` |
| `AUTH_IS_DEBUG` | 调试模式（cloud-api 侧使用固定验证码） | `False` |
| `AUTH_DEBUG_CODE` | 调试模式下的固定验证码（cloud-api 侧） | `888888` |

### 云端 API 转发相关

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `auth.cloud_api_url` | 云端 API 地址（`default_config.yaml` 中配置） | `http://127.0.0.1:8000` |

> `cloud_auth_proxy.py` 使用 `httpx.AsyncClient` 转发请求，默认超时 30 秒。
> 云端不可达时返回 HTTP 503 错误，不提供本地降级。

### 安全注意事项

- JWT `SECRET_KEY` 必须使用强随机字符串，不要使用默认值
- 生产环境必须关闭 `AUTH_IS_DEBUG`
- Profile 的 SQLite 文件应设置合理的文件权限（仅当前用户可读写）
- 云端转发时，cloud_token 缓存应加密存储
- 短信验证码应限制发送频率（如 60 秒/次，每日上限）
- 不要提交 `profiles.json`、`config.yaml`、数据库文件等运行时数据

---

## 13. 实施路线

### 阶段 1：Profile 隔离（优先）

1. **Profile 管理服务**：`profile_service.py` — 创建/列表/切换/绑定 Profile
2. **路径层适配**：`base_paths.py` — `get_user_data_dir()` 感知 active Profile
3. **数据库适配**：`database_base.py` — 支持 Profile 切换时重新初始化
4. **Profile API**：`routers/profile.py` — CRUD 路由
5. **认证适配**：`local_auth_service.py`、`auth.py` — 登录流程关联 Profile
6. **旧数据迁移**：首次启动自动将现有数据迁移为默认 Profile
7. **前端登录页**：Profile 创建/选择 UI
8. **前端用户菜单**：显示 Profile 信息 + 切换入口

### 阶段 2：云端绑定 + 基础同步

1. **云端转发代理**：local-api 中实现 `CloudProxyService` + 转发路由
2. **本地用户映射**：云端登录后在 Profile 内创建映射用户
3. **同步服务**：`sync_service.py` — push/pull 核心逻辑
4. **同步字段补充**：给缺 `uid` 的同步表补字段
5. **cloud-api 同步接口**：接收/返回变更数据

### 阶段 3：多设备同步 + 离线增强

1. **冲突解决**：last-write-wins + 云端优先策略
2. **离线变更队列**：记录离线期间的写操作，恢复后批量推送
3. **附件文件同步**：大文件分片上传/下载
4. **同步状态 UI**：进度条、冲突提示、手动同步按钮

### 依赖清单

**local-api Python 依赖**（无需新增，现有依赖已满足）：

```
fastapi, uvicorn, sqlmodel, aiosqlite, python-jose[cryptography],
passlib[bcrypt], httpx, python-dotenv, pillow
```

**cloud-api Python 依赖**：

```
fastapi, uvicorn, pydantic-settings, sqlmodel, asyncpg, psycopg2-binary,
greenlet, alembic, redis, python-jose[cryptography], bcrypt, httpx,
python-dotenv, pillow, minio, python-multipart, loguru,
alibabacloud-dysmsapi20170525
```
