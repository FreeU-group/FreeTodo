from __future__ import annotations

"""Workspace file management API."""

from fastapi import APIRouter, HTTPException, Query, status

from lifetrace.routers import dependencies as deps
from lifetrace.schemas.workspace import (
    AcquireWorkspaceLockRequest,
    ReleaseWorkspaceLockRequest,
    SaveWorkspaceFileRequest,
    WorkspaceFileListResponse,
    WorkspaceFileResponse,
    WorkspaceFileSummary,
    WorkspaceLockResponse,
    WorkspaceLockStatusResponse,
)
from lifetrace.storage.workspace_manager import (
    WorkspaceFileMetadata,
    WorkspaceConflictError,
    WorkspaceLockError,
    WorkspaceLock as WorkspaceLockModel,
    WorkspaceManager,
    WorkspaceSecurityError,
    WorkspaceValidationError,
)

router = APIRouter(prefix="/api/workspace", tags=["workspace"])


def _get_manager() -> WorkspaceManager:
    manager = deps.workspace_manager
    if manager is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Workspace 服务未初始化")
    return manager


def _summary_payload(meta: WorkspaceFileMetadata) -> dict:
    return {
        "path": meta.relative_path,
        "name": meta.path.name,
        "size": meta.size,
        "updated_at": meta.updated_at,
    }


def _lock_to_response(lock: WorkspaceLockModel, manager: WorkspaceManager) -> WorkspaceLockResponse:
    relative_path = lock.path.relative_to(manager.workspace_dir).as_posix()
    return WorkspaceLockResponse(
        path=relative_path,
        lock_id=lock.id,
        owner=lock.owner,
        mode=lock.mode,
        acquired_at=lock.acquired_at,
        expires_at=lock.expires_at,
    )


def _handle_workspace_error(exc: Exception) -> None:
    if isinstance(exc, FileNotFoundError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="文件不存在") from exc
    if isinstance(exc, WorkspaceSecurityError):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    if isinstance(exc, WorkspaceValidationError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if isinstance(exc, WorkspaceConflictError):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    if isinstance(exc, WorkspaceLockError):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    raise exc


@router.get("/files", response_model=WorkspaceFileListResponse)
def list_workspace_files():
    manager = _get_manager()
    try:
        files = manager.list_markdown_files()
    except Exception as exc:  # pragma: no cover - defensive
        _handle_workspace_error(exc)
    return WorkspaceFileListResponse(
        files=[WorkspaceFileSummary(**_summary_payload(meta)) for meta in files]
    )


@router.get("/file", response_model=WorkspaceFileResponse)
def read_workspace_file(path: str = Query(..., description="相对路径，例如 notes/todo.md")):
    manager = _get_manager()
    try:
        metadata, content = manager.read_file(path)
    except Exception as exc:
        _handle_workspace_error(exc)
    return WorkspaceFileResponse(**_summary_payload(metadata), content=content)


@router.put("/file", response_model=WorkspaceFileResponse)
def save_workspace_file(payload: SaveWorkspaceFileRequest):
    manager = _get_manager()
    try:
        metadata = manager.write_file(
            payload.path,
            payload.content,
            payload.actor,
            lock_id=payload.lock_id,
            last_known_modification=payload.last_known_modification,
        )
    except Exception as exc:
        _handle_workspace_error(exc)
    return WorkspaceFileResponse(**_summary_payload(metadata), content=payload.content)


@router.post("/lock", response_model=WorkspaceLockResponse)
def acquire_workspace_lock(payload: AcquireWorkspaceLockRequest):
    manager = _get_manager()
    try:
        lock = manager.acquire_lock(
            payload.path,
            payload.owner,
            payload.mode,
            duration_seconds=payload.duration_seconds,
        )
    except Exception as exc:
        _handle_workspace_error(exc)
    return _lock_to_response(lock, manager)


@router.post("/lock/release", status_code=status.HTTP_200_OK)
def release_workspace_lock(payload: ReleaseWorkspaceLockRequest):
    manager = _get_manager()
    try:
        released = manager.release_lock(
            payload.path,
            payload.owner,
            lock_id=payload.lock_id,
            force=payload.force,
        )
    except Exception as exc:
        _handle_workspace_error(exc)
    return {"released": released}


@router.get("/lock", response_model=WorkspaceLockStatusResponse)
def get_workspace_lock(path: str = Query(..., description="锁定文件路径")):
    manager = _get_manager()
    lock = manager.get_lock(path)
    if not lock:
        return WorkspaceLockStatusResponse(lock=None)
    return WorkspaceLockStatusResponse(lock=_lock_to_response(lock, manager))
