"""Chat attachments endpoints and helpers."""

from __future__ import annotations

import mimetypes
from pathlib import Path as FsPath

from fastapi import HTTPException, Path
from fastapi.responses import FileResponse

from util.logging_config import get_logger
from util.path_utils import get_attachments_dir

from .base import router

logger = get_logger()


def get_chat_attachments_dir(session_id: str) -> FsPath:
    return get_attachments_dir() / "chat" / session_id


def build_chat_attachment_filename(attachment_id: str, original_name: str) -> str:
    safe_name = FsPath(original_name).name if original_name else "attachment"
    return f"{attachment_id}__{safe_name}"


def extract_original_filename(storage_name: str) -> str:
    if "__" not in storage_name:
        return storage_name
    return storage_name.split("__", 1)[1] or storage_name


@router.get("/attachments/{session_id}/{storage_name}")
async def download_chat_attachment(
    session_id: str = Path(..., description="Chat session ID"),
    storage_name: str = Path(..., description="Stored attachment file name"),
) -> FileResponse:
    safe_name = FsPath(storage_name).name
    attachments_dir = get_chat_attachments_dir(session_id)
    target_path = attachments_dir / safe_name

    if not target_path.exists() or not target_path.is_file():
        raise HTTPException(status_code=404, detail="Attachment not found")

    mime_type, _ = mimetypes.guess_type(str(target_path))
    filename = extract_original_filename(safe_name)

    logger.info("[chat][attachments] download %s (session=%s)", filename, session_id)
    return FileResponse(
        str(target_path),
        media_type=mime_type or "application/octet-stream",
        filename=filename,
    )
