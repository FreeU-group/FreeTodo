# ruff: noqa: C901, PLR0911, PLR0912, PLR0915, PLR2004, TC003
"""Crawler process lifecycle and loop scheduling routes."""

from __future__ import annotations

import asyncio
import os
import socket
import subprocess  # nosec B404: router intentionally manages vetted local plugin processes.
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from secrets import SystemRandom
from typing import Any, TextIO

from fastapi import APIRouter, HTTPException

from .common import (
    extract_config_value,
    get_crawler_dir,
    get_sign_srv_dir,
    logger,
    normalize_platform_name,
    plugin,
    read_config_file,
    update_config_value,
    write_config_file,
)

ALL_PLATFORMS_CRAWL_ORDER = ["xhs", "douyin", "bilibili", "weibo", "kuaishou", "zhihu", "tieba"]
RANDOMIZER = SystemRandom()


@dataclass(slots=True)
class CrawlerRuntimeState:
    """In-memory crawler runtime state."""

    sign_srv_process: subprocess.Popen | None = None
    crawler_process: subprocess.Popen | None = None
    crawler_log_handle: TextIO | None = None
    crawler_status: str = "idle"
    stop_loop_flag: bool = False
    loop_crawler_task: asyncio.Task | None = None
    current_platform_index: int = 0
    excluded_keywords: list[str] = field(default_factory=list)


runtime_state = CrawlerRuntimeState()


def _is_within_directory(base_dir: Path, candidate: Path) -> bool:
    try:
        candidate.resolve().relative_to(base_dir.resolve())
    except ValueError:
        return False
    return True


def _venv_python(project_dir: Path) -> Path:
    if sys.platform == "win32":
        return project_dir / ".venv" / "Scripts" / "python.exe"
    return project_dir / ".venv" / "bin" / "python"


def _creationflags() -> int:
    return subprocess.CREATE_NEW_PROCESS_GROUP if sys.platform == "win32" else 0


def _close_crawler_log_handle() -> None:
    if runtime_state.crawler_log_handle is None:
        return
    try:
        runtime_state.crawler_log_handle.close()
    except OSError as exc:
        logger.debug("关闭爬虫日志句柄失败: %s", exc)
    finally:
        runtime_state.crawler_log_handle = None


def _build_conda_path_env(sign_srv_dir: Path) -> dict[str, str]:
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    if sys.platform != "win32":
        return env

    pyvenv_cfg = sign_srv_dir / ".venv" / "pyvenv.cfg"
    if not pyvenv_cfg.exists():
        return env

    conda_base = None
    for line in pyvenv_cfg.read_text(encoding="utf-8").splitlines():
        if line.startswith("home = "):
            conda_base = line.split("=", 1)[1].strip()
            break

    if not conda_base:
        return env

    conda_paths = [
        conda_base,
        os.path.join(conda_base, "Library", "mingw-w64", "bin"),
        os.path.join(conda_base, "Library", "usr", "bin"),
        os.path.join(conda_base, "Library", "bin"),
        os.path.join(conda_base, "Scripts"),
        os.path.join(conda_base, "bin"),
    ]
    env["PATH"] = os.pathsep.join([*conda_paths, env.get("PATH", "")])
    logger.info("添加 conda 环境路径到 PATH: %s", conda_base)
    return env


def is_sign_srv_running() -> bool:
    """Check whether the sign service is active."""
    process = runtime_state.sign_srv_process
    if process is not None and process.poll() is None:
        return True

    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as connection:
            connection.settimeout(1)
            if connection.connect_ex(("127.0.0.1", 8989)) == 0:
                logger.info("签名服务正在正常运行（端口 8989）")
                return True
    except OSError as exc:
        logger.debug("检测签名服务端口失败: %s", exc)
    return False


def is_crawler_running() -> bool:
    """Check whether a crawler process is active."""
    process = runtime_state.crawler_process
    return process is not None and process.poll() is None


def start_sign_service() -> bool:
    """Start the local sign service process."""
    if is_sign_srv_running():
        logger.info("签名服务已在运行")
        return True

    try:
        sign_srv_dir = get_sign_srv_dir()
        python_exe = _venv_python(sign_srv_dir)
        app_script = sign_srv_dir / "app.py"
        if not sign_srv_dir.exists():
            logger.error("签名服务目录不存在: %s", sign_srv_dir)
            return False
        if not python_exe.exists():
            logger.error(
                "SignSrv 虚拟环境 Python 不存在: %s，请先创建虚拟环境并安装依赖", python_exe
            )
            return False
        if not app_script.exists() or not _is_within_directory(sign_srv_dir, python_exe):
            logger.error("签名服务启动文件不安全或不存在: %s / %s", python_exe, app_script)
            return False

        logger.info("启动签名服务: %s，使用 Python: %s", sign_srv_dir, python_exe)
        runtime_state.sign_srv_process = subprocess.Popen(  # nosec B603: command uses fixed local plugin paths without shell.
            [str(python_exe), app_script.name],
            cwd=str(sign_srv_dir),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=_build_conda_path_env(sign_srv_dir),
            creationflags=_creationflags(),
        )

        time.sleep(2)
        if runtime_state.sign_srv_process.poll() is not None:
            _, stderr = runtime_state.sign_srv_process.communicate()
            logger.error("签名服务启动失败: %s", stderr.decode("utf-8", errors="ignore"))
            return False

        logger.info("签名服务启动成功")
        return True
    except Exception as exc:
        logger.error("启动签名服务失败: %s", exc)
        return False


def start_crawler_process(platform: str, crawler_type: str) -> bool:
    """Start the crawler CLI process."""
    if is_crawler_running():
        logger.info("爬虫已在运行")
        return True

    try:
        crawler_dir = get_crawler_dir()
        python_exe = _venv_python(crawler_dir)
        main_script = crawler_dir / "main.py"
        if not crawler_dir.exists():
            logger.error("爬虫目录不存在: %s", crawler_dir)
            return False
        if not python_exe.exists():
            logger.error("爬虫虚拟环境 Python 不存在: %s，请先创建虚拟环境并安装依赖", python_exe)
            return False
        if not main_script.exists() or not _is_within_directory(crawler_dir, python_exe):
            logger.error("爬虫启动文件不安全或不存在: %s / %s", python_exe, main_script)
            return False

        normalized_platform = normalize_platform_name(platform)
        if normalized_platform != platform:
            logger.info("平台名称已规范化: %s -> %s", platform, normalized_platform)

        cmd = [
            str(python_exe),
            main_script.name,
            "--platform",
            normalized_platform,
            "--type",
            crawler_type,
        ]
        env = os.environ.copy()
        env["PYTHONIOENCODING"] = "utf-8"

        crawler_log_file = crawler_dir / "logs" / "crawler_output.log"
        crawler_log_file.parent.mkdir(parents=True, exist_ok=True)
        with crawler_log_file.open("a", encoding="utf-8") as bootstrap_log:
            bootstrap_log.write(f"\n{'=' * 50}\n")
            bootstrap_log.write(f"启动时间: {time.strftime('%Y-%m-%d %H:%M:%S')}\n")
            bootstrap_log.write(f"命令: {' '.join(cmd)}\n")
            bootstrap_log.write(f"{'=' * 50}\n")

        _close_crawler_log_handle()
        runtime_state.crawler_log_handle = crawler_log_file.open("a", encoding="utf-8")
        runtime_state.crawler_process = subprocess.Popen(  # nosec B603: command uses fixed local plugin paths without shell.
            cmd,
            cwd=str(crawler_dir),
            stdout=runtime_state.crawler_log_handle,
            stderr=subprocess.STDOUT,
            env=env,
            creationflags=_creationflags(),
        )
        runtime_state.crawler_status = "running"
        logger.info("爬虫启动成功")
        return True
    except Exception as exc:
        logger.error("启动爬虫失败: %s", exc)
        runtime_state.crawler_status = "error"
        _close_crawler_log_handle()
        return False


def stop_sign_service() -> bool:
    """Stop the local sign service process."""
    if not is_sign_srv_running():
        logger.info("签名服务未运行")
        runtime_state.sign_srv_process = None
        return True

    process = runtime_state.sign_srv_process
    if process is None:
        return True

    try:
        process.terminate()
        process.wait(timeout=5)
        runtime_state.sign_srv_process = None
        logger.info("签名服务已停止")
        return True
    except Exception as exc:
        logger.error("停止签名服务失败: %s", exc)
        try:
            process.kill()
        except OSError as kill_error:
            logger.warning("强制终止签名服务失败: %s", kill_error)
        runtime_state.sign_srv_process = None
        return False


def stop_crawler_process() -> bool:
    """Stop the crawler process."""
    if not is_crawler_running():
        logger.info("爬虫未运行")
        runtime_state.crawler_status = "idle"
        _close_crawler_log_handle()
        runtime_state.crawler_process = None
        return True

    process = runtime_state.crawler_process
    if process is None:
        runtime_state.crawler_status = "idle"
        return True

    try:
        runtime_state.crawler_status = "stopping"
        process.terminate()
        process.wait(timeout=10)
        runtime_state.crawler_process = None
        runtime_state.crawler_status = "idle"
        _close_crawler_log_handle()
        logger.info("爬虫已停止")
        return True
    except Exception as exc:
        logger.error("停止爬虫失败: %s", exc)
        try:
            process.kill()
        except OSError as kill_error:
            logger.warning("强制终止爬虫失败: %s", kill_error)
        runtime_state.crawler_process = None
        runtime_state.crawler_status = "idle"
        _close_crawler_log_handle()
        return False


def _resolve_platforms(content: str, data: dict[str, Any] | None) -> list[str]:
    platforms = data.get("platforms") if data else None
    if platforms:
        return platforms

    platforms_str = extract_config_value(content, "PLATFORMS", "str") or ""
    if platforms_str:
        platforms = [value.strip() for value in platforms_str.split(",") if value.strip()]
    if platforms:
        return platforms

    platform = data.get("platform") if data else None
    if not platform:
        platform = extract_config_value(content, "PLATFORM", "str") or "xhs"
    return [platform]


async def loop_crawl_platforms(platforms: list[str], crawler_type: str) -> None:
    """Run the long-lived platform crawl loop."""
    runtime_state.crawler_status = "running"
    selected_platforms_set = set(platforms)
    ordered_platforms = (
        ALL_PLATFORMS_CRAWL_ORDER.copy()
        if selected_platforms_set >= set(ALL_PLATFORMS_CRAWL_ORDER) or len(platforms) >= 7
        else platforms
    )
    logger.info("[循环爬取] 使用平台顺序: %s", ordered_platforms)

    platform_fail_counts: dict[str, int] = dict.fromkeys(ordered_platforms, 0)
    platform_interval_range = (3, 5)
    round_interval_range = (50 * 60, 70 * 60)
    max_timeout = 120
    max_consecutive_fails = 3
    round_count = 0
    total_success_count = 0
    total_fail_count = 0

    while not runtime_state.stop_loop_flag:
        round_count += 1
        round_success_count = 0
        round_fail_count = 0
        logger.info("[循环爬取] ========== 开始第 %s 轮爬取 ==========", round_count)
        logger.info("[循环爬取] 平台顺序: %s", " → ".join(ordered_platforms))

        for platform_index, current_platform in enumerate(ordered_platforms):
            if runtime_state.stop_loop_flag:
                logger.info("[循环爬取] 收到停止信号，退出循环")
                break

            runtime_state.current_platform_index = platform_index
            if platform_fail_counts[current_platform] >= max_consecutive_fails:
                logger.warning(
                    "[循环爬取] 平台 %s 连续失败 %s 次，本轮跳过",
                    current_platform,
                    platform_fail_counts[current_platform],
                )
                platform_fail_counts[current_platform] = 0
                continue

            try:
                if not start_crawler_process(current_platform, crawler_type):
                    logger.error("[循环爬取] 启动平台 %s 爬虫失败，跳过", current_platform)
                    platform_fail_counts[current_platform] += 1
                    round_fail_count += 1
                    continue

                wait_time = 0
                while (
                    is_crawler_running()
                    and not runtime_state.stop_loop_flag
                    and wait_time < max_timeout
                ):
                    await asyncio.sleep(1)
                    wait_time += 1

                if runtime_state.stop_loop_flag:
                    logger.info("[循环爬取] 收到停止信号，退出循环")
                    break

                if wait_time >= max_timeout and is_crawler_running():
                    logger.warning(
                        "[循环爬取] 平台 %s 爬取超时（%s秒），强制终止",
                        current_platform,
                        max_timeout,
                    )
                    stop_crawler_process()
                    platform_fail_counts[current_platform] += 1
                    round_fail_count += 1
                else:
                    platform_fail_counts[current_platform] = 0
                    round_success_count += 1
                    logger.info("[循环爬取] 平台 %s 爬取完成", current_platform)
            except Exception as exc:
                logger.error("[循环爬取] 平台 %s 爬取异常: %s", current_platform, exc)
                platform_fail_counts[current_platform] += 1
                round_fail_count += 1
                if not stop_crawler_process():
                    logger.warning("[循环爬取] 平台 %s 异常后停止爬虫失败", current_platform)

            if platform_index < len(ordered_platforms) - 1 and not runtime_state.stop_loop_flag:
                platform_interval = RANDOMIZER.randint(*platform_interval_range)
                logger.info("[循环爬取] 等待 %s 秒后爬取下一个平台...", platform_interval)
                elapsed = 0
                while elapsed < platform_interval and not runtime_state.stop_loop_flag:
                    await asyncio.sleep(1)
                    elapsed += 1

        total_success_count += round_success_count
        total_fail_count += round_fail_count
        if runtime_state.stop_loop_flag:
            break

        logger.info("[循环爬取] ========== 第 %s 轮爬取完成 ==========", round_count)
        logger.info(
            "[循环爬取] 本轮结果: 成功 %s 次, 失败 %s 次", round_success_count, round_fail_count
        )
        logger.info(
            "[循环爬取] 累计结果: 成功 %s 次, 失败 %s 次", total_success_count, total_fail_count
        )

        round_interval = RANDOMIZER.randint(*round_interval_range)
        logger.info(
            "[循环爬取] 等待 %s 分钟（约 %s 秒）后开始第 %s 轮爬取...",
            round_interval // 60,
            round_interval,
            round_count + 1,
        )
        elapsed = 0
        while elapsed < round_interval and not runtime_state.stop_loop_flag:
            await asyncio.sleep(5)
            elapsed += 5

    runtime_state.crawler_status = "idle"
    logger.info(
        "[循环爬取] 循环爬取已停止，共完成 %s 轮，累计成功 %s 次，失败 %s 次",
        round_count,
        total_success_count,
        total_fail_count,
    )


def register_routes(router: APIRouter) -> None:
    """Register crawler lifecycle routes."""

    @router.get("/status")
    async def get_crawler_status() -> dict[str, Any]:
        """Return runtime status and plugin availability."""
        loop_task_running = (
            runtime_state.loop_crawler_task is not None
            and not runtime_state.loop_crawler_task.done()
        )
        if (
            runtime_state.crawler_status == "running"
            and not is_crawler_running()
            and not loop_task_running
        ):
            runtime_state.crawler_status = "idle"

        plugin_installed = plugin.is_installed()
        plugin_mode = (
            "plugin" if plugin_installed else ("dev" if plugin.resolve_crawler_dir() else "none")
        )
        return {
            "status": runtime_state.crawler_status,
            "sign_srv_running": is_sign_srv_running(),
            "crawler_running": is_crawler_running(),
            "plugin_installed": plugin_installed,
            "plugin_available": plugin.is_available(),
            "plugin_mode": plugin_mode,
            "loop_mode": loop_task_running,
            "loop_stopped": runtime_state.stop_loop_flag,
            "current_platform_index": runtime_state.current_platform_index,
            "excluded_keywords": runtime_state.excluded_keywords,
        }

    @router.post("/start")
    async def start_crawler(data: dict[str, Any] | None = None) -> dict[str, Any]:
        """Start the sign service and the looping crawler task."""
        try:
            runtime_state.crawler_status = "starting"
            runtime_state.stop_loop_flag = False
            runtime_state.current_platform_index = 0
            content = read_config_file()
            platforms = _resolve_platforms(content, data)
            crawler_type = data.get("crawler_type") if data else None
            crawler_type = (
                crawler_type or extract_config_value(content, "CRAWLER_TYPE", "str") or "search"
            )

            excluded_keywords = data.get("excluded_keywords") if data else None
            if excluded_keywords:
                runtime_state.excluded_keywords = (
                    excluded_keywords
                    if isinstance(excluded_keywords, list)
                    else [excluded_keywords]
                )
                logger.info("设置排除关键词: %s", runtime_state.excluded_keywords)
            else:
                runtime_state.excluded_keywords = []

            if platforms:
                updated_content = update_config_value(
                    content, "PLATFORMS", ",".join(platforms), "str"
                )
                updated_content = update_config_value(
                    updated_content, "PLATFORM", platforms[0], "str"
                )
                write_config_file(updated_content)
                logger.info("保存平台配置: %s", platforms)

            logger.info(
                "准备启动循环爬虫 - 平台: %s, 类型: %s, 排除关键词: %s",
                platforms,
                crawler_type,
                runtime_state.excluded_keywords,
            )
            if not await asyncio.to_thread(start_sign_service):
                runtime_state.crawler_status = "error"
                return {"success": False, "error": "启动签名服务失败"}

            await asyncio.sleep(3)
            runtime_state.loop_crawler_task = asyncio.create_task(
                loop_crawl_platforms(platforms, crawler_type)
            )
            return {
                "success": True,
                "message": f"循环爬虫启动成功，将轮流爬取 {len(platforms)} 个平台，直到手动停止",
                "platforms": platforms,
                "crawler_type": crawler_type,
                "excluded_keywords": runtime_state.excluded_keywords,
                "mode": "loop",
            }
        except Exception as exc:
            logger.error("启动爬虫失败: %s", exc)
            runtime_state.crawler_status = "error"
            raise HTTPException(status_code=500, detail=f"启动爬虫失败: {exc!s}") from exc

    @router.post("/stop")
    async def stop_crawler() -> dict[str, Any]:
        """Stop the loop task and active crawler process."""
        try:
            runtime_state.crawler_status = "stopping"
            runtime_state.stop_loop_flag = True
            logger.info("[停止爬虫] 设置停止标志，正在停止循环爬取...")
            stop_crawler_process()

            loop_task = runtime_state.loop_crawler_task
            if loop_task and not loop_task.done():
                try:
                    await asyncio.wait_for(asyncio.shield(loop_task), timeout=5.0)
                except TimeoutError:
                    logger.warning("[停止爬虫] 循环任务未能在5秒内停止，取消任务")
                    loop_task.cancel()
                except asyncio.CancelledError:
                    logger.info("[停止爬虫] 循环任务已取消")

            runtime_state.crawler_status = "idle"
            logger.info("[停止爬虫] 爬虫已完全停止")
            return {"success": True, "message": "爬虫已停止"}
        except Exception as exc:
            logger.error("停止爬虫失败: %s", exc)
            runtime_state.crawler_status = "idle"
            raise HTTPException(status_code=500, detail=f"停止爬虫失败: {exc!s}") from exc

    @router.post("/stop-all")
    async def stop_all() -> dict[str, Any]:
        """Stop crawler and sign service processes."""
        try:
            stop_crawler_process()
            stop_sign_service()
            return {"success": True, "message": "所有服务已停止"}
        except Exception as exc:
            logger.error("停止服务失败: %s", exc)
            raise HTTPException(status_code=500, detail=f"停止服务失败: {exc!s}") from exc
