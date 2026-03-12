"""L4 ProfileBuilder — incremental user-profile maintenance.

Runs on a periodic schedule (default: every hour).  Collects the latest L2
event summaries since the last update, compares them against the existing
profile, and asks an LLM whether and how the profile should be updated.
The profile is stored as ``profile_L4/user_profile.md``.

Design principles:
- **Synthesize, don't append**: new information is *merged* into existing
  descriptions rather than tacked on with "新增" prefixes.
- **Stable vs dynamic**: identity / preferences change rarely; current focus
  and recent status are *replaced* each cycle.
- **Bounded size**: a hard character budget triggers automatic consolidation
  so the profile never balloons out of control.
"""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING

from util.logging_config import get_logger
from util.time_utils import get_local_now, local_today_str, local_yesterday_str

if TYPE_CHECKING:
    from datetime import datetime
    from pathlib import Path

    from llm.llm_client import LLMClient

logger = get_logger()

# ---------------------------------------------------------------------------
# Prompt constants
# ---------------------------------------------------------------------------

PROFILE_MAX_CHARS = 3000

PROFILE_SYSTEM_PROMPT = (
    "你是一个用户画像维护助手。你的目标是维护一份**简洁、精炼、高信息密度**的用户画像。\n\n"
    "核心原则：\n"
    "1. **综合归纳，而非追加**：将新信息融入已有描述，不要使用「新增」前缀，不要罗列变更历史\n"
    "2. **替换过时信息**：如果新事件更新了某个状态（如当前重点），直接用新描述替换旧描述\n"
    "3. **严格控篇幅**：每个分区最多 5-7 个要点，整体控制在 1500 字以内\n"
    "4. **区分稳定与动态**：\n"
    "   - 稳定特征（身份、偏好）：仅在有实质性变化时修改\n"
    "   - 动态特征（当前重点、近期状态）：每次更新时根据最新情况重写\n"
    "5. **保持抽象层级**：画像应反映用户的长期特征和当前阶段性概况，不要记录一次性的具体事件细节\n"
    "6. 禁止输出变更日志、状态摘要行或任何 changelog 性质的内容\n\n"
    "如果新事件太琐碎、没有揭示任何新的用户特征，直接输出：NO_UPDATE"
)

PROFILE_USER_TEMPLATE = """\
当前用户画像：
{current_profile}

---

最近发生的事件摘要（{time_range}）：
{recent_events}

---

请根据以上事件更新用户画像。要求：

1. **综合归纳**：将新信息与已有内容合并，输出一份完整但精炼的画像
2. **淘汰过时内容**：如果某条旧信息已被新事实取代，删除旧版本
3. **控制篇幅**：每个分区 5-7 个要点，总字数 ≤ 1500 字
4. **分区规范**（所有分区均使用 ## 二级标题）：
   - **身份与角色**：学术/职业身份、核心能力领域（稳定）
   - **工作模式**：作息规律、工具偏好、协作方式（较稳定）
   - **当前重点**：正在推进的 3-5 件核心事项（动态，每次重写）
   - **社交网络**：关键人际关系及其角色（较稳定）
   - **偏好与习惯**：行为偏好、思维方式（稳定）
   - **近期状态**：情绪/压力/关键节点（动态，每次重写）
5. **禁止**：不要使用"新增""更新""变更"等前缀；不要输出 `> 状态：...` 行

如果无需更新，输出 NO_UPDATE。
"""

CONSOLIDATE_SYSTEM_PROMPT = (
    "你是一个信息精炼助手。请将过长的用户画像压缩为简洁版本，"
    "保留最重要的长期特征和当前阶段性概况，删除过时细节和重复内容。"
)

CONSOLIDATE_USER_TEMPLATE = """\
以下用户画像过于冗长（{char_count} 字），请精炼至 1500 字以内。

规则：
1. 每个分区保留最重要的 5-7 个要点
2. 合并重复或高度相关的条目
3. 删除一次性事件细节（如具体时间点、物流问题）
4. 保留能体现用户长期特征的信息
5. 动态分区（当前重点、近期状态）只保留最新信息
6. 不使用"新增"前缀，不输出 changelog

当前画像：
{current_profile}

请输出精炼后的完整画像（Markdown 格式，以 `# 用户画像` 开头）。
"""

DEFAULT_PROFILE = """# 用户画像

> 最后更新：{date}

（画像将在积累足够的观察数据后自动生成）
"""


class ProfileBuilder:
    """L4: maintain ``profile_L4/user_profile.md`` via hourly incremental updates.

    Each update cycle:
    1. Reads the current profile from ``profile_L4/user_profile.md``.
    2. Collects L2 event summaries from ``events_L2/`` since the last update.
    3. Asks LLM whether the profile should change.
    4. If yes, writes the updated profile back.
    5. If the result exceeds *PROFILE_MAX_CHARS*, runs a consolidation pass.
    """

    def __init__(
        self,
        memory_dir: Path,
        llm_client: LLMClient,
        *,
        model: str | None = None,
    ):
        self._memory_dir = memory_dir
        self._profile_dir = memory_dir / "profile_L4"
        self._profile_dir.mkdir(parents=True, exist_ok=True)
        self._profile_file = self._profile_dir / "user_profile.md"
        self._events_dir = memory_dir / "events_L2"
        self._llm = llm_client
        self._model = model

        self._last_update: datetime | None = None
        self._stats = {
            "checks": 0,
            "updates": 0,
            "skipped": 0,
            "errors": 0,
            "consolidations": 0,
        }

    def get_stats(self) -> dict:
        stats: dict[str, int | str | None] = dict(self._stats)
        stats["last_update"] = self._last_update.isoformat() if self._last_update else None
        return stats

    def read_profile(self) -> str:
        """Return current profile content."""
        if self._profile_file.exists():
            return self._profile_file.read_text(encoding="utf-8")
        return ""

    # ------------------------------------------------------------------
    # Main update cycle
    # ------------------------------------------------------------------

    async def update(self) -> bool:
        """Run one update cycle.  Returns True if the profile was changed."""
        self._stats["checks"] += 1

        current_profile = self.read_profile()
        if not current_profile:
            today = local_today_str()
            current_profile = DEFAULT_PROFILE.format(date=today)
            self._profile_file.write_text(current_profile, encoding="utf-8")

        # If profile is already over budget before we even add new events,
        # consolidate first so the update prompt stays within context limits.
        if len(current_profile) > PROFILE_MAX_CHARS:
            logger.info(
                f"ProfileBuilder: profile too long ({len(current_profile)} chars), consolidating before update"
            )
            current_profile = await self._consolidate(current_profile)

        recent = self._collect_recent_events()
        if not recent.strip():
            self._stats["skipped"] += 1
            logger.debug("ProfileBuilder: no recent events, skipping update")
            return False

        time_range = self._time_range_label()

        prompt = PROFILE_USER_TEMPLATE.format(
            current_profile=current_profile,
            recent_events=recent,
            time_range=time_range,
        )
        messages: list[dict[str, str]] = [
            {"role": "system", "content": PROFILE_SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ]

        try:
            resp = await asyncio.to_thread(
                self._llm.chat,
                messages,
                0.3,
                self._model,
                2048,
                log_usage=True,
                log_meta={"endpoint": "memory_profile", "feature_type": "memory_profile"},
            )
        except Exception:
            logger.exception("ProfileBuilder LLM call failed")
            self._stats["errors"] += 1
            return False

        if not resp or "NO_UPDATE" in resp.strip().upper():
            self._stats["skipped"] += 1
            self._last_update = get_local_now()
            logger.debug("ProfileBuilder: LLM said no update needed")
            return False

        updated = self._ensure_header(resp.strip())

        # Post-update consolidation guard
        if len(updated) > PROFILE_MAX_CHARS:
            logger.info(
                f"ProfileBuilder: post-update profile too long ({len(updated)} chars), consolidating"
            )
            updated = await self._consolidate(updated)

        self._profile_file.write_text(updated, encoding="utf-8")
        self._last_update = get_local_now()
        self._stats["updates"] += 1
        logger.info(f"ProfileBuilder: profile updated ({len(updated)} chars)")
        return True

    # ------------------------------------------------------------------
    # Consolidation — shrink an over-budget profile
    # ------------------------------------------------------------------

    async def consolidate(self) -> bool:
        """Public API: force-consolidate the current profile.

        Returns True if the profile was actually rewritten.
        """
        current = self.read_profile()
        if not current:
            return False
        consolidated = await self._consolidate(current)
        if consolidated != current:
            self._profile_file.write_text(consolidated, encoding="utf-8")
            return True
        return False

    async def _consolidate(self, content: str) -> str:
        """Ask LLM to compress *content* into a leaner profile."""
        prompt = CONSOLIDATE_USER_TEMPLATE.format(
            char_count=len(content),
            current_profile=content,
        )
        messages: list[dict[str, str]] = [
            {"role": "system", "content": CONSOLIDATE_SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ]
        try:
            resp = await asyncio.to_thread(
                self._llm.chat,
                messages,
                0.2,
                self._model,
                2048,
                log_usage=True,
                log_meta={
                    "endpoint": "memory_profile_consolidate",
                    "feature_type": "memory_profile",
                },
            )
        except Exception:
            logger.exception("ProfileBuilder consolidation LLM call failed")
            self._stats["errors"] += 1
            return content  # fall back to original

        if not resp or not resp.strip():
            return content

        self._stats["consolidations"] += 1
        logger.info(f"ProfileBuilder: consolidated {len(content)} → {len(resp.strip())} chars")
        return self._ensure_header(resp.strip())

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _collect_recent_events(self) -> str:
        """Gather L2 event summaries from today's events file.

        If a last_update timestamp exists, tries to extract only events that
        appear after that time.  Falls back to returning the full day's events
        if parsing is uncertain.
        """
        today = local_today_str()
        events_file = self._events_dir / f"{today}.md"

        parts: list[str] = []
        if events_file.exists():
            parts.append(events_file.read_text(encoding="utf-8"))

        yesterday = local_yesterday_str()
        yesterday_file = self._events_dir / f"{yesterday}.md"
        if yesterday_file.exists() and self._last_update is None:
            parts.append(yesterday_file.read_text(encoding="utf-8"))

        return "\n\n---\n\n".join(parts)

    def _time_range_label(self) -> str:
        if self._last_update:
            return f"自 {self._last_update.strftime('%Y-%m-%d %H:%M')} 以来"
        return "最近（首次运行）"

    @staticmethod
    def _ensure_header(content: str) -> str:
        """Make sure the profile starts with an H1 and has an update timestamp."""
        import re  # noqa: PLC0415

        now_str = get_local_now().strftime("%Y-%m-%d %H:%M")

        if not content.startswith("# "):
            content = f"# 用户画像\n\n{content}"

        # Strip any `> 状态：...` changelog line the LLM may still produce
        content = re.sub(r"> 状态：[^\n]*\n?", "", content)

        marker = "> 最后更新："
        if marker not in content:
            lines = content.split("\n", 1)
            rest = lines[1] if len(lines) > 1 else ""
            content = f"{lines[0]}\n\n> 最后更新：{now_str}\n{rest}"
        else:
            content = re.sub(
                r"> 最后更新：.*",
                f"> 最后更新：{now_str}",
                content,
                count=1,
            )
        return content
