"use client";

import { Radio, UserX } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { PanelHeader } from "@/components/common/layout/PanelHeader";
import { Button } from "@/components/ui/button";
import { usePerceptionStreamStore } from "@/lib/store/perception-stream-store";
import { ConnectionStatus } from "./components/ConnectionStatus";
import { EventTimeline } from "./components/EventTimeline";
import { SourceFilter } from "./components/SourceFilter";
import { SourceStatusBar } from "./components/SourceStatusBar";
import { useFilteredEvents } from "./hooks/useFilteredEvents";

type PerceptionStreamPanelProps = {
	autoConnect?: boolean;
	showSourceStatusBar?: boolean;
};

export function PerceptionStreamPanel({
	autoConnect = true,
	showSourceStatusBar = true,
}: PerceptionStreamPanelProps = {}) {
	const t = useTranslations("perceptionStream");

	const events = usePerceptionStreamStore((s) => s.events);
	const connectionState = usePerceptionStreamStore((s) => s.connectionState);
	const connect = usePerceptionStreamStore((s) => s.connect);
	const disconnect = usePerceptionStreamStore((s) => s.disconnect);
	const loadRecentEvents = usePerceptionStreamStore((s) => s.loadRecentEvents);

	const filteredEvents = useFilteredEvents(events);
	const [clearingSpk, setClearingSpk] = useState(false);

	const handleClearSpeakers = useCallback(async () => {
		if (!window.confirm(t("clearSpeakersConfirm"))) return;
		setClearingSpk(true);
		try {
			const res = await fetch("/api/audio/speakers", { method: "DELETE" });
			if (!res.ok) throw new Error(`${res.status}`);
			const data = (await res.json()) as { cleared?: number };
			window.alert(t("clearSpeakersSuccess", { count: data.cleared ?? 0 }));
		} catch {
			window.alert(t("clearSpeakersFailed"));
		} finally {
			setClearingSpk(false);
		}
	}, [t]);

	useEffect(() => {
		if (!autoConnect) {
			disconnect();
			return;
		}
		connect();
		return () => disconnect();
	}, [autoConnect, connect, disconnect]);

	return (
		<div className="flex h-full flex-col overflow-hidden bg-background">
			<PanelHeader
				icon={Radio}
				title={t("title")}
				actions={
					<div className="flex items-center gap-2">
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="h-7 px-2 text-xs"
							onClick={() => void loadRecentEvents(50)}
						>
							{t("loadRecent")}
						</Button>
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="h-7 px-2 text-xs"
							onClick={() => void loadRecentEvents(200)}
						>
							{t("loadMore")}
						</Button>
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="h-7 px-2 text-xs gap-1"
							disabled={clearingSpk}
							onClick={() => void handleClearSpeakers()}
						>
							<UserX className="h-3.5 w-3.5" />
							{t("clearSpeakers")}
						</Button>
						<ConnectionStatus connectionState={connectionState} />
					</div>
				}
			/>
			<SourceFilter />
			{showSourceStatusBar ? <SourceStatusBar /> : null}
			<EventTimeline events={filteredEvents} />
		</div>
	);
}
