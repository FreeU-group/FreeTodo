"""OCR-based todo extraction helper module.

This module handles todo extraction from OCR text content, including
caching, rate limiting, and deduplication logic.
"""

import hashlib
import json
import re
import time
import unicodedata
from datetime import datetime, timedelta, timezone
from typing import Any

from llm.llm_client import LLMClient
from storage import ocr_mgr, todo_mgr
from util.logging_config import get_logger
from util.prompt_loader import get_prompt
from util.time_utils import get_utc_now

logger = get_logger()


def _normalize_title(title: str) -> str:
    """对待办标题进行标准化处理，用于去重比较。

    - NFKC 标准化（全角→半角、兼容字符统一）
    - 转小写
    - 去除所有空白和常见标点
    """
    normalized = unicodedata.normalize("NFKC", title)
    normalized = normalized.lower()
    # 去除空白和常见中英文标点
    normalized = re.sub(
        r"""[\s\u3000.,;:!?，。；：！？、·\-_"'""''()（）【】{}\[\]]""", "", normalized
    )
    return normalized


def _is_similar_title(title_a: str, title_b: str) -> bool:
    """判断两个标题是否语义相似（基于包含关系）。

    在标准化后，如果一个标题是另一个标题的子串，则认为相似。
    """
    na = _normalize_title(title_a)
    nb = _normalize_title(title_b)
    if not na or not nb:
        return False
    return na == nb or na in nb or nb in na


def _compute_text_hash(text_content: str) -> str | None:
    """对 OCR 文本进行标准化并计算哈希，用于判断是否重复。

    必须与 OCRManager 中的逻辑保持一致。
    """
    normalized = " ".join((text_content or "").strip().split())
    if not normalized:
        return None
    return hashlib.md5(normalized.encode("utf-8"), usedforsecurity=False).hexdigest()


class OCRTodoExtractor:
    """OCR-based todo extraction helper class."""

    def __init__(self, llm_client: LLMClient):
        """Initialize the extractor with an LLM client."""
        self.llm_client = llm_client
        # 基于 OCR 文本的 LLM 调用缓存与频率控制
        # key: text_hash, value: {"timestamp": float, "todos_raw": list[dict[str, Any]]}
        self._ocr_text_cache: dict[str, dict[str, Any]] = {}
        # 同一 text_hash 的最小 LLM 调用间隔（秒），用于限流
        self._ocr_text_min_interval_sec: float = 3.0
        # 纯内存缓存的有效期（秒），过期后即便有缓存仍会重新调用 LLM
        self._ocr_text_cache_ttl_sec: float = 3600.0
        # 记录每个 text_hash 上一次真实调用 LLM 的时间戳
        self._ocr_text_last_llm_call: dict[str, float] = {}

    def extract_todos(  # noqa: PLR0911, PLR0912, PLR0915, C901
        self,
        ocr_result_id: int,
        text_content: str,
        app_name: str,
        window_title: str,
    ) -> dict[str, Any]:
        """基于主动 OCR 的纯文本进行待办提取。

        - 如果相同文本已经处理过，则跳过 LLM 调用。
        - 始终在提示词中包含当前活跃 Todo 列表，但不对 LLM 输出做额外去重。
        """
        try:
            if not self.llm_client.is_available():
                logger.warning("LLM客户端不可用，跳过基于OCR文本的待办提取")
                return {
                    "ocr_result_id": ocr_result_id,
                    "todos": [],
                    "skipped": True,
                    "reason": "llm_unavailable",
                }

            text_hash = _compute_text_hash(text_content)
            if not text_hash:
                logger.info("OCR 文本为空或无有效内容，跳过待办提取")
                return {
                    "ocr_result_id": ocr_result_id,
                    "todos": [],
                    "skipped": True,
                    "reason": "empty_text",
                }

            # 如果相同 text_hash 已存在于其他 OCR 结果中，则认为已处理过，跳过 LLM 调用
            existing = ocr_mgr.get_by_text_hash(text_hash)
            if existing and existing.get("id") != ocr_result_id:
                logger.info(
                    "检测到已处理过相同 OCR 文本，跳过本次待办提取："
                    f"current_id={ocr_result_id}, existing_id={existing.get('id')}"
                )
                return {
                    "ocr_result_id": ocr_result_id,
                    "todos": [],
                    "skipped": True,
                    "reason": "text_already_processed",
                }

            # 获取当前活跃 Todo 列表，用于提示词
            existing_todos = todo_mgr.get_active_todos_for_prompt(limit=100)
            existing_todos_json = json.dumps(existing_todos, ensure_ascii=False)

            current_time = get_utc_now().strftime("%Y-%m-%d %H:%M:%S")
            system_prompt = get_prompt("auto_todo_detection", "system_assistant")
            user_prompt = get_prompt(
                "auto_todo_detection",
                "user_prompt",
                existing_todos_json=existing_todos_json,
                current_time=current_time,
            )

            # 将 OCR 文本附加在用户提示词后面
            user_content = (
                f"{user_prompt}\n\n"
                f"当前应用：{app_name}\n"
                f"窗口标题：{window_title}\n"
                f"OCR 文本：\n{text_content}"
            )

            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ]

            # 频率控制与缓存：尽量减少对同一 text_hash 的重复 LLM 调用
            now_ts = time.time()
            cached_entry = self._ocr_text_cache.get(text_hash)
            todos: list[dict[str, Any]]

            # 如果有有效缓存且未过期，直接复用缓存结果，避免再次调用 LLM
            if (
                cached_entry
                and now_ts - cached_entry.get("timestamp", 0.0) <= self._ocr_text_cache_ttl_sec
            ):
                logger.info(
                    "基于 OCR 文本待办提取命中缓存，跳过 LLM 调用 "
                    f"(ocr_result_id={ocr_result_id}, text_hash={text_hash})"
                )
                todos = cached_entry.get("todos_raw") or []
            else:
                # 如果距离上次真实 LLM 调用的时间间隔过短，则进行限流
                last_call_ts = self._ocr_text_last_llm_call.get(text_hash)
                if (
                    last_call_ts is not None
                    and now_ts - last_call_ts < self._ocr_text_min_interval_sec
                ):
                    logger.info(
                        "距离上次基于相同 OCR 文本的 LLM 调用时间过短，跳过本次调用 "
                        f"(ocr_result_id={ocr_result_id}, text_hash={text_hash})"
                    )
                    # 如果存在旧缓存则复用，否则直接跳过（返回空结果）
                    if cached_entry and cached_entry.get("todos_raw"):
                        todos = cached_entry.get("todos_raw") or []
                    else:
                        return {
                            "ocr_result_id": ocr_result_id,
                            "todos": [],
                            "skipped": True,
                            "reason": "too_frequent",
                            "created_count": 0,
                            "created_todos": [],
                        }
                else:
                    logger.info("开始基于 OCR 文本调用 LLM 进行待办提取")
                    response_text = self.llm_client.chat(
                        messages=messages,
                        temperature=0.3,
                        max_tokens=1500,
                        log_meta={
                            "endpoint": "ocr_todo_extraction",
                            "feature_type": "ocr_todo_extraction",
                            "user_query": "",
                            "response_type": "todo_extraction",
                        },
                    )
                    # 记录本次真实 LLM 调用时间
                    self._ocr_text_last_llm_call[text_hash] = now_ts

                    # 仅做 JSON 解析，并在本地进行去重（基于标题+时间），避免重复创建相同待办
                    try:
                        json_match = re.search(r"\{.*\}", response_text, re.DOTALL)
                        if not json_match:
                            logger.warning("基于 OCR 文本的 LLM 响应中未找到 JSON，返回空结果")
                            return {
                                "ocr_result_id": ocr_result_id,
                                "todos": [],
                                "skipped": False,
                                "error_message": "no_json_in_response",
                                "created_count": 0,
                                "created_todos": [],
                            }

                        json_str = json_match.group(0)
                        data = json.loads(json_str)
                        todos = data.get("new_todos") or data.get("todos") or []

                        if not isinstance(todos, list):
                            logger.warning("LLM 返回的 todos 字段不是列表，返回空结果")
                            todos = []

                        # 将本次解析结果写入内存缓存
                        self._ocr_text_cache[text_hash] = {
                            "timestamp": now_ts,
                            "todos_raw": todos,
                        }
                    except Exception as e:
                        logger.error(
                            f"解析基于 OCR 文本的 LLM 响应失败: {e}\n原始响应: {response_text[:200]}"
                        )
                        return {
                            "ocr_result_id": ocr_result_id,
                            "todos": [],
                            "skipped": False,
                            "error_message": "parse_error",
                            "created_count": 0,
                            "created_todos": [],
                        }

            # 从这里开始，todos 已经就绪（来自缓存或本次 LLM 调用结果）
            # 后续统一执行本地去重与 draft 待办创建逻辑
            try:
                # 构建去重集合：
                # 1. dedupe_exact: (标准化标题, 时间) 精确去重
                # 2. dedupe_names: 存储所有已有待办的原始名称，用于模糊匹配
                # 3. dedupe_sources: 已有待办的来源文本集合，用于来源去重
                dedupe_exact: set[tuple[str, str | None]] = set()
                dedupe_names: list[str] = []
                dedupe_sources: set[str] = set()
                try:
                    existing_todos_full = todo_mgr.list_todos(limit=1000, offset=0, status=None)
                    logger.info(
                        f"本地去重：从数据库加载了 {len(existing_todos_full)} 条待办用于去重"
                    )
                    for t in existing_todos_full:
                        name = (t.get("name") or "").strip()
                        if not name:
                            continue
                        schedule_time = t.get("start_time") or t.get("deadline")
                        time_key = (
                            schedule_time.isoformat()
                            if isinstance(schedule_time, datetime)
                            else None
                        )
                        # 使用标准化后的标题作为去重键
                        normalized_name = _normalize_title(name)
                        dedupe_exact.add((normalized_name, time_key))
                        dedupe_names.append(name)

                        # 从 user_notes 中提取来源文本，用于来源去重
                        user_notes_raw = (t.get("user_notes") or "").strip()
                        if user_notes_raw.startswith("来源文本: "):
                            src = _normalize_title(user_notes_raw[len("来源文本: ") :])
                            if src:
                                dedupe_sources.add(src)
                except Exception as e:
                    logger.warning(f"构建去重集合失败，将跳过本地去重逻辑: {e}")

                # 基于 LLM 返回的 todos 创建 draft 状态的待办
                created_todos: list[dict[str, Any]] = []
                created_count = 0

                for todo_data in todos:
                    try:
                        title = (todo_data.get("title") or "").strip()
                        if not title:
                            logger.warning("跳过标题为空的待办（OCR 文本提取）")
                            continue

                        # 直接解析 LLM 返回的 ISO 时间字符串
                        # LLM 输出的时间默认视为北京时间（UTC+8）
                        _beijing_tz = timezone(timedelta(hours=8))
                        scheduled_time = None
                        raw_scheduled = todo_data.get("scheduled_time")
                        if raw_scheduled and isinstance(raw_scheduled, str):
                            try:
                                scheduled_time = datetime.fromisoformat(raw_scheduled)
                                # 如果是 naive datetime（无时区），视为北京时间
                                if scheduled_time.tzinfo is None:
                                    scheduled_time = scheduled_time.replace(tzinfo=_beijing_tz)
                            except (ValueError, TypeError) as e:
                                logger.warning(f"解析 scheduled_time 失败: {raw_scheduled!r}, {e}")

                        # 提取来源文本（去重和创建待办都需要）
                        source_text = (todo_data.get("source_text") or "").strip()

                        # 使用多层去重策略，避免重复创建同一待办
                        try:
                            time_key = (
                                scheduled_time.isoformat()
                                if isinstance(scheduled_time, datetime)
                                else None
                            )
                            normalized_title = _normalize_title(title)

                            # 层1：精确去重（标准化标题 + 时间）
                            exact_key = (normalized_title, time_key)
                            if exact_key in dedupe_exact:
                                logger.info(
                                    "去重命中(精确匹配)，跳过创建："
                                    f"title={title!r}, scheduled_time={time_key!r}"
                                )
                                continue

                            # 层2：仅标题标准化去重（忽略时间差异）
                            title_only_match = any(k[0] == normalized_title for k in dedupe_exact)
                            if title_only_match:
                                logger.info(
                                    "去重命中(标题匹配，忽略时间)，跳过创建："
                                    f"title={title!r}, scheduled_time={time_key!r}"
                                )
                                continue

                            # 层3：模糊去重（标题包含关系）
                            similar_match = any(
                                _is_similar_title(title, existing_name)
                                for existing_name in dedupe_names
                            )
                            if similar_match:
                                logger.info(f"去重命中(模糊匹配)，跳过创建：title={title!r}")
                                continue

                            # 层4：来源文本去重（相同 source_text 说明来自同一段对话/文档）
                            if source_text:
                                normalized_source = _normalize_title(source_text)
                                if normalized_source and normalized_source in dedupe_sources:
                                    logger.info(
                                        f"去重命中(来源文本匹配)，跳过创建：title={title!r}, "
                                        f"source_text={source_text!r}"
                                    )
                                    continue

                            # 将当前 key 加入去重集合，避免本批次内重复
                            dedupe_exact.add(exact_key)
                            dedupe_names.append(title)
                            if source_text:
                                dedupe_sources.add(_normalize_title(source_text))
                        except Exception as e:
                            logger.warning(f"本地去重检查失败，仍然尝试创建待办: {e}")

                        user_notes = f"来源文本: {source_text}" if source_text else None

                        todo_id = todo_mgr.create_todo(
                            name=title,
                            description=None,
                            user_notes=user_notes,
                            start_time=scheduled_time,
                            status="draft",
                            priority="none",
                            tags=["自动提取"],
                        )

                        if todo_id:
                            created_count += 1
                            created_todos.append(
                                {
                                    "id": todo_id,
                                    "name": title,
                                    "scheduled_time": scheduled_time.isoformat()
                                    if scheduled_time
                                    else None,
                                }
                            )
                            logger.info(
                                f"基于 OCR 文本创建 draft 待办: {todo_id} - {title} (ocr_result_id={ocr_result_id})"
                            )
                        else:
                            logger.warning(
                                f"基于 OCR 文本创建待办失败（create_todo 返回 None）: {title}"
                            )
                    except Exception as e:
                        logger.error(
                            f"处理 OCR 文本待办数据失败: {e}, 数据: {todo_data}",
                            exc_info=True,
                        )
                        continue

                return {
                    "ocr_result_id": ocr_result_id,
                    "todos": todos,
                    "skipped": False,
                    "created_count": created_count,
                    "created_todos": created_todos,
                }
            except Exception as e:
                logger.error(f"处理 OCR 文本待办创建逻辑失败: {e}", exc_info=True)
                return {
                    "ocr_result_id": ocr_result_id,
                    "todos": [],
                    "skipped": False,
                    "error_message": "parse_error",
                    "created_count": 0,
                    "created_todos": [],
                }

        except Exception as e:
            logger.error(f"基于 OCR 文本的待办提取失败: {e}", exc_info=True)
            return {
                "ocr_result_id": ocr_result_id,
                "todos": [],
                "skipped": False,
                "error_message": str(e),
            }
