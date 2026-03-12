"""Chat upload router for images and text files."""

from __future__ import annotations

import mimetypes
from pathlib import Path
from uuid import uuid4

from fastapi import File, HTTPException, UploadFile
from pydantic import BaseModel

from lifetrace.routers.chat.base import router
from lifetrace.util.path_utils import get_attachments_dir

MAX_UPLOAD_SIZE = 50 * 1024 * 1024  # 50MB
CHAT_UPLOAD_SUBDIR = "chat"

TEXT_MIME_TYPES = {
    "application/json",
    "application/xml",
    "application/x-yaml",
    "application/yaml",
    "application/markdown",
    "application/x-markdown",
    "text/csv",
    "text/markdown",
}

TEXT_EXTENSIONS = {
    ".txt",
    ".md",
    ".markdown",
    ".json",
    ".csv",
    ".tsv",
    ".yaml",
    ".yml",
    ".log",
    ".xml",
}

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"}


class ChatUploadFileResponse(BaseModel):
    id: str
    file_name: str
    storage_name: str
    file_path: str
    relative_path: str
    size: int
    mime_type: str | None = None
    is_image: bool
    is_text: bool


class ChatUploadResponse(BaseModel):
    workspace_path: str
    files: list[ChatUploadFileResponse]


def _sanitize_filename(name: str | None) -> str:
    if not name:
        return "upload"
    return Path(name).name or "upload"


def _resolve_ext(filename: str, mime_type: str | None) -> str:
    ext = Path(filename).suffix.lower()
    if ext:
        return ext
    if mime_type:
        guessed = mimetypes.guess_extension(mime_type)
        if guessed:
            return guessed
    return ""


def _classify_upload(filename: str, mime_type: str | None) -> tuple[bool, bool]:
    ext = Path(filename).suffix.lower()
    content_type = (mime_type or "").lower()

    is_image = content_type.startswith("image/") or ext in IMAGE_EXTENSIONS
    is_text = (
        content_type.startswith("text/")
        or content_type in TEXT_MIME_TYPES
        or ext in TEXT_EXTENSIONS
    )
    return is_image, is_text


@router.post("/uploads", response_model=ChatUploadResponse)
async def upload_chat_files(
    files: list[UploadFile] = File(..., description="聊天上传文件"),
):
    if not files:
        raise HTTPException(status_code=400, detail="未提供文件")

    upload_dir = get_attachments_dir() / CHAT_UPLOAD_SUBDIR
    upload_dir.mkdir(parents=True, exist_ok=True)

    uploaded: list[ChatUploadFileResponse] = []

    for file in files:
        original_name = _sanitize_filename(file.filename)
        mime_type = file.content_type or mimetypes.guess_type(original_name)[0]
        is_image, is_text = _classify_upload(original_name, mime_type)

        if not (is_image or is_text):
            raise HTTPException(status_code=400, detail="仅支持图片或文本文件")

        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="文件内容为空")

        size = len(content)
        if size > MAX_UPLOAD_SIZE:
            raise HTTPException(status_code=413, detail="文件超过 50MB 限制")

        ext = _resolve_ext(original_name, mime_type)
        storage_name = f"{uuid4().hex}{ext}"
        target_path = upload_dir / storage_name
        target_path.write_bytes(content)

        file_id = uuid4().hex
        uploaded.append(
            ChatUploadFileResponse(
                id=file_id,
                file_name=original_name,
                storage_name=storage_name,
                file_path=str(target_path),
                relative_path=storage_name,
                size=size,
                mime_type=mime_type,
                is_image=is_image,
                is_text=is_text,
            )
        )

    return ChatUploadResponse(workspace_path=str(upload_dir), files=uploaded)
