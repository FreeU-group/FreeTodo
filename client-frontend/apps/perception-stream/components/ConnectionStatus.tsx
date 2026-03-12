"use client";

import { useTranslations } from "next-intl";
import type { PerceptionConnectionState } from "@/lib/store/perception-stream-store";
import { cn } from "@/lib/utils";

export function ConnectionStatus({
	connectionState,
}: {
	connectionState: PerceptionConnectionState;
}) {
	const t = useTranslations("perceptionStream");

	const isConnected = connectionState === "connected";
	const isReconnecting = connectionState === "reconnecting" || connectionState === "connecting";

	return (
		<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
			<span
				className={cn(
					"h-2 w-2 rounded-full",
					isConnected && "bg-green-500 animate-pulse",
					!isConnected && isReconnecting && "bg-amber-500 animate-pulse",
					!isConnected && !isReconnecting && "bg-red-500",
				)}
			/>
			{isConnected
				? t("connected")
				: isReconnecting
					? t("reconnecting")
					: t("disconnected")}
		</div>
	);
}
