"""AgentOS entrypoint for Lifetrace (Agno)."""

from agno.db.sqlite import SqliteDb
from agno.os import AgentOS
from agno.tracing import setup_tracing
from fastapi import HTTPException, Request

from llm.agent_os_tools import (
    agent_os_session_end,
    agent_os_session_start,
    agent_os_tool_guard,
    build_agent_os_external_tools,
    get_all_lifetrace_tools,
)
from llm.agno_agent import DEFAULT_LANG, AgnoAgentService
from llm.agno_tools.memory_toolkit import MemoryToolkit
from util.logging_config import get_logger
from util.path_utils import get_agno_tracing_db_path
from util.settings import settings

logger = get_logger()


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


def _configure_tracing() -> tuple[SqliteDb | None, bool]:
    tracing_enabled = bool(settings.get("agno.tracing.enabled", False))
    if not tracing_enabled:
        return None, False

    db_path = get_agno_tracing_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    tracing_db = SqliteDb(db_file=str(db_path))

    if bool(settings.get("agno.tracing.use_setup_tracing", False)):
        setup_tracing(
            db=tracing_db,
            batch_processing=bool(settings.get("agno.tracing.batch_processing", True)),
            max_queue_size=int(settings.get("agno.tracing.max_queue_size", 2048)),
            schedule_delay_millis=int(settings.get("agno.tracing.schedule_delay_millis", 3000)),
        )
        logger.info("Agno tracing setup_tracing 已启用")

    logger.info("Agno tracing 已启用: db=%s", db_path)
    return tracing_db, True


def reload_agent_os_agent() -> None:
    """Rebuild the in-memory AgentOS agent to pick up latest runtime settings."""
    agent_os.agents = [_build_agent()]


_tracing_db, _tracing_enabled = _configure_tracing()
agent_os = AgentOS(agents=[_build_agent()], db=_tracing_db, tracing=_tracing_enabled)
app = agent_os.get_app()


@app.post("/internal/reload-agent")
async def reload_agent(request: Request):
    """Reload the AgentOS agent in-process.

    This endpoint is intentionally restricted to loopback callers because it mutates
    the running AgentOS configuration.
    """
    client_host = request.client.host if request.client else None
    if client_host not in {"127.0.0.1", "::1", "localhost"}:
        raise HTTPException(status_code=403, detail="Forbidden")

    try:
        reload_agent_os_agent()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Reload failed: {exc!s}") from exc

    return {"success": True}


if __name__ == "__main__":
    host = str(settings.get("agno.agent_os.host", "127.0.0.1"))
    port = int(settings.get("agno.agent_os.port", 8002))
    debug = bool(settings.get("agno.agent_os.debug", False))
    agent_os.serve(
        app="agent_os:app",
        host=host,
        port=port,
        reload=debug,
    )
