"""AgentOS tool helpers for Lifetrace."""

from pathlib import Path
from typing import Any

from agno.exceptions import AgentRunException
from agno.run import RunContext
from agno.tools import Toolkit
from agno.tools.file import FileTools
from agno.tools.local_file_system import LocalFileSystemTools
from agno.tools.shell import ShellTools

from llm.agno_agent import current_session_id
from llm.agno_external_tools import create_external_tool

LIFETRACE_TOOL_NAMES = [
    "create_todo",
    "complete_todo",
    "update_todo",
    "list_todos",
    "search_todos",
    "delete_todo",
    "breakdown_task",
    "parse_time",
    "check_schedule_conflict",
    "get_todo_stats",
    "get_overdue_todos",
    "list_tags",
    "get_todos_by_tag",
    "suggest_tags",
]

EXTERNAL_TOOL_FUNCTIONS: "dict[str, set[str]]" = {
    "file": {
        "save_file",
        "read_file",
        "list_files",
        "search_files",
        "delete_file",
        "read_file_chunk",
        "replace_file_chunk",
    },
    "local_fs": {"write_file"},
    "shell": {"run_shell_command"},
    "websearch": {"web_search", "search_news"},
    "hackernews": {"get_top_hackernews_stories", "get_user_details"},
    "sleep": {"sleep"},
}

TOOL_NAME_TO_GROUP: "dict[str, str]" = {
    tool_name: group
    for group, tool_names in EXTERNAL_TOOL_FUNCTIONS.items()
    for tool_name in tool_names
}


def get_all_lifetrace_tools() -> "list[str]":
    return list(LIFETRACE_TOOL_NAMES)


def _get_dependencies(run_context: RunContext | None) -> "dict[str, Any]":
    if run_context is None:
        return {}
    deps = getattr(run_context, "dependencies", None)
    return deps if isinstance(deps, dict) else {}


def _get_workspace_path(run_context: RunContext | None) -> Path | None:
    deps = _get_dependencies(run_context)
    raw_path = deps.get("workspace_path")
    if not raw_path:
        return None
    try:
        path = Path(str(raw_path)).expanduser().resolve()
    except OSError:
        return None
    return path


def _get_enable_delete(run_context: RunContext | None) -> bool:
    deps = _get_dependencies(run_context)
    return bool(deps.get("enable_file_delete"))


def _ensure_workspace(path: Path | None) -> "tuple[Path | None, str | None]":
    if path is None:
        return None, "未配置 workspace_path，无法使用文件类工具"
    if not path.exists() or not path.is_dir():
        return None, f"工作区路径不可用: {path}"
    return path, None


def _is_within_directory(path: Path, base_dir: Path) -> bool:
    try:
        path.resolve().relative_to(base_dir.resolve())
        return True
    except ValueError:
        return False


def agent_os_tool_guard(
    *, func, name: str | None = None, args: dict | None = None, run_context=None, **_
) -> Any:
    tool_name = name or ""
    deps = _get_dependencies(run_context)
    selected_tools = deps.get("selected_tools") or []
    external_tools = deps.get("external_tools") or []

    if tool_name in LIFETRACE_TOOL_NAMES:
        if not selected_tools or tool_name not in selected_tools:
            raise AgentRunException(f"Tool not enabled: {tool_name}")
    else:
        group = TOOL_NAME_TO_GROUP.get(tool_name)
        if group and (not external_tools or group not in external_tools):
            raise AgentRunException(f"External tool not enabled: {group}")

    return func(**(args or {}))


def agent_os_session_start(run_context: RunContext | None = None, **_) -> None:
    if run_context and run_context.session_id:
        current_session_id.set(run_context.session_id)


def agent_os_session_end(**_) -> None:
    current_session_id.set(None)


class DynamicFileTools(Toolkit):
    def __init__(self):
        tools = [
            self.save_file,
            self.read_file,
            self.list_files,
            self.search_files,
            self.delete_file,
            self.read_file_chunk,
            self.replace_file_chunk,
        ]
        super().__init__(name="dynamic_file_tools", tools=tools)

    def _build_file_tool(
        self, run_context: RunContext | None
    ) -> "tuple[FileTools | None, str | None]":
        workspace_path, error = _ensure_workspace(_get_workspace_path(run_context))
        if error:
            return None, error
        return FileTools(base_dir=workspace_path), None

    def save_file(
        self,
        run_context: RunContext,
        contents: str,
        file_name: str,
        overwrite: bool = True,
        encoding: str = "utf-8",
    ) -> str:
        tool, error = self._build_file_tool(run_context)
        if error or tool is None:
            return error or "无法保存文件"
        return tool.save_file(contents, file_name, overwrite=overwrite, encoding=encoding)

    def read_file(self, run_context: RunContext, file_name: str, encoding: str = "utf-8") -> str:
        tool, error = self._build_file_tool(run_context)
        if error or tool is None:
            return error or "无法读取文件"
        return tool.read_file(file_name, encoding=encoding)

    def read_file_chunk(
        self,
        run_context: RunContext,
        file_name: str,
        start_line: int,
        end_line: int,
        encoding: str = "utf-8",
    ) -> str:
        tool, error = self._build_file_tool(run_context)
        if error or tool is None:
            return error or "无法读取文件"
        return tool.read_file_chunk(
            file_name, start_line=start_line, end_line=end_line, encoding=encoding
        )

    def replace_file_chunk(
        self,
        run_context: RunContext,
        file_name: str,
        start_line: int,
        end_line: int,
        chunk: str,
        encoding: str = "utf-8",
    ) -> str:
        tool, error = self._build_file_tool(run_context)
        if error or tool is None:
            return error or "无法更新文件"
        return tool.replace_file_chunk(
            file_name,
            start_line=start_line,
            end_line=end_line,
            chunk=chunk,
            encoding=encoding,
        )

    def list_files(self, run_context: RunContext, directory: str | None = None) -> str:
        tool, error = self._build_file_tool(run_context)
        if error or tool is None:
            return error or "无法列出文件"
        return tool.list_files(directory=directory)

    def search_files(self, run_context: RunContext, pattern: str) -> str:
        tool, error = self._build_file_tool(run_context)
        if error or tool is None:
            return error or "无法搜索文件"
        return tool.search_files(pattern)

    def delete_file(self, run_context: RunContext, file_name: str) -> str:
        if not _get_enable_delete(run_context):
            return "未启用文件删除权限"
        tool, error = self._build_file_tool(run_context)
        if error or tool is None:
            return error or "无法删除文件"
        return tool.delete_file(file_name)


class DynamicLocalFileSystemTools(Toolkit):
    def __init__(self):
        tools = [self.write_file]
        super().__init__(name="dynamic_local_fs", tools=tools)

    def write_file(
        self,
        run_context: RunContext,
        content: str,
        filename: str | None = None,
        directory: str | None = None,
        extension: str | None = None,
    ) -> str:
        workspace_path, error = _ensure_workspace(_get_workspace_path(run_context))
        if error or workspace_path is None:
            return error or "无法写入文件"

        target_directory = workspace_path
        if directory:
            candidate = Path(directory)
            if not candidate.is_absolute():
                candidate = workspace_path / candidate
            if not _is_within_directory(candidate, workspace_path):
                return "目标目录不在工作区内"
            target_directory = candidate

        tool = LocalFileSystemTools(target_directory=str(target_directory))
        return tool.write_file(
            content=content,
            filename=filename,
            directory=str(target_directory),
            extension=extension,
        )


class DynamicShellTools(Toolkit):
    def __init__(self):
        tools = [self.run_shell_command]
        super().__init__(name="dynamic_shell", tools=tools)

    def run_shell_command(self, run_context: RunContext, args: "list[str]", tail: int = 100) -> str:
        workspace_path, error = _ensure_workspace(_get_workspace_path(run_context))
        if error or workspace_path is None:
            return error or "无法执行命令"
        tool = ShellTools(base_dir=workspace_path)
        return tool.run_shell_command(args=args, tail=tail)


def build_agent_os_external_tools(allowed_tools: "list[str] | None" = None) -> "list[Toolkit]":
    allow_all = not allowed_tools
    allowed_set = set(allowed_tools or [])

    tools: list[Toolkit] = []
    if allow_all or "file" in allowed_set:
        tools.append(DynamicFileTools())
    if allow_all or "local_fs" in allowed_set:
        tools.append(DynamicLocalFileSystemTools())
    if allow_all or "shell" in allowed_set:
        tools.append(DynamicShellTools())

    for tool_name in ("websearch", "hackernews", "sleep"):
        if not allow_all and tool_name not in allowed_set:
            continue
        tool = create_external_tool(tool_name)
        if tool:
            tools.append(tool)

    return tools
