"use client";

import { useEffect } from "react";
import { useUiStore } from "@/lib/store/ui-store";

const STORAGE_KEY = "ui-panel-config";

/**
 * Sync UI store changes across browser windows.
 */
export function UiStoreSync() {
	useEffect(() => {
		if (typeof window === "undefined") return;

		const handleStorage = (event: StorageEvent) => {
			if (event.key !== STORAGE_KEY) return;
			useUiStore.persist.rehydrate();
		};

		window.addEventListener("storage", handleStorage);
		return () => window.removeEventListener("storage", handleStorage);
	}, []);

	return null;
}
