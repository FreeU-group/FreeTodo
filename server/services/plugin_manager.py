"""可选插件管理服务 - 负责插件的下载、安装、卸载和状态查询。

目前支持的插件：
- media-crawler: MediaCrawlerPro 爬虫引擎 + 签名服务
"""

from __future__ import annotations

import asyncio
import json
import platform
import shutil
import sys
import zipfile
from pathlib import Path
from typing import Any

import httpx

from util.base_paths import get_app_root, get_user_data_dir
from util.logging_config import get_logger

logger = get_logger()

# ---------------------------------------------------------------------------
# 插件基础目录
# ---------------------------------------------------------------------------

PLUGIN_BASE_DIR = get_user_data_dir() / "plugins"


def _ensure_plugin_base_dir() -> Path:
    """确保插件基础目录存在并返回路径。"""
    PLUGIN_BASE_DIR.mkdir(parents=True, exist_ok=True)
    return PLUGIN_BASE_DIR


# ---------------------------------------------------------------------------
# MediaCrawler 插件
# ---------------------------------------------------------------------------

# 默认的插件下载 URL 模板（指向 GitHub Releases）
_DEFAULT_DOWNLOAD_URL = (
    "https://github.com/FreeU-group/FreeTodo/releases/download/plugin/media-crawler/v1.0.0/media-crawler-v1.0.0.zip"
    # "plugin/media-crawler/v1.0.0/media-crawler-v1.0.0.zip"
)

# manifest 文件名
_MANIFEST_FILE = "manifest.json"


class MediaCrawlerPlugin:
    """MediaCrawler 插件管理器。

    插件安装目录结构::

        {user_data_dir}/plugins/media-crawler/
        ├── manifest.json
        ├── MediaCrawlerPro-Python/
        │   ├── main.py
        │   ├── requirements.txt
        │   └── ...
        └── MediaCrawlerPro-SignSrv/
            ├── app.py
            ├── requirements.txt
            └── ...

    开发模式下，也支持从项目根目录（与 lifetrace/ 同级）直接读取。
    """

    PLUGIN_ID = "media-crawler"
    LATEST_VERSION = "1.0.0"

    # ------------------------------------------------------------------
    # 路径属性
    # ------------------------------------------------------------------

    @property
    def install_dir(self) -> Path:
        """插件安装目录。"""
        return PLUGIN_BASE_DIR / self.PLUGIN_ID

    @property
    def crawler_dir(self) -> Path:
        """爬虫引擎目录（插件模式）。"""
        return self.install_dir / "MediaCrawlerPro-Python"

    @property
    def sign_srv_dir(self) -> Path:
        """签名服务目录（插件模式）。"""
        return self.install_dir / "MediaCrawlerPro-SignSrv"

    @property
    def manifest_path(self) -> Path:
        return self.install_dir / _MANIFEST_FILE

    # ------------------------------------------------------------------
    # 开发模式路径（与 lifetrace/ 同级）
    # ------------------------------------------------------------------

    @staticmethod
    def _dev_project_root() -> Path:
        """返回项目根目录（lifetrace/ 的父目录）。"""
        return get_app_root().parent

    @property
    def dev_crawler_dir(self) -> Path:
        return self._dev_project_root() / "MediaCrawlerPro-Python"

    @property
    def dev_sign_srv_dir(self) -> Path:
        return self._dev_project_root() / "MediaCrawlerPro-SignSrv"

    # ------------------------------------------------------------------
    # 动态路径解析（插件优先，开发模式兜底）
    # ------------------------------------------------------------------

    def resolve_crawler_dir(self) -> Path | None:
        """动态获取爬虫引擎目录。优先从插件目录查找，其次从项目根目录查找。"""
        if self.crawler_dir.exists():
            return self.crawler_dir
        if self.dev_crawler_dir.exists():
            return self.dev_crawler_dir
        return None

    def resolve_sign_srv_dir(self) -> Path | None:
        """动态获取签名服务目录。"""
        if self.sign_srv_dir.exists():
            return self.sign_srv_dir
        if self.dev_sign_srv_dir.exists():
            return self.dev_sign_srv_dir
        return None

    # ------------------------------------------------------------------
    # 状态查询
    # ------------------------------------------------------------------

    def is_installed(self) -> bool:
        """检查插件是否已安装（插件目录模式）。"""
        return self.crawler_dir.exists() and self.sign_srv_dir.exists()

    def is_available(self) -> bool:
        """检查插件是否可用（安装模式或开发模式均可）。"""
        return self.resolve_crawler_dir() is not None

    def get_installed_version(self) -> str | None:
        """获取已安装插件的版本号。"""
        if not self.manifest_path.exists():
            # 如果有插件目录但无 manifest，视为 unknown 版本
            if self.is_installed():
                return "unknown"
            return None
        try:
            manifest = json.loads(self.manifest_path.read_text(encoding="utf-8"))
            return manifest.get("version")
        except Exception:
            return "unknown"

    def get_status(self) -> dict[str, Any]:
        """获取插件完整状态信息。"""
        installed = self.is_installed()
        available = self.is_available()
        mode = "none"
        if installed:
            mode = "plugin"
        elif available:
            mode = "dev"

        return {
            "plugin_id": self.PLUGIN_ID,
            "installed": installed,
            "available": available,
            "mode": mode,
            "version": self.get_installed_version(),
            "latest_version": self.LATEST_VERSION,
            "install_dir": str(self.install_dir) if installed else None,
            "crawler_dir": str(self.resolve_crawler_dir()),
            "sign_srv_dir": str(self.resolve_sign_srv_dir()),
        }

    # ------------------------------------------------------------------
    # 下载与安装
    # ------------------------------------------------------------------

    @staticmethod
    def _get_download_url(version: str) -> str:
        """获取插件下载 URL。"""
        return _DEFAULT_DOWNLOAD_URL.format(version=version)

    async def download_and_install(
        self,
        version: str | None = None,
        download_url: str | None = None,
    ) -> AsyncInstallProgress:
        """下载并安装插件，返回一个可异步迭代的进度对象。

        使用方法::

            progress = await plugin.download_and_install()
            async for step in progress:
                print(step)  # {"stage": "downloading", "percent": 50, ...}
        """
        version = version or self.LATEST_VERSION
        url = download_url or self._get_download_url(version)
        return AsyncInstallProgress(plugin=self, url=url, version=version)

    async def _do_install(
        self,
        zip_path: Path,
        version: str,
    ) -> None:
        """将已下载的 zip 包解压安装。"""
        install_dir = self.install_dir
        backup_dir = install_dir.with_suffix(".bak")

        # 如果已存在旧版本，先备份然后删除
        if install_dir.exists():
            # 清理可能残留的旧备份
            if backup_dir.exists():
                self._force_rmtree(backup_dir)

            try:
                install_dir.rename(backup_dir)
                logger.info(f"已备份旧插件到: {backup_dir}")
            except PermissionError:
                # Windows 上 .pyd 等文件可能被锁定导致 rename 失败，
                # 直接强制删除旧目录（不做备份回滚）
                logger.warning("旧插件目录中有锁定文件无法重命名，将强制删除旧目录后重新安装")
                self._force_rmtree(install_dir)
                # 如果强制删除后仍有残留文件，也删除目录本身
                if install_dir.exists():
                    shutil.rmtree(install_dir, ignore_errors=True)

        try:
            _ensure_plugin_base_dir()

            # 解压 zip 包
            logger.info(f"解压插件包: {zip_path} -> {install_dir}")
            with zipfile.ZipFile(zip_path, "r") as zf:
                zf.extractall(install_dir)

            # 写入 manifest
            manifest = {
                "plugin_id": self.PLUGIN_ID,
                "version": version,
                "platform": platform.system().lower(),
                "python_version": platform.python_version(),
            }
            self.manifest_path.write_text(
                json.dumps(manifest, indent=2, ensure_ascii=False),
                encoding="utf-8",
            )
            logger.info(f"插件安装完成: {self.PLUGIN_ID} v{version}")

            # 清理备份
            if backup_dir.exists():
                shutil.rmtree(backup_dir, ignore_errors=True)

        except Exception:
            # 安装失败，恢复备份（如果有）
            if install_dir.exists():
                shutil.rmtree(install_dir, ignore_errors=True)
            if backup_dir.exists():
                try:
                    backup_dir.rename(install_dir)
                    logger.info("安装失败，已恢复旧版本插件")
                except OSError:
                    logger.warning("安装失败且无法恢复旧版本，请重新安装插件")
            raise

    async def setup_venv(self, target_dir: Path) -> bool:
        """为插件子项目创建虚拟环境并安装依赖。

        Args:
            target_dir: 包含 requirements.txt 的项目目录。

        Returns:
            是否安装成功。
        """
        requirements = target_dir / "requirements.txt"
        if not requirements.exists():
            logger.warning(f"未找到 requirements.txt: {target_dir}")
            return True  # 没有依赖文件视为成功

        venv_dir = target_dir / ".venv"

        try:
            # 创建 venv
            if not venv_dir.exists():
                logger.info(f"创建虚拟环境: {venv_dir}")
                proc = await asyncio.create_subprocess_exec(
                    sys.executable,
                    "-m",
                    "venv",
                    str(venv_dir),
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                _, stderr = await proc.communicate()
                if proc.returncode != 0:
                    logger.error(f"创建 venv 失败: {stderr.decode(errors='ignore')}")
                    return False

            # 获取 venv 中的 pip
            if sys.platform == "win32":
                pip_exe = venv_dir / "Scripts" / "pip.exe"
            else:
                pip_exe = venv_dir / "bin" / "pip"

            if not pip_exe.exists():
                logger.error(f"pip 不存在: {pip_exe}")
                return False

            # 安装依赖
            logger.info(f"安装依赖: {requirements}")
            proc = await asyncio.create_subprocess_exec(
                str(pip_exe),
                "install",
                "-r",
                str(requirements),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=str(target_dir),
            )
            _, stderr = await proc.communicate()
            if proc.returncode != 0:
                logger.error(f"安装依赖失败: {stderr.decode(errors='ignore')}")
                return False

            logger.info(f"依赖安装完成: {target_dir.name}")
            return True

        except Exception as e:
            logger.error(f"设置虚拟环境失败 ({target_dir.name}): {e}")
            return False

    # ------------------------------------------------------------------
    # 卸载
    # ------------------------------------------------------------------

    async def uninstall(self) -> bool:
        """卸载插件（删除插件安装目录）。

        在 Windows 上，.pyd 等 DLL 文件可能被进程锁定，
        因此使用带重试的删除策略，并在必要时跳过锁定文件。
        """
        if not self.is_installed():
            logger.info("插件未安装，无需卸载")
            return True

        import asyncio

        install_path = self.install_dir
        max_retries = 3

        for attempt in range(1, max_retries + 1):
            try:
                shutil.rmtree(install_path)
                logger.info(f"插件已卸载: {self.PLUGIN_ID}")
                return True
            except PermissionError as e:
                if attempt < max_retries:
                    wait = attempt * 2  # 2s, 4s
                    logger.warning(
                        f"卸载插件第 {attempt} 次尝试失败（文件锁定），{wait} 秒后重试: {e}"
                    )
                    await asyncio.sleep(wait)
                else:
                    # 最后一次尝试：使用 onerror 回调跳过无法删除的文件
                    logger.warning(
                        f"卸载插件第 {attempt} 次仍有锁定文件，尝试跳过锁定文件强制删除..."
                    )
                    try:
                        self._force_rmtree(install_path)
                        # 检查目录是否还存在
                        if not install_path.exists():
                            logger.info(f"插件已卸载: {self.PLUGIN_ID}")
                            return True
                        # 目录仍存在但可能只剩少量锁定文件
                        remaining = list(install_path.rglob("*"))
                        logger.warning(
                            f"插件大部分文件已删除，"
                            f"仍有 {len(remaining)} 个锁定文件无法删除，"
                            "请关闭应用后手动删除残留文件"
                        )
                        return True  # 视为"基本成功"
                    except Exception as inner_e:
                        logger.error(f"强制卸载失败: {inner_e}")
                        return False
            except Exception as e:
                logger.error(f"卸载插件失败: {e}")
                return False

        return False  # 不应到达此处

    @staticmethod
    def _force_rmtree(path: Path) -> None:
        """强制删除目录树，遇到权限错误时修改权限后重试。"""
        import os
        import stat

        def _on_error(func, file_path, exc_info):  # noqa: ARG001
            """shutil.rmtree 的 onerror 回调。"""
            try:
                # 尝试移除只读属性后重新删除
                os.chmod(file_path, stat.S_IWRITE)
                func(file_path)
            except Exception:
                # 仍然失败（文件被锁定），记录但不中断
                logger.debug(f"无法删除文件（已跳过）: {file_path}")

        shutil.rmtree(path, onerror=_on_error)


# ---------------------------------------------------------------------------
# 异步安装进度迭代器
# ---------------------------------------------------------------------------


class AsyncInstallProgress:
    """异步安装进度迭代器，用于流式返回安装状态。"""

    def __init__(self, plugin: MediaCrawlerPlugin, url: str, version: str) -> None:
        self._plugin = plugin
        self._url = url
        self._version = version

    async def run(self):
        """执行完整的安装流程，yield 每个阶段的进度。"""
        tmp_zip: Path | None = None
        try:
            # === 阶段 1: 下载 ===
            yield self._progress("downloading", 0, message="开始下载插件包...")

            _ensure_plugin_base_dir()
            tmp_zip = PLUGIN_BASE_DIR / f"{self._plugin.PLUGIN_ID}-{self._version}.zip"

            async with (
                httpx.AsyncClient(
                    timeout=httpx.Timeout(connect=30, read=120, write=30, pool=30),
                    follow_redirects=True,
                ) as client,
                client.stream("GET", self._url) as resp,
            ):
                if resp.status_code != 200:
                    yield self._progress(
                        "error",
                        0,
                        message=f"下载失败: HTTP {resp.status_code}",
                        error=True,
                    )
                    return

                total_size = int(resp.headers.get("content-length", 0))
                downloaded = 0

                with open(tmp_zip, "wb") as f:
                    async for chunk in resp.aiter_bytes(chunk_size=65536):
                        f.write(chunk)
                        downloaded += len(chunk)
                        if total_size > 0:
                            pct = min(int(downloaded / total_size * 100), 100)
                        else:
                            pct = -1  # 未知大小
                        yield self._progress(
                            "downloading",
                            pct,
                            downloaded=downloaded,
                            total=total_size,
                        )

            yield self._progress("downloading", 100, message="下载完成")

            # === 阶段 2: 解压安装 ===
            yield self._progress("extracting", 0, message="正在解压安装...")

            await self._plugin._do_install(tmp_zip, self._version)

            yield self._progress("extracting", 100, message="解压完成")

            # === 阶段 3: 安装依赖 ===
            yield self._progress("installing_deps", 0, message="正在安装爬虫引擎依赖...")

            crawler_ok = await self._plugin.setup_venv(self._plugin.crawler_dir)
            yield self._progress("installing_deps", 50, message="正在安装签名服务依赖...")

            sign_ok = await self._plugin.setup_venv(self._plugin.sign_srv_dir)
            yield self._progress("installing_deps", 100, message="依赖安装完成")

            if not crawler_ok or not sign_ok:
                yield self._progress(
                    "warning",
                    100,
                    message="插件已安装，但部分依赖安装失败，请手动检查",
                )

            # === 完成 ===
            yield self._progress("complete", 100, message="插件安装成功")

        except Exception as e:
            logger.error(f"插件安装失败: {e}", exc_info=True)
            yield self._progress("error", 0, message=f"安装失败: {e}", error=True)

        finally:
            # 清理临时文件
            if tmp_zip and tmp_zip.exists():
                try:
                    tmp_zip.unlink()
                except OSError:
                    pass

    @staticmethod
    def _progress(
        stage: str,
        percent: int,
        *,
        message: str = "",
        error: bool = False,
        **extra: Any,
    ) -> dict[str, Any]:
        result: dict[str, Any] = {
            "stage": stage,
            "percent": percent,
            "error": error,
        }
        if message:
            result["message"] = message
        result.update(extra)
        return result


# ---------------------------------------------------------------------------
# 全局单例
# ---------------------------------------------------------------------------

media_crawler_plugin = MediaCrawlerPlugin()
