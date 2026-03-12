import { create, type StateCreator } from "zustand";
import type { PerceptionSource } from "./perception-stream-store";

export type TodoIntentConnectionState =
	| "disconnected"
	| "connecting"
	| "connected"
	| "reconnecting";

export type TodoIntentProcessingStatus =
	| "dedupe_hit"
	| "gate_skipped"
	| "extracted"
	| "extract_failed"
	| "processed"
	| "failed";

export type TodoIntentIntegrationAction =
	| "created"
	| "updated"
	| "skipped"
	| "queued_review";

export interface TodoIntentGateDecision {
	should_extract: boolean;
	reason: string;
	raw?: Record<string, unknown> | null;
}

export interface TodoIntentCandidate {
	name: string;
	description?: string | null;
	start_time?: string | null;
	due?: string | null;
	deadline?: string | null;
	time_zone?: string | null;
	priority: string;
	tags: string[];
	confidence: number;
	source_text?: string | null;
	source_event_ids: string[];
}

export interface TodoIntentIntegrationResult {
	action: TodoIntentIntegrationAction;
	todo_id?: number | null;
	dedupe_key?: string | null;
	reason?: string | null;
}

export interface TodoIntentProcessingRecord {
	record_id: string;
	context_id: string;
	status: TodoIntentProcessingStatus;
	created_at: string;
	event_ids: string[];
	source_set: PerceptionSource[];
	merged_text: string;
	time_window_start: string;
	time_window_end: string;
	metadata: Record<string, unknown>;
	dedupe_hit: boolean;
	dedupe_key?: string | null;
	gate_decision?: TodoIntentGateDecision | null;
	candidates: TodoIntentCandidate[];
	integration_results: TodoIntentIntegrationResult[];
	error?: string | null;
}

interface TodoIntentStreamState {
	records: TodoIntentProcessingRecord[];
	connectionState: TodoIntentConnectionState;
	connect: () => void;
	disconnect: () => void;
	loadRecent: (count?: number) => Promise<void>;
	clearRecords: () => void;
}

const MAX_RECORDS = 200;
const RECONNECT_DELAY_MS = 1500;

const WS_PATH_CANDIDATES = [
	"/api/perception/todo-intent/stream",
	"/perception/todo-intent/stream",
] as const;
const RECENT_PATH_CANDIDATES = [
	"/api/perception/todo-intent/records/recent",
	"/perception/todo-intent/records/recent",
] as const;

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let shouldReconnect = false;
let activeWsPath: (typeof WS_PATH_CANDIDATES)[number] | null = null;

function getApiBaseUrl(): string {
	return (
		process.env.NEXT_PUBLIC_API_URL ||
		(typeof window !== "undefined" &&
			(window as Window & { __BACKEND_URL__?: string }).__BACKEND_URL__) ||
		"http://127.0.0.1:8100"
	);
}

function buildWsUrl(path: string): string {
	const apiBaseUrl = getApiBaseUrl();
	const wsBaseUrl = apiBaseUrl
		.replace("http://", "ws://")
		.replace("https://", "wss://");
	return `${wsBaseUrl}${path}`;
}

function appendAndDedupeRecords(
	existing: TodoIntentProcessingRecord[],
	incoming: TodoIntentProcessingRecord[],
): TodoIntentProcessingRecord[] {
	if (incoming.length === 0) return existing;
	const seen = new Set(existing.map((r) => r.record_id));
	const merged = [...existing];
	for (const record of incoming) {
		if (seen.has(record.record_id)) continue;
		seen.add(record.record_id);
		merged.push(record);
	}
	merged.sort((a, b) => {
		const at = Date.parse(a.created_at);
		const bt = Date.parse(b.created_at);
		if (!Number.isNaN(at) && !Number.isNaN(bt)) return at - bt;
		return a.record_id.localeCompare(b.record_id);
	});
	return merged.slice(-MAX_RECORDS);
}

async function fetchRecentRecords(
	count: number,
): Promise<TodoIntentProcessingRecord[]> {
	const query = `?count=${encodeURIComponent(String(count))}`;
	for (const path of RECENT_PATH_CANDIDATES) {
		const relUrl = `${path}${query}`;
		try {
			const res = await fetch(relUrl);
			if (res.ok) return (await res.json()) as TodoIntentProcessingRecord[];
		} catch {}

		try {
			const absUrl = `${getApiBaseUrl()}${path}${query}`;
			const res = await fetch(absUrl);
			if (res.ok) return (await res.json()) as TodoIntentProcessingRecord[];
		} catch {}
	}
	return [];
}

async function loadRecentBestEffort(
	set: Parameters<StateCreator<TodoIntentStreamState>>[0],
	count: number,
): Promise<void> {
	try {
		const recent = await fetchRecentRecords(count);
		if (recent.length === 0) return;
		set((state) => ({
			records: appendAndDedupeRecords(state.records, recent),
		}));
	} catch {}
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
	set: Parameters<StateCreator<TodoIntentStreamState>>[0],
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
			const record = JSON.parse(String(msg.data)) as TodoIntentProcessingRecord;
			set((state) => ({
				records: appendAndDedupeRecords(state.records, [record]),
			}));
		} catch {}
	};
}

export const useTodoIntentStreamStore = create<TodoIntentStreamState>((set) => ({
	records: [],
	connectionState: "disconnected",

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

	loadRecent: async (count = 50) => {
		const recent = await fetchRecentRecords(count);
		set((state) => ({
			records: appendAndDedupeRecords(state.records, recent),
		}));
	},

	clearRecords: () => set({ records: [] }),
}));
