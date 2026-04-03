# FreeTodo 本地部署文档

本文档介绍如何在本地电脑上部署 FreeTodo 全套服务（Server + Frontend + Client），适用于个人开发、体验或单机使用场景。

## 1. 架构概览

```text
┌─────────────────────────────────────────────────────────┐
│                    🖥️ 本地电脑                            │
│                                                         │
│  ┌──────────────────┐    ┌──────────────────┐           │
│  │  Server (Python)  │◄──►│  AgentOS (Python) │           │
│  │     :8001         │    │     :8002         │           │
│  └────────┬──────────┘    └──────────────────┘           │
│           │                                              │
│   ┌───────┼───────────────────────┐                      │
│   │       │                       │                      │
│   ▼       ▼                       ▼                      │
│ ┌────────┐ ┌────────┐    ┌──────────────┐               │
│ │Frontend│ │ Client │    │  手机 APP     │◄── 局域网     │
│ │ :3001  │ │ (本地) │    │ + Omi 硬件   │               │
│ └────────┘ └────────┘    └──────────────┘               │
└─────────────────────────────────────────────────────────┘
```

| 组件 | 部署位置 | 说明 |
| ---- | -------- | ---- |
| **Server** | 本地 :8001 | FastAPI 主服务，处理业务 API、LLM 调用、数据存储 |
| **AgentOS** | 本地 :8002 | AgentOS 服务，提供 Agno Agent 工具调度 |
| **Frontend** | 本地 :3001 | Next.js 前端，连接本地 Server API |
| **Client** | 本地 | Python 感知客户端，采集屏幕截图、OCR 等数据上报到本地 Server |
| **手机 APP** | 手机（局域网） | Flutter APP，连接 Omi 硬件并通过局域网上报数据到本地 Server |

## 2. 前置条件

| 依赖 | 版本要求 | 用途 |
| ---- | -------- | ---- |
| Python | 3.12 | 运行 Server、AgentOS、Client |
| uv | 最新版 | Python 包管理器 |
| Node.js | 22+ | 运行 Frontend |
| pnpm | 最新版 | Frontend 包管理器 |

> 本地部署**不需要**安装 Docker，直接使用 Python 和 Node.js 运行即可。

## 3. 克隆项目

```bash
git clone https://github.com/freeu-group/FreeTodo.git
cd FreeTodo

git checkout vc
```

## 4. Server 部署

Server 是 FreeTodo 的核心服务，本地部署时直接用 Python 运行。

### 4.1 安装依赖

```bash
cd local-api

uv sync
source .venv/bin/activate

#Windows应该执行：
.venv\Scripts\Activate.ps1
```

### 4.2 配置文件

> 请注意，如果你不是开发者，这一步可以完全跳过，在界面上可以直接配置 API KEY。

首次启动时，Server 会自动从 `local-api/config/default_config.yaml` 生成 `local-api/config/config.yaml`。你也可以提前手动复制并修改：

```bash
cp config/default_config.yaml config/config.yaml
```

编辑 `local-api/config/config.yaml`，至少配置 LLM 密钥：

```yaml
# LLM配置（必填）
llm:
  api_key: your-api-key  # 替换为你的 API Key
  base_url: https://dashscope.aliyuncs.com/compatible-mode/v1
  model: qwen-plus

# 语音识别（可选）
audio:
  asr:
    api_key: your-asr-api-key

# Tavily 搜索（可选）
tavily:
  api_key: your-tavily-api-key

# Gemini 日记插画（可选，用于生成日记漫画插画）
banna2:
  api_key: your-gemini-api-key
```

也可以通过 `local-api/.env` 环境变量配置（优先级高于 `config.yaml`）：

```bash
cp .env.example .env
```

编辑 `local-api/.env`，按需填入：

```bash
LIFETRACE_LLM__API_KEY=your-llm-api-key(required)
LIFETRACE_AUDIO__ASR__API_KEY=your-asr-api-key(optional)
LIFETRACE_TAVILY__API_KEY=your-tavily-api-key(optional)
LIFETRACE_BANNA2__API_KEY=your-gemini-api-key(optional)
```

### 4.3 启动 Server

```bash
python server.py
```

验证服务运行状态：

```bash
curl http://localhost:8001/api/health
```

### 4.4 启动 AgentOS（可选）

AgentOS 提供 Agno Agent 工具调度能力，如不需要可跳过：

```bash
# 新开一个命令行窗口
cd FreeTodo/local-api

python agent_os.py
```

## 5. Frontend 部署

Frontend 运行在本地，连接本地 Server。

### 5.1 安装依赖

```bash
# 新开一个命令行窗口
cd FreeTodo/local-web

pnpm install
```

### 5.2 配置环境变量

```bash
cp .env.example .env
```

本地部署时，默认配置已指向 `localhost`，无需修改：

```bash
NEXT_PUBLIC_API_URL=http://localhost:8001
```

### 5.3 启动开发服务器

```bash
pnpm dev
```

启动后访问 <http://localhost:3001> 即可打开前端页面。

## 6. Client 部署

Client 是 Python 感知客户端，负责屏幕截图采集、OCR 识别等，采集的数据实时上报到本地 Server。

### 6.1 安装依赖

```bash
# 新开一个命令行窗口
cd FreeTodo
uv sync --directory local-sensor
```

### 6.2 配置环境变量

```bash
cp local-sensor/.env.example local-sensor/.env
```

本地部署时默认配置已指向 `localhost`，无需修改：

```bash
CENTER_URL=http://localhost:8001
```

### 6.3 启动 Client

```bash
# 使用 .env 中的 CENTER_URL（推荐）
uv run --directory local-sensor python sensor.py

# 或者手动指定地址（命令行参数优先级更高）
uv run --directory local-sensor python sensor.py --center-url http://localhost:8001
```

## 7. 手机 APP 与硬件连接

手机 APP 通过**局域网**连接本地 Server，因此手机和电脑需要在同一个网络下。

### 7.1 连接流程

```text
Omi 硬件 ──蓝牙──► 手机 APP ──局域网──► 本地 Server (:8001)
```

### 7.2 获取本地 IP

手机 APP 需要使用你电脑的**局域网 IP**（而非 `localhost`）：

```bash
# macOS
ipconfig getifaddr en0

# Linux
hostname -I | awk '{print $1}'

# Windows
ipconfig | findstr "IPv4"
```

假设获取到的 IP 为 `192.168.1.100`。

### 7.3 手机 APP 配置

1. 在手机上安装 FreeTodo APP（Flutter 应用）
2. 打开 APP，进入 **设置** 页面
3. 在 **TCP 隧道 和 HTTP 隧道** 中输入本地 Server 的局域网地址：

   ```text
   http://192.168.1.100:8001
   ```

4. 保存配置后，APP 将连接到本地 Server

### 7.4 硬件连接

1. 打开 Omi 设备电源
2. 在手机 APP 中通过蓝牙搜索并配对 Omi 设备
3. 配对成功后，硬件采集的数据将通过 APP 自动上报到本地 Server

> **提示**：确保手机和电脑在同一局域网内。如果连接失败，检查电脑防火墙是否放行了 8001 端口。

## 8. 数据存储

本地部署时，所有数据存储在 `local-api/data/` 目录下：

- SQLite 数据库（`lifetrace.db`）
- 截图文件（`screenshots/`）
- 附件文件（`attachments/`）
- 音频文件（`audio/`）
- 向量数据库（`vector_db/`）
- 日志文件（`logs/`）

> 备份时只需复制整个 `local-api/data/` 目录即可。

## 9. 常见问题

### 9.1 Frontend 无法连接 Server

1. 确认 Server 已启动并正常运行
2. 确认 `local-web/.env` 中 `NEXT_PUBLIC_API_URL` 为 `http://localhost:8001`
3. 测试连通性：`curl http://localhost:8001/api/health`

### 9.2 AI 功能不可用

确认 `local-api/config/config.yaml` 中 `llm.api_key` 已正确配置，且 `llm.base_url` 可访问。

### 9.3 Client 上报数据失败

1. 确认 `--center-url` 参数为 `http://localhost:8001`
2. 确认 Server 已启动
3. 查看 Client 日志排查具体错误

### 9.4 手机 APP 无法连接

1. 确认手机和电脑在同一局域网内
2. 确认 APP 中输入的地址是电脑的局域网 IP（不是 `localhost` 或 `127.0.0.1`）
3. 确认电脑防火墙已放行 8001 端口
4. 尝试在手机浏览器中访问 `http://<局域网IP>:8001/api/health` 验证连通性

### 9.5 端口被占用

如果 8001 端口被占用，可修改 `local-api/config/config.yaml` 中的 `server.port`，同时更新 `local-web/.env` 和 Client 启动参数中的端口号。
