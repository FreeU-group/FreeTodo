"""跨平台虚拟音频设备管理器

负责检测、配置和管理虚拟音频设备，支持：
- Windows: VB-CABLE
- macOS: BlackHole
- Linux: PulseAudio 环回模块
"""

import logging
import os
import platform
import subprocess
from pathlib import Path

logger = logging.getLogger(__name__)


class AudioDeviceManager:
    """跨平台音频设备管理器"""

    def __init__(self):
        self.platform = platform.system().lower()
        self.scripts_dir = Path(__file__).parent.parent.parent / "scripts" / "audio"

    def check_virtual_audio_available(self) -> tuple[bool, str]:
        """检查虚拟音频设备是否可用

        Returns:
            (is_available, message): 是否可用和状态消息
        """
        if self.platform == "windows":
            return self._check_windows()
        elif self.platform == "darwin":
            return self._check_macos()
        elif self.platform == "linux":
            return self._check_linux()
        else:
            return False, f"不支持的操作系统: {self.platform}"

    def setup_virtual_audio(self) -> tuple[bool, str]:
        """设置虚拟音频设备

        Returns:
            (success, message): 是否成功和消息
        """
        if self.platform == "windows":
            return self._setup_windows()
        elif self.platform == "darwin":
            return self._setup_macos()
        elif self.platform == "linux":
            return self._setup_linux()
        else:
            return False, f"不支持的操作系统: {self.platform}"

    def _check_windows(self) -> tuple[bool, str]:
        """检查 Windows 虚拟音频设备"""
        try:
            script_path = self.scripts_dir / "setup_virtual_audio_windows.ps1"
            if not script_path.exists():
                return False, "配置脚本不存在"

            result = subprocess.run(
                [
                    "powershell",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-File",
                    str(script_path),
                    "-CheckOnly",
                ],
                capture_output=True,
                text=True,
                timeout=10,
            )

            if result.returncode == 0:
                return True, "VB-CABLE 已安装"
            else:
                return False, "VB-CABLE 未安装或检查失败"
        except Exception as e:
            logger.error(f"检查 Windows 虚拟音频设备失败: {e}")
            return False, f"检查失败: {str(e)}"

    def _check_macos(self) -> tuple[bool, str]:
        """检查 macOS 虚拟音频设备"""
        try:
            script_path = self.scripts_dir / "setup_virtual_audio_macos.sh"
            if not script_path.exists():
                return False, "配置脚本不存在"

            # 确保脚本可执行
            os.chmod(script_path, 0o755)

            result = subprocess.run(
                [str(script_path), "--check-only"], capture_output=True, text=True, timeout=10
            )

            if result.returncode == 0:
                return True, "BlackHole 已安装"
            else:
                return False, "BlackHole 未安装或检查失败"
        except Exception as e:
            logger.error(f"检查 macOS 虚拟音频设备失败: {e}")
            return False, f"检查失败: {str(e)}"

    def _check_linux(self) -> tuple[bool, str]:
        """检查 Linux 虚拟音频设备"""
        try:
            # 检查 PulseAudio 是否运行
            result = subprocess.run(["pgrep", "-x", "pulseaudio"], capture_output=True, timeout=5)

            if result.returncode != 0:
                return False, "PulseAudio 未运行"

            # 检查环回模块
            result = subprocess.run(
                ["pactl", "list", "modules", "short"], capture_output=True, text=True, timeout=5
            )

            if "module-loopback" in result.stdout:
                return True, "PulseAudio 环回模块已加载"
            else:
                return False, "PulseAudio 环回模块未加载"
        except Exception as e:
            logger.error(f"检查 Linux 虚拟音频设备失败: {e}")
            return False, f"检查失败: {str(e)}"

    def _setup_windows(self) -> tuple[bool, str]:
        """设置 Windows 虚拟音频设备"""
        try:
            script_path = self.scripts_dir / "setup_virtual_audio_windows.ps1"
            if not script_path.exists():
                return False, "配置脚本不存在"

            result = subprocess.run(
                ["powershell", "-ExecutionPolicy", "Bypass", "-File", str(script_path)],
                capture_output=True,
                text=True,
                timeout=30,
            )

            if result.returncode == 0:
                return True, "Windows 虚拟音频设备配置完成"
            else:
                return False, f"配置失败: {result.stderr}"
        except Exception as e:
            logger.error(f"设置 Windows 虚拟音频设备失败: {e}")
            return False, f"设置失败: {str(e)}"

    def _setup_macos(self) -> tuple[bool, str]:
        """设置 macOS 虚拟音频设备"""
        try:
            script_path = self.scripts_dir / "setup_virtual_audio_macos.sh"
            if not script_path.exists():
                return False, "配置脚本不存在"

            os.chmod(script_path, 0o755)

            result = subprocess.run([str(script_path)], capture_output=True, text=True, timeout=30)

            if result.returncode == 0:
                return True, "macOS 虚拟音频设备配置完成"
            else:
                return False, f"配置失败: {result.stderr}"
        except Exception as e:
            logger.error(f"设置 macOS 虚拟音频设备失败: {e}")
            return False, f"设置失败: {str(e)}"

    def _setup_linux(self) -> tuple[bool, str]:
        """设置 Linux 虚拟音频设备"""
        try:
            script_path = self.scripts_dir / "setup_virtual_audio_linux.sh"
            if not script_path.exists():
                return False, "配置脚本不存在"

            os.chmod(script_path, 0o755)

            result = subprocess.run([str(script_path)], capture_output=True, text=True, timeout=30)

            if result.returncode == 0:
                return True, "Linux 虚拟音频设备配置完成"
            else:
                return False, f"配置失败: {result.stderr}"
        except Exception as e:
            logger.error(f"设置 Linux 虚拟音频设备失败: {e}")
            return False, f"设置失败: {str(e)}"

    def get_audio_device_info(self) -> dict[str, any]:
        """获取音频设备信息"""
        available, message = self.check_virtual_audio_available()

        return {
            "platform": self.platform,
            "available": available,
            "message": message,
            "recommended_setup": self._get_recommended_setup(),
        }

    def _get_recommended_setup(self) -> str:
        """获取推荐设置说明"""
        if self.platform == "windows":
            return """
Windows 推荐配置：
1. 安装 VB-CABLE: https://vb-audio.com/Cable/
2. 使用 Voicemeeter 混音器（推荐）：
   - 安装 Voicemeeter: https://vb-audio.com/Voicemeeter/
   - 配置系统音频同时输出到真实设备和 VB-CABLE
3. 或手动将默认播放设备切换为 VB-CABLE
"""
        elif self.platform == "darwin":
            return """
macOS 推荐配置：
1. 安装 BlackHole: brew install blackhole-2ch
   或从 GitHub 下载: https://github.com/ExistentialAudio/BlackHole
2. 在系统设置中授权麦克风权限
3. 使用 Audio MIDI Setup 创建多输出设备：
   - 添加真实输出设备 + BlackHole 2ch
   - 将系统音频输出设置为多输出设备
"""
        elif self.platform == "linux":
            return """
Linux 推荐配置：
1. 确保 PulseAudio 已安装并运行
2. 运行配置脚本自动加载环回模块
3. 虚拟音频设备将自动创建为 virtual_audio_sink
"""
        else:
            return "不支持的操作系统"


# 单例
_audio_device_manager: AudioDeviceManager | None = None


def get_audio_device_manager() -> AudioDeviceManager:
    """获取音频设备管理器单例"""
    global _audio_device_manager
    if _audio_device_manager is None:
        _audio_device_manager = AudioDeviceManager()
    return _audio_device_manager
