# FreeTodo 云端部署文档

本文档介绍如何将 FreeTodo Server 部署到云服务器，并在本地连接 Client、Frontend 及手机 APP。

## 1. 架构概览

```text
┌─────────────────────────────────────────────────────┐
│                  ☁️ 云服务器                          │
│                                                     │
│  ┌──────────────────┐    ┌──────────────────┐       │
│  │ lifetrace-server │◄──►│ lifetrace-agent  │       │
│  │     :8001        │    │     :8002        │       │
│  └────────┬─────────┘    └──────────────────┘       │
│           │ Docker Bridge Network                   │
└───────────┼─────────────────────────────────────────┘
            │ 公网 IP / 域名
            │
    ┌───────┼───────────────────────────┐
    │       │                           │
    ▼       ▼                           ▼
┌────────┐ ┌────────┐          ┌──────────────┐
│Frontend│ │ Client │          │  手机 APP     │
│ (本地) │ │ (本地) │          │ + Omi 硬件   │
└────────┘ └────────┘          └──────────────┘
```

| 组件 | 部署位置 | 说明 |
| ---- | -------- | ---- |
| **Server** (`lifetrace-server`) | 云端 :8001 | FastAPI 主服务，处理业务 API、LLM 调用、数据存储 |
| **AgentOS** (`lifetrace-agent`) | 云端 :8002 | AgentOS 服务，提供 Agno Agent 工具调度 |
| **Frontend** | 本地 | Next.js 前端，连接云端 Server API |
| **Client** | 本地 | Python 感知客户端，采集屏幕截图、OCR 等数据上报云端 |
| **手机 APP** | 本地手机 | Flutter APP，连接 Omi 硬件并上报数据到云端 |

## 2. 云端 Server 部署

### 2.1 前置条件

- 一台具有公网 IP 的云服务器（推荐 2 核 4G 以上）
- 操作系统：Ubuntu 22.04+
- Docker 20.10+
- Docker Compose V2（`docker compose` 命令）
- 确保 **8001** 端口可从外部访问（Server API）

### 2.2 克隆项目

```bash
git clone https://github.com/freeu-group/FreeTodo.git
cd FreeTodo

git checkout vc
```

### 2.3 构建镜像

```bash
make build-server
```

该命令在 `local-api/` 目录下执行 `docker build`，生成镜像 `freeu/lifetrace-server:latest`。

### 2.4 配置环境变量

> 请注意，如果你不是开发者，这一步可以完全跳过，在界面上可以直接配置 API KEY。

```bash
cp deploy/.env.example deploy/.env
```

云端 Docker 部署通常通过 `deploy/.env` 注入配置；如果镜像内存在默认 `config.yaml`，环境变量的优先级更高。

编辑 `deploy/.env`，填入必要的配置：

```bash
# 服务器端口
LIFETRACE_SERVER__PORT=8001

# AgentOS 端口（仅内部通信）
LIFETRACE_AGNO__AGENT_OS__PORT=8002

# LLM 配置（必填）
LIFETRACE_LLM__API_KEY=your-api-key(required)
LIFETRACE_LLM__BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
LIFETRACE_LLM__MODEL=qwen-plus

# 语音识别（可选）
LIFETRACE_AUDIO__ASR__API_KEY=your-asr-api-key(optional)

# Tavily 搜索（可选）
LIFETRACE_TAVILY__API_KEY=your-tavily-api-key(optional)

# Gemini 日记插画（可选，用于生成日记漫画插画）
LIFETRACE_BANNA2__API_KEY=your-gemini-api-key(optional)
```

### 2.5 启动服务

```bash
make start
```

验证服务运行状态：

```bash
# 查看容器状态
docker compose -f deploy/compose.yaml ps

# 健康检查（在云服务器上）
curl http://localhost:8001/api/health

# 从外部验证（替换为实际公网 IP）
curl http://<云服务器公网IP>:8001/api/health
```

### 2.6 查看日志

```bash
make logs
```

## 3. 本地 Frontend 部署

Frontend 运行在本地电脑上，通过网络连接云端 Server。

### 3.1 前置条件

- Node.js 22+
- pnpm

### 3.2 安装依赖

```bash
# 新开一个命令行窗口
cd FreeTodo/local-web

pnpm install
```

### 3.3 配置环境变量

```bash
cp .env.example .env
```

编辑 `local-web/.env`，将 `NEXT_PUBLIC_API_URL` 修改为云端 Server 的地址：

```bash
NEXT_PUBLIC_API_URL=http://<云服务器公网IP>:8001
```

### 3.4 启动开发服务器

```bash
pnpm dev
```

启动后访问 <http://localhost:3001> 即可打开前端页面。

## 4. 本地 Client 部署

Client 是 Python 感知客户端，负责屏幕截图采集、OCR 识别等，采集的数据实时上报到云端 Server。

### 4.1 前置条件

- Python 3.12
- uv 包管理器

### 4.2 安装依赖

```bash
# 新开一个命令行窗口
cd FreeTodo

uv sync --directory local-sensor
```

### 4.3 配置环境变量

```bash
cp local-sensor/.env.example local-sensor/.env
```

编辑 `local-sensor/.env`，将 `CENTER_URL` 修改为云端 Server 的地址：

```bash
CENTER_URL=http://<云服务器公网IP>:8001
```

### 4.4 启动 Client

```bash
# 使用 .env 中的 CENTER_URL（推荐）
uv run --directory local-sensor python sensor.py

# 或者手动指定地址（命令行参数优先级更高）
uv run --directory local-sensor python sensor.py --center-url http://<云服务器公网IP>:8001
```

## 5. 手机 APP 与硬件连接

FreeTodo 支持通过 Omi 硬件设备采集数据，硬件通过蓝牙连接手机 APP，APP 再将数据上报到云端 Server。

### 5.1 连接流程

```text
Omi 硬件 ──蓝牙──► 手机 APP ──网络──► 云端 Server (:8001)
```

### 5.2 手机 APP 配置

1. 在手机上安装 FreeTodo APP（Flutter 应用）
2. 打开 APP，进入 **设置** 页面
3. 在 **TCP 隧道 和 HTTP 隧道** 中输入云端 Server 的地址：

   ```text
   http://<云服务器公网IP>:8001
   ```

4. 保存配置后，APP 将连接到云端 Server

### 5.3 硬件连接

1. 打开 Omi 设备电源
2. 在手机 APP 中通过蓝牙搜索并配对 Omi 设备
3. 配对成功后，硬件采集的数据将通过 APP 自动上报到云端

> **提示**：确保手机能够访问云服务器的公网地址。如在公司内网环境，可能需要连接外部网络或配置代理。

## 6. 多实例部署

当需要在同一台云服务器上运行多个 FreeTodo 实例时（如多用户/多环境），使用 `scripts/deploy_new.sh` 脚本快速生成隔离的部署配置。

### 6.1 使用方法

```bash
bash scripts/deploy_new.sh <端口号> <用户名>
```

端口号范围：**8000 ~ 9000**。用户名需为 **3-20 位英文字母**，会用于容器名后缀。脚本会自动将 AgentOS 端口设为 `端口号 + 1`，并生成目录 `deploy-端口号-用户名`。

### 6.2 示例

```bash
bash scripts/deploy_new.sh 8010 alice
```

输出：

```text
创建部署目录: /path/to/FreeTodo/deploy-8010-alice
✅ 部署配置已生成:
  目录: /path/to/FreeTodo/deploy-8010-alice
  Server 端口: 8010
  Agent  端口: 8011
  用户名: alice

启动命令:
  cd /path/to/FreeTodo/deploy-8010-alice && docker compose up -d
```

> 每个实例需要独立的端口，且需在防火墙中额外放行对应端口。各 Client 和手机 APP 通过不同端口连接到对应的实例。容器名也会带上用户名后缀，便于区分不同用户实例。

### 6.3 启动新实例

```bash
cd deploy-8010-alice
vim .env    # 编辑 .env 填入 API Key

docker compose up -d
```

## 7. Make 命令速查

| 命令 | 说明 |
| ---- | ---- |
| `make build-server` | 构建 Server Docker 镜像 |
| `make start` | 启动所有容器 |
| `make stop` | 停止所有容器 |
| `make restart` | 重启所有容器并跟踪日志 |
| `make logs` | 查看实时日志 |
| `make deploy` | 构建镜像 + 重启服务（一键部署） |

## 8. 数据持久化

Server 容器将 `./volume/data` 挂载到容器内的 `/app/data`，该目录存储：

- SQLite 数据库（`lifetrace.db`）
- 截图文件
- 附件文件
- 音频文件
- 向量数据库

> 升级或重建容器时，只要不删除 `volume/data` 目录，数据即可保留。

## 9. 环境变量参考

### 9.1 服务器配置

| 变量 | 默认值 | 说明 |
| ---- | ------ | ---- |
| `LIFETRACE_SERVER__HOST` | `0.0.0.0` | Server 监听地址 |
| `LIFETRACE_SERVER__PORT` | `8001` | Server 监听端口 |
| `LIFETRACE_SERVER__DEBUG` | `false` | 调试模式 |

### 9.2 AgentOS 配置

| 变量 | 默认值 | 说明 |
| ---- | ------ | ---- |
| `LIFETRACE_AGNO__AGENT_OS__HOST` | `0.0.0.0` | AgentOS 监听地址 |
| `LIFETRACE_AGNO__AGENT_OS__PORT` | `8002` | AgentOS 监听端口 |
| `LIFETRACE_AGNO__AGENT_OS__DEBUG` | `false` | AgentOS 调试模式 |
| `LIFETRACE_AGNO__EXTERNAL_TOOLS` | `[]` | 外部工具配置（JSON 数组） |

### 9.3 LLM 配置

| 变量 | 默认值 | 说明 |
| ---- | ------ | ---- |
| `LIFETRACE_LLM__API_KEY` | — | **必填**，LLM API 密钥 |
| `LIFETRACE_LLM__BASE_URL` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | LLM API 地址 |
| `LIFETRACE_LLM__MODEL` | `qwen-plus` | 使用的模型名称 |

### 9.4 可选服务

| 变量 | 说明 |
| ---- | ---- |
| `LIFETRACE_AUDIO__ASR__API_KEY` | 阿里云语音识别 API Key |
| `LIFETRACE_TAVILY__API_KEY` | Tavily 搜索 API Key |
| `LIFETRACE_BANNA2__API_KEY` | Google Gemini API Key（日记插画生成） |

## 10. 常见问题

### 10.1 本地无法连接云端 Server

1. 确认云服务器防火墙和安全组已放行 8001 端口
2. 确认容器正常运行：`docker compose -f deploy/compose.yaml ps`
3. 在云服务器本地测试：`curl http://localhost:8001/api/health`
4. 从本地测试公网连通性：`curl http://<公网IP>:8001/api/health`

### 10.2 AI 功能不可用

确认 `deploy/.env` 中 `LIFETRACE_LLM__API_KEY` 已正确配置，且 `LIFETRACE_LLM__BASE_URL` 可访问。

### 10.3 手机 APP 无法连接

1. 确认手机网络可以访问云服务器公网 IP
2. 确认 APP 中输入的 TCP 隧道和 HTTP 隧道地址格式正确：`http://<公网IP>:8001`
3. 如使用域名，确认 DNS 解析正常

### 10.4 Client 上报数据失败

1. 确认 `--center-url` 参数指向正确的云端地址
2. 确认本地网络可以访问云服务器
3. 查看 Client 日志排查具体错误

### 10.5 多实例端口冲突

`deploy_new.sh` 会检查目标目录是否已存在。如需重建，先删除旧目录：

```bash
rm -rf deploy-8010-alice
bash scripts/deploy_new.sh 8010 alice
```

### 10.6 数据迁移

每个实例的数据存储在其目录下的 `volume/data/`，复制该目录即可完成数据迁移。
