#!/bin/bash
# ============================================
# LifeTrace - One-Click Installation Script
# LifeTrace - 一键安装脚本
# ============================================
# Description: Automated setup for LifeTrace
# 描述: LifeTrace 自动化安装脚本
# Usage: ./scripts/install.sh [options]
# 用法: ./scripts/install.sh [选项]
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
SKIP_FRONTEND=false
SKIP_BACKEND=false
CHINA_MIRROR=false

# ============================================
# Parse Arguments / 解析参数
# ============================================
while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-frontend)
            SKIP_FRONTEND=true
            shift
            ;;
        --skip-backend)
            SKIP_BACKEND=true
            shift
            ;;
        --china-mirror)
            CHINA_MIRROR=true
            shift
            ;;
        -h|--help)
            echo "Usage: ./scripts/install.sh [options]"
            echo "用法: ./scripts/install.sh [选项]"
            echo ""
            echo "Options / 选项:"
            echo "  --skip-frontend    Skip frontend installation / 跳过前端安装"
            echo "  --skip-backend     Skip backend installation / 跳过后端安装"
            echo "  --china-mirror     Use China mirror sources / 使用国内镜像源"
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

cd "$PROJECT_ROOT"

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
echo -e "${CYAN}║          One-Click Installation Script / 一键安装脚本          ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# ============================================
# Step 1: Environment Check / 环境检查
# ============================================
log_step "Step 1/5: Checking environment... / 第1步/共5步: 检查环境..."

# Check OS / 检查操作系统
OS_TYPE="$(uname -s)"
case "$OS_TYPE" in
    Linux*)     OS="Linux";;
    Darwin*)    OS="macOS";;
    MINGW*|MSYS*|CYGWIN*)
        log_error "Please use install.ps1 for Windows / Windows 请使用 install.ps1"
        exit 1
        ;;
    *)
        log_error "Unsupported OS: $OS_TYPE / 不支持的操作系统: $OS_TYPE"
        exit 1
        ;;
esac
log_info "Detected OS: $OS / 检测到操作系统: $OS"

# Check Git / 检查 Git
if ! command -v git &> /dev/null; then
    log_error "Git is not installed. Please install Git first."
    log_error "Git 未安装。请先安装 Git。"
    exit 1
fi
log_success "Git: $(git --version)"

# Check Python / 检查 Python
check_python() {
    local python_cmd=""

    # Try different Python commands
    for cmd in python3 python; do
        if command -v "$cmd" &> /dev/null; then
            python_cmd="$cmd"
            break
        fi
    done

    if [[ -z "$python_cmd" ]]; then
        log_error "Python is not installed. Please install Python >= 3.13"
        log_error "Python 未安装。请安装 Python >= 3.13"
        exit 1
    fi

    # Check version
    local python_version
    python_version=$("$python_cmd" -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
    local major_version
    local minor_version
    major_version=$(echo "$python_version" | cut -d. -f1)
    minor_version=$(echo "$python_version" | cut -d. -f2)

    if [[ "$major_version" -lt 3 ]] || [[ "$major_version" -eq 3 && "$minor_version" -lt 13 ]]; then
        log_error "Python >= 3.13 is required (found: $python_version)"
        log_error "需要 Python >= 3.13 (当前: $python_version)"
        exit 1
    fi

    log_success "Python: $python_version"
    echo "$python_cmd"
}

PYTHON_CMD=$(check_python)

# Check Node.js / 检查 Node.js
if ! command -v node &> /dev/null; then
    log_error "Node.js is not installed. Please install Node.js >= 20"
    log_error "Node.js 未安装。请安装 Node.js >= 20"
    exit 1
fi

NODE_VERSION=$(node --version | grep -oE '[0-9]+' | head -1)
if [[ "$NODE_VERSION" -lt 20 ]]; then
    log_error "Node.js >= 20 is required (found: v$NODE_VERSION)"
    log_error "需要 Node.js >= 20 (当前: v$NODE_VERSION)"
    exit 1
fi
log_success "Node.js: $(node --version)"

log_success "Environment check passed! / 环境检查通过！"
echo ""

# ============================================
# Step 2: Install Package Managers / 安装包管理器
# ============================================
log_step "Step 2/5: Installing package managers... / 第2步/共5步: 安装包管理器..."

# Install uv / 安装 uv
if ! command -v uv &> /dev/null; then
    log_info "Installing uv... / 正在安装 uv..."
    if [[ "$CHINA_MIRROR" == "true" ]]; then
        # Use China mirror for uv installation
        curl -LsSf https://astral.sh/uv/install.sh | sh
    else
        curl -LsSf https://astral.sh/uv/install.sh | sh
    fi

    # Add uv to PATH for current session
    export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"

    if ! command -v uv &> /dev/null; then
        log_error "Failed to install uv. Please install it manually."
        log_error "uv 安装失败。请手动安装。"
        log_info "Visit / 访问: https://docs.astral.sh/uv/getting-started/installation/"
        exit 1
    fi
fi
log_success "uv: $(uv --version)"

# Install pnpm / 安装 pnpm
if ! command -v pnpm &> /dev/null; then
    log_info "Installing pnpm... / 正在安装 pnpm..."
    if [[ "$CHINA_MIRROR" == "true" ]]; then
        npm config set registry https://registry.npmmirror.com
    fi
    npm install -g pnpm

    if ! command -v pnpm &> /dev/null; then
        log_error "Failed to install pnpm. Please install it manually."
        log_error "pnpm 安装失败。请手动安装。"
        log_info "Visit / 访问: https://pnpm.io/installation"
        exit 1
    fi
fi
log_success "pnpm: $(pnpm --version)"

log_success "Package managers installed! / 包管理器安装完成！"
echo ""

# ============================================
# Step 3: Install Backend Dependencies / 安装后端依赖
# ============================================
if [[ "$SKIP_BACKEND" == "false" ]]; then
    log_step "Step 3/5: Installing backend dependencies... / 第3步/共5步: 安装后端依赖..."

    # Set China mirror for uv if needed
    if [[ "$CHINA_MIRROR" == "true" ]]; then
        export UV_INDEX_URL="https://pypi.tuna.tsinghua.edu.cn/simple"
    fi

    # Install Python dependencies using uv
    log_info "Running uv sync... / 正在运行 uv sync..."
    uv sync

    # Verify virtual environment
    if [[ ! -d ".venv" ]]; then
        log_error "Virtual environment not created. uv sync may have failed."
        log_error "虚拟环境未创建。uv sync 可能失败了。"
        exit 1
    fi

    log_success "Backend dependencies installed! / 后端依赖安装完成！"
else
    log_warning "Skipping backend installation / 跳过后端安装"
fi
echo ""

# ============================================
# Step 4: Install Frontend Dependencies / 安装前端依赖
# ============================================
if [[ "$SKIP_FRONTEND" == "false" ]]; then
    log_step "Step 4/5: Installing frontend dependencies... / 第4步/共5步: 安装前端依赖..."

    cd "$PROJECT_ROOT/frontend"

    # Set China mirror for pnpm if needed
    if [[ "$CHINA_MIRROR" == "true" ]]; then
        pnpm config set registry https://registry.npmmirror.com
    fi

    # Install Node.js dependencies
    log_info "Running pnpm install... / 正在运行 pnpm install..."
    pnpm install

    # Verify node_modules
    if [[ ! -d "node_modules" ]]; then
        log_error "node_modules not created. pnpm install may have failed."
        log_error "node_modules 未创建。pnpm install 可能失败了。"
        exit 1
    fi

    cd "$PROJECT_ROOT"

    log_success "Frontend dependencies installed! / 前端依赖安装完成！"
else
    log_warning "Skipping frontend installation / 跳过前端安装"
fi
echo ""

# ============================================
# Step 5: Initialize Configuration / 初始化配置
# ============================================
log_step "Step 5/5: Initializing configuration... / 第5步/共5步: 初始化配置..."

CONFIG_DIR="$PROJECT_ROOT/lifetrace/config"
CONFIG_FILE="$CONFIG_DIR/config.yaml"
DEFAULT_CONFIG="$CONFIG_DIR/default_config.yaml"

if [[ ! -f "$CONFIG_FILE" ]]; then
    if [[ -f "$DEFAULT_CONFIG" ]]; then
        log_info "Creating config.yaml from default_config.yaml..."
        log_info "从 default_config.yaml 创建 config.yaml..."
        cp "$DEFAULT_CONFIG" "$CONFIG_FILE"
        log_success "Configuration file created! / 配置文件已创建！"
    else
        log_warning "default_config.yaml not found. Please create config.yaml manually."
        log_warning "未找到 default_config.yaml。请手动创建 config.yaml。"
    fi
else
    log_info "config.yaml already exists / config.yaml 已存在"
fi

log_success "Configuration initialized! / 配置初始化完成！"
echo ""

# ============================================
# Installation Complete / 安装完成
# ============================================
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                                                            ║${NC}"
echo -e "${GREEN}║         Installation Complete! / 安装完成！                    ║${NC}"
echo -e "${GREEN}║                                                            ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Next Steps / 后续步骤:${NC}"
echo ""
echo -e "  1. ${YELLOW}Configure your LLM API Key / 配置 LLM API Key:${NC}"
echo -e "     Edit / 编辑: ${BLUE}lifetrace/config/config.yaml${NC}"
echo ""
echo -e "  2. ${YELLOW}Start the application / 启动应用:${NC}"
echo -e "     ${BLUE}./scripts/start.sh${NC}"
echo ""
echo -e "  3. ${YELLOW}Open in browser / 在浏览器中打开:${NC}"
echo -e "     ${BLUE}http://localhost:3000${NC}"
echo ""
echo -e "${CYAN}For more information / 更多信息:${NC}"
echo -e "  ${BLUE}./scripts/start.sh --help${NC}"
echo ""
