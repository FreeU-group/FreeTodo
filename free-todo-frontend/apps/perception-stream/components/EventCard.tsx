"use client";

import type { LucideIcon } from "lucide-react";
import { Bot, Eye, Keyboard, MapPin, Mic, Monitor, X } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type {
	PerceptionEvent,
	PerceptionSource,
} from "@/lib/store/perception-stream-store";
import { cn, formatDateTime } from "@/lib/utils";

type SourceStyle = { icon: LucideIcon; accentClassName: string };

const SOURCE_STYLE_MAP: Record<PerceptionSource, SourceStyle> = {
	mic_pc: { icon: Mic, accentClassName: "text-blue-600" },
	mic_hardware: { icon: Mic, accentClassName: "text-indigo-600" },
	ocr_screen: { icon: Monitor, accentClassName: "text-amber-600" },
	ocr_proactive: { icon: Eye, accentClassName: "text-green-600" },
	user_input: { icon: Keyboard, accentClassName: "text-purple-600" },
	ai_output: { icon: Bot, accentClassName: "text-teal-600" },
	gps_mobile: { icon: MapPin, accentClassName: "text-rose-600" },
};

function formatMetadataValue(value: unknown): string {
	if (value === null || value === undefined) return "";
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

export function EventCard({ event }: { event: PerceptionEvent }) {
	const t = useTranslations("perceptionStream");
	const [expanded, setExpanded] = useState(false);
	const [rawPreviewOpen, setRawPreviewOpen] = useState(false);

	const style = SOURCE_STYLE_MAP[event.source];
	const Icon = style.icon;
	const time = formatDateTime(event.timestamp, "HH:mm:ss");

	const metadataEntries = useMemo(() => {
		const entries = Object.entries(event.metadata ?? {}).filter(([, v]) => v !== null && v !== undefined);
		return entries.slice(0, 6);
	}, [event.metadata]);

	const raw =
		typeof event.content_raw === "string" && event.content_raw.length > 0
			? event.content_raw
			: null;

	const showThumbnail = raw && (raw.startsWith("/assets/") || raw.startsWith("/api/"));
	const canOpenRaw = raw && (raw.startsWith("/") || raw.startsWith("http://") || raw.startsWith("https://"));

	return (
		<div className="rounded-lg border bg-background p-3 shadow-sm">
			<div className="flex items-start justify-between gap-3">
				<div className="flex min-w-0 items-center gap-2">
					<Icon className={cn("h-4 w-4 shrink-0", style.accentClassName)} />
					<span className={cn("text-sm font-medium", style.accentClassName)}>
						{t(event.source)}
					</span>
				</div>
				<div className="shrink-0 text-xs tabular-nums text-muted-foreground">
					{time}
				</div>
			</div>

			<button
				type="button"
				className="mt-2 w-full text-left"
				onClick={() => setExpanded((v) => !v)}
			>
				<div
					className={cn(
						"text-sm leading-snug text-foreground whitespace-pre-wrap break-words",
						!expanded && "max-h-16 overflow-hidden",
					)}
				>
					{event.content_text}
				</div>
			</button>

			{metadataEntries.length > 0 && (
				<div className="mt-2 flex flex-wrap gap-1.5">
					{metadataEntries.map(([k, v]) => (
						<span
							key={k}
							className="rounded-full border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
						>
							{k}:{formatMetadataValue(v)}
						</span>
					))}
				</div>
			)}

			{showThumbnail && raw && (
				<>
					<button
						type="button"
						className="mt-2 block"
						onClick={() => setRawPreviewOpen(true)}
					>
						<Image
							alt="raw"
							src={raw}
							width={128}
							height={80}
							className="h-20 w-32 rounded-md border object-cover cursor-zoom-in"
							unoptimized
						/>
					</button>

					<Dialog open={rawPreviewOpen} onOpenChange={setRawPreviewOpen}>
						<DialogContent className="w-auto max-w-[95vw] p-0">
							<DialogTitle className="sr-only">{t("rawPreviewTitle")}</DialogTitle>
							<div className="flex items-center justify-end border-b border-border px-3 py-2">
								<DialogClose asChild>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										aria-label={t("close")}
									>
										<X className="h-4 w-4" />
									</Button>
								</DialogClose>
							</div>

							<div className="p-3 sm:p-4">
								<Image
									alt="raw"
									src={raw}
									width={1600}
									height={900}
									className="h-auto w-auto max-h-[80vh] max-w-[90vw] rounded-md border object-contain"
									unoptimized
								/>

								<div className="mt-3 flex justify-end gap-2">
									<Button asChild variant="outline" size="sm">
										<a href={raw} target="_blank" rel="noreferrer">
											{t("openRaw")}
										</a>
									</Button>
									<Button asChild variant="outline" size="sm">
										<a href={raw} download>
											{t("download")}
										</a>
									</Button>
								</div>
							</div>
						</DialogContent>
					</Dialog>
				</>
			)}
			{!showThumbnail && canOpenRaw && raw && (
				<button
					type="button"
					className="mt-2 text-xs text-muted-foreground underline underline-offset-2"
					onClick={() => window.open(raw, "_blank")}
				>
					{t("openRaw")}
				</button>
			)}
		</div>
	);
}
