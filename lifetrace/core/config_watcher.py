"""
配置变更监听与回调机制

提供配置变更时的回调注册和触发功能，用于：
- LLM API Key 变更时重新初始化 RAG 服务
- 定时任务开关变更时暂停/恢复任务
- 其他需要响应配置变更的场景
"""

from collections.abc import Callable
from typing import Any

from lifetrace.util.logging_config import get_logger

logger = get_logger()

# 配置变更回调注册表
# 格式: {config_key: [callback_func, ...]}
_callbacks: dict[str, list[Callable[[Any, Any], None]]] = {}

# 配置值快照（用于检测变更）
_config_snapshot: dict[str, Any] = {}


def on_config_change(key: str):
    """装饰器：注册配置变更回调

    当指定的配置键发生变更时，回调函数将被调用。
    回调函数签名：callback(old_value, new_value)

    Args:
        key: 配置键（支持点号分隔的嵌套键，如 "llm.api_key"）

    Example:
        @on_config_change("llm.api_key")
        def on_llm_key_change(old_val, new_val):
            print(f"LLM API Key changed from {old_val} to {new_val}")
    """

    def decorator(func: Callable[[Any, Any], None]):
        register_callback(key, func)
        return func

    return decorator


def register_callback(key: str, callback: Callable[[Any, Any], None]):
    """注册配置变更回调

    Args:
        key: 配置键
        callback: 回调函数，签名为 callback(old_value, new_value)
    """
    if key not in _callbacks:
        _callbacks[key] = []
    if callback not in _callbacks[key]:
        _callbacks[key].append(callback)
        logger.debug(f"已注册配置变更回调: {key} -> {callback.__name__}")


def unregister_callback(key: str, callback: Callable[[Any, Any], None]):
    """取消注册配置变更回调

    Args:
        key: 配置键
        callback: 要取消的回调函数
    """
    if key in _callbacks and callback in _callbacks[key]:
        _callbacks[key].remove(callback)
        logger.debug(f"已取消配置变更回调: {key} -> {callback.__name__}")


def notify_config_change(key: str, old_value: Any, new_value: Any):
    """通知配置变更

    触发已注册的所有回调函数。

    Args:
        key: 配置键
        old_value: 旧值
        new_value: 新值
    """
    if key not in _callbacks:
        return

    logger.info(f"配置变更: {key} = {new_value} (原值: {old_value})")

    for callback in _callbacks[key]:
        try:
            callback(old_value, new_value)
            logger.debug(f"配置变更回调成功: {key} -> {callback.__name__}")
        except Exception as e:
            logger.error(f"配置变更回调失败: {key} -> {callback.__name__}: {e}")


def take_snapshot():
    """获取当前配置快照

    在配置重载前调用，用于后续比对变更。
    """
    from lifetrace.util.settings import settings

    _config_snapshot.clear()

    # 记录所有已注册回调的配置键的当前值
    for key in _callbacks:
        try:
            _config_snapshot[key] = settings.get(key)
        except KeyError:
            _config_snapshot[key] = None


def detect_and_notify_changes():
    """检测并通知配置变更

    在配置重载后调用，比对快照与当前值，触发变更回调。
    """
    from lifetrace.util.settings import settings

    for key in _callbacks:
        old_value = _config_snapshot.get(key)
        try:
            new_value = settings.get(key)
        except KeyError:
            new_value = None

        if old_value != new_value:
            notify_config_change(key, old_value, new_value)


def reload_with_callbacks() -> bool:
    """带回调的配置重载

    1. 获取当前配置快照
    2. 重载配置
    3. 检测变更并触发回调

    Returns:
        bool: 重载是否成功
    """
    from lifetrace.util.settings import settings

    # 获取快照
    take_snapshot()

    # 重载配置
    try:
        settings.reload()
        success = True
    except Exception:
        success = False

    if success:
        # 检测并通知变更
        detect_and_notify_changes()

    return success


# ============================================================
# 预定义的配置变更回调
# ============================================================


@on_config_change("llm.api_key")
def _on_llm_api_key_change(old_val: Any, new_val: Any):
    """LLM API Key 变更时重新初始化 RAG 服务"""
    try:
        from lifetrace.core.lazy_services import reinit_rag_service

        reinit_rag_service()
        logger.info("LLM API Key 变更，已重新初始化 RAG 服务")
    except ImportError:
        logger.debug("lazy_services 模块未加载，跳过 RAG 服务重新初始化")
    except Exception as e:
        logger.error(f"重新初始化 RAG 服务失败: {e}")


@on_config_change("llm.base_url")
def _on_llm_base_url_change(old_val: Any, new_val: Any):
    """LLM Base URL 变更时重新初始化 RAG 服务"""
    try:
        from lifetrace.core.lazy_services import reinit_rag_service

        reinit_rag_service()
        logger.info("LLM Base URL 变更，已重新初始化 RAG 服务")
    except ImportError:
        logger.debug("lazy_services 模块未加载，跳过 RAG 服务重新初始化")
    except Exception as e:
        logger.error(f"重新初始化 RAG 服务失败: {e}")


@on_config_change("jobs.recorder.enabled")
def _on_recorder_toggle(old_val: Any, new_val: Any):
    """录制器任务开关变更"""
    try:
        from lifetrace.jobs.job_manager import get_job_manager

        manager = get_job_manager()
        if new_val:
            manager.scheduler_manager.resume_job("recorder_job")
            logger.info("录制器任务已启用")
        else:
            manager.scheduler_manager.pause_job("recorder_job")
            logger.info("录制器任务已暂停")
    except ImportError:
        logger.debug("job_manager 模块未加载，跳过任务状态变更")
    except Exception as e:
        logger.error(f"变更录制器任务状态失败: {e}")


@on_config_change("jobs.ocr.enabled")
def _on_ocr_toggle(old_val: Any, new_val: Any):
    """OCR 任务开关变更"""
    try:
        from lifetrace.jobs.job_manager import get_job_manager

        manager = get_job_manager()
        if new_val:
            manager.scheduler_manager.resume_job("ocr_job")
            logger.info("OCR 任务已启用")
        else:
            manager.scheduler_manager.pause_job("ocr_job")
            logger.info("OCR 任务已暂停")
    except ImportError:
        logger.debug("job_manager 模块未加载，跳过任务状态变更")
    except Exception as e:
        logger.error(f"变更 OCR 任务状态失败: {e}")


@on_config_change("jobs.auto_todo_detection.enabled")
def _on_auto_todo_detection_toggle(old_val: Any, new_val: Any):
    """自动待办检测任务开关变更"""
    try:
        from lifetrace.jobs.job_manager import get_job_manager

        manager = get_job_manager()
        if new_val:
            manager.scheduler_manager.resume_job("auto_todo_detection_job")
            logger.info("自动待办检测任务已启用")
        else:
            manager.scheduler_manager.pause_job("auto_todo_detection_job")
            logger.info("自动待办检测任务已暂停")
    except ImportError:
        logger.debug("job_manager 模块未加载，跳过任务状态变更")
    except Exception as e:
        logger.error(f"变更自动待办检测任务状态失败: {e}")


@on_config_change("vector_db.enabled")
def _on_vector_db_toggle(old_val: Any, new_val: Any):
    """向量数据库开关变更"""
    try:
        from lifetrace.core.lazy_services import reinit_rag_service

        if new_val:
            reinit_rag_service()
            logger.info("向量数据库已启用，重新初始化 RAG 服务")
        else:
            logger.info("向量数据库已禁用")
    except ImportError:
        logger.debug("lazy_services 模块未加载，跳过向量数据库状态变更")
    except Exception as e:
        logger.error(f"变更向量数据库状态失败: {e}")
