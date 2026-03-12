"""自动化任务路由"""

from fastapi import APIRouter, HTTPException

from schemas.automation import (
    AutomationTaskCreate,
    AutomationTaskListResponse,
    AutomationTaskResponse,
    AutomationTaskUpdate,
)
from services.automation_task_service import AutomationTaskService

router = APIRouter(prefix="/api/automation", tags=["automation"])


@router.get("/tasks", response_model=AutomationTaskListResponse)
async def list_tasks():
    service = AutomationTaskService()
    tasks = service.list_tasks()
    return AutomationTaskListResponse(
        total=len(tasks),
        tasks=[AutomationTaskResponse(**task) for task in tasks],
    )


@router.get("/tasks/{task_id}", response_model=AutomationTaskResponse)
async def get_task(task_id: int):
    service = AutomationTaskService()
    task = service.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    return task


@router.post("/tasks", response_model=AutomationTaskResponse)
async def create_task(request: AutomationTaskCreate):
    service = AutomationTaskService()
    task = service.create_task(
        name=request.name,
        description=request.description,
        enabled=request.enabled,
        schedule=request.schedule,
        action=request.action,
    )
    if not task:
        raise HTTPException(status_code=500, detail="创建任务失败")
    return task


@router.put("/tasks/{task_id}", response_model=AutomationTaskResponse)
async def update_task(task_id: int, request: AutomationTaskUpdate):
    service = AutomationTaskService()
    task = service.update_task(
        task_id,
        name=request.name,
        description=request.description,
        enabled=request.enabled,
        schedule=request.schedule,
        action=request.action,
    )
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    return task


@router.delete("/tasks/{task_id}")
async def delete_task(task_id: int):
    service = AutomationTaskService()
    if not service.delete_task(task_id):
        raise HTTPException(status_code=404, detail="任务不存在")
    return {"success": True}


@router.post("/tasks/{task_id}/run")
async def run_task(task_id: int):
    service = AutomationTaskService()
    task = service.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    success = service.run_task(task_id)
    if not success:
        raise HTTPException(status_code=400, detail="任务执行失败")
    return {"success": True}


@router.post("/tasks/{task_id}/pause")
async def pause_task(task_id: int):
    service = AutomationTaskService()
    task = service.update_task(
        task_id,
        name=None,
        description=None,
        enabled=False,
        schedule=None,
        action=None,
    )
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    return {"success": True}


@router.post("/tasks/{task_id}/resume")
async def resume_task(task_id: int):
    service = AutomationTaskService()
    task = service.update_task(
        task_id,
        name=None,
        description=None,
        enabled=True,
        schedule=None,
        action=None,
    )
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    return {"success": True}
