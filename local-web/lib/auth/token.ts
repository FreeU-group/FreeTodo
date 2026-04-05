const ACCESS_TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";

function getAccessToken(): string | null {
	if (typeof window === "undefined") return null;
	return localStorage.getItem(ACCESS_TOKEN_KEY);
}

function setAccessToken(token: string): void {
	localStorage.setItem(ACCESS_TOKEN_KEY, token);
}

function getRefreshToken(): string | null {
	if (typeof window === "undefined") return null;
	return localStorage.getItem(REFRESH_TOKEN_KEY);
}

function setRefreshToken(token: string): void {
	localStorage.setItem(REFRESH_TOKEN_KEY, token);
}

function isTokenExpired(token: string): boolean {
	try {
		const payload = JSON.parse(atob(token.split(".")[1]));
		return payload.exp * 1000 < Date.now();
	} catch {
		return true;
	}
}

export async function getValidAccessToken(): Promise<string | null> {
	const token = getAccessToken();
	if (!token) return null;

	if (!isTokenExpired(token)) return token;

	const refreshToken = getRefreshToken();
	if (!refreshToken || isTokenExpired(refreshToken)) {
		clearTokens();
		return null;
	}

	try {
		const response = await fetch("/api/v1/auth/refresh_token", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ refresh_token: refreshToken }),
		});

		if (response.ok) {
			const data = await response.json();
			setAccessToken(data.access_token);
			setRefreshToken(data.refresh_token);
			return data.access_token;
		}
	} catch {
		// Refresh failed silently
	}

	clearTokens();
	return null;
}

export function clearTokens(): void {
	if (typeof window === "undefined") return;
	localStorage.removeItem(ACCESS_TOKEN_KEY);
	localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function clearAllAuthStorage(): void {
	clearTokens();
	if (typeof window === "undefined") return;
	localStorage.removeItem("auth_mode");
	localStorage.removeItem("user_type");
}

export function hasToken(): boolean {
	return !!getAccessToken();
}

export function storeTokens(accessToken: string, refreshToken: string): void {
	setAccessToken(accessToken);
	setRefreshToken(refreshToken);
}
