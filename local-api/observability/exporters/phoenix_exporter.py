"""Phoenix 导出器包装器

为 OTLPSpanExporter 增加失败抑制与自动恢复逻辑，避免 Phoenix 未启动时刷屏报错。
"""

from __future__ import annotations

import socket
import threading
import time
from typing import TYPE_CHECKING
from urllib.parse import urlparse

from opentelemetry.sdk.trace.export import SpanExporter, SpanExportResult

from util.logging_config import get_logger

if TYPE_CHECKING:
    from collections.abc import Sequence

    from opentelemetry.sdk.trace import ReadableSpan

logger = get_logger()


class PhoenixCircuitBreakerExporter(SpanExporter):
    """Phoenix 导出器包装器（熔断 + 自动恢复）"""

    def __init__(
        self,
        exporter: SpanExporter,
        endpoint: str,
        disable_after_failures: int = 1,
        retry_cooldown_sec: float = 60.0,
    ) -> None:
        self._exporter = exporter
        self._endpoint = endpoint
        self._disable_after_failures = int(disable_after_failures)
        self._retry_cooldown_sec = float(retry_cooldown_sec)
        self._lock = threading.Lock()
        self._consecutive_failures = 0
        self._disabled_until = 0.0
        self._disabled = False
        self._has_logged_first_failure = False

    def _should_skip_export(self) -> bool:
        now = time.monotonic()
        with self._lock:
            if not self._disabled:
                return False

            # 禁用且不重试
            if self._retry_cooldown_sec <= 0:
                return True

            # Phoenix 已启动时立即恢复（不等冷却期）
            if self._endpoint_is_reachable():
                self._disabled = False
                self._consecutive_failures = 0
                self._has_logged_first_failure = False
                self._disabled_until = 0.0
                logger.info(f"Observability: Phoenix 导出已恢复 -> {self._endpoint}")
                return False

            # 仍在冷却期
            if now < self._disabled_until:
                return True

            # 冷却期结束，尝试恢复
            self._disabled = False
            self._consecutive_failures = 0
            self._has_logged_first_failure = False
            logger.info(f"Observability: Phoenix 导出尝试恢复 -> {self._endpoint}")
            return False

    def _handle_success(self) -> None:
        with self._lock:
            if self._consecutive_failures > 0 or self._disabled:
                logger.info(f"Observability: Phoenix 导出已恢复 -> {self._endpoint}")
            self._consecutive_failures = 0
            self._disabled = False
            self._disabled_until = 0.0
            self._has_logged_first_failure = False

    def _handle_failure(self, error: Exception | None) -> None:
        with self._lock:
            self._consecutive_failures += 1

            if not self._has_logged_first_failure:
                msg = f"Observability: Phoenix 导出失败 -> {self._endpoint}"
                if error is not None:
                    msg = f"{msg} ({error})"
                logger.warning(msg)
                self._has_logged_first_failure = True

            if self._disable_after_failures <= 0:
                return

            if self._consecutive_failures >= self._disable_after_failures and not self._disabled:
                self._disabled = True
                if self._retry_cooldown_sec > 0:
                    self._disabled_until = time.monotonic() + self._retry_cooldown_sec
                    logger.warning(
                        "Observability: Phoenix 导出已暂停，"
                        f"{self._retry_cooldown_sec:.0f}s 后自动重试 -> {self._endpoint}"
                    )
                else:
                    self._disabled_until = float("inf")
                    logger.warning(
                        "Observability: Phoenix 导出已暂停，"
                        f"需手动重启或开启 Phoenix -> {self._endpoint}"
                    )

    def _endpoint_is_reachable(self) -> bool:
        try:
            parsed = urlparse(self._endpoint)
            host = parsed.hostname
            port = parsed.port
            if not host:
                return False
            if port is None:
                port = 443 if parsed.scheme == "https" else 80
            with socket.create_connection((host, port), timeout=0.3):
                return True
        except OSError:
            return False

    def export(self, spans: Sequence[ReadableSpan]) -> SpanExportResult:
        if not spans:
            return SpanExportResult.SUCCESS

        if self._should_skip_export():
            return SpanExportResult.FAILURE

        try:
            result = self._exporter.export(spans)
        except Exception as e:
            self._handle_failure(e)
            return SpanExportResult.FAILURE

        if result == SpanExportResult.SUCCESS:
            self._handle_success()
        else:
            self._handle_failure(None)
        return result

    def shutdown(self) -> None:
        try:
            self._exporter.shutdown()
        except Exception as e:
            logger.warning(f"Observability: Phoenix 导出器关闭失败: {e}")

    def force_flush(self, timeout_millis: int = 30000) -> bool:
        try:
            return self._exporter.force_flush(timeout_millis)
        except Exception:
            return False
