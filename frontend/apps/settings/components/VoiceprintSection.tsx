"use client";

import { Mic, RotateCcw, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { toastError, toastSuccess } from "@/lib/toast";
import { SettingsSection } from "./SettingsSection";

interface VoiceprintSectionProps {
	loading?: boolean;
}

type RecordingState = "idle" | "recording" | "uploading";

export function VoiceprintSection({ loading = false }: VoiceprintSectionProps) {
	const t = useTranslations("page.settings");

	const [recordingState, setRecordingState] = useState<RecordingState>("idle");
	const [voiceprintInfo, setVoiceprintInfo] = useState<{
		exists: boolean;
		path?: string;
		size?: number;
	} | null>(null);

	const mediaRecorderRef = useRef<MediaRecorder | null>(null);
	const chunksRef = useRef<Blob[]>([]);

	const fetchVoiceprintStatus = useCallback(async () => {
		try {
			const res = await fetch("/api/setup/voiceprint-status");
			if (res.ok) {
				const data = await res.json();
				setVoiceprintInfo(data);
			}
		} catch {
			// endpoint may not exist yet
		}
	}, []);

	useEffect(() => {
		fetchVoiceprintStatus();
	}, [fetchVoiceprintStatus]);

	const startRecording = async () => {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: true,
			});
			const recorder = new MediaRecorder(stream, {
				mimeType: "audio/webm",
			});
			chunksRef.current = [];
			recorder.ondataavailable = (e) => {
				if (e.data.size > 0) chunksRef.current.push(e.data);
			};
			recorder.onstop = async () => {
				stream.getTracks().forEach((track) => track.stop());
				const blob = new Blob(chunksRef.current, { type: "audio/webm" });
				await uploadVoiceprint(blob);
			};
			recorder.start();
			mediaRecorderRef.current = recorder;
			setRecordingState("recording");
		} catch {
			toastError(t("voiceprintMicError"));
		}
	};

	const stopRecording = () => {
		if (mediaRecorderRef.current?.state === "recording") {
			mediaRecorderRef.current.stop();
			setRecordingState("uploading");
		}
	};

	const uploadVoiceprint = async (blob: Blob) => {
		try {
			const formData = new FormData();
			formData.append("file", blob, "voiceprint.webm");
			const res = await fetch("/api/setup/save-voiceprint", {
				method: "POST",
				body: formData,
			});
			if (!res.ok) throw new Error(`${res.status}`);
			toastSuccess(t("voiceprintSaved"));
			await fetchVoiceprintStatus();
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			toastError(t("voiceprintSaveFailed", { error: msg }));
		} finally {
			setRecordingState("idle");
		}
	};

	const handleDeleteVoiceprint = async () => {
		if (!window.confirm(t("voiceprintDeleteConfirm"))) return;
		try {
			const res = await fetch("/api/setup/delete-voiceprint", {
				method: "POST",
			});
			if (!res.ok) throw new Error(`${res.status}`);
			toastSuccess(t("voiceprintDeleted"));
			await fetchVoiceprintStatus();
		} catch {
			toastError(t("voiceprintDeleteFailed"));
		}
	};

	const isLoading = loading || recordingState !== "idle";

	return (
		<SettingsSection
			title={t("voiceprintTitle")}
			description={t("voiceprintDescription")}
			searchKeywords={[t("voiceprintTitle"), "voiceprint", "voice"]}
		>
			<div className="space-y-3">
				<div className="flex items-center gap-3">
					<div
						className={`flex h-10 w-10 items-center justify-center rounded-full ${
							voiceprintInfo?.exists
								? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
								: "bg-muted text-muted-foreground"
						}`}
					>
						<Mic className="h-5 w-5" />
					</div>
					<div>
						<p className="text-sm font-medium">
							{voiceprintInfo?.exists
								? t("voiceprintStatusRecorded")
								: t("voiceprintStatusNone")}
						</p>
						{voiceprintInfo?.exists && voiceprintInfo.path && (
							<p className="text-xs text-muted-foreground">
								{voiceprintInfo.path.split(/[/\\]/).pop()}
							</p>
						)}
					</div>
				</div>

				<div className="flex items-center gap-2">
					{recordingState === "recording" ? (
						<button
							type="button"
							onClick={stopRecording}
							className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground"
						>
							<span className="h-2 w-2 animate-pulse rounded-full bg-destructive" />
							{t("voiceprintStopRecording")}
						</button>
					) : (
						<button
							type="button"
							onClick={startRecording}
							disabled={isLoading}
							className="flex items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
						>
							<RotateCcw className="h-4 w-4" />
							{voiceprintInfo?.exists
								? t("voiceprintReRecord")
								: t("voiceprintRecord")}
						</button>
					)}

					{recordingState === "uploading" && (
						<span className="text-sm text-muted-foreground">
							{t("voiceprintUploading")}
						</span>
					)}

					{voiceprintInfo?.exists && recordingState === "idle" && (
						<button
							type="button"
							onClick={handleDeleteVoiceprint}
							disabled={isLoading}
							className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
						>
							<Trash2 className="h-4 w-4" />
							{t("voiceprintDelete")}
						</button>
					)}
				</div>
			</div>
		</SettingsSection>
	);
}
