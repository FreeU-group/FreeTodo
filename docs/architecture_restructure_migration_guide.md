# 架构重构迁移指南 — 从旧目录结构到新目录结构

本文档记录了 `feat/user` 分支上的全部架构调整，用于在合作者的分支上重新执行相同的结构变更。

---

## 1. 变更总览

本次架构调整的核心是 **统一目录命名规范**，使每个模块的职责与部署拓扑从目录名即可辨识。

- `local-*` 前缀表示运行在本地设备上的模块
- `cloud-*` 前缀表示运行在云端的集中式服务

总计涉及约 **2383 个文件** 变更（1300 重命名 + 1003 删除 + 7 新增 + 73 修改）。

### 1.1 目录重命名映射表

| 旧路径 | 新路径 | 文件数 | 说明 |
|--------|--------|--------|------|
| `server/` | `local-api/` | 352 | FastAPI 后端（SQLite + ChromaDB） |
| `frontend/` | `local-web/` | 916 | Next.js 前端 + Electron/Tauri 桌面壳 |
| `client/` | `local-sensor/` | 32 | Python 本地感知客户端（OCR、屏幕捕获） |
| `phone/` | 已删除 | ~995 | Flutter 移动应用代码从此分支移除 |

### 1.2 新增目录

`cloud-api/` — 云端 API（用户认证、数据同步、Postgres），目录结构：

```
cloud-api/
├── app/
│   ├── __init__.py
│   ├── main.py
│   ├── core/          # 核心配置
│   ├── db/            # 数据库连接
│   ├── dependencies/  # 依赖注入
│   ├── models/        # SQLModel 模型
│   ├── routers/       # API 路由
│   ├── schemas/       # Pydantic 数据模型
│   ├── services/      # 业务逻辑
│   └── utils/         # 工具函数
├── alembic/           # 数据库迁移
├── alembic.ini
├── scripts/           # 辅助脚本
├── pyproject.toml
└── uv.lock
```

### 1.3 新增文件

以下文件因内容变化较大，Git 未识别为 rename，属于新增：

| 文件 | 说明 |
|------|------|
| `local-api/.env.example` | 后端环境变量模板（从 `server/.env.example` 演化，新增 auth/cloud 配置） |
| `local-web/.env.example` | 前端环境变量模板（新增） |
| `local-web/components/auth/AuthShell.tsx` | 认证壳组件（原访客模式改为统一登录） |
| `local-web/components/auth/HomeAuthGate.tsx` | 首页认证门控 |
| `local-web/lib/query/setup.ts` | React Query 全局配置 |
| `local-web/lib/runtime-backend-url.ts` | 运行时后端 URL 解析（支持 local-api / cloud-api 双后端） |
| `local-web/lib/store/auth-store.ts` | Zustand 认证状态管理 |
| `scripts/run_db.sh` | 一键启动 PostgreSQL 和 Redis 开发环境脚本 |
| `docs/architecture/架构图.md` | 新增架构图文档 |

此外 `cloud-api/` 整个目录（61 个文件）均为新增，包含完整的 FastAPI + Postgres 云端 API 实现。

### 1.4 重构后的顶层目录结构

```
FreeTodo/
├── local-api/          # FastAPI 后端（SQLite + ChromaDB）
├── local-web/          # Next.js 前端 + Electron/Tauri 桌面壳
├── local-sensor/       # Python 感知客户端（OCR、屏幕捕获）
├── cloud-api/          # 云端 API（用户认证、数据同步、Postgres）
├── cli/                # FreeTodo CLI 工具
├── deploy/             # Docker Compose 部署配置
├── docs/               # 项目文档
├── hardware/           # 硬件集成
├── scripts/            # 全局脚本
├── mac-scripts/        # macOS 专用脚本
├── windows-scripts/    # Windows 专用脚本
├── .github/            # CI/CD、贡献指南
├── AGENTS.md           # AI Agent 协作规范
├── CLAUDE.md           # CLAUDE.md 协作规范（与 AGENTS.md 镜像）
├── README.md / README_CN.md
├── .pre-commit-config.yaml
├── .gitignore
├── bandit.yaml
├── biome.json
├── makefile
└── pyrightconfig.json
```

---

## 2. 逐步迁移操作

### Step 1: 目录重命名（核心操作）

使用 `git mv` 保留历史：

```bash
git mv server local-api
git mv frontend local-web
git mv client local-sensor
```

如果需要移除 `phone/`：

```bash
git rm -r phone
```

> **重要**：执行 `git mv` 后立即提交一次，让后续 diff 更清晰。

### Step 2: 新增文件处理

1. 创建 `local-api/.env.example`，内容参考下方模板
2. 创建 `local-web/.env.example`
3. 创建认证相关前端文件（如有需要）：
   - `local-web/components/auth/AuthShell.tsx`
   - `local-web/components/auth/HomeAuthGate.tsx`
   - `local-web/lib/query/setup.ts`
   - `local-web/lib/runtime-backend-url.ts`
   - `local-web/lib/store/auth-store.ts`

### Step 3: 根目录配置文件路径替换

#### `.gitignore`

```diff
-server/data/
-server/config/config.yaml
+local-api/data/
+local-api/config/config.yaml

-client/config/config.yaml
+local-sensor/config/config.yaml

-!phone/lib/gen/
+!phone-app/lib/gen/

-phone/ios/Pods/
-phone/ios/.symlinks/
-phone/ios/Flutter/Flutter.podspec
-phone/ios/Runner.xcworkspace/
+phone-app/ios/Pods/
+phone-app/ios/.symlinks/
+phone-app/ios/Flutter/Flutter.podspec
+phone-app/ios/Runner.xcworkspace/

-frontend/.notification-popup.json
+local-web/.notification-popup.json
```

#### `biome.json`

```diff
-"includes": ["**", "!frontend/lib/generated/**"]
+"includes": ["**", "!local-web/lib/generated/**"]
```

#### `bandit.yaml`

```diff
 exclude_dirs:
   - dist
   - build
   - cli/tests
-  - client/tests
+  - local-sensor/tests
   - migrations/versions
-  - server/.venv
-  - server/data
-  - server/migrations/versions
-  - server/tests
-  - server/build
-  - server/dist
+  - local-api/.venv
+  - local-api/data
+  - local-api/migrations/versions
+  - local-api/tests
+  - local-api/build
+  - local-api/dist
```

#### `pyrightconfig.json`

```diff
-"include": ["server", "scripts"],
+"include": ["local-api", "scripts"],
 "exclude": [
   ...
-  "server/data",
-  "server/data/**",
-  "server/migrations/versions"
+  "local-api/data",
+  "local-api/data/**",
+  "local-api/migrations/versions"
 ]
```

#### `makefile`

```diff
 build-server:
-  cd server && docker build -t $(SERVER_IMAGE):$(VERSION) .
+  cd local-api && docker build -t $(SERVER_IMAGE):$(VERSION) .
```

#### `.pre-commit-config.yaml`

完整替换规则：

| 位置 | 旧值 | 新值 |
|------|------|------|
| end-of-file-fixer exclude | `^frontend/lib/generated/` | `^local-web/lib/generated/` |
| trailing-whitespace exclude | `^frontend/lib/generated/` | `^local-web/lib/generated/` |
| ruff files (后端) | `^(server\|scripts)/` | `^(local-api\|scripts)/` |
| ruff exclude (后端) | `^server/migrations/versions/` | `^local-api/migrations/versions/` |
| ruff-format files (后端) | `^(server\|scripts)/` | `^(local-api\|scripts)/` |
| ruff files (客户端) | `^client/` | `^local-sensor/` |
| ruff-format files (客户端) | `^client/` | `^local-sensor/` |
| biome-check name | `Biome check (frontend)` | `Biome check (local-web)` |
| biome-check entry | `pnpm --dir frontend exec biome ...` | `pnpm --dir local-web exec biome ...` |
| biome-check files | `^frontend/.*` | `^local-web/.*` |
| bandit entry | `uv run --project server` | `uv run --project local-api` |
| bandit files | `^(server\|client\|cli\|scripts)/` | `^(local-api\|local-sensor\|cli\|scripts)/` |
| pyright files (注释中) | `^(server\|scripts)/` | `^(local-api\|scripts)/` |
| pytest-quick entry | `uv run --directory server` | `uv run --directory local-api` |
| pytest-quick files | `^(server\|tests)/` | `^(local-api\|tests)/` |
| tsc-frontend name | `TypeScript type check (frontend/)` | `TypeScript type check (local-web/)` |
| tsc-frontend entry | `pnpm --dir frontend run type-check` | `pnpm --dir local-web run type-check` |
| tsc-frontend files | `^frontend/.*` | `^local-web/.*` |
| check-frontend-code-lines entry | `node frontend/scripts/check_code_lines.js` | `node local-web/scripts/check_code_lines.js` |
| check-frontend-code-lines files | `^(frontend\|scripts)/` | `^(local-web\|scripts)/` |
| check-python-code-lines entry | `uv run --project server ... python server/scripts/check_code_lines.py --include server,client ... --exclude ...server/...client/...` | `uv run --project local-api ... python local-api/scripts/check_code_lines.py --include local-api,local-sensor ... --exclude ...local-api/...local-sensor/...` |
| check-python-code-lines files | `^(server\|client\|cli\|scripts)/` | `^(local-api\|local-sensor\|cli\|scripts)/` |
| check-tauri-rust-code-lines entry | `node frontend/scripts/check_rust_code_lines.js` | `node local-web/scripts/check_rust_code_lines.js` |
| check-tauri-rust-code-lines files | `^frontend/src-tauri/` | `^local-web/src-tauri/` |
| rustfmt files | `^frontend/src-tauri/` | `^local-web/src-tauri/` |
| clippy files | `^frontend/src-tauri/` | `^local-web/src-tauri/` |

### Step 4: CI/CD 配置更新

#### `.github/workflows/pre-commit.yml`

```diff
 # path filter
-'server/**'
-'client/**'
+'local-api/**'
+'local-sensor/**'

-'server/pyproject.toml'
-'client/pyproject.toml'
+'local-api/pyproject.toml'
+'local-sensor/pyproject.toml'

-'frontend/**'
+'local-web/**'

-'frontend/src-tauri/**'
+'local-web/src-tauri/**'

 # backend deps
-run: uv sync --directory server --group dev
+run: uv sync --directory local-api --group dev

 # database init
-uv run --directory server python - <<'PY'
+uv run --directory local-api python - <<'PY'

 # alembic
-working-directory: server
+working-directory: local-api

 # frontend deps
-run: pnpm --dir frontend install
+run: pnpm --dir local-web install
```

#### `.github/workflows/_disabled/dev-build-verify.yml`

- `working-directory` 与 artifact 路径：`frontend` → `local-web`

#### `.github/workflows/_disabled/tauri-release.yml`

- `working-directory`：`frontend` → `local-web`

### Step 5: 脚本文件更新

以下 **32 个脚本文件** 中的旧路径引用需全部替换：

**`mac-scripts/`** (4 个文件):
- `quick-start-all.sh` — `SERVER_DIR`, `FRONTEND_DIR`, `SENSOR_DIR` 变量
- `start-center.sh` — `SERVER_DIR`, `FRONTEND_DIR` 变量
- `start-local.sh` — `FRONTEND_DIR`, `CLIENT_DIR` 变量及 echo 输出
- `start-sensor.sh` — `SENSOR_DIR` 变量

**`scripts/`** (25 个文件):
- `build_media_crawler_plugin.py` — `find_project_root()` 中 `(root / "server")` → `(root / "local-api")`
- `center-node/start-center-1-phoenix.sh` — `cd "$REPO_ROOT/server"` → `cd "$REPO_ROOT/local-api"`
- `center-node/start-center-2-agentos.sh` — 同上
- `center-node/start-center-3-backend.sh` — 同上
- `center-node/start-center-4-frontend.sh` — `cd "$REPO_ROOT/frontend"` → `cd "$REPO_ROOT/local-web"`
- `center-node/start-center.bat` — `SERVER_DIR`, `FRONTEND_DIR` 及提示语
- `center-node/start-center.sh` — 同类路径替换
- `center-node/kol-push-standalone.bat` — `FRONTEND_DIR`
- `start-center-*.sh`（顶层副本）— 同 center-node 子目录
- `start-center.bat` / `start-center.sh` — 同上
- `start-sensor.bat` / `start-sensor.sh` — `SENSOR_DIR` / `CLIENT_DIR`
- `start_all.sh` / `start_all.ps1` — 服务目录变量
- `stop_all.sh` / `stop_all.ps1` — 进程路径匹配
- `pc-node/signal-sensor.py` / `pc-node/start-sensor.bat` — 客户端路径
- `signal-sensor.py` — 同上
- `kol-push-standalone.bat` — `FRONTEND_DIR`
- `precommit_clippy.py` / `precommit_rustfmt.py` — `frontend/src-tauri` → `local-web/src-tauri`

**`windows-scripts/`** (2 个文件):
- `start-center.bat` — `SERVER_DIR`, `FRONTEND_DIR`
- `start-sensor.bat` — `SENSOR_DIR`

**通用替换模式**：

```
cd "$REPO_ROOT/server"       →  cd "$REPO_ROOT/local-api"
cd "$REPO_ROOT/frontend"     →  cd "$REPO_ROOT/local-web"
cd "$REPO_ROOT/client"       →  cd "$REPO_ROOT/local-sensor"

SERVER_DIR="$REPO_ROOT/server"       →  SERVER_DIR="$REPO_ROOT/local-api"
FRONTEND_DIR="$REPO_ROOT/frontend"   →  FRONTEND_DIR="$REPO_ROOT/local-web"
SENSOR_DIR="$REPO_ROOT/client"       →  SENSOR_DIR="$REPO_ROOT/local-sensor"
CLIENT_DIR="$REPO_ROOT/client"       →  CLIENT_DIR="$REPO_ROOT/local-sensor"

%REPO_ROOT%\server       →  %REPO_ROOT%\local-api
%REPO_ROOT%\frontend     →  %REPO_ROOT%\local-web

uv run --directory server   →  uv run --directory local-api
pnpm --dir frontend         →  pnpm --dir local-web
```

### Step 6: 文档更新

需要更新的文档清单（共约 25 个文件），按类别分组：

#### 根目录文档

| 文件 | 变更范围 |
|------|----------|
| `AGENTS.md` | 模块目录说明、所有 `uv`/`pnpm` 命令路径、测试路径、安全提示、worktree 依赖说明 |
| `CLAUDE.md` | 与 `AGENTS.md` 镜像同步 |
| `README.md` | 项目结构、快速开始命令、目录树示意 |
| `README_CN.md` | 同 `README.md` 中文版 |

#### `.github/` 文档

| 文件 | 变更范围 |
|------|----------|
| `CONTRIBUTING.md` / `CONTRIBUTING_CN.md` | 示例中 `cd frontend` → `cd local-web` |
| `FRONTEND_GUIDELINES.md` / `FRONTEND_GUIDELINES_CN.md` | 项目结构树 `frontend/` → `local-web/` |
| `PRE_COMMIT_GUIDE.md` / `PRE_COMMIT_GUIDE_CN.md` | 路径、命令示例、关键配置说明 |

#### `docs/` 文档

| 文件 | 变更范围 |
|------|----------|
| `docs/architecture/server_to_api_migration.md` | 全文 `server` → `local-api`；新增第 8 节云侧实施记录 |
| `docs/architecture/AUDIO_PIPELINE.md` | 路径修正 |
| `docs/architecture/3-1_omi兼容层设计.md` | 路径修正 |
| `docs/guides/deployment/deploy_in_local.md` | `cd server` → `cd local-api` 等 |
| `docs/guides/deployment/deploy_in_cloud.md` | 路径对齐 |
| `docs/guides/precommit_security_checks.md` | 路径对齐 |
| `docs/guides/crawler_router_refactor.md` | 路径更新 |
| `docs/guides/3-2_omi端到端测试指南.md` | 路径/步骤更新 |
| `docs/iOS_打包测试流程指南.md` | `phone` → `phone-app` 等 |
| `docs/user.md` | 后端目录叙述、新增本地认证小节、访客模式标记为已移除 |
| `docs/plans/wechat_ocr_region_detection.md` | 路径调整 |
| `docs/plans/漫画功能更新记录_20260313-14.md` | 路径调整 |
| `docs/reports/CODE_REVIEW_REPORT.md` | 路径修订 |
| `docs/architecture/架构图.md` | 新增架构图文档 |

#### 其他文档

| 文件 | 变更范围 |
|------|----------|
| `cli/README.md` | 路径引用 |
| `hardware/音频链路部署指南.md` | 路径更新 |
| `.codex/environments/environment.toml` | 路径更新 |
| `.cursor/commands/web.md` / `web_CN.md` | 路径更新 |

### Step 7: CLI 代码微调

| 文件 | 变更内容 |
|------|----------|
| `cli/freetodo_cli/commands/logs.py` | 路径引用更新 |
| `cli/freetodo_cli/help_catalog.py` | 帮助文本中的路径 |
| `cli/tests/test_cli_system_search_vector.py` | 测试中的路径 |
| `cli/tests/test_cli_todo_core.py` | 测试中的路径 |

### Step 8: 内部代码路径残留清理

执行完上述步骤后，全局搜索以下旧路径确认无遗漏：

```bash
# 排除 .git、node_modules、.venv、.next 等目录
rg "server/" --type-not json -g '!.git' -g '!node_modules' -g '!.venv' -g '!.next' -g '!*.lock' -g '!pnpm-lock.yaml'
```

已知需要注意的遗留项：

- `local-api/services/plugin_manager.py` — 注释中仍提到 `server/`，应改为 `local-api/` 或"后端根目录"
- `local-api/config/default_config.yaml` — 新增了 `auth` 配置段（本地认证模式）
- `local-web/next.config.ts` — rewrites 配置需确认后端 URL 指向正确

**不需要替换的 `server` 出现位置**：

- `server.py` — 入口脚本文件名，在 `local-api/` 下运行
- `.next/server/` — Next.js 构建输出目录
- npm 包路径中的 `server` — 属于第三方包
- Docker Compose 中的服务名 — 逻辑名称可保持不变
- Python import 语句 — 不涉及目录名（除非 pyproject 中 package 名变了）

---

## 3. 全局搜索替换速查表

在目标分支上执行批量替换时使用（排除 `node_modules/`、`.git/`、`.venv/`、`.next/`、`*.lock`）：

| 搜索模式 | 替换为 | 说明 |
|----------|--------|------|
| `--directory server` | `--directory local-api` | uv 命令 |
| `--dir frontend` | `--dir local-web` | pnpm 命令 |
| `--project server` | `--project local-api` | uv 命令 |
| `cd server` | `cd local-api` | shell 脚本 |
| `cd frontend` | `cd local-web` | shell 脚本 |
| `cd client` | `cd local-sensor` | shell 脚本 |
| `server/` (路径上下文) | `local-api/` | 仅当指代后端目录时 |
| `frontend/` (路径上下文) | `local-web/` | 仅当指代前端目录时 |
| `client/` (路径上下文) | `local-sensor/` | 仅当指代感知客户端目录时 |
| `phone/` (路径上下文) | `phone-app/` | 仅在 `.gitignore` 等配置中 |

---

## 4. 验证清单

完成迁移后按顺序验证：

```bash
# 1. 后端依赖安装
uv sync --directory local-api

# 2. 客户端依赖安装
uv sync --directory local-sensor

# 3. 前端依赖安装
pnpm --dir local-web install

# 4. 后端 lint
uv run --directory local-api ruff check .

# 5. 后端格式化检查
uv run --directory local-api ruff format --check .

# 6. 后端测试
uv run --directory local-api pytest

# 7. 前端类型检查
pnpm --dir local-web type-check

# 8. 前端 Biome 检查
pnpm --dir local-web check

# 9. pre-commit 全量运行
pre-commit run --all-files

# 10. 全局搜索残留旧路径
rg '"server/' -g '!.git' -g '!node_modules' -g '!.venv' -g '!.next' -g '!*.lock'
rg '"frontend/' -g '!.git' -g '!node_modules' -g '!.venv' -g '!.next' -g '!*.lock'
rg '"client/' -g '!.git' -g '!node_modules' -g '!.venv' -g '!.next' -g '!*.lock'
```

---

## 5. 架构决策说明

### 5.1 双后端架构（local-api + cloud-api）

前端通过两个环境变量实现双后端路由分流：

- `NEXT_PUBLIC_SERVER_URL` → `local-api`（本地数据、LLM 编排、实时功能）
- `NEXT_PUBLIC_API_URL` → `cloud-api`（用户认证、数据同步、集中持久化）

前端 `next.config.ts` 的 rewrites 与 `lib/runtime-backend-url.ts` 负责运行时路由分发。

### 5.2 本地认证模式

`local-api/config/default_config.yaml` 新增 `auth` 配置段：

```yaml
auth:
  mode: ""           # "local" | "cloud" | ""
  secret_key: ""     # JWT 签名密钥
  access_token_expire_minutes: 10080
  refresh_token_expire_days: 30
  cloud_api_url: "http://127.0.0.1:8000"
  default_username: "admin"
  default_password: "admin123"
```

- `local` 模式：本地独立运行，使用 SQLite 存储用户凭证
- `cloud` 模式：认证请求转发至 cloud-api
- 空值：未选择，显示登录页引导用户选择

### 5.3 访客模式移除

- 原 `guest.py` 路由及前端访客入口已下线
- 未登录用户统一跳转 `/login`
- `docs/user.md` 中"访客模式"标记为已移除

### 5.4 phone/ 目录处理

本次从 `feat/user` 分支移除了 `phone/` 目录（约 995 个 Flutter 文件）。如果合作者分支仍需要移动端代码：

- 保留为 `phone-app/`（与 `.gitignore` 中的新路径一致）
- 或根据实际需要决定是否保留

---

## 6. 推荐执行顺序

1. **备份当前分支**：`git branch backup/before-restructure`
2. **执行 Step 1**（目录重命名）→ 提交
3. **执行 Step 3-4**（配置文件路径替换）→ 提交
4. **执行 Step 5**（脚本文件更新）→ 提交
5. **执行 Step 6**（文档更新）→ 提交
6. **执行 Step 7-8**（CLI 代码 + 残留清理）→ 提交
7. **执行 Step 2**（新增文件，如需要）→ 提交
8. **运行验证清单**（第 4 节）
9. **全局搜索旧路径**确认无遗漏

每个步骤独立提交，便于 review 和回退。
