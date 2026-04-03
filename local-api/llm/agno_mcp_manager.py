"""MCP (Model Context Protocol) tools lifecycle manager.

Manages long-lived connections to MCP servers. Connected at application
startup and torn down at shutdown. The connected toolkits are injected
into AgnoAgentService as extra tools.

Note: MCP tool entrypoints are inherently async. Since AgnoAgentService
uses the synchronous ``Agent.run()`` path, we patch each async entrypoint
with a sync wrapper that submits coroutines back to the main event loop
via ``run_coroutine_threadsafe``, keeping the MCP transport on its
original loop and avoiding the overhead of ``asyncio.run()`` spinning up
a throwaway loop on every call.
"""

from __future__ import annotations

import asyncio
from functools import wraps
from inspect import iscoroutinefunction
from pathlib import Path
from typing import Any

from util.logging_config import get_logger
from util.settings import settings

logger = get_logger()

_connected_tools: list[Any] = []
_lock = __import__("threading").Lock()

# Captured once during ``connect_mcp_servers`` so sync wrappers can submit
# coroutines back to the loop where the MCP transports live.
_main_loop: asyncio.AbstractEventLoop | None = None

_MCP_TOOL_TIMEOUT = 300  # seconds – generous upper-bound per tool call


def _make_sync_wrapper(async_fn):
    """Return a sync callable that runs *async_fn* on the main event loop.

    Uses ``run_coroutine_threadsafe`` when the captured main loop is still
    running (normal operation).  Falls back to ``asyncio.run()`` only when
    no loop has been captured yet (e.g. unit-test isolation).
    """

    @wraps(async_fn)
    def _sync(*args, **kwargs):
        loop = _main_loop
        if loop is not None and loop.is_running() and not loop.is_closed():
            future = asyncio.run_coroutine_threadsafe(async_fn(*args, **kwargs), loop)
            return future.result(timeout=_MCP_TOOL_TIMEOUT)
        return asyncio.run(async_fn(*args, **kwargs))

    return _sync


_PATH_ARG_NAMES = frozenset(
    {
        "path",
        "source",
        "destination",
        "file_path",
        "directory",
        "target",
        "old_path",
        "new_path",
        "dir_path",
        "folder",
        "filename",
        "filepath",
    }
)


def _is_relative(value: str) -> bool:
    """True when *value* looks like a relative path (no drive letter / UNC / root)."""
    if not value or not isinstance(value, str):
        return False
    if len(value) >= 2 and value[0].isalpha() and value[1] == ":":
        return False
    if value.startswith("\\\\") or value.startswith("//"):
        return False
    if value.startswith("/"):
        return False
    return True


def _make_path_resolver(fn, workspace: str):
    """Wrap *fn* so that relative-path arguments are resolved against *workspace*."""
    ws = Path(workspace)

    @wraps(fn)
    def _resolved(*args, **kwargs):
        new_kwargs = {}
        for key, value in kwargs.items():
            if key.lower() in _PATH_ARG_NAMES and isinstance(value, str) and _is_relative(value):
                resolved = str(ws / value)
                logger.debug("[MCP] Resolved relative path %r → %r", value, resolved)
                new_kwargs[key] = resolved
            else:
                new_kwargs[key] = value
        return fn(*args, **new_kwargs)

    return _resolved


def _patch_async_entrypoints(toolkit) -> None:
    """Replace async entrypoints in a toolkit's sync functions dict with sync wrappers.

    Agno's sync ``Agent.run()`` calls ``toolkit.get_functions()`` which returns
    the ``functions`` dict.  MCP toolkits register async callables there, causing
    the sync agent to silently skip them.  This patches each one in-place.
    """
    patched = 0
    for name, func_obj in getattr(toolkit, "functions", {}).items():
        ep = getattr(func_obj, "entrypoint", None)
        if ep is not None and iscoroutinefunction(ep):
            func_obj.entrypoint = _make_sync_wrapper(ep)
            patched += 1
    if patched:
        logger.debug("[MCP] Patched %d async entrypoints to sync wrappers", patched)


def _patch_relative_paths(toolkit, workspace: str) -> None:
    """Wrap file-operation entrypoints to resolve relative paths against *workspace*."""
    patched = 0
    for name, func_obj in getattr(toolkit, "functions", {}).items():
        ep = getattr(func_obj, "entrypoint", None)
        if ep is not None:
            func_obj.entrypoint = _make_path_resolver(ep, workspace)
            patched += 1
    if patched:
        logger.debug(
            "[MCP] Patched %d entrypoints with path resolver (workspace=%s)", patched, workspace
        )


async def connect_mcp_servers() -> None:
    """Connect to all configured MCP servers. Call during app startup."""
    global _main_loop
    _main_loop = asyncio.get_running_loop()

    servers: list[dict] = settings.get("agno.mcp_servers", []) or []
    if not servers:
        logger.info("[MCP] No MCP servers configured (agno.mcp_servers is empty)")
        return

    enabled = [s for s in servers if s.get("enabled", True)]
    if not enabled:
        logger.info("[MCP] All configured MCP servers are disabled")
        return

    try:
        from agno.tools.mcp import MCPTools  # noqa: PLC0415
    except ImportError:
        logger.warning("[MCP] agno MCP support unavailable (pip install mcp)")
        return

    workspace = str(settings.get("agno.default_workspace", ".")).strip() or "."

    for server_cfg in enabled:
        name = server_cfg.get("name", "unnamed")
        command = server_cfg.get("command", "")
        url = server_cfg.get("url", "")
        transport = server_cfg.get("transport")
        env = server_cfg.get("env") or {}
        timeout = int(server_cfg.get("timeout_seconds", 30))
        include_tools = server_cfg.get("include_tools")
        exclude_tools = server_cfg.get("exclude_tools")

        if command:
            safe_workspace = workspace.replace("\\", "/")
            command = command.replace("{workspace}", safe_workspace)

            # Support {allowed_dirs} placeholder for filesystem MCP servers
            allowed_dirs = server_cfg.get("allowed_dirs") or []
            if allowed_dirs and "{allowed_dirs}" in command:
                dirs_str = " ".join(
                    f'"{d.replace(chr(92), "/")}"' if " " in d else d.replace("\\", "/")
                    for d in allowed_dirs
                )
                command = command.replace("{allowed_dirs}", dirs_str)

        if not command and not url:
            logger.warning("[MCP] Server %r has no command or url, skipping", name)
            continue

        kwargs: dict[str, Any] = {"timeout_seconds": timeout}
        if command:
            kwargs["command"] = command
        if url:
            kwargs["url"] = url
        if transport:
            kwargs["transport"] = transport
        if env:
            kwargs["env"] = env
        if include_tools:
            kwargs["include_tools"] = include_tools
        if exclude_tools:
            kwargs["exclude_tools"] = exclude_tools

        try:
            tool = MCPTools(**kwargs)
            await tool.connect()
            _patch_async_entrypoints(tool)
            _patch_relative_paths(tool, workspace)
            func_names = list(tool.functions.keys())
            with _lock:
                _connected_tools.append(tool)
            logger.info(
                "[MCP] Connected to %r: %d tools registered %s",
                name,
                len(func_names),
                func_names,
            )
        except Exception:
            logger.exception("[MCP] Failed to connect to %r, skipping", name)


async def disconnect_mcp_servers() -> None:
    """Disconnect all MCP servers. Call during app shutdown."""
    with _lock:
        tools = list(_connected_tools)
        _connected_tools.clear()

    for tool in tools:
        name = getattr(tool, "name", "unnamed")
        try:
            await tool.close()
            logger.info("[MCP] Disconnected from %r", name)
        except Exception:
            logger.debug("[MCP] Error closing %r", name, exc_info=True)


def get_connected_mcp_tools() -> list[Any]:
    """Return the list of connected MCP Toolkits (thread-safe, sync)."""
    with _lock:
        return list(_connected_tools)


def get_mcp_superseded_external_tools() -> set[str]:
    """Return set of built-in external tool names that MCP servers supersede.

    When an MCP server provides file operations, the built-in ``file`` and
    ``local_fs`` tools become redundant and could conflict (duplicate
    function names like ``read_file``).  This function checks connected
    MCP servers and returns the built-in tool names that should be skipped.
    """
    with _lock:
        if not _connected_tools:
            return set()
        mcp_func_names: set[str] = set()
        for tool in _connected_tools:
            if hasattr(tool, "functions"):
                mcp_func_names.update(tool.functions.keys())

    superseded: set[str] = set()
    file_tool_indicators = {"read_file", "write_file", "list_directory", "edit_file"}
    if file_tool_indicators & mcp_func_names:
        superseded.add("file")
        superseded.add("local_fs")
    return superseded


async def reconnect_mcp_servers() -> None:
    """Reconnect all MCP servers (e.g. after config change)."""
    await disconnect_mcp_servers()
    await connect_mcp_servers()
