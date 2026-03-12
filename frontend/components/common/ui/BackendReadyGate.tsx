"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { isDesktop, isTauri } from "@/lib/utils/platform";

interface BackendReadyGateProps {
	children: ReactNode;
}

function getBackendHealthUrl(): string {
	const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8100";
	return `${baseUrl}/health`;
}

export function BackendReadyGate({ children }: BackendReadyGateProps) {
	const [ready, setReady] = useState(false);
	const [visible, setVisible] = useState(true);
	const [phase, setPhase] = useState<"boot" | "backend">("boot");
	const [logs, setLogs] = useState<string[]>([]);

	useEffect(() => {
		if (!isDesktop()) {
			setReady(true);
			setVisible(false);
			return;
		}

		let cancelled = false;
		let unlisten: (() => void) | null = null;
		const healthUrl = getBackendHealthUrl();
		setPhase("backend");

		const setupLogListener = async () => {
			if (!isTauri()) return;
			try {
				const { listen } = await import("@tauri-apps/api/event");
				unlisten = await listen<string>("backend-log", (event) => {
					if (cancelled) return;
					setLogs((prev) => {
						const next = [...prev, event.payload];
						return next.slice(-200);
					});
				});
			} catch (error) {
				setLogs((prev) => [
					...prev,
					`Failed to listen for backend logs: ${String(error)}`,
				]);
			}
		};

		const checkHealth = async () => {
			try {
				const response = await fetch(healthUrl, { cache: "no-store" });
				if (response.ok && !cancelled) {
					setReady(true);
					setVisible(false);
				}
			} catch {
				// Ignore until backend is ready
			}
		};

		const interval = setInterval(checkHealth, 500);
		checkHealth();
		setupLogListener();

		return () => {
			cancelled = true;
			clearInterval(interval);
			if (unlisten) unlisten();
		};
	}, []);

	return (
		<>
			{children}
			{!ready && visible && (
				<div className="fixed inset-0 z-[9999] flex items-center justify-center bg-neutral-950/90 text-white backdrop-blur">
					<div className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-neutral-900/80 px-6 py-5 shadow-lg">
						<div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
						<div className="text-sm font-medium tracking-wide">
							{phase === "boot" ? "正在启动前端界面" : "正在连接后端服务"}
						</div>
						<div className="text-xs text-white/60">首次启动可能需要几秒钟…</div>
						{logs.length > 0 && (
							<div className="mt-2 max-h-40 w-[min(560px,80vw)] overflow-auto rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-[11px] leading-5 text-white/80">
								{logs.map((line, index) => (
									<div key={`${index}-${line.slice(0, 12)}`}>{line}</div>
								))}
							</div>
						)}
					</div>
				</div>
			)}
		</>
	);
}
