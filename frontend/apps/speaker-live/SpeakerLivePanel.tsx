"use client";

import {
	Fingerprint,
	ListFilter,
	Mic,
	Square,
	Trash2,
	UserRound,
	Users,
	UserX,
	X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAudioRecording } from "@/apps/audio/hooks/useAudioRecording";
import { PanelHeader } from "@/components/common/layout/PanelHeader";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@/components/ui/dialog";
import { FEATURE_ICON_MAP } from "@/lib/config/panel-config";
import type { RealtimeSpeakerInfo } from "@/lib/store/audio-recording-store";

type SpeakerLine = {
	id: number;
	kind: "speech" | "boundary";
	text: string;
	occurredAt: number;
	speakerId: number | null;
	speakerName: string | null;
	confidence: number | null;
	isMe: boolean;
	backend: string | null;
	overlapLabels: string[];
};

type SpeakerStat = {
	key: string;
	label: string;
	count: number;
	isMe: boolean;
};

type AutoAssignState = "idle" | "saving" | "success" | "failed";
type KnownSpeaker = {
	name: string | null;
	isMe: boolean;
};

const MAX_LINES = 200;
const ALL_FILTER = "__all__";

function normalizeSpeakerInfo(speaker?: RealtimeSpeakerInfo | null): {
	speakerId: number | null;
	speakerName: string | null;
	confidence: number | null;
	isMe: boolean;
	backend: string | null;
	overlapLabels: string[];
} {
	const speakerIdFromNumber =
		typeof speaker?.speaker_id === "number"
			? speaker.speaker_id
			: typeof speaker?.speaker_id === "string" && /^\d+$/.test(speaker.speaker_id)
				? Number.parseInt(speaker.speaker_id, 10)
				: null;
	const rawLabel = typeof speaker?.label === "string" ? speaker.label.trim() : "";
	const parsedIdFromLabel =
		rawLabel.length > 0
			? (() => {
					const match = rawLabel.match(/\d+/);
					return match ? Number.parseInt(match[0], 10) : null;
				})()
			: null;
	const speakerId = speakerIdFromNumber ?? parsedIdFromLabel;
	const speakerName =
		typeof speaker?.speaker_name === "string" && speaker.speaker_name.trim().length > 0
			? speaker.speaker_name.trim()
			: rawLabel.length > 0
				? rawLabel
				: null;
	const confidence = typeof speaker?.confidence === "number" ? speaker.confidence : null;
	const isMe = speaker?.is_me === true;
	const backend = typeof speaker?.backend === "string" && speaker.backend.trim() ? speaker.backend : null;
	const overlapLabelsRaw = Array.isArray(speaker?.overlap_speakers)
		? speaker.overlap_speakers
				.filter((item) => {
					if (!item || typeof item !== "object") return false;
					return item.is_current !== true;
				})
				.map((item) => {
					if (!item || typeof item !== "object") return "";
					const named =
						typeof item.speaker_name === "string" && item.speaker_name.trim().length > 0
							? item.speaker_name.trim()
							: null;
					if (named) return named;
					if (typeof item.speaker_id === "number") return `#${item.speaker_id}`;
					if (typeof item.label === "string" && item.label.trim().length > 0) return item.label.trim();
					return "";
				})
				.filter((v): v is string => v.length > 0)
		: [];
	const overlapLabels = Array.from(new Set(overlapLabelsRaw)).filter((label) => {
		if (speakerName && label === speakerName) return false;
		if (speakerId !== null && label === `#${speakerId}`) return false;
		return true;
	});

	return { speakerId, speakerName, confidence, isMe, backend, overlapLabels };
}

export function SpeakerLivePanel() {
	const tPage = useTranslations("page");
	const t = useTranslations("speakerLive");
	const { isRecording, startRecording, stopRecording } = useAudioRecording();

	const [lines, setLines] = useState<SpeakerLine[]>([]);
	const [partialText, setPartialText] = useState("");
	const [partialSpeaker, setPartialSpeaker] = useState<ReturnType<
		typeof normalizeSpeakerInfo
	> | null>(null);
	const [panelError, setPanelError] = useState<string | null>(null);
	const [meSpeakerId, setMeSpeakerId] = useState<number | null>(null);
	const [autoAssignState, setAutoAssignState] = useState<AutoAssignState>("idle");
	const [isListOpen, setIsListOpen] = useState(false);
	const [activeSpeakerFilter, setActiveSpeakerFilter] = useState<string>(ALL_FILTER);
	const [clearingSpeakers, setClearingSpeakers] = useState(false);
	const [lastBackend, setLastBackend] = useState<string | null>(null);

	const isStartingRef = useRef(false);
	const nextLineIdRef = useRef(1);
	const meSpeakerIdRef = useRef<number | null>(null);
	const autoAssignedRef = useRef(false);
	const lastBackendRef = useRef<string | null>(null);
	const knownSpeakersRef = useRef<Map<number, KnownSpeaker>>(new Map());
	const listBottomRef = useRef<HTMLDivElement | null>(null);
	const lastKnownSpeakerRef = useRef<{
		speakerId: number | null;
		speakerName: string | null;
		confidence: number | null;
		isMe: boolean;
		backend: string | null;
		at: number;
	} | null>(null);

	const setMeSpeaker = useCallback((speakerId: number | null) => {
		meSpeakerIdRef.current = speakerId;
		setMeSpeakerId(speakerId);
	}, []);
	const setBackend = useCallback((backend: string | null) => {
		lastBackendRef.current = backend;
		setLastBackend(backend);
	}, []);

	const applyKnownSpeakerMeta = useCallback((speaker: ReturnType<typeof normalizeSpeakerInfo>) => {
		if (speaker.speakerId === null) return speaker;
		const known = knownSpeakersRef.current.get(speaker.speakerId);
		if (!known) return speaker;
		return {
			...speaker,
			speakerName: speaker.speakerName ?? known.name,
			isMe: speaker.isMe || known.isMe,
		};
	}, []);

	const setKnownSpeakerAsMe = useCallback((speakerId: number) => {
		const next = new Map(knownSpeakersRef.current);
		for (const [id, value] of next.entries()) {
			next.set(id, { ...value, isMe: id === speakerId });
		}
		if (!next.has(speakerId)) {
			next.set(speakerId, { name: null, isMe: true });
		}
		knownSpeakersRef.current = next;
	}, []);

	const loadKnownSpeakers = useCallback(async () => {
		try {
			const res = await fetch("/api/audio/speakers");
			if (!res.ok) return;
			const data = (await res.json()) as {
				speakers?: Array<{ id?: number; name?: string; is_me?: boolean }>;
			};
			if (!Array.isArray(data.speakers)) return;

			const next = new Map<number, KnownSpeaker>();
			let meId: number | null = null;
			for (const item of data.speakers) {
				if (typeof item?.id !== "number" || item.id <= 0) continue;
				const normalizedName =
					typeof item.name === "string" && item.name.trim().length > 0 ? item.name.trim() : null;
				const isMe = item.is_me === true;
				next.set(item.id, { name: normalizedName, isMe });
				if (isMe) {
					meId = item.id;
				}
			}
			knownSpeakersRef.current = next;
			if (meId !== null) {
				autoAssignedRef.current = true;
				setMeSpeaker(meId);
				setAutoAssignState("success");
			}
		} catch {
			// Ignore preload failure; live stream can still work.
		}
	}, [setMeSpeaker]);

	const getSpeakerKey = useCallback((line: Pick<SpeakerLine, "speakerId" | "speakerName">) => {
		if (line.speakerId !== null) return `id:${line.speakerId}`;
		if (line.speakerName) return `name:${line.speakerName}`;
		return "unknown";
	}, []);

	const getSpeakerLabel = useCallback(
		(line: Pick<SpeakerLine, "speakerId" | "speakerName" | "isMe">) => {
			if (line.isMe) return t("me");
			if (line.speakerName) return line.speakerName;
			if (line.speakerId !== null) return t("speakerWithId", { id: line.speakerId });
			return t("unknownSpeaker");
		},
		[t],
	);

	const formatClockTime = useCallback((timestampMs: number) => {
		return new Date(timestampMs).toLocaleTimeString([], {
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
		});
	}, []);

	const appendLine = useCallback((line: Omit<SpeakerLine, "id">) => {
		setLines((prev) => {
			const next = [...prev, { id: nextLineIdRef.current++, ...line }];
			if (next.length > MAX_LINES) {
				return next.slice(next.length - MAX_LINES);
			}
			return next;
		});
	}, []);

	const autoSetFirstSpeakerAsMe = useCallback(
		async (speakerId: number, backend: string | null) => {
			if (autoAssignedRef.current) {
				return;
			}

			setAutoAssignState("saving");

			try {
				setPanelError(null);
				if (backend === "diart") {
					// Diart IDs are session-local and may not exist in VoiceprintStore.
					autoAssignedRef.current = true;
					setMeSpeaker(speakerId);
					setKnownSpeakerAsMe(speakerId);
					setAutoAssignState("success");
					return;
				}
				const res = await fetch(`/api/audio/speakers/${speakerId}/set-as-me`, {
					method: "POST",
				});
				if (res.status === 404) {
					// diart labels may be ephemeral and not persisted in VoiceprintStore;
					// keep local "me" assignment to avoid noisy failures.
					autoAssignedRef.current = true;
					setMeSpeaker(speakerId);
					setAutoAssignState("success");
					return;
				}
				if (!res.ok) {
					throw new Error(`${res.status}`);
				}
				autoAssignedRef.current = true;
				setMeSpeaker(speakerId);
				setKnownSpeakerAsMe(speakerId);
				setAutoAssignState("success");
			} catch {
				autoAssignedRef.current = false;
				setAutoAssignState("failed");
				setPanelError(t("autoSetMeFailed"));
			}
		},
		[setKnownSpeakerAsMe, setMeSpeaker, t],
	);

	const resetPanelState = useCallback(
		(options?: { keepMe?: boolean }) => {
			const keepMe = options?.keepMe === true && meSpeakerIdRef.current !== null;

			setLines([]);
			setPartialText("");
			setPartialSpeaker(null);
			setPanelError(null);
			setBackend(null);
			if (keepMe) {
				autoAssignedRef.current = true;
				setAutoAssignState("success");
			} else {
				setMeSpeaker(null);
				setAutoAssignState("idle");
				autoAssignedRef.current = false;
			}
			nextLineIdRef.current = 1;
			lastKnownSpeakerRef.current = null;
		},
		[setBackend, setMeSpeaker],
	);

	const handleClearVoiceprints = useCallback(async () => {
		if (!window.confirm(t("clearVoiceprintsConfirm"))) return;
		setClearingSpeakers(true);
		try {
			const res = await fetch("/api/audio/speakers", { method: "DELETE" });
			if (!res.ok) throw new Error(`${res.status}`);
			const data = (await res.json()) as { cleared?: number };
			knownSpeakersRef.current = new Map();
			setMeSpeaker(null);
			autoAssignedRef.current = false;
			setAutoAssignState("idle");
			window.alert(t("clearVoiceprintsSuccess", { count: data.cleared ?? 0 }));
		} catch {
			window.alert(t("clearVoiceprintsFailed"));
		} finally {
			setClearingSpeakers(false);
		}
	}, [setMeSpeaker, t]);

	const handleStartRecording = useCallback(async () => {
		if (isRecording || isStartingRef.current) return;

		isStartingRef.current = true;
		await loadKnownSpeakers();
		resetPanelState({ keepMe: true });

		try {
			await startRecording(
				(text, isFinal, speaker) => {
					if (isFinal && text.startsWith("__SEGMENT_SAVED__")) {
						const reason = text.slice("__SEGMENT_SAVED__:".length).trim();
						appendLine({
							kind: "boundary",
							text: reason || t("segmentBoundary"),
							occurredAt: Date.now(),
							speakerId: null,
							speakerName: null,
							confidence: null,
							isMe: false,
							backend: lastBackendRef.current,
							overlapLabels: [],
						});
						return;
					}

					if (!isFinal) {
						setPartialText(text);
						setPartialSpeaker(
							speaker ? applyKnownSpeakerMeta(normalizeSpeakerInfo(speaker)) : null,
						);
						return;
					}

					if (text.trim().length === 0) {
						setPartialText("");
						setPartialSpeaker(null);
						return;
					}

					setPartialText("");
					setPartialSpeaker(null);

					const parsed = applyKnownSpeakerMeta(normalizeSpeakerInfo(speaker));
					const now = Date.now();
					if (parsed.backend) {
						setBackend(parsed.backend);
					}
					const recentKnown = lastKnownSpeakerRef.current;
					const shouldBorrowLastSpeaker =
						parsed.speakerId === null &&
						!parsed.speakerName &&
						parsed.overlapLabels.length === 0 &&
						recentKnown !== null &&
						now - recentKnown.at <= 1200 &&
						text.trim().length <= 24;

					const maybeBorrowedSpeaker = shouldBorrowLastSpeaker
						? {
								...parsed,
								speakerId: recentKnown.speakerId,
								speakerName: recentKnown.speakerName,
								confidence: recentKnown.confidence,
								isMe: recentKnown.isMe,
								backend: parsed.backend ?? recentKnown.backend,
							}
						: parsed;
					const effectiveSpeaker = applyKnownSpeakerMeta(maybeBorrowedSpeaker);

					if (effectiveSpeaker.speakerId !== null || effectiveSpeaker.speakerName) {
						lastKnownSpeakerRef.current = {
							speakerId: effectiveSpeaker.speakerId,
							speakerName: effectiveSpeaker.speakerName,
							confidence: effectiveSpeaker.confidence,
							isMe: effectiveSpeaker.isMe,
							backend: effectiveSpeaker.backend,
							at: now,
						};
					}

					if (
						effectiveSpeaker.speakerId !== null &&
						effectiveSpeaker.speakerId > 0 &&
						meSpeakerIdRef.current === null
					) {
						if (effectiveSpeaker.isMe) {
							autoAssignedRef.current = true;
							setMeSpeaker(effectiveSpeaker.speakerId);
							setKnownSpeakerAsMe(effectiveSpeaker.speakerId);
							setAutoAssignState("success");
						} else if (!autoAssignedRef.current) {
							void autoSetFirstSpeakerAsMe(
								effectiveSpeaker.speakerId,
								effectiveSpeaker.backend,
							);
						}
					}

					const isMeLine =
						effectiveSpeaker.isMe ||
						(effectiveSpeaker.speakerId !== null &&
							meSpeakerIdRef.current !== null &&
							effectiveSpeaker.speakerId === meSpeakerIdRef.current);

					appendLine({
						kind: "speech",
						text,
						occurredAt: Date.now(),
						speakerId: effectiveSpeaker.speakerId,
						speakerName: effectiveSpeaker.speakerName,
						confidence: effectiveSpeaker.confidence,
						isMe: isMeLine,
						backend: effectiveSpeaker.backend,
						overlapLabels: effectiveSpeaker.overlapLabels,
					});
				},
				undefined,
				(error) => {
					setPanelError(error.message || t("recordingError"));
				},
				false,
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : t("recordingError");
			setPanelError(message);
		} finally {
			isStartingRef.current = false;
		}
	}, [
		appendLine,
		applyKnownSpeakerMeta,
		autoSetFirstSpeakerAsMe,
		isRecording,
		loadKnownSpeakers,
		resetPanelState,
		setBackend,
		setKnownSpeakerAsMe,
		setMeSpeaker,
		startRecording,
		t,
	]);

	useEffect(() => {
		void loadKnownSpeakers();
	}, [loadKnownSpeakers]);

	const handleStopRecording = useCallback(() => {
		if (!isRecording) return;
		stopRecording();
		setPartialText("");
		setPartialSpeaker(null);
	}, [isRecording, stopRecording]);

	const scrollSignal = useMemo(() => `${lines.length}:${partialText}`, [lines, partialText]);

	useEffect(() => {
		void scrollSignal;
		listBottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
	}, [scrollSignal]);

	useEffect(() => {
		if (!isListOpen) {
			setActiveSpeakerFilter(ALL_FILTER);
		}
	}, [isListOpen]);

	const autoAssignHint = useMemo(() => {
		if (meSpeakerId === null) return t("meNotSet");
		if (autoAssignState === "saving") return t("autoSettingMe");
		if (autoAssignState === "failed") return t("autoSetMeFailed");
		return t("meSpeakerId", { id: meSpeakerId });
	}, [autoAssignState, meSpeakerId, t]);

	const speakerStats = useMemo<SpeakerStat[]>(() => {
		const statMap = new Map<string, SpeakerStat>();
		for (const line of lines) {
			if (line.kind !== "speech") continue;
			const key = getSpeakerKey(line);
			const existing = statMap.get(key);
			if (existing) {
				existing.count += 1;
				if (line.isMe) {
					existing.isMe = true;
					existing.label = t("me");
				}
				continue;
			}

			statMap.set(key, {
				key,
				label: getSpeakerLabel(line),
				count: 1,
				isMe: line.isMe,
			});
		}

		return Array.from(statMap.values()).sort((a, b) => {
			if (a.isMe !== b.isMe) return a.isMe ? -1 : 1;
			return b.count - a.count;
		});
	}, [getSpeakerKey, getSpeakerLabel, lines, t]);

	const filteredLines = useMemo(() => {
		if (activeSpeakerFilter === ALL_FILTER) return lines;
		return lines.filter(
			(line) => line.kind === "speech" && getSpeakerKey(line) === activeSpeakerFilter,
		);
	}, [activeSpeakerFilter, getSpeakerKey, lines]);

	const unknownSegmentCount = useMemo(
		() =>
			lines.filter(
				(line) => line.kind === "speech" && line.speakerId === null && !line.speakerName,
			).length,
		[lines],
	);

	const recognizedSpeakerCount = useMemo(
		() => speakerStats.filter((stat) => stat.key !== "unknown").length,
		[speakerStats],
	);

	const Icon = FEATURE_ICON_MAP.speakerLive;
	const totalSegments = useMemo(
		() => lines.filter((line) => line.kind === "speech").length,
		[lines],
	);
	const backendDisplay = lastBackend ?? t("unknownBackend");

	return (
		<div className="flex h-full flex-col overflow-hidden bg-background">
			<PanelHeader
				icon={Icon}
				title={tPage("speakerLiveLabel")}
				actions={
					<div
						className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${
							isRecording
								? "border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
								: "border-border bg-muted text-muted-foreground"
						}`}
					>
						<Mic className="mr-1 h-3.5 w-3.5" />
						{isRecording ? t("realtime") : t("stop")}
					</div>
				}
			/>

			<div className="border-b border-border/70 bg-gradient-to-b from-muted/35 to-background px-4 py-3">
				<div className="flex flex-wrap items-center gap-2.5">
					<button
						type="button"
						className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
						onClick={() => void handleStartRecording()}
						disabled={isRecording || isStartingRef.current}
					>
						<Mic className="h-4 w-4" />
						{t("start")}
					</button>
					<button
						type="button"
						className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground disabled:cursor-not-allowed disabled:opacity-50"
						onClick={handleStopRecording}
						disabled={!isRecording}
					>
						<Square className="h-4 w-4" />
						{t("stop")}
					</button>
					<button
						type="button"
						className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
						onClick={() => resetPanelState()}
					>
						<Trash2 className="h-4 w-4" />
						{t("clear")}
					</button>
					<button
						type="button"
						className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted/40"
						onClick={() => setIsListOpen(true)}
					>
						<Users className="h-4 w-4" />
						{t("openList", { count: lines.length })}
					</button>
					<button
						type="button"
						className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
						onClick={() => void handleClearVoiceprints()}
						disabled={clearingSpeakers}
					>
						<UserX className="h-4 w-4" />
						{t("clearVoiceprints")}
					</button>
				</div>

				<div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
					<div className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-1 text-muted-foreground">
						<Fingerprint className="h-3.5 w-3.5" />
						<span>{autoAssignHint}</span>
					</div>
					<div className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-1 text-muted-foreground">
						<span>{t("statsBackend")}:</span>
						<span className="font-medium text-foreground">{backendDisplay}</span>
					</div>
					<div className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-1 text-muted-foreground">
						<span>{t("statsRecognizedSpeakers")}:</span>
						<span className="font-medium text-foreground">{recognizedSpeakerCount}</span>
					</div>
					<div className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-1 text-muted-foreground">
						<span>{t("statsUnknownSegments")}:</span>
						<span className="font-medium text-foreground">{unknownSegmentCount}</span>
					</div>
				</div>

				{panelError && (
					<div className="mt-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
						{panelError}
					</div>
				)}
			</div>

			<div className="flex-1 overflow-y-auto p-3">
				{lines.length === 0 && !partialText && (
					<div className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
						{t("empty")}
					</div>
				)}

				<div className="space-y-2">
					{lines.map((line) => {
						if (line.kind === "boundary") {
							return (
								<div
									key={line.id}
									className="rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-700/50 dark:bg-amber-900/20 dark:text-amber-300"
								>
									{line.text}
								</div>
							);
						}
						const speakerLabel = getSpeakerLabel(line);

						return (
							<div key={line.id} className="rounded-lg border border-border bg-card px-3 py-2">
								<div className="mb-1 flex items-center gap-2">
									<span
										className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
											line.isMe
												? "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300"
												: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
										}`}
									>
										<UserRound className="h-3 w-3" />
										{speakerLabel}
									</span>
									{line.confidence !== null && (
										<span className="text-[11px] text-muted-foreground">
											{t("confidence", { value: Math.round(line.confidence * 100) })}
										</span>
									)}
									{line.backend && (
										<span className="text-[11px] rounded-full border border-border px-2 py-0.5 text-muted-foreground">
											{t("backend", { name: line.backend })}
										</span>
									)}
									<span className="text-[11px] text-muted-foreground">
										{formatClockTime(line.occurredAt)}
									</span>
								</div>
								{line.overlapLabels.length > 0 && (
									<div className="mb-1 text-[11px] text-amber-700 dark:text-amber-300">
										{t("overlapWith", { names: line.overlapLabels.join(" / ") })}
									</div>
								)}
								<div className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
									{line.text}
								</div>
							</div>
						);
					})}

					{isRecording && partialText && (
						<div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-700/50 dark:bg-amber-900/20">
							<div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] font-medium text-amber-700 dark:text-amber-300">
								{t("realtime")}
								{partialSpeaker && (
									<span className="rounded-full border border-amber-300/80 bg-amber-100 px-2 py-0.5 text-amber-800 dark:border-amber-600/50 dark:bg-amber-900/40 dark:text-amber-200">
										{getSpeakerLabel({
											speakerId: partialSpeaker.speakerId,
											speakerName: partialSpeaker.speakerName,
											isMe:
												partialSpeaker.isMe ||
												(partialSpeaker.speakerId !== null &&
													meSpeakerIdRef.current !== null &&
													partialSpeaker.speakerId === meSpeakerIdRef.current),
										})}
									</span>
								)}
							</div>
							{partialSpeaker && partialSpeaker.overlapLabels.length > 0 && (
								<div className="mb-1 text-[11px] text-amber-700 dark:text-amber-300">
									{t("overlapWith", { names: partialSpeaker.overlapLabels.join(" / ") })}
								</div>
							)}
							<div className="text-sm text-foreground/90">{partialText}</div>
						</div>
					)}
				</div>

				<div ref={listBottomRef} />
			</div>

			<Dialog open={isListOpen} onOpenChange={setIsListOpen}>
				<DialogContent className="w-[96vw] max-w-5xl overflow-hidden p-0">
					<div className="border-b border-border bg-gradient-to-r from-muted/50 via-background to-muted/30 px-4 py-3">
						<div className="flex flex-wrap items-start justify-between gap-3">
							<div>
								<DialogTitle>{t("listTitle")}</DialogTitle>
								<DialogDescription className="mt-1">{t("dialogSubtitle")}</DialogDescription>
							</div>
							<div className="flex items-center gap-2">
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="h-8 gap-1 px-2 text-xs"
									onClick={() => void handleClearVoiceprints()}
									disabled={clearingSpeakers}
								>
									<UserX className="h-3.5 w-3.5" />
									{t("clearVoiceprints")}
								</Button>
								<DialogClose asChild>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										className="h-8 w-8"
										aria-label={t("closeList")}
									>
										<X className="h-4 w-4" />
									</Button>
								</DialogClose>
							</div>
						</div>
					</div>

					<div className="max-h-[82vh] space-y-3 overflow-y-auto p-4">
						<div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
							<div className="rounded-lg border border-border bg-muted/20 p-3">
								<div className="text-[11px] text-muted-foreground">{t("statsTotalSegments")}</div>
								<div className="mt-1 text-xl font-semibold text-foreground">{totalSegments}</div>
							</div>
							<div className="rounded-lg border border-border bg-muted/20 p-3">
								<div className="text-[11px] text-muted-foreground">{t("statsRecognizedSpeakers")}</div>
								<div className="mt-1 text-xl font-semibold text-foreground">{recognizedSpeakerCount}</div>
							</div>
							<div className="rounded-lg border border-border bg-muted/20 p-3">
								<div className="text-[11px] text-muted-foreground">{t("statsUnknownSegments")}</div>
								<div className="mt-1 text-xl font-semibold text-foreground">{unknownSegmentCount}</div>
							</div>
							<div className="rounded-lg border border-border bg-muted/20 p-3">
								<div className="text-[11px] text-muted-foreground">{t("statsBackend")}</div>
								<div className="mt-1 truncate text-sm font-semibold text-foreground">{backendDisplay}</div>
							</div>
						</div>

						<div className="rounded-lg border border-border bg-muted/20 p-3">
							<div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
								<ListFilter className="h-4 w-4" />
								{t("speakerSummaryTitle")}
							</div>
							<div className="flex flex-wrap gap-2">
								<button
									type="button"
									className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
										activeSpeakerFilter === ALL_FILTER
											? "border-primary bg-primary/10 text-primary"
											: "border-border bg-background text-muted-foreground"
									}`}
									onClick={() => setActiveSpeakerFilter(ALL_FILTER)}
								>
									{t("allSpeakers")} ({totalSegments})
								</button>
								{speakerStats.map((stat) => (
									<button
										key={stat.key}
										type="button"
										className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
											activeSpeakerFilter === stat.key
												? "border-primary bg-primary/10 text-primary"
												: "border-border bg-background text-muted-foreground"
										}`}
										onClick={() => setActiveSpeakerFilter(stat.key)}
									>
										{stat.label} ({stat.count})
									</button>
								))}
							</div>
						</div>

						<div className="rounded-lg border border-border">
							<div className="border-b border-border bg-muted/20 px-3 py-2 text-sm font-medium text-foreground">
								{t("segmentListTitle", { count: filteredLines.length })}
							</div>
							<div className="max-h-[56vh] space-y-2 overflow-y-auto p-3">
								{filteredLines.length === 0 && (
									<div className="rounded-md border border-dashed border-border bg-background px-3 py-4 text-sm text-muted-foreground">
										{t("noSegments")}
									</div>
								)}

								{filteredLines.map((line) => {
									if (line.kind === "boundary") {
										return (
											<div
												key={`modal-${line.id}`}
												className="rounded-md border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-700/50 dark:bg-amber-900/20 dark:text-amber-300"
											>
												{line.text}
											</div>
										);
									}
									const toneClass =
										line.isMe
											? "border-l-sky-400"
											: line.speakerId === null && !line.speakerName
												? "border-l-amber-400"
												: "border-l-violet-400";
									return (
										<div
											key={`modal-${line.id}`}
											className={`rounded-md border border-border border-l-4 bg-background px-3 py-2 ${toneClass}`}
										>
											<div className="mb-1 flex flex-wrap items-center gap-2 text-[11px]">
												<span className="rounded-full border border-border bg-muted px-2 py-0.5 text-muted-foreground">
													#{line.id}
												</span>
												<span
													className={`rounded-full px-2 py-0.5 font-medium ${
														line.isMe
															? "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300"
															: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
													}`}
												>
													{getSpeakerLabel(line)}
												</span>
												<span className="text-muted-foreground">
													{formatClockTime(line.occurredAt)}
												</span>
												{line.confidence !== null && (
													<span className="text-muted-foreground">
														{t("confidence", { value: Math.round(line.confidence * 100) })}
													</span>
												)}
												{line.backend && (
													<span className="rounded-full border border-border px-1.5 py-0.5 text-muted-foreground">
														{line.backend}
													</span>
												)}
											</div>
											{line.overlapLabels.length > 0 && (
												<div className="mb-1 text-[11px] text-amber-700 dark:text-amber-300">
													{t("overlapWith", { names: line.overlapLabels.join(" / ") })}
												</div>
											)}
											<div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
												{line.text}
											</div>
										</div>
									);
								})}
							</div>
						</div>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}
