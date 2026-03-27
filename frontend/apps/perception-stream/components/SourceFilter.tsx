"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
	type PerceptionModality,
	type PerceptionSource,
	usePerceptionStreamStore,
} from "@/lib/store/perception-stream-store";

const SOURCES: PerceptionSource[] = [
	"mic_pc",
	"mic_hardware",
	"ocr_screen",
	"ocr_proactive",
	"user_input",
	"ai_output",
	"gps_mobile",
	"app_switch",
];

const MODALITIES: PerceptionModality[] = ["audio", "image", "text", "location"];

export function SourceFilter() {
	const t = useTranslations("perceptionStream");

	const filter = usePerceptionStreamStore((s) => s.filter);
	const setFilter = usePerceptionStreamStore((s) => s.setFilter);
	const clearEvents = usePerceptionStreamStore((s) => s.clearEvents);

	const toggleSource = (source: PerceptionSource) => {
		const next = new Set(filter.sources);
		if (next.has(source)) next.delete(source);
		else next.add(source);
		setFilter({ sources: next });
	};

	const toggleModality = (modality: PerceptionModality) => {
		const next = new Set(filter.modalities);
		if (next.has(modality)) next.delete(modality);
		else next.add(modality);
		setFilter({ modalities: next });
	};

	return (
		<div className="shrink-0 border-b bg-background px-4 py-3">
			<div className="flex flex-col gap-2">
				<div className="flex items-center justify-between gap-2">
					<div className="text-xs font-medium text-muted-foreground">
						{t("filterBySource")}
					</div>
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="h-7 px-2 text-xs"
						onClick={clearEvents}
					>
						{t("clearAll")}
					</Button>
				</div>

				<div className="flex flex-wrap gap-2">
					{SOURCES.map((s) => {
						const selected = filter.sources.has(s);
						return (
							<Button
								key={s}
								type="button"
								variant={selected ? "default" : "outline"}
								size="sm"
								className="h-7 px-2 text-xs"
								onClick={() => toggleSource(s)}
							>
								{t(s)}
							</Button>
						);
					})}
				</div>

				<div className="pt-1 text-xs font-medium text-muted-foreground">
					{t("filterByModality")}
				</div>
				<div className="flex flex-wrap gap-2">
					{MODALITIES.map((m) => {
						const selected = filter.modalities.has(m);
						return (
							<Button
								key={m}
								type="button"
								variant={selected ? "default" : "outline"}
								size="sm"
								className="h-7 px-2 text-xs"
								onClick={() => toggleModality(m)}
							>
								{t(m)}
							</Button>
						);
					})}
				</div>
			</div>
		</div>
	);
}
