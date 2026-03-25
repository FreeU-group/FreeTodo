import { isTauri } from "@/lib/utils/platform";

export type DesktopSettings = {
	apiBaseUrl: string;
	configPath: string;
};

export async function getDesktopSettings(): Promise<DesktopSettings | null> {
	if (!isTauri()) {
		return null;
	}

	const { invoke } = await import("@tauri-apps/api/core");
	return invoke<DesktopSettings>("get_desktop_settings");
}

export async function updateDesktopSettings(
	apiBaseUrl: string,
): Promise<DesktopSettings> {
	if (!isTauri()) {
		throw new Error("Desktop settings are only available in Tauri");
	}

	const { invoke } = await import("@tauri-apps/api/core");
	return invoke<DesktopSettings>("update_desktop_settings", { apiBaseUrl });
}
