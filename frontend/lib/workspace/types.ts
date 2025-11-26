export type ActorMode = "human" | "ai";

export interface WorkspaceFileSummary {
  path: string;
  name: string;
  size: number;
  updated_at: string;
}

export interface WorkspaceFileResponse extends WorkspaceFileSummary {
  content: string;
}

export interface WorkspaceFileListResponse {
  files: WorkspaceFileSummary[];
}

export interface WorkspaceLock {
  path: string;
  lock_id: string;
  owner: string;
  mode: ActorMode;
  acquired_at: string;
  expires_at: string;
}

export interface WorkspaceLockStatusResponse {
  lock: WorkspaceLock | null;
}
