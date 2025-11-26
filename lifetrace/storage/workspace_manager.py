from __future__ import annotations

import threading
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal, Sequence

ActorMode = Literal["human", "ai"]


class WorkspaceError(Exception):
    """Base workspace exception."""


class WorkspaceSecurityError(WorkspaceError):
    """Raised when a path escapes the workspace sandbox."""


class WorkspaceValidationError(WorkspaceError):
    """Raised when user input fails validation."""


class WorkspaceLockError(WorkspaceError):
    """Raised when lock acquisition or validation fails."""


class WorkspaceConflictError(WorkspaceError):
    """Raised when a save would overwrite newer content."""


@dataclass(slots=True)
class WorkspaceFileMetadata:
    path: Path
    relative_path: str
    size: int
    updated_at: datetime


@dataclass(slots=True)
class WorkspaceLock:
    id: str
    path: Path
    owner: str
    mode: ActorMode
    acquired_at: datetime
    expires_at: datetime

    def is_expired(self) -> bool:
        return datetime.now(timezone.utc) >= self.expires_at

    def refresh(self, duration_seconds: int) -> None:
        self.expires_at = datetime.now(timezone.utc) + timedelta(seconds=duration_seconds)


class WorkspaceManager:
    """Manage workspace files and edit locks."""

    def __init__(
        self,
        workspace_dir: str | Path,
        allowed_extensions: Sequence[str] | None = None,
        lock_timeout_seconds: int = 300,
    ) -> None:
        self.workspace_dir = Path(workspace_dir).resolve()
        
        self.workspace_dir.mkdir(parents=True, exist_ok=True)
        self.allowed_extensions = {
            (ext if ext.startswith(".") else f".{ext}").lower()
            for ext in (allowed_extensions or [".md", ".markdown"])
        }
        self.lock_timeout_seconds = max(lock_timeout_seconds, 5)
        self._locks: dict[str, WorkspaceLock] = {}
        self._lock = threading.RLock()

    # ------------------------------------------------------------------
    # File operations
    # ------------------------------------------------------------------
    def list_markdown_files(self) -> list[WorkspaceFileMetadata]:
        files: list[WorkspaceFileMetadata] = []
        for path in self.workspace_dir.rglob("*"):
            if not path.is_file():
                continue
            if path.suffix.lower() not in self.allowed_extensions:
                continue
            files.append(self._build_metadata(path))
        files.sort(key=lambda meta: meta.relative_path)
        return files

    def read_file(self, relative_path: str) -> tuple[WorkspaceFileMetadata, str]:
        file_path = self._resolve_path(relative_path, must_exist=True)
        try:
            content = file_path.read_text(encoding="utf-8")
        except UnicodeDecodeError as exc:
            raise WorkspaceValidationError("文件不是有效的 UTF-8 文本") from exc
        return self._build_metadata(file_path), content

    def write_file(
        self,
        relative_path: str,
        content: str,
        actor_mode: ActorMode,
        *,
        lock_id: str | None = None,
        last_known_modification: datetime | None = None,
    ) -> WorkspaceFileMetadata:
        file_path = self._resolve_path(relative_path)
        self._ensure_actor_can_write(file_path, actor_mode, lock_id)

        if last_known_modification and file_path.exists():
            current_meta = self._build_metadata(file_path)
            if current_meta.updated_at > last_known_modification:
                raise WorkspaceConflictError("文件已被其他来源更新，请刷新后重试")

        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text(content, encoding="utf-8")
        return self._build_metadata(file_path)

    # ------------------------------------------------------------------
    # Lock management
    # ------------------------------------------------------------------
    def acquire_lock(
        self,
        relative_path: str,
        owner: str,
        mode: ActorMode,
        duration_seconds: int | None = None,
    ) -> WorkspaceLock:
        file_path = self._resolve_path(relative_path)
        with self._lock:
            self._cleanup_expired_locks()
            key = self._path_key(file_path)
            current = self._locks.get(key)
            if current and not current.is_expired():
                if current.owner == owner and current.mode == mode:
                    current.refresh(duration_seconds or self.lock_timeout_seconds)
                    return current
                raise WorkspaceLockError("文件已被其他编辑器锁定")

            lock = WorkspaceLock(
                id=str(uuid.uuid4()),
                path=file_path,
                owner=owner,
                mode=mode,
                acquired_at=datetime.now(timezone.utc),
                expires_at=datetime.now(timezone.utc)
                + timedelta(seconds=duration_seconds or self.lock_timeout_seconds),
            )
            self._locks[key] = lock
            return lock

    def release_lock(
        self,
        relative_path: str,
        owner: str,
        lock_id: str | None = None,
        *,
        force: bool = False,
    ) -> bool:
        file_path = self._resolve_path(relative_path)
        with self._lock:
            key = self._path_key(file_path)
            existing = self._locks.get(key)
            if not existing:
                return False
            if not force and existing.owner != owner:
                raise WorkspaceLockError("无法释放其他拥有者的锁")
            if not force and lock_id and existing.id != lock_id:
                raise WorkspaceLockError("锁ID不匹配，无法释放")
            self._locks.pop(key, None)
            return True

    def get_lock(self, relative_path: str) -> WorkspaceLock | None:
        file_path = self._resolve_path(relative_path)
        with self._lock:
            lock = self._locks.get(self._path_key(file_path))
            if lock and lock.is_expired():
                self._locks.pop(self._path_key(file_path), None)
                return None
            return lock

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _resolve_path(self, relative_path: str, *, must_exist: bool = False) -> Path:
        if not relative_path:
            raise WorkspaceValidationError("必须提供文件路径")

        rel_path = Path(relative_path)
        if rel_path.is_absolute():
            raise WorkspaceSecurityError("不允许使用绝对路径")

        candidate = (self.workspace_dir / rel_path).resolve()
        try:
            candidate.relative_to(self.workspace_dir)
        except ValueError as exc:
            raise WorkspaceSecurityError("文件路径超出工作区") from exc

        if candidate.suffix.lower() not in self.allowed_extensions:
            raise WorkspaceValidationError("仅支持 Markdown 文件 (.md/.markdown)")

        if must_exist and not candidate.exists():
            raise FileNotFoundError(relative_path)

        return candidate

    def _build_metadata(self, file_path: Path) -> WorkspaceFileMetadata:
        stat = file_path.stat()
        return WorkspaceFileMetadata(
            path=file_path,
            relative_path=file_path.relative_to(self.workspace_dir).as_posix(),
            size=stat.st_size,
            updated_at=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc),
        )

    def _ensure_actor_can_write(self, file_path: Path, actor_mode: ActorMode, lock_id: str | None) -> None:
        with self._lock:
            self._cleanup_expired_locks()
            lock = self._locks.get(self._path_key(file_path))
            if not lock:
                return
            if lock.mode != actor_mode:
                raise WorkspaceLockError("该文件目前由其他模式占用，无法写入")
            if lock_id and lock.id != lock_id:
                raise WorkspaceLockError("提供的锁ID与现有锁不匹配")
            if lock.is_expired():
                self._locks.pop(self._path_key(file_path), None)

    def _cleanup_expired_locks(self) -> None:
        expired_keys = [key for key, lock in self._locks.items() if lock.is_expired()]
        for key in expired_keys:
            self._locks.pop(key, None)

    def _path_key(self, path: Path) -> str:
        return str(path)

