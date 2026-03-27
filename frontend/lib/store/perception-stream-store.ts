import { create, type StateCreator } from "zustand";
import { getRuntimeBackendUrl } from "@/lib/runtime-backend-url";

export type PerceptionSource =
	| "mic_pc"
	| "mic_hardware"
	| "ocr_screen"
	| "ocr_proactive"
	| "user_input"
	| "ai_output"
	| "gps_mobile"
	| "app_switch";

export type PerceptionModality = "audio" | "image" | "text" | "location";

export interface PerceptionEvent {
	event_id: string;
	sequence_id: number;
	timestamp: string;
	ingested_at: string | null;
	source: PerceptionSource;
	modality: PerceptionModality;
	content_text: string;
	content_raw?: string | null;
	metadata: Record<string, unknown>;
	priority: number;
}

export interface StreamFilter {
	sources: Set<PerceptionSource>;
	modalities: Set<PerceptionModality>;
}

export type PerceptionConnectionState =
	| "disconnected"
	| "connecting"
	| "connected"
	| "reconnecting";

interface PerceptionStreamState {
	events: PerceptionEvent[];
	connectionState: PerceptionConnectionState;
	filter: StreamFilter;
	appendEvents: (events: PerceptionEvent[]) => void;
	connect: () => void;
	disconnect: () => void;
	loadRecentEvents: (count?: number) => Promise<void>;
	setFilter: (filter: Partial<StreamFilter>) => void;
	clearEvents: () => void;
}

const MAX_EVENTS = 200;
const RECONNECT_DELAY_MS = 1500;

const WS_PATH_CANDIDATES = ["/api/perception/stream", "/perception/stream"] as const;
const RECENT_PATH_CANDIDATES = [
	"/api/perception/events/recent",
	"/perception/events/recent",
] as const;

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let shouldReconnect = false;
let activeWsPath: (typeof WS_PATH_CANDIDATES)[number] | null = null;

function getWsApiBaseUrl(): string {
	return getRuntimeBackendUrl("http://127.0.0.1:8001");
}

function buildWsUrl(path: string): string {
	const apiBaseUrl = getWsApiBaseUrl();
	const wsBaseUrl = apiBaseUrl
		.replace("http://", "ws://")
		.replace("https://", "wss://");
	return `${wsBaseUrl}${path}`;
}

function appendAndDedupeEvents(
	existing: PerceptionEvent[],
	incoming: PerceptionEvent[],
): PerceptionEvent[] {
	if (incoming.length === 0) return existing;

	const fallbackMerge = (): PerceptionEvent[] => {
		const seen = new Set(existing.map((e) => e.event_id));
		const merged = [...existing];
		for (const event of incoming) {
			if (seen.has(event.event_id)) continue;
			seen.add(event.event_id);
			merged.push(event);
		}
		merged.sort((a, b) => (a.sequence_id ?? 0) - (b.sequence_id ?? 0));
		return merged.slice(-MAX_EVENTS);
	};

	if (existing.length === 0) {
		return fallbackMerge();
	}

	const lastExisting = existing[existing.length - 1];
	const lastSequenceId = lastExisting?.sequence_id ?? Number.NEGATIVE_INFINITY;

	// 高频单条事件流：在顺序递增且无重复时直接追加，避免每次全量排序。
	if (incoming.length === 1) {
		const next = incoming[0];
		const nextSequenceId = next.sequence_id ?? Number.NEGATIVE_INFINITY;
		if (nextSequenceId > lastSequenceId) {
			const duplicated = existing.some((event) => event.event_id === next.event_id);
			if (!duplicated) {
				const merged =
					existing.length < MAX_EVENTS
						? [...existing, next]
						: [...existing.slice(-(MAX_EVENTS - 1)), next];
				return merged;
			}
		}
		return fallbackMerge();
	}

	let monotonicAppend = true;
	let previousSequenceId = lastSequenceId;
	const incomingIds = new Set<string>();
	for (const event of incoming) {
		if (incomingIds.has(event.event_id)) {
			monotonicAppend = false;
			break;
		}
		incomingIds.add(event.event_id);

		const sequenceId = event.sequence_id ?? Number.NEGATIVE_INFINITY;
		if (sequenceId <= previousSequenceId) {
			monotonicAppend = false;
			break;
		}
		previousSequenceId = sequenceId;
	}

	if (!monotonicAppend) {
		return fallbackMerge();
	}

	const existingIds = new Set(existing.map((event) => event.event_id));
	for (const id of incomingIds) {
		if (existingIds.has(id)) {
			return fallbackMerge();
		}
	}

	const merged = [...existing, ...incoming];
	return merged.length <= MAX_EVENTS ? merged : merged.slice(-MAX_EVENTS);
}

async function loadRecentBestEffort(
	set: Parameters<StateCreator<PerceptionStreamState>>[0],
	count: number,
): Promise<void> {
	try {
		const recent = await fetchRecentEvents(count);
		if (recent.length === 0) return;
		set((state) => ({
			events: appendAndDedupeEvents(state.events, recent),
		}));
	} catch {}
}

async function fetchRecentEvents(count: number): Promise<PerceptionEvent[]> {
	const query = `?count=${encodeURIComponent(String(count))}`;

	for (const path of RECENT_PATH_CANDIDATES) {
		const relUrl = `${path}${query}`;
		try {
			const res = await fetch(relUrl);
			if (res.ok) return (await res.json()) as PerceptionEvent[];
		} catch {}

		try {
			const absUrl = `${getWsApiBaseUrl()}${path}${query}`;
			const res = await fetch(absUrl);
			if (res.ok) return (await res.json()) as PerceptionEvent[];
		} catch {}
	}

	return [];
}

function clearReconnectTimer(): void {
	if (reconnectTimer) {
		clearTimeout(reconnectTimer);
		reconnectTimer = null;
	}
}

function closeWs(): void {
	try {
		ws?.close();
	} catch {}
	ws = null;
}

function connectWithFallback(
	set: Parameters<StateCreator<PerceptionStreamState>>[0],
	candidateIndex: number,
	isReconnectAttempt: boolean,
): void {
	if (!shouldReconnect) return;
	if (ws) return;

	const candidate = WS_PATH_CANDIDATES[candidateIndex];
	if (!candidate) {
		set({ connectionState: "disconnected" });
		void loadRecentBestEffort(set, 50);
		return;
	}

	set({ connectionState: isReconnectAttempt ? "reconnecting" : "connecting" });
	const wsUrl = buildWsUrl(candidate);
	const socket = new WebSocket(wsUrl);
	ws = socket;

	let opened = false;
	const openTimeout = setTimeout(() => {
		if (opened) return;
		if (ws !== socket) return;
		closeWs();
		connectWithFallback(set, candidateIndex + 1, isReconnectAttempt);
	}, 2000);

	socket.onopen = () => {
		opened = true;
		activeWsPath = candidate;
		clearTimeout(openTimeout);
		set({ connectionState: "connected" });
	};

	socket.onclose = () => {
		clearTimeout(openTimeout);
		if (ws === socket) ws = null;
		set({ connectionState: "disconnected" });

		if (!shouldReconnect) return;
		clearReconnectTimer();
		reconnectTimer = setTimeout(() => {
			if (!shouldReconnect) return;
			const retryPath = activeWsPath ?? WS_PATH_CANDIDATES[0];
			const retryIndex = WS_PATH_CANDIDATES.indexOf(retryPath);
			connectWithFallback(set, Math.max(0, retryIndex), true);
		}, RECONNECT_DELAY_MS);
	};

	socket.onmessage = (msg) => {
		try {
			const event = JSON.parse(String(msg.data)) as PerceptionEvent;
			set((state) => ({
				events: appendAndDedupeEvents(state.events, [event]),
			}));
		} catch {}
	};
}

export const usePerceptionStreamStore = create<PerceptionStreamState>((set) => ({
	events: [],
	connectionState: "disconnected",
	filter: { sources: new Set(), modalities: new Set() },
	appendEvents: (incoming) =>
		set((state) => ({
			events: appendAndDedupeEvents(state.events, incoming),
		})),

	connect: () => {
		shouldReconnect = true;
		clearReconnectTimer();
		void loadRecentBestEffort(set, 50);
		connectWithFallback(set, 0, false);
	},

	disconnect: () => {
		shouldReconnect = false;
		clearReconnectTimer();
		closeWs();
		set({ connectionState: "disconnected" });
	},

	loadRecentEvents: async (count = 50) => {
		const recent = await fetchRecentEvents(count);
		set((state) => ({
			events: appendAndDedupeEvents(state.events, recent),
		}));
	},

	setFilter: (partial) =>
		set((state) => ({
			filter: {
				sources: partial.sources ?? state.filter.sources,
				modalities: partial.modalities ?? state.filter.modalities,
			},
		})),

	clearEvents: () => set({ events: [] }),
}));
