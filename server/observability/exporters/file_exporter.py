"""本地文件导出器

将 OpenTelemetry spans 转换为可读的 JSON 格式并写入本地文件。
设计目标：
- Cursor 友好：结构化 JSON，便于 AI 分析
- 人类可读：格式化输出，清晰的字段命名
- 日志精简：Terminal 只输出一行摘要
- 按会话聚合：同一 session 的所有 trace 保存在同一个文件中
"""

from __future__ import annotations

import contextlib
import importlib
import json
import os
import threading
from collections import defaultdict
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from opentelemetry.sdk.trace.export import SpanExporter, SpanExportResult

from util.base_paths import get_user_data_dir
from util.logging_config import get_logger

if TYPE_CHECKING:
    from collections.abc import Sequence
    from pathlib import Path

    from opentelemetry.sdk.trace import ReadableSpan

logger = get_logger()


def _get_current_session_id() -> str | None:
    """获取当前 session_id（从 ContextVar 读取）"""
    try:
        agno_module = importlib.import_module("llm.agno_agent")
        return agno_module.current_session_id.get()
    except Exception:
        return None


# OpenInference 语义约定中的常用属性
OPENINFERENCE_SPAN_KIND = "openinference.span.kind"
OPENINFERENCE_INPUT_VALUE = "input.value"
OPENINFERENCE_OUTPUT_VALUE = "output.value"
OPENINFERENCE_LLM_MODEL_NAME = "llm.model_name"
OPENINFERENCE_LLM_INPUT_MESSAGES = "llm.input_messages"
OPENINFERENCE_LLM_OUTPUT_MESSAGES = "llm.output_messages"
OPENINFERENCE_LLM_TOKEN_COUNT_PROMPT = "llm.token_count.prompt"  # nosec B105
OPENINFERENCE_LLM_TOKEN_COUNT_COMPLETION = "llm.token_count.completion"  # nosec B105
OPENINFERENCE_TOOL_NAME = "tool.name"
OPENINFERENCE_TOOL_PARAMETERS = "tool.parameters"


def _coerce_int(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


class LocalFileExporter(SpanExporter):
    """本地 JSON 文件导出器

    将 traces 写入本地 JSON 文件，支持：
    - 按 session_id 聚合：同一会话的所有 trace 保存在同一个文件中
    - 按 trace_id 聚合 spans（当无 session_id 时）
    - 格式化输出便于阅读
    - Terminal 摘要输出
    - 自动清理旧文件
    """

    def __init__(
        self,
        traces_dir: str = "traces/",
        max_files: int = 100,
        pretty_print: bool = True,
        summary_only: bool = True,
    ):
        """初始化导出器

        Args:
            traces_dir: trace 文件存储目录（相对于 base_dir）
            max_files: 最大保留文件数
            pretty_print: 是否格式化 JSON 输出
            summary_only: Terminal 是否只输出摘要
        """
        self.traces_dir = traces_dir
        self.max_files = max_files
        self.pretty_print = pretty_print
        self.summary_only = summary_only
        self._lock = threading.Lock()

        # 用于聚合同一 trace 的 spans
        self._pending_traces: dict[str, list[ReadableSpan]] = defaultdict(list)

        # session_id -> 文件路径的映射（内存缓存）
        self._session_files: dict[str, Path] = {}

    def _get_traces_path(self) -> Path:
        """获取 traces 目录路径"""
        traces_path = get_user_data_dir() / self.traces_dir
        traces_path.mkdir(parents=True, exist_ok=True)
        return traces_path

    def _get_session_file_path(self, session_id: str) -> Path:
        """获取 session 文件路径

        如果已有该 session 的文件，返回现有路径；否则创建新路径。
        文件名格式：session_{session_id}_{创建时间}.json
        """
        # 检查内存缓存
        if session_id in self._session_files:
            return self._session_files[session_id]

        traces_path = self._get_traces_path()

        # 查找已有的 session 文件
        existing_files = list(traces_path.glob(f"session_{session_id}_*.json"))
        if existing_files:
            # 使用最新的文件
            filepath = max(existing_files, key=lambda f: f.stat().st_mtime)
            self._session_files[session_id] = filepath
            return filepath

        # 创建新文件路径
        timestamp = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
        filename = f"session_{session_id}_{timestamp}.json"
        filepath = traces_path / filename
        self._session_files[session_id] = filepath
        return filepath

    def _load_session_data(self, filepath: Path) -> dict[str, Any]:
        """加载已有的 session 数据"""
        if not filepath.exists():
            return {}
        try:
            with open(filepath, encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError) as e:
            logger.warning(f"加载 session 文件失败: {e}")
            return {}

    def _save_session_data(self, filepath: Path, data: dict[str, Any]) -> bool:
        """保存 session 数据"""
        try:
            with open(filepath, "w", encoding="utf-8") as f:
                if self.pretty_print:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                else:
                    json.dump(data, f, ensure_ascii=False)
            return True
        except OSError as e:
            logger.error(f"保存 session 文件失败: {e}")
            return False

    def _extract_span_kind(self, span: ReadableSpan) -> str:
        """提取 span 类型"""
        attrs = dict(span.attributes or {})
        return str(attrs.get(OPENINFERENCE_SPAN_KIND, span.name))

    def _extract_tool_call(self, span: ReadableSpan) -> dict[str, Any] | None:
        """从 span 提取工具调用信息"""
        attrs = dict(span.attributes or {})
        span_kind = attrs.get(OPENINFERENCE_SPAN_KIND, "")

        if span_kind != "TOOL" and "tool" not in span.name.lower():
            return None

        tool_name = attrs.get(OPENINFERENCE_TOOL_NAME, span.name)
        tool_params = attrs.get(OPENINFERENCE_TOOL_PARAMETERS, "{}")

        # 尝试解析参数
        try:
            args = json.loads(tool_params) if isinstance(tool_params, str) else tool_params
        except (json.JSONDecodeError, TypeError):
            args = {"raw": str(tool_params)}

        # 获取结果
        output = attrs.get(OPENINFERENCE_OUTPUT_VALUE, "")
        result_preview = str(output)[:200] if output else ""

        # 计算持续时间
        duration_ms = 0
        if span.start_time and span.end_time:
            duration_ms = (span.end_time - span.start_time) / 1_000_000  # ns -> ms

        return {
            "name": str(tool_name),
            "args": args,
            "result_preview": result_preview,
            "duration_ms": round(duration_ms, 2),
        }

    def _extract_llm_call(self, span: ReadableSpan) -> dict[str, Any] | None:
        """从 span 提取 LLM 调用信息"""
        attrs = dict(span.attributes or {})
        span_kind = attrs.get(OPENINFERENCE_SPAN_KIND, "")

        if span_kind != "LLM" and "llm" not in span.name.lower():
            return None

        model = attrs.get(OPENINFERENCE_LLM_MODEL_NAME, "unknown")
        input_tokens = _coerce_int(attrs.get(OPENINFERENCE_LLM_TOKEN_COUNT_PROMPT, 0))
        output_tokens = _coerce_int(attrs.get(OPENINFERENCE_LLM_TOKEN_COUNT_COMPLETION, 0))

        # 计算持续时间
        duration_ms = 0
        if span.start_time and span.end_time:
            duration_ms = (span.end_time - span.start_time) / 1_000_000

        return {
            "model": str(model),
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "duration_ms": round(duration_ms, 2),
        }

    def _aggregate_spans(self, spans: Sequence[ReadableSpan]) -> dict[str, Any]:
        """将 spans 聚合为结构化的 trace 数据

        Args:
            spans: OpenTelemetry spans 列表

        Returns:
            聚合后的 trace 数据字典
        """
        if not spans:
            return {}

        # 获取基本信息
        first_span = spans[0]
        trace_id = format(first_span.context.trace_id, "032x") if first_span.context else "unknown"

        # 找到根 span（通常是 agent 运行）
        root_span = None
        for span in spans:
            if span.parent is None:
                root_span = span
                break
        if root_span is None:
            root_span = first_span

        # 提取输入输出
        root_attrs = dict(root_span.attributes or {})
        input_value = root_attrs.get(OPENINFERENCE_INPUT_VALUE, "")
        output_value = root_attrs.get(OPENINFERENCE_OUTPUT_VALUE, "")

        # 计算总持续时间
        start_time = min(s.start_time for s in spans if s.start_time)
        end_time = max(s.end_time for s in spans if s.end_time)
        total_duration_ms = (end_time - start_time) / 1_000_000 if start_time and end_time else 0

        # 提取工具调用和 LLM 调用
        tool_calls = []
        llm_calls = []
        for span in spans:
            tool_call = self._extract_tool_call(span)
            if tool_call:
                tool_calls.append(tool_call)

            llm_call = self._extract_llm_call(span)
            if llm_call:
                llm_calls.append(llm_call)

        # 确定状态
        status = "success"
        for span in spans:
            if span.status and span.status.is_ok is False:
                status = "error"
                break

        # 生成时间戳
        timestamp = datetime.now(UTC).isoformat()

        return {
            "trace_id": trace_id[:12],  # 使用短 ID
            "timestamp": timestamp,
            "duration_ms": round(total_duration_ms, 2),
            "agent": root_span.name,
            "input": str(input_value)[:500] if input_value else "",
            "output_preview": str(output_value)[:500] if output_value else "",
            "tool_calls": tool_calls,
            "llm_calls": llm_calls,
            "status": status,
            "span_count": len(spans),
        }

    def _write_to_file(
        self, trace_data: dict[str, Any], session_id: str | None = None
    ) -> str | None:
        """将 trace 数据写入 JSON 文件

        Args:
            trace_data: 聚合后的 trace 数据
            session_id: 会话 ID，如果提供则追加到 session 文件

        Returns:
            写入的文件路径，失败返回 None
        """
        if not trace_data:
            return None

        # 如果有 session_id，追加到 session 文件
        if session_id:
            return self._write_to_session_file(trace_data, session_id)

        # 否则，每个 trace 一个文件（原有行为）
        traces_path = self._get_traces_path()
        trace_id = trace_data.get("trace_id", "unknown")
        timestamp = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
        filename = f"{timestamp}_{trace_id}.json"
        filepath = traces_path / filename

        try:
            with open(filepath, "w", encoding="utf-8") as f:
                if self.pretty_print:
                    json.dump(trace_data, f, ensure_ascii=False, indent=2)
                else:
                    json.dump(trace_data, f, ensure_ascii=False)

            # 清理旧文件
            self._cleanup_old_files(traces_path)

            return str(filepath)
        except Exception as e:
            logger.error(f"写入 trace 文件失败: {e}")
            return None

    def _write_to_session_file(self, trace_data: dict[str, Any], session_id: str) -> str | None:
        """将 trace 数据追加到 session 文件

        Session 文件格式：
        {
            "session_id": "xxx",
            "created_at": "2026-01-23T08:27:03Z",
            "updated_at": "2026-01-23T08:30:00Z",
            "traces": [...],
            "summary": {...}
        }
        """
        filepath = self._get_session_file_path(session_id)

        try:
            # 加载已有数据或创建新结构
            session_data = self._load_session_data(filepath)
            if not session_data:
                session_data = {
                    "session_id": session_id,
                    "created_at": datetime.now(UTC).isoformat(),
                    "traces": [],
                    "summary": {
                        "total_duration_ms": 0,
                        "tool_count": 0,
                        "llm_count": 0,
                        "trace_count": 0,
                        "status": "success",
                    },
                }

            # 追加 trace
            session_data["traces"].append(trace_data)
            session_data["updated_at"] = datetime.now(UTC).isoformat()

            # 更新摘要
            summary = session_data["summary"]
            summary["total_duration_ms"] += trace_data.get("duration_ms", 0)
            summary["tool_count"] += len(trace_data.get("tool_calls", []))
            summary["llm_count"] += len(trace_data.get("llm_calls", []))
            summary["trace_count"] = len(session_data["traces"])
            if trace_data.get("status") == "error":
                summary["status"] = "error"

            # 保存
            if self._save_session_data(filepath, session_data):
                # 清理旧文件
                self._cleanup_old_files(self._get_traces_path())
                return str(filepath)
            return None
        except Exception as e:
            logger.error(f"写入 session 文件失败: {e}")
            return None

    def _cleanup_old_files(self, traces_path: Path) -> None:
        """清理超出限制的旧文件

        Args:
            traces_path: traces 目录路径
        """
        try:
            json_files = sorted(
                traces_path.glob("*.json"),
                key=lambda f: f.stat().st_mtime,
                reverse=True,
            )

            if len(json_files) > self.max_files:
                for old_file in json_files[self.max_files :]:
                    with contextlib.suppress(OSError):
                        old_file.unlink()
        except Exception as e:
            logger.debug(f"清理旧文件失败: {e}")

    def _print_summary(
        self,
        trace_data: dict[str, Any],
        filepath: str | None,
        session_id: str | None = None,
    ) -> None:
        """输出 Terminal 摘要

        Args:
            trace_data: trace 数据
            filepath: 文件路径
            session_id: 会话 ID
        """
        if not trace_data:
            return

        trace_id = trace_data.get("trace_id", "unknown")
        tool_count = len(trace_data.get("tool_calls", []))
        llm_count = len(trace_data.get("llm_calls", []))
        duration_ms = trace_data.get("duration_ms", 0)
        duration_s = duration_ms / 1000

        # 获取相对路径用于显示
        if filepath:
            try:
                rel_path = os.path.relpath(filepath, get_user_data_dir())
            except Exception:
                rel_path = filepath
        else:
            rel_path = "N/A"

        # 构建摘要信息
        parts = [f"[Trace] {trace_id}"]
        if session_id:
            parts.append(f"session:{session_id[:8]}")
        parts.append(f"{tool_count} tools")
        if llm_count > 0:
            parts.append(f"{llm_count} llm")
        parts.append(f"{duration_s:.2f}s")
        parts.append(rel_path)

        if self.summary_only:
            # 精简输出：一行摘要
            logger.info(" | ".join(parts))
        else:
            # 详细输出
            logger.info(f"[Trace] {trace_id}")
            if session_id:
                logger.info(f"  Session: {session_id}")
            logger.info(f"  Duration: {duration_s:.2f}s")
            logger.info(f"  Tools: {tool_count}")
            logger.info(f"  LLM calls: {llm_count}")
            logger.info(f"  File: {rel_path}")
            for tool in trace_data.get("tool_calls", []):
                logger.info(f"    - {tool['name']}: {tool.get('duration_ms', 0):.0f}ms")
            for llm in trace_data.get("llm_calls", []):
                logger.info(
                    f"    - LLM({llm.get('model', 'unknown')}): {llm.get('duration_ms', 0):.0f}ms"
                )

    def export(self, spans: Sequence[ReadableSpan]) -> SpanExportResult:
        """导出 spans

        Args:
            spans: 要导出的 spans

        Returns:
            导出结果
        """
        if not spans:
            return SpanExportResult.SUCCESS

        # 获取当前 session_id（在处理 spans 时获取，因为 ContextVar 可能在之后被重置）
        session_id = _get_current_session_id()

        with self._lock:
            try:
                # 按 trace_id 分组
                traces: dict[str, list[ReadableSpan]] = defaultdict(list)
                for span in spans:
                    if span.context:
                        trace_id = format(span.context.trace_id, "032x")
                        traces[trace_id].append(span)

                # 处理每个 trace
                for trace_id, trace_spans in traces.items():
                    # 检查是否有根 span（表示 trace 完成）
                    has_root = any(s.parent is None for s in trace_spans)

                    if has_root:
                        # 合并之前缓存的 spans
                        all_spans = self._pending_traces.pop(trace_id, []) + trace_spans

                        # 聚合并写入
                        trace_data = self._aggregate_spans(all_spans)
                        if trace_data:
                            filepath = self._write_to_file(trace_data, session_id)
                            self._print_summary(trace_data, filepath, session_id)
                    else:
                        # 缓存非根 spans，等待完整 trace
                        self._pending_traces[trace_id].extend(trace_spans)

                return SpanExportResult.SUCCESS
            except Exception as e:
                logger.error(f"导出 spans 失败: {e}")
                return SpanExportResult.FAILURE

    def shutdown(self) -> None:
        """关闭导出器，处理剩余的 spans"""
        with self._lock:
            # 导出所有缓存的 traces（shutdown 时无法获取 session_id，使用独立文件）
            for _trace_id, spans in self._pending_traces.items():
                if spans:
                    trace_data = self._aggregate_spans(spans)
                    if trace_data:
                        filepath = self._write_to_file(trace_data, session_id=None)
                        self._print_summary(trace_data, filepath, session_id=None)
            self._pending_traces.clear()
            self._session_files.clear()

    def force_flush(self, timeout_millis: int = 30000) -> bool:
        """强制刷新

        Args:
            timeout_millis: 超时时间（毫秒）

        Returns:
            是否成功
        """
        # 对于文件导出器，export 已经是同步的，不需要特殊处理
        _ = timeout_millis
        return True
