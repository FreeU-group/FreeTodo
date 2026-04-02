"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { isDesktop } from "@/lib/utils/platform";
import { getRuntimeBackendUrl } from "@/lib/runtime-backend-url";

interface BackendReadyGateProps {
	children: ReactNode;
}

function getBackendHealthUrl(): string {
	const baseUrl = getRuntimeBackendUrl();
	return `${baseUrl}/ready`;
}

export function BackendReadyGate({ children }: BackendReadyGateProps) {
	const t = useTranslations("appBoot");
	const [ready, setReady] = useState(() => !isDesktop());
	const [phase, setPhase] = useState<"boot" | "backend">("boot");

	useEffect(() => {
		if (!isDesktop()) return;

		let cancelled = false;
		const healthUrl = getBackendHealthUrl();
		setPhase("backend");

		const checkHealth = async () => {
			try {
				const response = await fetch(healthUrl, { cache: "no-store" });
				if (response.ok && !cancelled) {
					setReady(true);
				}
			} catch {
				// Ignore until backend is ready
			}
		};

		const interval = setInterval(checkHealth, 500);
		checkHealth();

		return () => {
			cancelled = true;
			clearInterval(interval);
		};
	}, []);

	if (!ready) {
		return (
			<div className="fixed inset-0 z-[9999] flex items-center justify-center bg-neutral-950/90 text-white backdrop-blur">
				<div className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-neutral-900/80 px-6 py-5 shadow-lg">
					<div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
					<div className="text-sm font-medium tracking-wide">
						{phase === "boot" ? t("startingFrontend") : t("connectingBackend")}
					</div>
					<div className="text-xs text-white/60">{t("firstLaunchHint")}</div>
				</div>
			</div>
		);
	}

	return <>{children}</>;
}
