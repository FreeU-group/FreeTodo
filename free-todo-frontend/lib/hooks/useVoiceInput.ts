import type { RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type VoiceInputError = "unsupported" | "permission" | "upload" | "empty";

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

type UseVoiceInputOptions = {
	onText: (text: string) => void;
	targetRef: RefObject<HTMLElement | null>;
	endpoint?: string;
	language?: string;
	hotkeyCode?: string;
	onStatusChange?: (status: "recording" | "transcribing" | null) => void;
};

export function useVoiceInput({
	onText,
	targetRef,
	endpoint = "/api/audio/transcriptions/quick",
	language,
	hotkeyCode = "AltRight",
	onStatusChange,
}: UseVoiceInputOptions) {
	const [isRecording, setIsRecording] = useState(false);
	const [isTranscribing, setIsTranscribing] = useState(false);
	const [error, setError] = useState<VoiceInputError | null>(null);

	const mediaRecorderRef = useRef<MediaRecorder | null>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const chunksRef = useRef<Blob[]>([]);

	const mimeType = useMemo(() => pickSupportedMimeType(), []);

	const cleanup = useCallback(() => {
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
	}, []);

	const uploadBlob = useCallback(
		async (blob: Blob) => {
			setIsTranscribing(true);
			onStatusChange?.("transcribing");
			setError(null);
			try {
				const formData = new FormData();
				const ext = blob.type.includes("ogg") ? "ogg" : "webm";
				const file = new File([blob], `voice.${ext}`, { type: blob.type });
				formData.append("file", file);

				const url = language ? `${endpoint}?language=${encodeURIComponent(language)}` : endpoint;
				const response = await fetch(url, {
					method: "POST",
					body: formData,
				});

				if (!response.ok) {
					throw new Error(`HTTP ${response.status}`);
				}

				const data = await response.json();
				const segments = (data?.segments || []) as Array<{
					text_content?: string;
					textContent?: string;
				}>;
				const text = segments
					.map((segment) => segment.textContent ?? segment.text_content ?? "")
					.filter(Boolean)
					.join(" ");
				if (!text) {
					setError("empty");
					return;
				}
				onText(text);
			} catch (err) {
				console.error(err);
				setError("upload");
			} finally {
				setIsTranscribing(false);
				onStatusChange?.(null);
			}
		},
		[endpoint, language, onText, onStatusChange],
	);

	const startRecording = useCallback(async () => {
		if (!navigator.mediaDevices?.getUserMedia) {
			setError("unsupported");
			return;
		}
		if (isTranscribing) return;
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
				chunksRef.current = [];
				void uploadBlob(blob);
			};

			recorder.start();
			setIsRecording(true);
			onStatusChange?.("recording");
		} catch (err) {
			console.error(err);
			setError("permission");
			cleanup();
		}
	}, [cleanup, isTranscribing, mimeType, uploadBlob, onStatusChange]);

	const stopRecording = useCallback(() => {
		if (!mediaRecorderRef.current) return;
		setIsRecording(false);
		onStatusChange?.(null);
		mediaRecorderRef.current.stop();
		cleanup();
	}, [cleanup, onStatusChange]);

	const toggleRecording = useCallback(() => {
		if (isRecording) {
			stopRecording();
		} else {
			void startRecording();
		}
	}, [isRecording, startRecording, stopRecording]);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.code !== hotkeyCode) return;
			if (event.repeat) return;
			if (!targetRef.current) return;
			if (document.activeElement !== targetRef.current) return;
			event.preventDefault();
			void startRecording();
		};

		const handleKeyUp = (event: KeyboardEvent) => {
			if (event.code !== hotkeyCode) return;
			if (!targetRef.current) return;
			if (document.activeElement !== targetRef.current) return;
			event.preventDefault();
			stopRecording();
		};

		window.addEventListener("keydown", handleKeyDown);
		window.addEventListener("keyup", handleKeyUp);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
			window.removeEventListener("keyup", handleKeyUp);
		};
	}, [targetRef, startRecording, stopRecording, hotkeyCode]);

	useEffect(() => cleanup, [cleanup]);

	return {
		isRecording,
		isTranscribing,
		error,
		startRecording,
		stopRecording,
		toggleRecording,
		clearError: () => setError(null),
	};
}
