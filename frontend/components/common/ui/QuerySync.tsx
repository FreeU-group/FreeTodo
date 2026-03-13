"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

const CHANNEL_NAME = "ft-query-sync";
const STORAGE_KEY = "ft-query-sync";
const POST_MESSAGE_TYPE = "ft-query-sync";
const SENDER_ID =
	typeof window !== "undefined" && "crypto" in window && "randomUUID" in crypto
		? crypto.randomUUID()
		: `sync-${Math.random().toString(36).slice(2)}`;

type QuerySyncMessage = {
	version: 1;
	action: "invalidate";
	queryKey?: ReadonlyArray<unknown>;
	senderId?: string;
};

function isValidMessage(data: unknown): data is QuerySyncMessage {
	if (!data || typeof data !== "object") return false;
	const payload = data as QuerySyncMessage;
	return payload.version === 1 && payload.action === "invalidate";
}

/**
 * Sync query invalidation across browser windows.
 */
export function QuerySync() {
	const queryClient = useQueryClient();

	useEffect(() => {
		if (typeof window === "undefined") return;
		const channel =
			typeof BroadcastChannel !== "undefined"
				? new BroadcastChannel(CHANNEL_NAME)
				: null;

		const handleInvalidate = (data: QuerySyncMessage) => {
			if (data.senderId && data.senderId === SENDER_ID) return;
			void queryClient.invalidateQueries(
				data.queryKey ? { queryKey: data.queryKey } : undefined,
			);
			void queryClient.refetchQueries(
				data.queryKey ? { queryKey: data.queryKey } : undefined,
			);
		};

		const handleMessage = (event: MessageEvent<QuerySyncMessage>) => {
			const data = event.data;
			if (!isValidMessage(data)) return;
			handleInvalidate(data);
		};

		const handleStorage = (event: StorageEvent) => {
			if (event.key !== STORAGE_KEY || !event.newValue) return;
			try {
				const data = JSON.parse(event.newValue) as QuerySyncMessage;
				if (!isValidMessage(data)) return;
				handleInvalidate(data);
			} catch {
				// ignore malformed payloads
			}
		};

		const handlePostMessage = (event: MessageEvent) => {
			if (event.origin !== window.location.origin) return;
			const payload = event.data as { type?: string; payload?: unknown };
			if (payload?.type !== POST_MESSAGE_TYPE) return;
			const data = payload.payload as QuerySyncMessage;
			if (!isValidMessage(data)) return;
			handleInvalidate(data);
		};

		channel?.addEventListener("message", handleMessage);
		window.addEventListener("storage", handleStorage);
		window.addEventListener("message", handlePostMessage);
		return () => {
			channel?.removeEventListener("message", handleMessage);
			channel?.close();
			window.removeEventListener("storage", handleStorage);
			window.removeEventListener("message", handlePostMessage);
		};
	}, [queryClient]);

	return null;
}

export function broadcastQueryInvalidation(
	queryKey?: ReadonlyArray<unknown>,
) {
	if (typeof window === "undefined") return;
	const payload: QuerySyncMessage = {
		version: 1,
		action: "invalidate",
		queryKey,
		senderId: SENDER_ID,
	};

	if (typeof BroadcastChannel !== "undefined") {
		const channel = new BroadcastChannel(CHANNEL_NAME);
		channel.postMessage(payload);
		channel.close();
	}

	try {
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({ ...payload, ts: Date.now() }),
		);
	} catch {
		// ignore storage failures
	}

	if (window.opener) {
		window.opener.postMessage(
			{ type: POST_MESSAGE_TYPE, payload },
			window.location.origin,
		);
	}
}
