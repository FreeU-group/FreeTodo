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
- **Preferences are independent**: the "偏好与习惯" section is managed
  separately (e.g. from chat) and does NOT count towards the character budget.
"""

from __future__ import annotations

import asyncio
import re
from typing import TYPE_CHECKING

from util.logging_config import get_logger
from util.time_utils import get_local_now, local_today_str, local_yesterday_str

if TYPE_CHECKING:
    from datetime import datetime
    from pathlib import Path

    from llm.llm_client import LLMClient

logger = get_logger()

PREFERENCES_HEADING = "## 偏好与习惯"
_PREFERENCES_SPLIT_RE = re.compile(r"(^|\n)(## 偏好与习惯\s*\n)", re.MULTILINE)

# ---------------------------------------------------------------------------
# Prompt constants
# ---------------------------------------------------------------------------

PROFILE_MAX_CHARS = 2000

PROFILE_SYSTEM_PROMPT = (
    "你是一个用户画像维护助手。你的目标是维护一份**简洁、精炼**的用户画像。\n\n"
    "核心原则：\n"
    "1. **综合归纳，而非追加**：将新信息融入已有描述，不要使用「新增」前缀\n"
    "2. **替换过时信息**：新事件更新了某个状态时，直接用新描述替换旧描述\n"
    "3. **严格控篇幅**：每个分区 3-5 个 bullet，整体控制在 1000 字以内\n"
    "4. **全部使用 bullet point**（`- `开头），不要写长段落\n"
    "5. **维度解耦**：每个分区只关注自己的职责，不要跨分区重复信息\n"
    "6. **保持抽象层级**：画像反映长期特征和阶段性概况，不记录一次性事件细节\n"
    "7. 禁止输出变更日志、状态摘要行或任何 changelog 性质的内容\n\n"
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

1. **综合归纳**：将新信息与已有内容合并，输出完整但精炼的画像
2. **淘汰过时内容**：旧信息已被新事实取代时，删除旧版本
3. **控制篇幅**：每个分区 3-5 个 bullet，总字数 ≤ 1000 字
4. **全部使用 bullet point**（`- `开头），禁止写长段落
5. **分区规范**（所有分区均使用 ## 二级标题，共 4 个分区）：
   - **身份与角色**：身份是什么、目前在做什么领域的事，末尾附一句当前阶段状态（稳定，融合了近期状态）
   - **工作模式**：工作时间规律 + 常用工具/平台（较稳定，不要展开细节）
   - **当前重点**：正在推进的 3-5 件核心事项（动态，每次重写）
   - **社交网络**：关键人际关系及其角色（较稳定）
6. **不要**输出「偏好与习惯」分区（该分区由独立通路维护，会自动拼接）
7. **不要**有「近期状态」分区，近期状态已融入「身份与角色」末尾
8. **禁止**：不要使用"新增""更新""变更"等前缀；不要输出 `> 状态：...` 行

如果无需更新，输出 NO_UPDATE。
"""

CONSOLIDATE_SYSTEM_PROMPT = (
    "你是一个信息精炼助手。请将过长的用户画像压缩为简洁版本，"
    "保留最重要的长期特征和当前阶段性概况，删除过时细节和重复内容。"
    "全部使用 bullet point 格式。"
)

CONSOLIDATE_USER_TEMPLATE = """\
以下用户画像过于冗长（{char_count} 字），请精炼至 1000 字以内。

规则：
1. 每个分区保留 3-5 个 bullet（`- `开头），禁止长段落
2. 合并重复或高度相关的条目
3. 删除一次性事件细节（如具体时间点、物流问题）
4. 保留能体现用户长期特征的信息
5. 仅保留 4 个分区：身份与角色、工作模式、当前重点、社交网络
6. 不要输出「偏好与习惯」分区（由独立通路维护）
7. 不要有「近期状态」分区，近期状态融入「身份与角色」末尾一句
8. 不使用"新增"前缀，不输出 changelog

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

        # Strip preferences before LLM sees the profile (managed independently)
        body, saved_prefs = _split_preferences(current_profile)

        if len(body) > PROFILE_MAX_CHARS:
            logger.info(
                "ProfileBuilder: body too long (%d chars), consolidating before update",
                len(body),
            )
            body = await self._consolidate(body)

        recent = self._collect_recent_events()
        if not recent.strip():
            self._stats["skipped"] += 1
            logger.debug("ProfileBuilder: no recent events, skipping update")
            return False

        time_range = self._time_range_label()

        prompt = PROFILE_USER_TEMPLATE.format(
            current_profile=body,
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

        updated_body = self._ensure_header(resp.strip())

        if len(updated_body) > PROFILE_MAX_CHARS:
            logger.info(
                "ProfileBuilder: post-update body too long (%d chars), consolidating",
                len(updated_body),
            )
            updated_body = await self._consolidate(updated_body)

        # Re-attach preserved preferences section
        full = _merge_preferences(updated_body, saved_prefs)
        self._profile_file.write_text(full, encoding="utf-8")
        self._last_update = get_local_now()
        self._stats["updates"] += 1
        logger.info("ProfileBuilder: profile updated (%d chars body + prefs)", len(updated_body))
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
    # Preferences — managed independently from chat
    # ------------------------------------------------------------------

    def update_preferences(self, new_items: list[str]) -> bool:
        """Merge new preference bullets into the 偏好与习惯 section.

        Returns True if the profile was changed.
        """
        if not new_items:
            return False
        profile = self.read_profile()
        if not profile:
            today = local_today_str()
            profile = DEFAULT_PROFILE.format(date=today)

        body, prefs = _split_preferences(profile)
        existing = {line.strip() for line in prefs.splitlines() if line.strip().startswith("- ")}
        added = []
        for item in new_items:
            bullet = item.strip()
            if not bullet.startswith("- "):
                bullet = f"- {bullet}"
            if bullet not in existing:
                added.append(bullet)
                existing.add(bullet)
        if not added:
            return False

        new_prefs = prefs.rstrip("\n") + "\n" + "\n".join(added) + "\n"
        merged = _merge_preferences(body, new_prefs)
        merged = self._ensure_header(merged)
        self._profile_file.write_text(merged, encoding="utf-8")
        logger.info("ProfileBuilder: added %d preference(s)", len(added))
        return True

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


# ---------------------------------------------------------------------------
# Module-level helpers for preference section splitting / merging
# ---------------------------------------------------------------------------


def _split_preferences(profile: str) -> tuple[str, str]:
    """Split profile into (body_without_prefs, prefs_section_content).

    If the preferences section doesn't exist, returns (profile, "").
    """
    m = _PREFERENCES_SPLIT_RE.search(profile)
    if not m:
        return profile, ""
    start = m.start()
    after_heading = m.end()
    next_section = re.search(r"\n## ", profile[after_heading:])
    end = after_heading + next_section.start() if next_section else len(profile)
    prefs_content = profile[after_heading:end]
    body = profile[:start] + profile[end:]
    return body, prefs_content


def _merge_preferences(body: str, prefs: str) -> str:
    """Append the preferences section at the end of the profile body."""
    body = body.rstrip("\n")
    if not prefs.strip():
        return body + "\n"
    return f"{body}\n\n{PREFERENCES_HEADING}\n{prefs.strip()}\n"
