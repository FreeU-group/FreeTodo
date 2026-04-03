"use client";

import { useEffect, useRef } from "react";
import { customFetcher } from "@/lib/api/fetcher";
import type { PanelFeature } from "@/lib/config/panel-config";
import { getPanelPlugins } from "@/lib/plugins/registry";
import { useUiStore } from "@/lib/store/ui-store";

type CapabilitiesResponse = {
	enabledModules?: string[];
	availableModules?: string[];
	disabledModules?: string[];
	missingDeps?: Record<string, string[]>;
};

function computeBackendDisabledFeatures(
	capabilities: CapabilitiesResponse,
): PanelFeature[] {
	const enabled = new Set(capabilities.enabledModules ?? []);
	const available = new Set(capabilities.availableModules ?? []);
	const activeModules = new Set(
		[...enabled].filter((module) => available.has(module)),
	);

	return getPanelPlugins()
		.filter((plugin) => {
			if (!plugin.backendModules || plugin.backendModules.length === 0) {
				return false;
			}
			return plugin.backendModules.some(
				(module) => !activeModules.has(module),
			);
		})
		.map((plugin) => plugin.id);
}

export function CapabilitiesSync() {
	const setBackendDisabledFeatures = useUiStore(
		(state) => state.setBackendDisabledFeatures,
	);
	const hasRequested = useRef(false);

	useEffect(() => {
		if (hasRequested.current) return;
		hasRequested.current = true;

		const loadCapabilities = async () => {
			try {
				const data = await customFetcher<CapabilitiesResponse>(
					"/api/capabilities",
					{
						method: "GET",
					},
				);
				if (!data) return;
				const backendDisabled = computeBackendDisabledFeatures(data);
				setBackendDisabledFeatures(backendDisabled);
			} catch (error) {
				console.warn("[capabilities] Failed to load backend capabilities", error);
			}
		};

		void loadCapabilities();
	}, [setBackendDisabledFeatures]);

	return null;
}
