export type AuthMode = "local" | "cloud";

const AUTH_MODE_KEY = "auth_mode";

export function getAuthMode(): AuthMode {
	if (typeof window === "undefined") return "local";
	return (localStorage.getItem(AUTH_MODE_KEY) as AuthMode) || "local";
}

export function setAuthMode(mode: AuthMode): void {
	localStorage.setItem(AUTH_MODE_KEY, mode);
}

export function isLocalMode(): boolean {
	return getAuthMode() === "local";
}

export function isCloudMode(): boolean {
	return getAuthMode() === "cloud";
}
