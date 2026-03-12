"""AgentOS entrypoint for Lifetrace (Agno)."""

from agno.os import AgentOS

from llm.agent_os_tools import (
    agent_os_session_end,
    agent_os_session_start,
    agent_os_tool_guard,
    build_agent_os_external_tools,
    get_all_lifetrace_tools,
)
from llm.agno_agent import DEFAULT_LANG, AgnoAgentService
from llm.agno_tools.memory_toolkit import MemoryToolkit
from util.settings import settings


def _normalize_list(value) -> list[str] | None:
    if not value:
        return None
    if isinstance(value, list | tuple):
        return [str(item) for item in value if str(item).strip()]
    if isinstance(value, str):
        return [item.strip() for item in value.split(",") if item.strip()]
    return None


def _build_agent():
    lang = settings.get("agno.agent_os.lang", DEFAULT_LANG)
    selected_tools = _normalize_list(settings.get("agno.agent_os.selected_tools"))
    if not selected_tools:
        selected_tools = get_all_lifetrace_tools()

    external_tools = _normalize_list(settings.get("agno.agent_os.external_tools"))

    agent_id = settings.get("agno.agent_os.agent_id", "lifetrace-agent")
    agent_name = settings.get("agno.agent_os.agent_name", "Lifetrace Agent")
    extra_tools = build_agent_os_external_tools(allowed_tools=external_tools)

    memory_config = settings.get("memory", {}) or {}
    if memory_config.get("enabled", True):
        extra_tools.append(MemoryToolkit(lang=lang))

    tool_hooks = [agent_os_tool_guard]
    pre_hooks = [agent_os_session_start]
    post_hooks = [agent_os_session_end]

    service = AgnoAgentService(
        lang=lang,
        selected_tools=selected_tools,
        extra_tools=extra_tools,
        tool_hooks=tool_hooks,
        pre_hooks=pre_hooks,
        post_hooks=post_hooks,
        agent_id=agent_id,
        agent_name=agent_name,
    )
    return service.agent


agent_os = AgentOS(agents=[_build_agent()])
app = agent_os.get_app()


if __name__ == "__main__":
    host = str(settings.get("agno.agent_os.host", "0.0.0.0"))
    port = int(settings.get("agno.agent_os.port", 8002))
    debug = bool(settings.get("agno.agent_os.debug", False))
    agent_os.serve(
        app="agent_os:app",
        host=host,
        port=port,
        reload=debug,
    )
