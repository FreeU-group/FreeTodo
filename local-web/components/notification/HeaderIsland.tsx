"use client";

import { Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

function formatCurrentTime(t: ReturnType<typeof useTranslations>): {
	time: string;
	date: string;
} {
	const now = new Date();
	const hours = now.getHours().toString().padStart(2, "0");
	const minutes = now.getMinutes().toString().padStart(2, "0");
	const time = `${hours}:${minutes}`;
	const month = (now.getMonth() + 1).toString().padStart(2, "0");
	const day = now.getDate().toString().padStart(2, "0");
	const date = t("dateFormat", { month, day });
	return { time, date };
}

export function HeaderIsland() {
	const t = useTranslations("todoExtraction");
	const [currentTime, setCurrentTime] = useState(() => formatCurrentTime(t));

	useEffect(() => {
		const updateTime = () => setCurrentTime(formatCurrentTime(t));
		updateTime();
		const interval = setInterval(updateTime, 1000);
		return () => clearInterval(interval);
	}, [t]);

	return (
		<div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50">
			<div
				className="relative flex items-center gap-2 overflow-hidden rounded-full
					bg-background/95 backdrop-blur-sm border border-border/50
					shadow-lg px-3 py-2
					hover:shadow-2xl hover:shadow-primary/5 hover:border-primary/20
					hover:bg-background transition-all duration-300
					cursor-default"
			>
				<Clock className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
				<div className="flex items-baseline gap-1.5">
					<span className="text-sm font-medium text-foreground tabular-nums">
						{currentTime.time}
					</span>
					<span className="text-xs text-muted-foreground/70 font-normal">
						{currentTime.date}
					</span>
				</div>
			</div>
		</div>
	);
}
