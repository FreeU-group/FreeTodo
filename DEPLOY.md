# FreeTodo Server 部署文档

本文档介绍如何通过 Docker 部署 FreeTodo Server（含 AgentOS）。

## 架构概览

Docker 部署包含两个容器，共用同一镜像 `freeu/lifetrace-server`：

| 容器 | 默认端口 | 说明 |
|------|---------|------|
| `lifetrace-server` | 8001 | FastAPI 主服务，处理业务 API、LLM 调用、数据存储 |
| `lifetrace-agent` | 8002 | AgentOS 服务，提供 Agno Agent 工具调度 |

两个容器通过 Docker Bridge 网络互通，Server 通过内部域名 `agent` 访问 AgentOS。

## 前置条件

- Docker 20.10+
- Docker Compose V2（`docker compose` 命令）
- GNU Make（可选，用于快捷命令）

## 快速开始

### 1. 构建镜像

```bash
make build-server
```

该命令在 `server/` 目录下执行 `docker build`，生成镜像 `freeu/lifetrace-server:latest`。

### 2. 配置环境变量

```bash
cp deploy/.env.example deploy/.env
```

编辑 `deploy/.env`，填入必要的 API Key：

```bash
# 服务器端口
LIFETRACE_SERVER__PORT=8001

# AgentOS 端口
LIFETRACE_AGNO__AGENT_OS__PORT=8002

# LLM 配置（必填）
LIFETRACE_LLM__API_KEY=your-api-key
LIFETRACE_LLM__BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
LIFETRACE_LLM__MODEL=qwen-plus

# 语音识别（可选）
LIFETRACE_AUDIO__ASR__API_KEY=your-asr-api-key

# Tavily 搜索（可选）
LIFETRACE_TAVILY__API_KEY=your-tavily-api-key
```

> **注意**：`LIFETRACE_LLM__API_KEY` 为必填项，未配置时 AI 相关功能不可用。

### 3. 启动服务

```bash
make start
```

验证服务运行状态：

```bash
# 查看容器状态
docker compose -f deploy/compose.yaml ps

# 健康检查
curl http://localhost:8001/api/health
```

### 4. 查看日志

```bash
make logs
```

## Make 命令速查

| 命令 | 说明 |
|------|------|
| `make build-server` | 构建 Server Docker 镜像 |
| `make start` | 启动所有容器 |
| `make stop` | 停止所有容器 |
| `make restart` | 重启所有容器并跟踪日志 |
| `make logs` | 查看实时日志 |
| `make deploy` | 构建镜像 + 重启服务（一键部署） |

## 数据持久化

Server 容器将 `./volume/data` 挂载到容器内的 `/app/data`，该目录存储：

- SQLite 数据库（`lifetrace.db`）
- 截图文件
- 附件文件
- 音频文件
- 向量数据库

> 升级或重建容器时，只要不删除 `volume/data` 目录，数据即可保留。

## 多实例部署

当需要在同一台服务器上运行多个 FreeTodo 实例时（如多用户/多环境），使用 `scripts/deploy_new.sh` 脚本快速生成隔离的部署配置。

### 使用方法

```bash
bash scripts/deploy_new.sh <端口号>
```

端口号范围：**8000 ~ 9000**。脚本会自动将 AgentOS 端口设为 `端口号 + 1`。

### 示例

```bash
# 创建一个运行在 8010 端口的实例
bash scripts/deploy_new.sh 8010
```

输出：

```
创建部署目录: /path/to/FreeTodo/deploy-8010
✅ 部署配置已生成:
  目录: /path/to/FreeTodo/deploy-8010
  Server 端口: 8010
  Agent  端口: 8011

启动命令:
  cd /path/to/FreeTodo/deploy-8010 && docker compose up -d
```

### 脚本做了什么

脚本基于 `deploy/` 模板目录，生成一个独立的 `deploy-<端口>/` 目录，并自动完成以下替换：

| 项目 | 模板默认值 | 替换后（以 8010 为例） |
|------|-----------|----------------------|
| 部署目录 | `deploy/` | `deploy-8010/` |
| Server 端口 | 8001 | 8010 |
| AgentOS 端口 | 8002 | 8011 |
| Server 容器名 | `lifetrace-server` | `lifetrace-server-8010` |
| Agent 容器名 | `lifetrace-agent` | `lifetrace-agent-8010` |
| Docker 网络 | `lifetrace-network` | `lifetrace-network-8010` |

### 启动新实例

```bash
# 进入新实例目录，编辑 .env 填入 API Key
cd deploy-8010
vim .env

# 启动
docker compose up -d

# 查看日志
docker compose logs -f
```

### 管理多实例

```bash
# 查看所有 FreeTodo 容器
docker ps --filter "name=lifetrace"

# 停止指定实例
cd deploy-8010 && docker compose down

# 重启指定实例
cd deploy-8010 && docker compose restart
```

> 每个实例拥有独立的容器名、网络和端口映射，互不冲突。但需注意为每个实例的 `.env` 配置各自的 API Key。

## 环境变量参考

### 服务器配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `LIFETRACE_SERVER__HOST` | `0.0.0.0` | Server 监听地址 |
| `LIFETRACE_SERVER__PORT` | `8001` | Server 监听端口 |
| `LIFETRACE_SERVER__DEBUG` | `false` | 调试模式 |

### AgentOS 配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `LIFETRACE_AGNO__AGENT_OS__HOST` | `0.0.0.0` | AgentOS 监听地址 |
| `LIFETRACE_AGNO__AGENT_OS__PORT` | `8002` | AgentOS 监听端口 |
| `LIFETRACE_AGNO__AGENT_OS__DEBUG` | `false` | AgentOS 调试模式 |
| `LIFETRACE_AGNO__EXTERNAL_TOOLS` | `[]` | 外部工具配置（JSON 数组） |

### LLM 配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `LIFETRACE_LLM__API_KEY` | — | **必填**，LLM API 密钥 |
| `LIFETRACE_LLM__BASE_URL` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | LLM API 地址 |
| `LIFETRACE_LLM__MODEL` | `qwen-plus` | 使用的模型名称 |

### 可选服务

| 变量 | 说明 |
|------|------|
| `LIFETRACE_AUDIO__ASR__API_KEY` | 阿里云语音识别 API Key |
| `LIFETRACE_TAVILY__API_KEY` | Tavily 搜索 API Key |

## 常见问题

### 容器启动后无法访问

1. 确认端口未被占用：`lsof -i :<端口号>`
2. 确认容器正常运行：`docker compose ps`
3. 查看容器日志排查错误：`docker compose logs`

### AI 功能不可用

确认 `deploy/.env` 中 `LIFETRACE_LLM__API_KEY` 已正确配置，且 `LIFETRACE_LLM__BASE_URL` 可访问。

### 多实例端口冲突

`deploy_new.sh` 会检查目标目录是否已存在。如需重建，先删除旧目录：

```bash
rm -rf deploy-8010
bash scripts/deploy_new.sh 8010
```

### 数据迁移

每个实例的数据存储在其目录下的 `volume/data/`，复制该目录即可完成数据迁移。
