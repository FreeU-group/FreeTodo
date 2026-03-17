"""Todo 管理路由 - 使用依赖注入"""

from __future__ import annotations

import hashlib
import os
from pathlib import Path as FsPath
from typing import TYPE_CHECKING
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Path, Query, Response, UploadFile
from fastapi.responses import FileResponse

from lifetrace.core.dependencies import get_db_session, get_todo_service
from lifetrace.schemas.todo import (
    TodoAttachmentResponse,
    TodoCreate,
    TodoListResponse,
    TodoReorderRequest,
    TodoResponse,
    TodoUpdate,
)
from lifetrace.services.icalendar_service import ICalendarService
from lifetrace.util.path_utils import get_attachments_dir

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from lifetrace.services.todo_service import TodoService

router = APIRouter(prefix="/api/todos", tags=["todos"])
tags_router = APIRouter(prefix="/api/tags", tags=["tags"])
MAX_ATTACHMENT_SIZE = 50 * 1024 * 1024  # 50MB


@tags_router.get("")
async def list_tags(db: "Session" = Depends(get_db_session)):
    """获取所有标签"""
    from lifetrace.storage.models import Tag  # noqa: PLC0415

    tags = db.query(Tag).filter(Tag.deleted_at.is_(None)).order_by(Tag.tag_name).all()
    return {"tags": [{"id": t.id, "name": t.tag_name} for t in tags]}


def _sanitize_filename(name: str) -> str:
    return FsPath(name).name if name else "attachment"


@router.get("", response_model=TodoListResponse)
async def list_todos(
    limit: int = Query(200, ge=1, le=2000, description="返回数量限制"),
    offset: int = Query(0, ge=0, description="偏移量"),
    status: str | None = Query(None, description="状态筛选：active/completed/canceled"),
    page: int | None = Query(None, ge=1, description="页码（从1开始）"),
    page_size: int | None = Query(None, ge=1, le=200, description="每页数量（最大200）"),
    service: TodoService = Depends(get_todo_service),
):
    """获取待办列表"""
    if page is not None and page_size is not None:
        actual_limit = page_size
        actual_offset = (page - 1) * page_size
    else:
        actual_limit = limit
        actual_offset = offset
    return service.list_todos(actual_limit, actual_offset, status)


@router.get("/{todo_id}", response_model=TodoResponse)
async def get_todo(
    todo_id: int = Path(..., description="Todo ID"),
    service: TodoService = Depends(get_todo_service),
):
    """获取单个待办"""
    return service.get_todo(todo_id)


@router.post(
    "/{todo_id}/attachments",
    response_model=list[TodoAttachmentResponse],
    status_code=201,
)
async def upload_attachments(
    todo_id: int = Path(..., description="Todo ID"),
    files: list[UploadFile] = File(..., description="附件列表"),
    service: TodoService = Depends(get_todo_service),
):
    """上传附件并绑定到 Todo"""
    if not files:
        raise HTTPException(status_code=400, detail="未提供附件")

    attachments_dir = get_attachments_dir()
    attachments_dir.mkdir(parents=True, exist_ok=True)

    created = []
    for file in files:
        if not file.filename:
            continue

        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="附件内容为空")

        size = len(content)
        if size > MAX_ATTACHMENT_SIZE:
            raise HTTPException(status_code=413, detail="附件超过 50MB 限制")

        file_name = _sanitize_filename(file.filename)
        ext = FsPath(file_name).suffix
        storage_name = f"{uuid4().hex}{ext}"
        target_path = attachments_dir / storage_name
        target_path.write_bytes(content)

        file_hash = hashlib.sha256(content).hexdigest()
        created.append(
            service.add_attachment(
                todo_id=todo_id,
                file_name=file_name,
                file_path=str(target_path),
                file_size=size,
                mime_type=file.content_type,
                file_hash=file_hash,
            )
        )

    return created


@router.delete("/{todo_id}/attachments/{attachment_id}", status_code=204)
async def delete_attachment(
    todo_id: int = Path(..., description="Todo ID"),
    attachment_id: int = Path(..., description="附件 ID"),
    service: TodoService = Depends(get_todo_service),
):
    """解绑附件（不删除实际文件）"""
    service.remove_attachment(todo_id=todo_id, attachment_id=attachment_id)


@router.get("/attachments/{attachment_id}/file")
async def get_attachment_file(
    attachment_id: int = Path(..., description="附件 ID"),
    service: TodoService = Depends(get_todo_service),
):
    """下载附件文件"""
    attachment = service.get_attachment(attachment_id)
    file_path = attachment["file_path"]
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="附件文件不存在")

    return FileResponse(
        file_path,
        media_type=attachment.get("mime_type") or "application/octet-stream",
        filename=attachment.get("file_name") or f"attachment-{attachment_id}",
    )


@router.post("", response_model=TodoResponse, status_code=201)
async def create_todo(
    todo: TodoCreate,
    service: TodoService = Depends(get_todo_service),
):
    """创建待办"""
    return service.create_todo(todo)


@router.put("/{todo_id}", response_model=TodoResponse)
async def update_todo(
    todo_id: int = Path(..., description="Todo ID"),
    todo: TodoUpdate | None = None,
    service: TodoService = Depends(get_todo_service),
):
    """更新待办"""
    if todo is None:
        raise HTTPException(status_code=400, detail="缺少待办更新内容")
    return service.update_todo(todo_id, todo)


@router.delete("/{todo_id}", status_code=204)
async def delete_todo(
    todo_id: int = Path(..., description="Todo ID"),
    service: TodoService = Depends(get_todo_service),
):
    """删除待办"""
    service.delete_todo(todo_id)


@router.post("/reorder", status_code=200)
async def reorder_todos(
    request: TodoReorderRequest,
    service: TodoService = Depends(get_todo_service),
):
    """批量更新待办的排序和父子关系"""
    items = [
        {
            "id": item.id,
            "order": item.order,
            **({"parent_todo_id": item.parent_todo_id} if item.parent_todo_id is not None else {}),
        }
        for item in request.items
    ]
    return service.reorder_todos(items)


@router.get("/export/ics")
async def export_ics(
    limit: int = Query(2000, ge=1, le=2000, description="导出数量限制"),
    offset: int = Query(0, ge=0, description="导出偏移量"),
    status: str | None = Query(None, description="状态筛选：active/completed/canceled"),
    service: TodoService = Depends(get_todo_service),
):
    """导出 Todo 为 ICS 文件"""
    payload = service.list_todos(limit, offset, status)
    todos = [t.model_dump() if hasattr(t, "model_dump") else t for t in payload.get("todos", [])]
    ics_content = ICalendarService().export_todos(todos)
    filename = "lifetrace-todos.ics" if not status else f"lifetrace-todos-{status}.ics"
    return Response(
        content=ics_content,
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/import/ics", response_model=list[TodoResponse])
async def import_ics(
    file: UploadFile = File(...),
    service: TodoService = Depends(get_todo_service),
):
    """从 ICS 文件导入 Todo"""
    if not file.filename:
        raise HTTPException(status_code=400, detail="未提供 ICS 文件")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="ICS 文件为空")

    try:
        ics_text = content.decode("utf-8")
    except UnicodeDecodeError:
        ics_text = content.decode("utf-8", errors="ignore")

    todos = ICalendarService().import_todos(ics_text)
    created: list[TodoResponse] = []
    seen_uids: set[str] = set()
    for todo in todos:
        uid = (todo.uid or "").strip()
        if uid:
            if uid in seen_uids:
                continue
            seen_uids.add(uid)
            if service.get_todo_by_uid(uid):
                continue
        created.append(service.create_todo(todo))
    return created
