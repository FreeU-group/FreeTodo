"""Observability 初始化模块

负责设置 OpenTelemetry tracing 和 instrumentors。
"""

from __future__ import annotations

import importlib
import logging
import threading
import warnings
from typing import Any, cast

from observability.config import get_observability_config
from util.logging_config import get_logger

logger = get_logger()


def _suppress_otel_context_warnings():
    """抑制 OpenTelemetry context detach 警告

    这些警告在异步/生成器环境中是正常的，不影响功能。
    警告来源：OpenTelemetry 的 context detach 在流式/生成器模式下
    会因为 context 跨越不同的异步边界而触发。
    """

    # 1. 过滤 logging 模块的警告
    class ContextDetachFilter(logging.Filter):
        def filter(self, record: logging.LogRecord) -> bool:
            msg = record.getMessage()
            if "Failed to detach context" in msg:
                return False
            return "was created in a different Context" not in msg

    # 应用到 OpenTelemetry 相关的 logger
    for logger_name in ["opentelemetry", "opentelemetry.context"]:
        otel_logger = logging.getLogger(logger_name)
        otel_logger.addFilter(ContextDetachFilter())

    # 2. 过滤 warnings 模块
    warnings.filterwarnings("ignore", message=".*was created in a different Context.*")

    # 3. 重定向 OpenTelemetry 的 stderr 输出（它直接打印到 stderr）
    # 通过 monkey-patch OpenTelemetry 的 detach 函数来抑制警告
    try:
        otel_context = importlib.import_module("opentelemetry.context")
        otel_context_any = cast("Any", otel_context)
        _original_detach = otel_context_any.detach

        def _silent_detach(token):
            """静默版本的 detach，捕获并忽略 context 错误"""
            try:
                return _original_detach(token)
            except ValueError as e:
                if "was created in a different Context" in str(e):
                    pass  # 静默忽略这个已知问题
                else:
                    raise

        if hasattr(otel_context, "detach"):
            otel_context_any.detach = _silent_detach

    except Exception as e:
        logger.debug(f"Observability: patch OTel context 失败: {e}")


# 全局初始化标志，确保只初始化一次
_initialized = threading.Event()
_init_lock = threading.Lock()


def _try_create_phoenix_exporter(config):
    """创建 Phoenix 导出器，失败时返回 (None, None)。"""
    try:
        exporter_module = importlib.import_module(
            "opentelemetry.exporter.otlp.proto.http.trace_exporter"
        )
        otlp_span_exporter_class = exporter_module.OTLPSpanExporter
    except ImportError:
        logger.warning("Phoenix 导出器依赖未安装，跳过 Phoenix 集成")
        return None, None

    try:
        phoenix_endpoint = f"{config.phoenix.endpoint}/v1/traces"
        phoenix_module = importlib.import_module("observability.exporters.phoenix_exporter")
        phoenix_circuit_breaker_exporter_class = phoenix_module.PhoenixCircuitBreakerExporter

        exporter = otlp_span_exporter_class(
            endpoint=phoenix_endpoint,
            timeout=config.phoenix.export_timeout_sec,
        )
        safe_exporter = phoenix_circuit_breaker_exporter_class(
            exporter=exporter,
            endpoint=phoenix_endpoint,
            disable_after_failures=config.phoenix.disable_after_failures,
            retry_cooldown_sec=config.phoenix.retry_cooldown_sec,
        )
        return safe_exporter, phoenix_endpoint
    except Exception as e:
        logger.warning(f"Phoenix 导出器初始化失败: {e}")
        return None, None


def _setup_phoenix_exporter(tracer_provider, config) -> None:
    """设置 Phoenix 导出器"""
    phoenix_exporter, phoenix_endpoint = _try_create_phoenix_exporter(config)
    if phoenix_exporter is None or phoenix_endpoint is None:
        return

    exporter_module = importlib.import_module("opentelemetry.sdk.trace.export")
    simple_span_processor_class = exporter_module.SimpleSpanProcessor
    tracer_provider.add_span_processor(simple_span_processor_class(phoenix_exporter))
    logger.info(
        "Observability: Phoenix 导出已启用 "
        f"(failures={config.phoenix.disable_after_failures}, "
        f"cooldown={config.phoenix.retry_cooldown_sec:.0f}s) -> {phoenix_endpoint}"
    )


def _setup_agno_instrumentor() -> None:
    """设置 Agno Instrumentor"""
    try:
        agno_module = importlib.import_module("openinference.instrumentation.agno")
        agno_instrumentor_class = agno_module.AgnoInstrumentor
        agno_instrumentor_class().instrument()
        logger.info("Observability: Agno Instrumentor 已启用")
    except ImportError:
        logger.warning("AgnoInstrumentor 未安装，跳过自动 instrument")
    except Exception as e:
        logger.warning(f"AgnoInstrumentor 初始化失败: {e}")


def _setup_openai_instrumentor() -> None:
    """设置 OpenAI Instrumentor

    用于追踪 Tool 内部的 LLM 调用，如 breakdown_task 中的 stream_chat。
    这样可以在 Phoenix 中看到：
    - Tool 调用的总耗时
    - 内部 LLM 调用的详细信息（模型、token、延迟等）
    """
    try:
        openai_module = importlib.import_module("openinference.instrumentation.openai")
        openai_instrumentor_class = openai_module.OpenAIInstrumentor
        openai_instrumentor_class().instrument()
        logger.info("Observability: OpenAI Instrumentor 已启用")
    except ImportError:
        logger.warning("OpenAIInstrumentor 未安装，跳过 OpenAI 自动 instrument")
    except Exception as e:
        logger.warning(f"OpenAIInstrumentor 初始化失败: {e}")


def setup_observability() -> bool:
    """初始化观测系统

    根据配置设置 OpenTelemetry tracing，支持：
    - local: 本地 JSON 文件导出
    - phoenix: Phoenix UI 导出
    - both: 同时启用两者

    Returns:
        bool: 是否成功初始化
    """
    with _init_lock:
        if _initialized.is_set():
            return True

        config = get_observability_config()
        if not config.enabled:
            logger.debug("Observability 已禁用")
            return False

        # 抑制 OTel context 警告（在异步环境中是正常的）
        _suppress_otel_context_warnings()

        try:
            trace_api = importlib.import_module("opentelemetry.trace")
            trace_sdk = importlib.import_module("opentelemetry.sdk.trace")
            exporter_module = importlib.import_module("opentelemetry.sdk.trace.export")
            batch_span_processor_class = exporter_module.BatchSpanProcessor

            local_exporter_module = importlib.import_module("observability.exporters.file_exporter")
            local_file_exporter_class = local_exporter_module.LocalFileExporter

            tracer_provider = trace_sdk.TracerProvider()

            # 本地文件导出
            if config.mode in ("local", "both"):
                file_exporter = local_file_exporter_class(
                    traces_dir=config.local.traces_dir,
                    max_files=config.local.max_files,
                    pretty_print=config.local.pretty_print,
                    summary_only=config.terminal.summary_only,
                )
                tracer_provider.add_span_processor(batch_span_processor_class(file_exporter))
                logger.info(f"Observability: 本地文件导出已启用 -> {config.local.traces_dir}")

            # Phoenix 导出
            if config.mode in ("phoenix", "both"):
                _setup_phoenix_exporter(tracer_provider, config)

            trace_api.set_tracer_provider(tracer_provider)
            _setup_agno_instrumentor()
            _setup_openai_instrumentor()  # 追踪 Tool 内部的 LLM 调用

            _initialized.set()
            logger.info(f"Observability 初始化成功，模式: {config.mode}")
            return True

        except ImportError as e:
            logger.warning(f"Observability 依赖未安装: {e}")
            return False
        except Exception as e:
            logger.error(f"Observability 初始化失败: {e}")
            return False


def is_observability_enabled() -> bool:
    """检查观测系统是否已启用

    Returns:
        bool: 是否已启用
    """
    return _initialized.is_set()
