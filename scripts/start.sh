#!/bin/bash
# ============================================
# LifeTrace - One-Click Startup Script
# LifeTrace - 一键启动脚本
# ============================================
# Description: Start LifeTrace services
# 描述: 启动 LifeTrace 服务
# Usage: ./scripts/start.sh [options]
# 用法: ./scripts/start.sh [选项]
# ============================================

set -e

# ============================================
# Color Definitions / 颜色定义
# ============================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ============================================
# Logging Functions / 日志函数
# ============================================
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${CYAN}[STEP]${NC} $1"; }

# ============================================
# Default Options / 默认选项
# ============================================
BACKEND_ONLY=false
FRONTEND_ONLY=false
NO_BROWSER=false
BACKEND_HOST="127.0.0.1"
BACKEND_PORT=8000
FRONTEND_PORT=3000

# ============================================
# Parse Arguments / 解析参数
# ============================================
while [[ $# -gt 0 ]]; do
    case $1 in
        --backend-only)
            BACKEND_ONLY=true
            shift
            ;;
        --frontend-only)
            FRONTEND_ONLY=true
            shift
            ;;
        --no-browser)
            NO_BROWSER=true
            shift
            ;;
        -h|--help)
            echo "Usage: ./scripts/start.sh [options]"
            echo "用法: ./scripts/start.sh [选项]"
            echo ""
            echo "Options / 选项:"
            echo "  --backend-only     Start backend only / 仅启动后端"
            echo "  --frontend-only    Start frontend only / 仅启动前端"
            echo "  --no-browser       Don't open browser automatically / 不自动打开浏览器"
            echo "  -h, --help         Show this help message / 显示帮助信息"
            exit 0
            ;;
        *)
            log_error "Unknown option: $1 / 未知选项: $1"
            exit 1
            ;;
    esac
done

# ============================================
# Get Script Directory / 获取脚本目录
# ============================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PID_DIR="$PROJECT_ROOT/.pids"

cd "$PROJECT_ROOT"

# Create PID directory
mkdir -p "$PID_DIR"

# ============================================
# Banner
# ============================================
echo ""
echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║                                                            ║${NC}"
echo -e "${CYAN}║     ${GREEN}██╗     ██╗███████╗███████╗████████╗██████╗  █████╗ ██████╗███████╗${NC}     ${CYAN}║${NC}"
echo -e "${CYAN}║     ${GREEN}██║     ██║██╔════╝██╔════╝╚══██╔══╝██╔══██╗██╔══██╗██╔════╝██╔════╝${NC}     ${CYAN}║${NC}"
echo -e "${CYAN}║     ${GREEN}██║     ██║█████╗  █████╗     ██║   ██████╔╝███████║██║     █████╗${NC}       ${CYAN}║${NC}"
echo -e "${CYAN}║     ${GREEN}██║     ██║██╔══╝  ██╔══╝     ██║   ██╔══██╗██╔══██║██║     ██╔══╝${NC}       ${CYAN}║${NC}"
echo -e "${CYAN}║     ${GREEN}███████╗██║██║     ███████╗   ██║   ██║  ██║██║  ██║╚██████╗███████╗${NC}     ${CYAN}║${NC}"
echo -e "${CYAN}║     ${GREEN}╚══════╝╚═╝╚═╝     ╚══════╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝╚══════╝${NC}     ${CYAN}║${NC}"
echo -e "${CYAN}║                                                            ║${NC}"
echo -e "${CYAN}║              Startup Script / 启动脚本                       ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# ============================================
# Read Configuration / 读取配置
# ============================================
CONFIG_FILE="lifetrace/config/config.yaml"
DEFAULT_CONFIG_FILE="lifetrace/config/default_config.yaml"

# Read ports from config file / 从配置文件读取端口
CONFIG_TO_READ="$CONFIG_FILE"
if [[ ! -f "$CONFIG_FILE" ]]; then
    CONFIG_TO_READ="$DEFAULT_CONFIG_FILE"
fi

if [[ -f "$CONFIG_TO_READ" ]]; then
    # Read backend host (server.host)
    host=$(grep -A5 "^server:" "$CONFIG_TO_READ" | grep "host:" | head -1 | sed 's/.*host:\s*//' | tr -d '[:space:]')
    if [[ -n "$host" ]]; then
        BACKEND_HOST=$host
    fi

    # Read backend port (server.port)
    port=$(grep -A5 "^server:" "$CONFIG_TO_READ" | grep "port:" | head -1 | sed 's/.*port:\s*//' | tr -d '[:space:]')
    if [[ -n "$port" ]]; then
        BACKEND_PORT=$port
    fi

    # Read frontend port (frontend.port)
    port=$(grep -A5 "^frontend:" "$CONFIG_TO_READ" | grep "port:" | head -1 | sed 's/.*port:\s*//' | tr -d '[:space:]')
    if [[ -n "$port" ]]; then
        FRONTEND_PORT=$port
    fi

    log_info "Backend: http://${BACKEND_HOST}:${BACKEND_PORT}, Frontend port: $FRONTEND_PORT (from config)"
    log_info "后端: http://${BACKEND_HOST}:${BACKEND_PORT}, 前端端口: $FRONTEND_PORT (来自配置)"
fi

# ============================================
# Environment Validation / 环境验证
# ============================================
log_step "Validating environment... / 验证环境..."

# Check virtual environment
if [[ ! -d ".venv" ]]; then
    log_error "Virtual environment not found. Please run install.sh first."
    log_error "未找到虚拟环境。请先运行 install.sh。"
    exit 1
fi

# Check node_modules
if [[ ! -d "frontend/node_modules" ]]; then
    log_error "node_modules not found. Please run install.sh first."
    log_error "未找到 node_modules。请先运行 install.sh。"
    exit 1
fi

# Check config.yaml
if [[ ! -f "$CONFIG_FILE" ]]; then
    log_warning "config.yaml not found. Creating from default_config.yaml..."
    log_warning "未找到 config.yaml。从 default_config.yaml 创建..."
    if [[ -f "$DEFAULT_CONFIG_FILE" ]]; then
        cp "$DEFAULT_CONFIG_FILE" "$CONFIG_FILE"
    else
        log_error "default_config.yaml not found. Please create config.yaml manually."
        log_error "未找到 default_config.yaml。请手动创建 config.yaml。"
        exit 1
    fi
fi

log_success "Environment validated! / 环境验证通过！"
echo ""

# ============================================
# Check for Running Services / 检查运行中的服务
# ============================================
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 0  # Port is in use
    else
        return 1  # Port is free
    fi
}

# Check if services are already running
if [[ "$FRONTEND_ONLY" == "false" ]]; then
    if check_port $BACKEND_PORT; then
        log_warning "Port $BACKEND_PORT is already in use. Backend may already be running."
        log_warning "端口 $BACKEND_PORT 已被占用。后端可能已在运行。"
        log_info "Use ./scripts/stop.sh to stop existing services / 使用 ./scripts/stop.sh 停止现有服务"
    fi
fi

if [[ "$BACKEND_ONLY" == "false" ]]; then
    if check_port $FRONTEND_PORT; then
        log_warning "Port $FRONTEND_PORT is already in use. Frontend may already be running."
        log_warning "端口 $FRONTEND_PORT 已被占用。前端可能已在运行。"
        log_info "Use ./scripts/stop.sh to stop existing services / 使用 ./scripts/stop.sh 停止现有服务"
    fi
fi

# ============================================
# Start Backend / 启动后端
# ============================================
if [[ "$FRONTEND_ONLY" == "false" ]]; then
    log_step "Starting backend service... / 正在启动后端服务..."

    # Activate virtual environment and start backend
    (
        source .venv/bin/activate
        python -m lifetrace.server &
        echo $! > "$PID_DIR/backend.pid"
    )

    # Wait for backend / 等待后端
    log_info "Waiting for backend to be ready... / 等待后端就绪..."
    log_info "(First startup may take several minutes to download models / 首次启动可能需要几分钟下载模型)"

    backend_ready=false
    round=1

    while [[ "$backend_ready" == "false" ]]; do
        log_info "Waiting 30 seconds... (round $round) / 等待 30 秒...（第 $round 轮）"
        sleep 30

        # Health check / 健康检查
        if curl -s --max-time 5 "http://localhost:$BACKEND_PORT/health" > /dev/null 2>&1; then
            log_success "Backend is ready at http://localhost:$BACKEND_PORT"
            log_success "后端已就绪: http://localhost:$BACKEND_PORT"
            backend_ready=true
        else
            log_info "Backend not ready yet, continuing to wait... / 后端尚未就绪，继续等待..."
        fi

        ((round++))
    done
fi

# ============================================
# Start Frontend / 启动前端
# ============================================
if [[ "$BACKEND_ONLY" == "false" ]]; then
    log_step "Starting frontend service... / 正在启动前端服务..."

    # Build API URL for frontend / 构建前端 API URL
    API_URL="http://${BACKEND_HOST}:${BACKEND_PORT}"
    log_info "Frontend API URL: $API_URL"
    log_info "前端 API 地址: $API_URL"

    cd frontend

    # Start frontend in background with configured port and API URL / 使用配置的端口和 API 地址后台启动前端
    NEXT_PUBLIC_API_URL="$API_URL" pnpm dev -p $FRONTEND_PORT &
    FRONTEND_PID=$!
    echo $FRONTEND_PID > "$PID_DIR/frontend.pid"

    cd "$PROJECT_ROOT"

    # Wait for frontend to start
    log_info "Waiting for frontend to be ready... / 等待前端就绪..."
    max_retries=60
    retry_count=0
    while [[ $retry_count -lt $max_retries ]]; do
        if curl -s "http://localhost:$FRONTEND_PORT" > /dev/null 2>&1; then
            log_success "Frontend is ready at http://localhost:$FRONTEND_PORT"
            log_success "前端已就绪: http://localhost:$FRONTEND_PORT"
            break
        fi
        sleep 1
        ((retry_count++))
        echo -ne "\r${BLUE}[INFO]${NC} Waiting... ${retry_count}/${max_retries}s"
    done
    echo ""

    if [[ $retry_count -ge $max_retries ]]; then
        log_warning "Frontend health check timed out. It may still be starting..."
        log_warning "前端健康检查超时。它可能仍在启动中..."
    fi
fi

# ============================================
# Open Browser / 打开浏览器
# ============================================
if [[ "$NO_BROWSER" == "false" && "$BACKEND_ONLY" == "false" ]]; then
    log_info "Opening browser... / 正在打开浏览器..."

    # Detect OS and open browser
    if [[ "$OSTYPE" == "darwin"* ]]; then
        open "http://localhost:$FRONTEND_PORT"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        if command -v xdg-open &> /dev/null; then
            xdg-open "http://localhost:$FRONTEND_PORT"
        elif command -v gnome-open &> /dev/null; then
            gnome-open "http://localhost:$FRONTEND_PORT"
        else
            log_warning "Could not detect browser. Please open manually: http://localhost:$FRONTEND_PORT"
            log_warning "无法检测浏览器。请手动打开: http://localhost:$FRONTEND_PORT"
        fi
    fi
fi

# ============================================
# Startup Complete / 启动完成
# ============================================
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                                                            ║${NC}"
echo -e "${GREEN}║           Services Started! / 服务已启动！                   ║${NC}"
echo -e "${GREEN}║                                                            ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

if [[ "$FRONTEND_ONLY" == "false" ]]; then
    echo -e "  ${CYAN}Backend / 后端:${NC}  ${BLUE}http://localhost:$BACKEND_PORT${NC}"
fi
if [[ "$BACKEND_ONLY" == "false" ]]; then
    echo -e "  ${CYAN}Frontend / 前端:${NC} ${BLUE}http://localhost:$FRONTEND_PORT${NC}"
fi

echo ""
echo -e "${YELLOW}Logs are output in this terminal. Press Ctrl+C to stop."
echo -e "日志将输出在此终端。按 Ctrl+C 停止。${NC}"
echo ""

# Keep the script running to show logs
# The services will run until this script is terminated
wait
