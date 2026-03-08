"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { PerceptionSource } from "@/lib/store/perception-stream-store";
import { cn } from "@/lib/utils";

type PerceptionSourceStatus = {
	enabled?: boolean;
	online?: boolean;
};

type PerceptionSourceStatusResponse = Record<string, PerceptionSourceStatus | boolean>;

const STATUS_PATH_CANDIDATES = ["/api/perception/status", "/perception/status"] as const;

const SOURCES: PerceptionSource[] = [
	"mic_pc",
	"mic_hardware",
	"ocr_screen",
	"ocr_proactive",
	"user_input",
	"ai_output",
	"gps_mobile",
];

async function fetchStatus(): Promise<PerceptionSourceStatusResponse | null> {
	for (const path of STATUS_PATH_CANDIDATES) {
		try {
			const res = await fetch(path);
			if (res.ok) return (await res.json()) as PerceptionSourceStatusResponse;
		} catch {}

		try {
			const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8100";
			const res = await fetch(`${baseUrl}${path}`);
			if (res.ok) return (await res.json()) as PerceptionSourceStatusResponse;
		} catch {}
	}
	return null;
}

function getIndicatorState(v: unknown): boolean | null {
	if (typeof v === "boolean") return v;
	if (typeof v === "object" && v !== null) {
		const sourceStatus = v as { enabled?: unknown; online?: unknown };
		const enabled =
			typeof sourceStatus.enabled === "boolean" ? sourceStatus.enabled : undefined;
		const online = typeof sourceStatus.online === "boolean" ? sourceStatus.online : null;
		if (enabled === false && online !== true) return null;
		return online;
	}
	return null;
}

export function SourceStatusBar() {
	const t = useTranslations("perceptionStream");
	const [status, setStatus] = useState<PerceptionSourceStatusResponse | null>(null);

	useEffect(() => {
		let stopped = false;

		const tick = async () => {
			const next = await fetchStatus();
			if (stopped) return;
			if (next) setStatus(next);
		};

		void tick();
		const id = setInterval(() => void tick(), 3000);
		return () => {
			stopped = true;
			clearInterval(id);
		};
	}, []);

	return (
		<div className="shrink-0 border-b bg-background px-4 py-2">
			<div className="flex flex-wrap items-center gap-2">
				<span className="text-xs font-medium text-muted-foreground">
					{t("sourceStatus")}
				</span>
				{SOURCES.map((s) => {
					const online = status ? getIndicatorState(status[s]) : null;
					return (
						<span
							key={s}
							className="inline-flex items-center gap-1.5 rounded-full border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
						>
							<span
								className={cn(
									"h-2 w-2 rounded-full",
									online === true && "bg-green-500",
									online === false && "bg-red-500",
									online === null && "bg-gray-400",
								)}
							/>
							{t(s)}
						</span>
					);
				})}
			</div>
		</div>
	);
}
