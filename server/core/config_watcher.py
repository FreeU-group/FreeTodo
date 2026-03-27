"""
配置变更监听与回调机制

提供配置变更时的回调注册和触发功能，用于：
- LLM API Key 变更时重新初始化 RAG 服务
- 定时任务开关变更时暂停/恢复任务
- 其他需要响应配置变更的场景
"""

from collections.abc import Callable
from typing import Any

from core.lazy_services import reinit_rag_service
from util.logging_config import get_logger
from util.settings import settings

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


def _reinit_asr_clients():
    """重新初始化所有 ASR 客户端单例"""
    try:
        from services.asr_client import ASRClient  # noqa: PLC0415

        if ASRClient._initialized:
            ASRClient().reinitialize()
    except Exception as e:
        logger.debug(f"ASRClient reinit skipped: {e}")

    try:
        from services.asr_client_dashscope import ASRDashScopeClient  # noqa: PLC0415

        if ASRDashScopeClient._initialized:
            ASRDashScopeClient().reinitialize()
    except Exception as e:
        logger.debug(f"ASRDashScopeClient reinit skipped: {e}")


@on_config_change("llm.api_key")
def _on_llm_api_key_change(_old_val: Any, _new_val: Any):
    """LLM API Key 变更时重新初始化 RAG 服务和 ASR 客户端"""
    try:
        reinit_rag_service()
        logger.info("LLM API Key 变更，已重新初始化 RAG 服务")
    except Exception as e:
        logger.error(f"重新初始化 RAG 服务失败: {e}")
    _reinit_asr_clients()


@on_config_change("llm.base_url")
def _on_llm_base_url_change(_old_val: Any, _new_val: Any):
    """LLM Base URL 变更时重新初始化 RAG 服务"""
    try:
        reinit_rag_service()
        logger.info("LLM Base URL 变更，已重新初始化 RAG 服务")
    except Exception as e:
        logger.error(f"重新初始化 RAG 服务失败: {e}")


@on_config_change("audio.asr.api_key")
def _on_asr_api_key_change(_old_val: Any, _new_val: Any):
    """ASR API Key 变更时重新初始化 ASR 客户端"""
    _reinit_asr_clients()


@on_config_change("jobs.auto_todo_detection.enabled")
def _on_auto_todo_detection_toggle(_old_val: Any, new_val: Any):
    """自动待办检测开关变更 → 控制意图识别工作流"""
    from perception.manager import try_get_perception_manager  # noqa: PLC0415

    enabled = bool(new_val)
    try:
        mgr = try_get_perception_manager()
        if mgr is None:
            logger.warning("PerceptionStreamManager 未初始化，无法切换意图识别")
            return
        subscriber = mgr.get_todo_intent_subscriber()
        if subscriber is None:
            logger.warning("TodoIntentSubscriber 未初始化，无法切换意图识别")
            return
        subscriber.set_enabled(enabled)
        logger.info(f"意图识别工作流已{'启用' if enabled else '禁用'}")
    except Exception as e:
        logger.error(f"切换意图识别工作流失败: {e}")


@on_config_change("vector_db.enabled")
def _on_vector_db_toggle(_old_val: Any, new_val: Any):
    """向量数据库开关变更"""
    try:
        if new_val:
            reinit_rag_service()
            logger.info("向量数据库已启用，重新初始化 RAG 服务")
        else:
            logger.info("向量数据库已禁用")
    except Exception as e:
        logger.error(f"变更向量数据库状态失败: {e}")
