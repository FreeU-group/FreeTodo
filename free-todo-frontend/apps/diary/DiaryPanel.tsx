"use client";

import {
	Mic,
	PauseCircle,
	PlayCircle,
	RefreshCw,
	Upload,
	Pencil,
	Save,
	Trash2,
	MessageSquare,
	X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { PanelHeader } from "@/components/common/layout/PanelHeader";
import { useUiStore } from "@/lib/store/ui-store";

interface AudioRecord {
	id: number;
	name?: string | null;
	createdAt: string;
	status: string;
	language?: string | null;
	duration?: number | null;
	fileSize?: number;
}

interface AudioSegment {
	id: number;
	audioId: number;
	startTime: number;
	endTime: number;
	textContent?: string | null;
	speaker?: string | null;
}

const SUPPORTED_MIME_TYPES = [
	"audio/webm;codecs=opus",
	"audio/webm",
	"audio/ogg;codecs=opus",
	"audio/ogg",
];

function pickSupportedMimeType() {
	if (typeof MediaRecorder === "undefined") return undefined;
	return SUPPORTED_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

export function DiaryPanel() {
	const t = useTranslations("diary");
	const [isRecording, setIsRecording] = useState(false);
	const [recordingSeconds, setRecordingSeconds] = useState(0);
	const [isUploading, setIsUploading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [records, setRecords] = useState<AudioRecord[]>([]);
	const [segments, setSegments] = useState<Record<number, AudioSegment[]>>({});
	const [expandedRecordId, setExpandedRecordId] = useState<number | null>(null);
	const [editingRecordId, setEditingRecordId] = useState<number | null>(null);
	const [nameDraft, setNameDraft] = useState("");

	const mediaRecorderRef = useRef<MediaRecorder | null>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const chunksRef = useRef<Blob[]>([]);
	const timerRef = useRef<number | null>(null);
	const { getIsFeatureOpen, toggleFeature } = useUiStore();

	const mimeType = useMemo(() => pickSupportedMimeType(), []);

	useEffect(() => {
		void loadRecords();
		return () => {
			cleanupRecorder();
		};
	}, []);

	const cleanupRecorder = () => {
		if (timerRef.current) {
			window.clearInterval(timerRef.current);
			timerRef.current = null;
		}
		if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
			mediaRecorderRef.current.stop();
		}
		if (streamRef.current) {
			for (const track of streamRef.current.getTracks()) {
				track.stop();
			}
			streamRef.current = null;
		}
		mediaRecorderRef.current = null;
	};

	const startTimer = () => {
		setRecordingSeconds(0);
		timerRef.current = window.setInterval(() => {
			setRecordingSeconds((value) => value + 1);
		}, 1000);
	};

	const stopTimer = () => {
		if (timerRef.current) {
			window.clearInterval(timerRef.current);
			timerRef.current = null;
		}
	};

	const startRecording = async () => {
		setError(null);
		if (!navigator.mediaDevices?.getUserMedia) {
			setError(t("unsupported"));
			return;
		}

		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			streamRef.current = stream;
			chunksRef.current = [];

			const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
			mediaRecorderRef.current = recorder;

			recorder.ondataavailable = (event) => {
				if (event.data.size > 0) {
					chunksRef.current.push(event.data);
				}
			};

			recorder.onstop = () => {
				const blob = new Blob(chunksRef.current, {
					type: recorder.mimeType || "audio/webm",
				});
				void uploadBlob(blob);
				chunksRef.current = [];
			};

			recorder.start();
			startTimer();
			setIsRecording(true);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
			cleanupRecorder();
		}
	};

	const stopRecording = () => {
		if (!mediaRecorderRef.current) return;
		stopTimer();
		setIsRecording(false);
		mediaRecorderRef.current.stop();
		cleanupRecorder();
	};

	const uploadBlob = async (blob: Blob) => {
		setIsUploading(true);
		setError(null);
		try {
			const formData = new FormData();
			const ext = blob.type.includes("ogg") ? "ogg" : "webm";
			const file = new File([blob], `recording.${ext}`, { type: blob.type });
			formData.append("file", file);

			const response = await fetch(`/api/audio/transcriptions?process=true`, {
				method: "POST",
				body: formData,
			});

			if (!response.ok) {
				const message = await response.text();
				throw new Error(message || `HTTP ${response.status}`);
			}

			const data = await response.json();
			const audioId = data?.audioId ?? data?.audio_id;
			if (audioId) {
				await loadRecords();
				await loadSegments(audioId);
				setExpandedRecordId(audioId);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setIsUploading(false);
		}
	};

	const uploadFile = async (file: File) => {
		setIsUploading(true);
		setError(null);
		try {
			const formData = new FormData();
			formData.append("file", file);
			const response = await fetch(`/api/audio/transcriptions?process=true`, {
				method: "POST",
				body: formData,
			});
			if (!response.ok) {
				const message = await response.text();
				throw new Error(message || `HTTP ${response.status}`);
			}
			const data = await response.json();
			const audioId = data?.audioId ?? data?.audio_id;
			if (audioId) {
				await loadRecords();
				await loadSegments(audioId);
				setExpandedRecordId(audioId);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setIsUploading(false);
		}
	};


	const normalizeRecord = (record: any): AudioRecord => ({
		id: record.id,
		name: record.name ?? null,
		createdAt: record.createdAt ?? record.created_at,
		status: record.status,
		language: record.language ?? null,
		duration: record.duration ?? null,
		fileSize: record.fileSize ?? record.file_size,
	});

	const normalizeSegment = (segment: any): AudioSegment => ({
		id: segment.id,
		audioId: segment.audioId ?? segment.audio_id,
		startTime: segment.startTime ?? segment.start_time,
		endTime: segment.endTime ?? segment.end_time,
		textContent: segment.textContent ?? segment.text_content,
		speaker: segment.speaker,
	});

	const loadRecords = async () => {
		try {
			const response = await fetch("/api/audio/records?limit=20");
			if (!response.ok) return;
			const data = await response.json();
			setRecords((data || []).map(normalizeRecord));
		} catch (err) {
			console.error(err);
		}
	};

	const loadSegments = async (audioId: number): Promise<AudioSegment[]> => {
		if (segments[audioId]) return segments[audioId] ?? [];
		try {
			const response = await fetch(`/api/audio/records/${audioId}/segments`);
			if (!response.ok) return [];
			const data = await response.json();
			setSegments((prev) => ({
				...prev,
				[audioId]: (data || []).map(normalizeSegment),
			}));
			return (data || []).map(normalizeSegment) as AudioSegment[];
		} catch (err) {
			console.error(err);
			return [];
		}
	};

	const toggleRecord = () => {
		if (isRecording) {
			stopRecording();
		} else {
			void startRecording();
		}
	};

	const formatDuration = (seconds: number) => {
		const mins = Math.floor(seconds / 60)
			.toString()
			.padStart(2, "0");
		const secs = Math.floor(seconds % 60)
			.toString()
			.padStart(2, "0");
		return `${mins}:${secs}`;
	};

	const formatStatus = (status: string) => {
		const mapping: Record<string, string> = {
			pending: t("statusPending"),
			processing: t("statusProcessing"),
			done: t("statusDone"),
			failed: t("statusFailed"),
			deleted: t("statusDeleted"),
		};
		return mapping[status] ?? status;
	};

	const startRename = (record: AudioRecord) => {
		setEditingRecordId(record.id);
		setNameDraft(record.name ?? "");
	};

	const cancelRename = () => {
		setEditingRecordId(null);
		setNameDraft("");
	};

	const saveRename = async (recordId: number) => {
		setError(null);
		try {
			const response = await fetch(`/api/audio/records/${recordId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: nameDraft.trim() || null }),
			});
			if (!response.ok) {
				const message = await response.text();
				throw new Error(message || `HTTP ${response.status}`);
			}
			setRecords((prev) =>
				prev.map((item) =>
					item.id === recordId ? { ...item, name: nameDraft.trim() || null } : item,
				),
			);
			cancelRename();
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		}
	};

	const deleteRecord = async (recordId: number) => {
		const confirmed = window.confirm(t("confirmDelete"));
		if (!confirmed) return;
		setError(null);
		try {
			const response = await fetch(`/api/audio/records/${recordId}`, {
				method: "DELETE",
			});
			if (!response.ok) {
				const message = await response.text();
				throw new Error(message || `HTTP ${response.status}`);
			}
			setRecords((prev) => prev.filter((item) => item.id !== recordId));
			setSegments((prev) => {
				const next = { ...prev };
				delete next[recordId];
				return next;
			});
			if (expandedRecordId === recordId) {
				setExpandedRecordId(null);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		}
	};

	const buildTranscriptText = (record: AudioRecord, recordSegments: AudioSegment[]) => {
		const title = record.name || t("recordTitle", { id: record.id });
		const header = t("importHeader", { title });
		const lines = recordSegments.map((segment) => {
			const speaker = segment.speaker || t("speakerUnknown");
			const text = segment.textContent || t("noText");
			return `${speaker}: ${text}`;
		});
		return `${header}\n\n${lines.join("\n")}`;
	};

	const importToChat = async (record: AudioRecord) => {
		let recordSegments = segments[record.id];
		if (!recordSegments) {
			recordSegments = await loadSegments(record.id);
		}
		if (!recordSegments || recordSegments.length === 0) {
			setError(t("noText"));
			return;
		}
		const prompt = buildTranscriptText(record, recordSegments);
		window.dispatchEvent(new CustomEvent("chat:prefill", { detail: { text: prompt } }));
		if (!getIsFeatureOpen("chat")) {
			toggleFeature("chat");
		}
	};

	return (
		<div className="flex h-full flex-col overflow-hidden bg-background">
			<PanelHeader icon={Mic} title={t("title")} />
			<div className="flex flex-col gap-4 border-b border-border px-4 py-3">
				<div className="flex flex-wrap items-center gap-3">
					<button
						type="button"
						onClick={toggleRecord}
						disabled={isUploading}
						className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
							isRecording
								? "bg-red-600 text-white hover:bg-red-500"
								: "bg-primary text-primary-foreground hover:bg-primary/90"
						}`}
					>
						{isRecording ? (
							<PauseCircle className="h-4 w-4" />
						) : (
							<PlayCircle className="h-4 w-4" />
						)}
						{isRecording ? t("stopRecording") : t("startRecording")}
					</button>
					{isRecording && (
						<span className="text-sm text-muted-foreground">
							{t("recording")}: {formatDuration(recordingSeconds)}
						</span>
					)}
					<label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
						<input
							type="file"
							accept="audio/*"
							onChange={(event) => {
								const file = event.target.files?.[0];
								if (file) {
									void uploadFile(file);
								}
								event.currentTarget.value = "";
							}}
							className="hidden"
						/>
						<span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5">
							<Upload className="h-4 w-4" />
							{t("uploadFile")}
						</span>
					</label>
					<button
						type="button"
						onClick={() => void loadRecords()}
						className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
					>
						<RefreshCw className="h-4 w-4" />
						{t("refresh")}
					</button>
				</div>
				{isUploading && (
					<div className="text-xs text-muted-foreground">
						{t("uploading")}
					</div>
				)}
				{error && <div className="text-xs text-red-500">{error}</div>}
			</div>

			<div className="flex-1 overflow-y-auto px-4 py-4">
				{records.length === 0 ? (
					<div className="text-sm text-muted-foreground">{t("empty")}</div>
				) : (
					<div className="space-y-4">
						{records.map((record) => (
							<div
								key={record.id}
								className="rounded-xl border border-border bg-card/60"
							>
								<div
									role="button"
									tabIndex={0}
									onClick={() => {
										const next =
											expandedRecordId === record.id ? null : record.id;
										setExpandedRecordId(next);
										if (next) {
											void loadSegments(record.id);
										}
									}}
									onKeyDown={(event) => {
										if (event.key !== "Enter" && event.key !== " ") return;
										event.preventDefault();
										const next =
											expandedRecordId === record.id ? null : record.id;
										setExpandedRecordId(next);
										if (next) {
											void loadSegments(record.id);
										}
									}}
									className="flex w-full items-center justify-between px-4 py-3 text-left"
								>
									<div className="space-y-1">
										{editingRecordId === record.id ? (
											<div className="flex items-center gap-2">
												<input
													value={nameDraft}
													onChange={(event) => setNameDraft(event.target.value)}
													placeholder={t("renamePlaceholder")}
													className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
												/>
												<button
													type="button"
													onClick={(event) => {
														event.stopPropagation();
														void saveRename(record.id);
													}}
													className="inline-flex items-center gap-1 text-xs text-primary"
												>
													<Save className="h-3 w-3" />
													{t("save")}
												</button>
												<button
													type="button"
													onClick={(event) => {
														event.stopPropagation();
														cancelRename();
													}}
													className="inline-flex items-center gap-1 text-xs text-muted-foreground"
												>
													<X className="h-3 w-3" />
													{t("cancel")}
												</button>
											</div>
										) : (
											<div className="flex items-center gap-2 text-sm font-medium">
												<span>
													{record.name || t("recordTitle", { id: record.id })}
												</span>
												<button
													type="button"
													onClick={(event) => {
														event.stopPropagation();
														startRename(record);
													}}
													className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
												>
													<Pencil className="h-3 w-3" />
													{t("rename")}
												</button>
											</div>
										)}
										<div className="text-xs text-muted-foreground">
											{new Date(record.createdAt).toLocaleString()} · {t("status")}: {formatStatus(record.status)}
										</div>
									</div>
									<span className="text-xs text-muted-foreground">
										{expandedRecordId === record.id ? t("collapse") : t("expand")}
									</span>
								</div>
								<div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground">
									<div className="flex items-center gap-3">
										<button
											type="button"
											onClick={() => void importToChat(record)}
											className="inline-flex items-center gap-1 text-xs text-primary"
										>
											<MessageSquare className="h-3 w-3" />
											{t("importToChat")}
										</button>
										<button
											type="button"
											onClick={() => void deleteRecord(record.id)}
											className="inline-flex items-center gap-1 text-xs text-red-500"
										>
											<Trash2 className="h-3 w-3" />
											{t("delete")}
										</button>
									</div>
								</div>
								{expandedRecordId === record.id && (
									<div className="border-t border-border px-4 py-3">
										{segments[record.id]?.length ? (
											<div className="space-y-3">
												{segments[record.id].map((segment) => (
													<div
														key={segment.id}
														className="rounded-lg bg-muted/40 px-3 py-2"
													>
														<div className="text-xs text-muted-foreground">
															{segment.speaker || t("speakerUnknown")} · {segment.startTime.toFixed(2)}s - {segment.endTime.toFixed(2)}s
														</div>
														<div className="text-sm text-foreground">
															{segment.textContent || t("noText")}
														</div>
													</div>
												))}
											</div>
										) : (
											<div className="text-sm text-muted-foreground">
												{t("loadingSegments")}
											</div>
										)}
									</div>
								)}
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
