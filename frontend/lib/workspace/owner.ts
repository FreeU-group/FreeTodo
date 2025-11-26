const OWNER_STORAGE_KEY = "lifetrace.workspace.owner";

function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getWorkspaceOwnerId(): string {
  if (typeof window === "undefined") {
    return `human-${uuid()}`;
  }

  const cached = window.localStorage.getItem(OWNER_STORAGE_KEY);
  if (cached) {
    return cached;
  }

  const generated = `human-${uuid()}`;
  window.localStorage.setItem(OWNER_STORAGE_KEY, generated);
  return generated;
}
