"""Todo 管理路由 - 使用依赖注入"""

from __future__ import annotations

import hashlib
import os
from pathlib import Path as FsPath
from typing import TYPE_CHECKING
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Path, Query, Response, UploadFile
from fastapi.responses import FileResponse

from core.dependencies import get_todo_service
from schemas.todo import (
    TodoAttachmentResponse,
    TodoCreate,
    TodoListResponse,
    TodoReorderRequest,
    TodoResponse,
    TodoUpdate,
)
from services.icalendar_service import ICalendarService
from util.path_utils import get_attachments_dir

if TYPE_CHECKING:
    from services.todo_service import TodoService

router = APIRouter(prefix="/api/todos", tags=["todos"])
MAX_ATTACHMENT_SIZE = 50 * 1024 * 1024  # 50MB


def _sanitize_filename(name: str) -> str:
    return FsPath(name).name if name else "attachment"


@router.get("", response_model=TodoListResponse)
async def list_todos(
    limit: int = Query(200, ge=1, le=2000, description="返回数量限制"),
    offset: int = Query(0, ge=0, description="偏移量"),
    status: str | None = Query(None, description="状态筛选：active/completed/canceled"),
    service: TodoService = Depends(get_todo_service),
):
    """获取待办列表"""
    return service.list_todos(limit, offset, status)


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


# ---------------------------------------------------------------------------
# AI 时间规划
# ---------------------------------------------------------------------------

import asyncio  # noqa: E402
import json as _json  # noqa: E402
from datetime import timedelta  # noqa: E402

from pydantic import BaseModel as _BaseModel  # noqa: E402


class AiPlanRequest(_BaseModel):
    scope: str = "today"


class AiPlanSuggestion(_BaseModel):
    todo_id: int
    todo_name: str
    suggested_start: str
    suggested_end: str
    reason: str = ""


class AiPlanResponse(_BaseModel):
    suggestions: list[AiPlanSuggestion] = []
    summary: str = ""


_AI_PLAN_SYSTEM = (
    "你是一个智能时间规划助手。根据用户的待办事项列表，为用户规划合理的时间安排。\n\n"
    "规划原则（必须严格遵守）：\n"
    "1. 已有明确时间的待办，保持不变\n"
    "2. 没有时间的待办，根据优先级和预估耗时安排到空闲时段\n"
    "3. 高优先级的待办尽量安排在上午精力最好的时候\n"
    "4. 会议/社交类安排在下午\n"
    "5. 每个待办之间留 15-30 分钟缓冲\n"
    "6. 午餐时间 12:00-13:00 不安排工作\n"
    "7. 工作时间默认 9:00-22:00\n"
    "8. **绝对禁止时间重叠**：任何两个待办的时间段不能有任何交叉。"
    "每个待办结束后，下一个待办才能开始。"
    "安排前请先在脑中列出已占用的时间段，再逐个填入空闲段。\n\n"
    "输出必须是 JSON，格式：\n"
    '{"suggestions": [{"todo_id": 1, "todo_name": "xxx", "suggested_start": "2026-03-31T09:00:00+08:00", '
    '"suggested_end": "2026-03-31T10:00:00+08:00", "reason": "高优先级任务，安排在上午"}], '
    '"summary": "一句话总结今天的安排"}\n\n'
    "只输出 JSON，不要解释。"
)


def _resolve_overlaps(suggestions: list[dict]) -> list[dict]:
    """Programmatic overlap resolution: shift overlapping suggestions forward.

    Sorts by start time, then for each suggestion checks if it overlaps the
    previous one.  If it does, shift it to start right after the previous ends
    (preserving its duration).
    """
    from datetime import datetime as _dt  # noqa: PLC0415

    parsed: list[tuple[_dt, _dt, dict]] = []
    for s in suggestions:
        try:
            start = _dt.fromisoformat(s["suggested_start"])
            end = _dt.fromisoformat(s["suggested_end"])
            if end <= start:
                end = start + timedelta(hours=1)
            parsed.append((start, end, s))
        except (KeyError, ValueError):
            parsed.append((_dt.min, _dt.min, s))

    parsed.sort(key=lambda x: x[0])

    resolved: list[dict] = []
    prev_end: _dt | None = None
    for start, end, s in parsed:
        if start == _dt.min:
            resolved.append(s)
            continue
        duration = end - start
        if prev_end and start < prev_end:
            start = prev_end + timedelta(minutes=15)
            end = start + duration
            s = {**s, "suggested_start": start.isoformat(), "suggested_end": end.isoformat()}
        prev_end = end
        resolved.append(s)

    return resolved


@router.post("/ai-plan", response_model=AiPlanResponse)
async def ai_plan(
    req: AiPlanRequest,
    service: TodoService = Depends(get_todo_service),
):
    """AI 智能规划时间安排"""
    from openai import OpenAI  # noqa: PLC0415
    from util.base_paths import get_user_data_dir  # noqa: PLC0415
    from util.settings import settings  # noqa: PLC0415
    from util.time_utils import get_local_now  # noqa: PLC0415

    agent_cfg = settings.get("llm.agent", {}) or {}
    api_key = str(agent_cfg.get("api_key", "") or "").strip() or settings.llm.api_key
    base_url = str(agent_cfg.get("base_url", "") or "").strip() or settings.llm.base_url
    model_id = str(agent_cfg.get("model", "") or "").strip() or settings.llm.model

    llm_client = OpenAI(api_key=api_key, base_url=base_url)

    result = service.list_todos(limit=200, offset=0, status="active")
    todos = result.get("todos", []) if isinstance(result, dict) else getattr(result, "todos", [])

    now = get_local_now()
    if req.scope == "today":
        scope_label = f"今天（{now.strftime('%Y-%m-%d %A')}）"
        scope_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        scope_end = scope_start + timedelta(days=1)
    else:
        from util.time_utils import get_local_now  # noqa: PLC0415

        weekday = now.weekday()
        scope_start = (now - timedelta(days=weekday)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        scope_end = scope_start + timedelta(days=7)
        scope_label = f"本周（{scope_start.strftime('%m/%d')} - {scope_end.strftime('%m/%d')}）"

    todo_lines = []
    for t in todos:
        tid = t.get("id") if isinstance(t, dict) else getattr(t, "id", None)
        name = t.get("name", "") if isinstance(t, dict) else getattr(t, "name", "")
        priority = (
            t.get("priority", "none") if isinstance(t, dict) else getattr(t, "priority", "none")
        )
        start_time = t.get("start_time") if isinstance(t, dict) else getattr(t, "start_time", None)
        end_time = t.get("end_time") if isinstance(t, dict) else getattr(t, "end_time", None)
        due = t.get("due") if isinstance(t, dict) else getattr(t, "due", None)
        desc = t.get("description", "") if isinstance(t, dict) else getattr(t, "description", "")
        tags = t.get("tags") if isinstance(t, dict) else getattr(t, "tags", None)

        line = f"- ID:{tid} | {name} | 优先级:{priority}"
        if start_time:
            line += f" | 开始:{start_time}"
        if end_time:
            line += f" | 结束:{end_time}"
        if due:
            line += f" | 截止:{due}"
        if tags:
            line += f" | 标签:{','.join(tags) if isinstance(tags, list) else tags}"
        if desc:
            line += f" | 描述:{desc[:100]}"
        todo_lines.append(line)

    if not todo_lines:
        return AiPlanResponse(summary="当前没有待办事项需要安排")

    profile_text = ""
    profile_file = get_user_data_dir() / "memory" / "profile_L4" / "user_profile.md"
    if profile_file.exists():
        profile_text = profile_file.read_text(encoding="utf-8")[:500]

    user_prompt = (
        f"当前时间：{now.strftime('%Y-%m-%d %H:%M')}（{now.strftime('%A')}）\n"
        f"规划范围：{scope_label}\n\n"
        f"用户画像：\n{profile_text[:300] if profile_text else '无'}\n\n"
        f"待办列表：\n" + "\n".join(todo_lines) + "\n\n"
        f"请为用户规划{scope_label}的时间安排。"
    )

    messages = [
        {"role": "system", "content": _AI_PLAN_SYSTEM},
        {"role": "user", "content": user_prompt},
    ]

    from services.agent_activity_tracker import start_activity, stop_activity  # noqa: PLC0415

    aid = start_activity(
        agent_type="calendar_plan",
        task=f"AI 规划 {scope_label}（{len(todos)} 个待办）",
        model=model_id,
    )
    try:

        def _call_llm():
            c = llm_client.chat.completions.create(
                model=model_id, messages=messages, temperature=0.3, max_tokens=2048
            )
            return (c.choices[0].message.content or "").strip() if c.choices else ""

        resp = await asyncio.to_thread(_call_llm)
    except Exception as exc:
        stop_activity(aid, status="error")
        raise HTTPException(status_code=500, detail=f"LLM 调用失败: {exc}") from exc

    if not resp:
        stop_activity(aid)
        return AiPlanResponse(summary="AI 未返回有效规划")

    try:
        clean = resp.strip()
        if clean.startswith("```"):
            clean = clean.split("\n", 1)[1] if "\n" in clean else clean[3:]
        if clean.endswith("```"):
            clean = clean[:-3]
        parsed = _json.loads(clean.strip())
        raw_suggestions = parsed.get("suggestions", [])
        resolved_suggestions = _resolve_overlaps(raw_suggestions)
        stop_activity(aid)
        return AiPlanResponse(
            suggestions=[AiPlanSuggestion(**s) for s in resolved_suggestions],
            summary=parsed.get("summary", ""),
        )
    except Exception:
        stop_activity(aid)
        return AiPlanResponse(summary=resp[:200])
