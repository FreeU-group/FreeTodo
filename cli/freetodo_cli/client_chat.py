"""Chat-specific request helpers for CLI HTTP clients."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from freetodo_cli.client_helpers import (
    append_optional_field,
    append_repeated_fields,
    build_upload_list,
)

if TYPE_CHECKING:
    from collections.abc import Callable


@dataclass(slots=True)
class ChatRequest:
    """Normalized chat streaming request payload."""

    message: str
    user_input: str | None
    mode: str | None
    attachments: list[str] | None
    selected_tools: list[str] | None
    external_tools: list[str] | None
    context: str | None
    system_prompt: str | None
    conversation_id: str | None
    use_rag: bool | None
    on_chunk: Callable[[str], None] | None = None

    def form_data(self) -> list[tuple[str, str]]:
        """Build form fields for the chat request."""
        data: list[tuple[str, str]] = []
        append_optional_field(data, "message", self.message)
        append_optional_field(data, "user_input", self.user_input)
        append_optional_field(data, "mode", self.mode)
        append_optional_field(data, "context", self.context)
        append_optional_field(data, "system_prompt", self.system_prompt)
        append_optional_field(data, "conversation_id", self.conversation_id)
        if self.use_rag is not None:
            append_optional_field(data, "use_rag", str(self.use_rag))
        append_repeated_fields(data, "selected_tools", self.selected_tools)
        append_repeated_fields(data, "external_tools", self.external_tools)
        return data

    def files(self) -> list[tuple[str, tuple[str, bytes, str]]] | None:
        """Build multipart attachments when provided."""
        if not self.attachments:
            return None
        return build_upload_list("attachments", self.attachments)
