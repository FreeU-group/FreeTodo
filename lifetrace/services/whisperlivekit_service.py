"""WhisperLiveKit 服务管理器

负责启动、管理和连接 WhisperLiveKit 服务器
"""

import asyncio
import importlib.util
import subprocess
from typing import Any

from lifetrace.util.logging_config import get_logger
from lifetrace.util.settings import settings

logger = get_logger()


class WhisperLiveKitService:
    """WhisperLiveKit 服务管理器

    负责：
    1. 启动和管理 WhisperLiveKit 服务器进程
    2. 通过 WebSocket 连接到服务器
    3. 处理音频流和转录结果
    """

    def __init__(self):
        self.server_process: subprocess.Popen | None = None
        self.server_port: int = 8002  # 默认端口（避免与主服务器冲突）
        self.server_host: str = "localhost"
        self.is_running: bool = False
        self.ws_client: Any | None = None

        # 从配置读取参数
        self.model_size = settings.get("speech_recognition", {}).get("whisper_model_size", "base")
        self.language = settings.get("speech_recognition", {}).get("language", "zh")
        self.device = settings.get("speech_recognition", {}).get("whisper_device", "cpu")
        self.server_port = settings.get("speech_recognition", {}).get("server_port", 8002)
        self.server_host = settings.get("speech_recognition", {}).get("server_host", "localhost")

    async def start_server(self) -> bool:
        """启动 WhisperLiveKit 服务器"""
        if self.is_running:
            logger.info("WhisperLiveKit 服务器已在运行")
            return True

        try:
            # 检查 whisperlivekit 是否安装
            if importlib.util.find_spec("whisperlivekit") is None:
                logger.error("WhisperLiveKit 未安装，请运行: uv pip install whisperlivekit")
                return False

            # 构建启动命令
            # 注意：WhisperLiveKit 可能不支持某些语言代码格式
            # 如果语言是 zh，尝试使用 auto 或 chinese
            language_param = self.language
            if self.language.lower() in ["zh", "zh-cn", "chinese"]:
                # WhisperLiveKit 可能不支持 zh-cn，尝试使用 auto 让系统自动检测
                # 或者不指定语言参数（使用默认）
                language_param = "auto"  # 让 WhisperLiveKit 自动检测语言

            cmd = [
                "whisperlivekit-server",
                "--model",
                self.model_size,
                "--language",
                language_param,
                "--port",
                str(self.server_port),
                "--host",
                self.server_host,
            ]

            # 如果是 GPU，添加 GPU 参数
            if self.device == "cuda":
                cmd.append("--device")
                cmd.append("cuda")

            logger.info(f"启动 WhisperLiveKit 服务器: {' '.join(cmd)}")

            # 启动服务器进程
            self.server_process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
            )

            # 等待服务器启动（首次启动可能需要更长时间，特别是下载模型时）
            # 增加超时时间：首次启动可能需要 30-60 秒（下载模型）
            max_wait = 60  # 增加到 60 秒
            wait_interval = 1.0  # 每秒检查一次
            waited = 0
            last_log_time = 0
            log_interval = 5  # 每 5 秒记录一次进度

            logger.info(f"等待 WhisperLiveKit 服务器启动（最多等待 {max_wait} 秒）...")

            while waited < max_wait:
                # 检查进程是否已退出
                if self.server_process.poll() is not None:
                    # 进程已退出
                    try:
                        stdout, stderr = self.server_process.communicate(timeout=1)
                        logger.error(
                            f"WhisperLiveKit 服务器启动失败:\nstdout: {stdout}\nstderr: {stderr}"
                        )
                    except subprocess.TimeoutExpired:
                        self.server_process.kill()
                        logger.error("WhisperLiveKit 服务器进程异常退出")
                    return False

                # 检查服务器是否已启动（尝试连接）
                try:
                    import socket

                    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                    sock.settimeout(1.0)
                    result = sock.connect_ex((self.server_host, self.server_port))
                    sock.close()
                    if result == 0:
                        logger.info(
                            f"✅ WhisperLiveKit 服务器已启动 (端口: {self.server_port})，耗时: {waited:.1f} 秒"
                        )
                        self.is_running = True
                        return True
                except Exception:
                    # 连接失败是正常的，继续等待
                    pass

                # 定期记录进度
                if waited - last_log_time >= log_interval:
                    logger.info(f"⏳ WhisperLiveKit 服务器启动中... ({waited:.0f}/{max_wait} 秒)")
                    last_log_time = waited

                await asyncio.sleep(wait_interval)
                waited += wait_interval

            # 超时后，检查进程是否还在运行
            if self.server_process.poll() is None:
                # 进程还在运行，可能服务器正在启动但较慢
                logger.warning(f"⚠️  WhisperLiveKit 服务器启动超时（{max_wait} 秒），但进程仍在运行")
                logger.warning("   服务器可能正在下载模型或初始化，将在后台继续启动")
                logger.warning("   首次启动可能需要更长时间，请稍后重试连接")
                # 标记为运行中，但实际可能还未完全启动
                self.is_running = True
                return True
            else:
                # 进程已退出
                logger.error("WhisperLiveKit 服务器启动失败：进程已退出")
                return False

        except FileNotFoundError:
            logger.error("whisperlivekit-server 命令未找到，请确保已安装 WhisperLiveKit")
            return False
        except Exception as e:
            logger.error(f"启动 WhisperLiveKit 服务器失败: {e}", exc_info=True)
            return False

    async def stop_server(self):
        """停止 WhisperLiveKit 服务器"""
        if not self.is_running:
            return

        if self.server_process:
            try:
                # 发送终止信号
                self.server_process.terminate()

                # 等待进程结束（最多 5 秒）
                try:
                    self.server_process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    # 强制终止
                    logger.warning("WhisperLiveKit 服务器未正常退出，强制终止")
                    self.server_process.kill()
                    self.server_process.wait()

                logger.info("WhisperLiveKit 服务器已停止")
            except Exception as e:
                logger.error(f"停止 WhisperLiveKit 服务器失败: {e}", exc_info=True)
            finally:
                self.server_process = None

        self.is_running = False

    def get_server_url(self) -> str:
        """获取服务器 WebSocket URL

        WhisperLiveKit 的 WebSocket 端点：
        - 根据官方文档和源码，默认是 /ws
        - 某些版本可能使用 /asr
        我们优先尝试 /ws，如果失败可以降级
        """
        # WhisperLiveKit 标准 WebSocket 端点
        return f"ws://{self.server_host}:{self.server_port}/ws"

    def get_http_url(self) -> str:
        """获取服务器 HTTP URL"""
        return f"http://{self.server_host}:{self.server_port}"

    async def health_check(self) -> bool:
        """检查服务器健康状态"""
        if not self.is_running:
            return False

        if self.server_process and self.server_process.poll() is not None:
            # 进程已退出
            self.is_running = False
            return False

        # 尝试连接服务器
        try:
            import socket

            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(1)
            result = sock.connect_ex((self.server_host, self.server_port))
            sock.close()
            return result == 0
        except Exception:
            return False

    def __del__(self):
        """清理资源"""
        if self.server_process:
            try:
                self.server_process.terminate()
            except Exception:
                pass


# 全局服务实例
_whisperlivekit_service: WhisperLiveKitService | None = None


def get_whisperlivekit_service() -> WhisperLiveKitService:
    """获取 WhisperLiveKit 服务实例（单例）"""
    global _whisperlivekit_service
    if _whisperlivekit_service is None:
        _whisperlivekit_service = WhisperLiveKitService()
    return _whisperlivekit_service
