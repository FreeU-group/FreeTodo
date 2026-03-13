"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

const CHANNEL_NAME = "ft-query-sync";

type QuerySyncMessage = {
	version: 1;
	action: "invalidate";
	queryKey?: ReadonlyArray<unknown>;
};

/**
 * Sync query invalidation across browser windows.
 */
export function QuerySync() {
	const queryClient = useQueryClient();

	useEffect(() => {
		if (typeof window === "undefined") return;
		const channel = new BroadcastChannel(CHANNEL_NAME);

		const handleMessage = (event: MessageEvent<QuerySyncMessage>) => {
			const data = event.data;
			if (!data || data.version !== 1 || data.action !== "invalidate") return;
			void queryClient.invalidateQueries(
				data.queryKey ? { queryKey: data.queryKey } : undefined,
			);
			void queryClient.refetchQueries(
				data.queryKey ? { queryKey: data.queryKey } : undefined,
			);
		};

		channel.addEventListener("message", handleMessage);
		return () => {
			channel.removeEventListener("message", handleMessage);
			channel.close();
		};
	}, [queryClient]);

	return null;
}

export function broadcastQueryInvalidation(
	queryKey?: ReadonlyArray<unknown>,
) {
	if (typeof window === "undefined") return;
	const channel = new BroadcastChannel(CHANNEL_NAME);
	channel.postMessage({ version: 1, action: "invalidate", queryKey });
	channel.close();
}
