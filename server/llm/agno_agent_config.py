"""Agent configuration helpers: LLM resolution, instructions building, tool guards, MCP integration."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from agno.db.sqlite import SqliteDb
from agno.learn import LearningMachine, LearningMode, UserMemoryConfig, UserProfileConfig
from agno.models.openai.like import OpenAILike

from llm.agno_tools.base import get_message
from util.logging_config import get_logger
from util.path_utils import get_agno_learning_db_path
from util.settings import settings

if TYPE_CHECKING:
    from agno.tools import Toolkit

logger = get_logger()


def build_learning_config() -> tuple[
    SqliteDb | None, bool | LearningMachine | None, bool, str | None
]:
    """构建 Agno Learning 配置"""
    learning_enabled = bool(settings.get("agno.learning.enabled", False))
    if not learning_enabled:
        return None, None, False, None

    db_path = get_agno_learning_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    db = SqliteDb(db_file=str(db_path))

    learning_mode = str(settings.get("agno.learning.mode", "always")).lower()
    learning_model_id = str(settings.get("agno.learning.model", "")).strip() or settings.get(
        "llm.small_model", "qwen-turbo"
    )
    learning_model = OpenAILike(
        id=learning_model_id,
        api_key=settings.llm.api_key,
        base_url=settings.llm.base_url,
    )
    if learning_mode == "agentic":
        learning = LearningMachine(
            model=learning_model,
            user_profile=UserProfileConfig(mode=LearningMode.AGENTIC),
            user_memory=UserMemoryConfig(mode=LearningMode.AGENTIC),
        )
    else:
        learning = LearningMachine(
            model=learning_model,
            user_profile=UserProfileConfig(mode=LearningMode.ALWAYS),
            user_memory=UserMemoryConfig(mode=LearningMode.ALWAYS),
        )

    add_history_to_context = bool(settings.get("agno.learning.add_history_to_context", False))
    return db, learning, add_history_to_context, str(db_path)


def get_current_date_instruction(lang: str) -> str:
    """获取当前日期的指令字符串（使用东八区时间）"""
    from util.time_utils import get_local_now  # noqa: PLC0415

    now = get_local_now()
    date_str = now.strftime("%Y-%m-%d")
    weekday_zh = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"][now.weekday()]
    weekday_en = now.strftime("%A")

    if lang == "zh":
        return f"当前日期：{date_str}（{weekday_zh}）。"
    return f"Current date: {date_str} ({weekday_en})."


def resolve_identity() -> tuple[str, str]:
    """Read user_name and agent_name from setup config."""
    user_name = settings.get("setup.user_name", "") or ""
    agent_name = settings.get("setup.agent_name", "") or ""
    return user_name.strip() or "用户", agent_name.strip() or "Free U"


def inject_identity(text: str) -> str:
    """Replace {user_name}, {agent_name}, and {workspace} placeholders in instructions."""
    user_name, agent_name = resolve_identity()
    workspace = str(settings.get("agno.default_workspace", ".")).strip() or "."
    try:
        return text.format(user_name=user_name, agent_name=agent_name, workspace=workspace)
    except (KeyError, IndexError):
        return (
            text.replace("{user_name}", user_name)
            .replace("{agent_name}", agent_name)
            .replace("{workspace}", workspace)
        )


def build_tool_guard(lang: str, available_tool_names: list[str] | None) -> str | None:
    """构建工具约束指令，防止模型调用不存在的工具。"""
    if not available_tool_names:
        return None
    names_str = ", ".join(available_tool_names)
    if lang == "zh":
        return (
            f"【重要约束】当前可用的工具仅有：{names_str}。"
            "你只能调用上述列表中的工具，禁止调用任何不在此列表中的工具。"
            "如果用户的需求需要不可用的工具，请直接用文字回答而不要尝试调用工具。"
        )
    return (
        f"[IMPORTANT] Currently available tools: {names_str}. "
        "You MUST only call tools from this list. Do NOT call any tool not listed above. "
        "If the user's request requires an unavailable tool, answer in text instead."
    )


def build_instructions(
    lang: str,
    has_tools: bool,
    use_all_lifetrace_tools: bool,
    has_external_tools: bool,
    available_tool_names: list[str] | None = None,
) -> list[str] | None:
    """构建 Agent 的 instructions"""
    date_instruction = get_current_date_instruction(lang)
    _ = (use_all_lifetrace_tools, has_external_tools)
    user_name, agent_name = resolve_identity()

    tool_guard = build_tool_guard(lang, available_tool_names)

    from llm.agno_skills import build_skills_instruction, load_skills_info  # noqa: PLC0415

    skills = load_skills_info()
    skills_instruction = build_skills_instruction(lang, skills)
    if skills:
        logger.info("已加载 %d 个 CLI 技能: %s", len(skills), [s["name"] for s in skills])

    def _finalize(result: list[str]) -> list[str]:
        if skills_instruction:
            result.append(skills_instruction)
        if tool_guard:
            result.append(tool_guard)
        return result

    instructions = get_message(lang, "instructions")
    if instructions and instructions != "[instructions]":
        return _finalize([date_instruction, inject_identity(instructions)])

    if lang == "zh":
        if has_tools:
            return _finalize(
                [
                    date_instruction,
                    f"你是 {agent_name}，{user_name} 的智能助手，可以帮助用户管理待办事项和执行各种任务。"
                    "请根据用户的问题选择合适的工具来完成任务。",
                ]
            )
        return [
            date_instruction,
            f"你是 {agent_name}，{user_name} 的智能助手。当前没有启用任何工具，请直接回答用户的问题。",
        ]

    if has_tools:
        return _finalize(
            [
                date_instruction,
                f"You are {agent_name}, {user_name}'s assistant that helps manage todos "
                "and perform various tasks. Use the appropriate tools to complete tasks.",
            ]
        )
    return [
        date_instruction,
        f"You are {agent_name}, {user_name}'s assistant. No tools are currently enabled. "
        "Please answer the user's questions directly.",
    ]


def collect_tool_names(tools_to_use: list[Any]) -> list[str]:
    """从 toolkit 列表中收集所有已注册的函数名。"""
    names: list[str] = []
    for toolkit in tools_to_use:
        if hasattr(toolkit, "functions"):
            names.extend(toolkit.functions.keys())
    return names


def get_mcp_tools() -> list[Toolkit]:
    """Get globally connected MCP toolkits (safe to call from sync context)."""
    try:
        from llm.agno_mcp_manager import get_connected_mcp_tools  # noqa: PLC0415

        return get_connected_mcp_tools()
    except Exception:
        return []


def get_mcp_superseded_tools() -> set[str]:
    """Get set of built-in external tool names superseded by MCP servers."""
    try:
        from llm.agno_mcp_manager import get_mcp_superseded_external_tools  # noqa: PLC0415

        return get_mcp_superseded_external_tools()
    except Exception:
        return set()


def resolve_agent_llm(model_override: str | None = None) -> tuple[str, str, str]:
    """Resolve model/api_key/base_url for the Agent.

    Priority: explicit override > llm.agent.* > llm.*
    """
    _placeholders = {"", "YOUR_LLM_KEY_HERE", "YOUR_BASE_URL_HERE"}

    agent_cfg = settings.get("llm.agent", {}) or {}
    agent_key = str(agent_cfg.get("api_key", "") or "").strip()
    agent_url = str(agent_cfg.get("base_url", "") or "").strip()
    agent_model = str(agent_cfg.get("model", "") or "").strip()

    if agent_key and agent_key not in _placeholders and agent_url and agent_model:
        resolved_model = model_override or agent_model
        logger.info(
            "Agent 使用专属模型配置: model=%s, base_url=%s",
            resolved_model,
            agent_url,
        )
        return resolved_model, agent_key, agent_url

    return (
        model_override or settings.llm.model,
        settings.llm.api_key,
        settings.llm.base_url,
    )
