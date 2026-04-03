"""Preview file router for local file rendering."""

from __future__ import annotations

import mimetypes
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query, Response
from fastapi.responses import FileResponse

router = APIRouter(prefix="/api/preview", tags=["preview"])

MAX_TEXT_BYTES = 2 * 1024 * 1024  # 2MB
MAX_BINARY_BYTES = 50 * 1024 * 1024  # 50MB


def _resolve_path(raw_path: str) -> Path:
    try:
        file_path = Path(raw_path).expanduser().resolve()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid path: {exc}") from exc

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    if not file_path.is_file():
        raise HTTPException(status_code=400, detail="Path is not a file")

    return file_path


@router.get("/file")
async def preview_file(
    path: str = Query(..., description="Absolute file path"),
    mode: str = Query("binary", description="text or binary"),
    max_bytes: int | None = Query(None, description="Optional size limit"),
):
    """Return file content for preview (text or binary)."""
    file_path = _resolve_path(path)
    stats = file_path.stat()
    size = stats.st_size
    modified_at = int(stats.st_mtime * 1000)

    limit = max_bytes or (MAX_TEXT_BYTES if mode == "text" else MAX_BINARY_BYTES)
    if size > limit:
        raise HTTPException(status_code=413, detail="File exceeds preview size limit")

    headers = {
        "X-File-Size": str(size),
        "X-File-Modified": str(modified_at),
        "X-File-Name": file_path.name,
        "Cache-Control": "no-store",
    }

    mime_type, _ = mimetypes.guess_type(file_path.name)
    media_type = mime_type or "application/octet-stream"

    if mode == "text":
        content = file_path.read_text(encoding="utf-8", errors="replace")
        if media_type.startswith("text/") and "charset" not in media_type:
            media_type = f"{media_type}; charset=utf-8"
        return Response(content=content, media_type=media_type, headers=headers)

    headers["Content-Disposition"] = f'inline; filename="{file_path.name}"'
    return FileResponse(
        path=str(file_path),
        media_type=media_type,
        filename=file_path.name,
        headers=headers,
    )
