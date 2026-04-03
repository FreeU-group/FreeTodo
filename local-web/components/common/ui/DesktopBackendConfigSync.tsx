"use client";

import { useEffect } from "react";
import { getDesktopSettings } from "@/lib/desktop-settings";
import { isTauri } from "@/lib/utils/platform";

declare global {
	interface Window {
		__BACKEND_URL__?: string;
	}
}

export function DesktopBackendConfigSync() {
	useEffect(() => {
		if (!isTauri()) {
			return;
		}

		void getDesktopSettings().then((settings) => {
			if (settings?.apiBaseUrl) {
				window.__BACKEND_URL__ = settings.apiBaseUrl;
			}
		});
	}, []);

	return null;
}
