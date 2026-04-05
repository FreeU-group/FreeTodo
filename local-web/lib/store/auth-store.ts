import { create } from "zustand";
import type { AuthMode } from "@/lib/auth/auth-mode";
import { getAuthMode, setAuthMode as persistAuthMode } from "@/lib/auth/auth-mode";
import {
	clearAllAuthStorage,
	hasToken,
	storeTokens,
} from "@/lib/auth/token";

const PROFILE_ID_KEY = "profile_id";
const PROFILE_NAME_KEY = "profile_name";

interface AuthState {
	isAuthenticated: boolean;
	authMode: AuthMode;
	username: string | null;
	profileId: string | null;
	profileName: string | null;
	isBound: boolean;

	login: (accessToken: string, refreshToken: string, mode: AuthMode, profileId?: string) => void;
	logout: () => void;
	hydrate: () => void;
	fetchProfile: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
	isAuthenticated: false,
	authMode: "local",
	username: null,
	profileId: null,
	profileName: null,
	isBound: false,

	login: (accessToken, refreshToken, mode, profileId) => {
		storeTokens(accessToken, refreshToken);
		persistAuthMode(mode);
		if (profileId) {
			localStorage.setItem(PROFILE_ID_KEY, profileId);
		}
		set({ isAuthenticated: true, authMode: mode, profileId: profileId ?? null });
	},

	logout: () => {
		clearAllAuthStorage();
		localStorage.removeItem(PROFILE_ID_KEY);
		localStorage.removeItem(PROFILE_NAME_KEY);
		set({
			isAuthenticated: false,
			authMode: "local",
			username: null,
			profileId: null,
			profileName: null,
			isBound: false,
		});
	},

	hydrate: () => {
		const authenticated = hasToken();
		const mode = getAuthMode();
		const profileId = localStorage.getItem(PROFILE_ID_KEY);
		const profileName = localStorage.getItem(PROFILE_NAME_KEY);
		set({ isAuthenticated: authenticated, authMode: mode, profileId, profileName });
		if (authenticated && !get().username) {
			get().fetchProfile();
		}
	},

	fetchProfile: async () => {
		try {
			const token = localStorage.getItem("access_token");
			if (!token) return;
			const res = await fetch("/api/v1/auth/me", {
				headers: { Authorization: `Bearer ${token}` },
			});
			if (!res.ok) return;
			const data = await res.json();
			const updates: Partial<AuthState> = { username: data.username };
			if (data.profile_id) {
				updates.profileId = data.profile_id;
				localStorage.setItem(PROFILE_ID_KEY, data.profile_id);
			}
			if (data.profile_name) {
				updates.profileName = data.profile_name;
				localStorage.setItem(PROFILE_NAME_KEY, data.profile_name);
			}
			if (data.is_bound !== undefined) {
				updates.isBound = data.is_bound;
			}
			set(updates);
		} catch {
			// Profile fetch is best-effort; silently ignore failures
		}
	},
}));
