"use client";

import { Mic } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

interface VoiceprintStepProps {
	onNext: () => void;
	onBack: () => void;
}

const RECORD_SECONDS = 5;
const BAR_COUNT = 40;
const BAR_IDS = Array.from({ length: BAR_COUNT }, (_, index) => `bar-${index}`);

export function VoiceprintStep({ onNext, onBack }: VoiceprintStepProps) {
	const t = useTranslations("onboarding");
	const [phase, setPhase] = useState<"idle" | "recording" | "stopping" | "done" | "error">("idle");
	const [elapsed, setElapsed] = useState(0);
	const [bars, setBars] = useState<number[]>(new Array(BAR_COUNT).fill(0));
	const [errorMsg, setErrorMsg] = useState("");

	const animRef = useRef<number>(0);
	const phaseRef = useRef(phase);
	phaseRef.current = phase;
	const mediaRef = useRef<MediaStream | null>(null);
	const analyserRef = useRef<AnalyserNode | null>(null);

	const cleanup = useCallback(() => {
		if (animRef.current) cancelAnimationFrame(animRef.current);
		if (mediaRef.current) {
			for (const t of mediaRef.current.getTracks()) t.stop();
			mediaRef.current = null;
		}
		analyserRef.current = null;
	}, []);

	useEffect(() => () => cleanup(), [cleanup]);

	const stopBackendRecording = async () => {
		try {
			await fetch("/api/audio/local-mic/stop", { method: "POST" });
		} catch {
			// best effort
		}
	};

	const startRecording = async () => {
		setErrorMsg("");

		// 1. Start backend recording (actual audio capture + save)
		try {
			const res = await fetch("/api/audio/local-mic/start", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ device: null, is_24x7: false }),
			});
			const data = await res.json();
			if (!res.ok || (data.status !== "started" && data.status !== "already_running")) {
				setPhase("error");
				setErrorMsg(t("voiceprintBackendStartFailed"));
				return;
			}
		} catch {
			setPhase("error");
			setErrorMsg(t("voiceprintBackendConnectFailed"));
			return;
		}

		// 2. Open browser mic ONLY for real-time waveform visualization
		let analyser: AnalyserNode | null = null;
		let freqData: Uint8Array<ArrayBuffer> | null = null;
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			mediaRef.current = stream;
			const audioCtx = new AudioContext();
			const source = audioCtx.createMediaStreamSource(stream);
			analyser = audioCtx.createAnalyser();
			analyser.fftSize = 128;
			source.connect(analyser);
			analyserRef.current = analyser;
			freqData = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
		} catch {
			// If browser mic fails (e.g. LAN IP), fall back to simulated waveform
		}

		setPhase("recording");
		setElapsed(0);

		const startTime = Date.now();
		const barSpeeds = Array.from({ length: BAR_COUNT }, () => 80 + Math.random() * 200);
		const barPhases = Array.from({ length: BAR_COUNT }, () => Math.random() * Math.PI * 2);

		const tick = () => {
			if (phaseRef.current !== "recording") return;

			const now = Date.now();
			const sec = (now - startTime) / 1000;
			setElapsed(Math.min(sec, RECORD_SECONDS));

			let newBars: number[];

			if (analyser && freqData) {
				// Real mic frequency data for visualization
				const currentFreqData = freqData;
				analyser.getByteFrequencyData(currentFreqData);
				const binCount = analyser.frequencyBinCount;
				const step = Math.max(1, Math.floor(binCount / BAR_COUNT));
				newBars = Array.from({ length: BAR_COUNT }, (_, i) => {
					const idx = Math.min(i * step, binCount - 1);
					return currentFreqData[idx] / 255;
				});
			} else {
				// Fallback: simulated waveform
				newBars = Array.from({ length: BAR_COUNT }, (_, i) => {
					const wave = Math.sin(now / barSpeeds[i] + barPhases[i]) * 0.5 + 0.5;
					const noise = Math.random() * 0.35;
					const center = Math.abs(i - BAR_COUNT / 2) / (BAR_COUNT / 2);
					const envelope = 1 - center * 0.4;
					return Math.min(1, (wave * 0.55 + noise) * envelope);
				});
			}

			setBars(newBars);

			if (sec >= RECORD_SECONDS) {
				cleanup();
				setPhase("stopping");
				setBars(new Array(BAR_COUNT).fill(0));
				stopBackendRecording().then(() => setPhase("done"));
				return;
			}
			animRef.current = requestAnimationFrame(tick);
		};
		animRef.current = requestAnimationFrame(tick);
	};

	return (
		<div className="flex w-full max-w-md flex-col gap-5">
			<div className="text-center">
				<div className="mb-4 flex justify-center">
					<div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/20 text-primary">
						<Mic className="h-6 w-6" />
					</div>
				</div>
				<h2 className="text-xl font-bold text-white">{t("voiceprintTitle")}</h2>
				<p className="mt-1 text-sm text-white/60">
					{t("voiceprintDescription")}
				</p>
			</div>

			{/* Sample text to read */}
			<div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center">
				<p className="text-sm leading-relaxed text-white/80">
					{t("voiceprintSample")}
				</p>
			</div>

			{/* Waveform visualizer */}
			<div className="flex h-16 items-center justify-center gap-[2px] rounded-xl border border-white/10 bg-black/20 px-4">
				{BAR_IDS.map((barId, i) => {
					const level = bars[i] ?? 0;
					const isActive = phase === "recording";
					const h = isActive ? Math.max(4, level * 56) : 4;
					return (
						<div
							key={barId}
							className="w-1.5 rounded-full"
							style={{
								height: `${h}px`,
								transition: "height 60ms ease-out",
								background: isActive
									? `linear-gradient(to top, oklch(var(--primary)), oklch(var(--primary) / 0.4))`
									: "rgba(255,255,255,0.12)",
							}}
						/>
					);
				})}
			</div>

			{/* Status */}
			<div className="text-center">
				{phase === "idle" && (
					<button
						type="button"
						onClick={startRecording}
					className="inline-flex items-center gap-2 rounded-full bg-red-500/80 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-red-500/20 transition hover:bg-red-500"
				>
					<span className="h-2.5 w-2.5 rounded-full bg-white" />
					{t("voiceprintStartRecording", { seconds: RECORD_SECONDS })}
				</button>
			)}
			{phase === "recording" && (
				<div className="space-y-1">
					<div className="flex items-center justify-center gap-2">
						<span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
						<span className="text-sm font-medium text-red-400">{t("voiceprintRecording")}</span>
					</div>
						<div className="text-xs text-white/40">
							{elapsed.toFixed(1)}s / {RECORD_SECONDS}s
						</div>
						<div className="mx-auto h-1 w-32 overflow-hidden rounded-full bg-white/10">
							<div
								className="h-full rounded-full bg-red-500 transition-all duration-100"
								style={{ width: `${(elapsed / RECORD_SECONDS) * 100}%` }}
							/>
						</div>
					</div>
				)}
			{phase === "stopping" && (
				<div className="flex items-center justify-center gap-2">
					<div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-primary" />
					<span className="text-sm text-white/60">{t("voiceprintSaving")}</span>
				</div>
			)}
			{phase === "done" && (
				<div className="space-y-2">
					<p className="text-sm font-medium text-green-400">
						{t("voiceprintDone")}
					</p>
					<button
							type="button"
							onClick={() => {
								setPhase("idle");
								setBars(new Array(BAR_COUNT).fill(0));
						}}
						className="text-xs text-white/40 hover:text-white/60"
					>
						{t("voiceprintRetryRecording")}
					</button>
				</div>
			)}
				{phase === "error" && (
					<div className="space-y-2">
						<p className="text-sm font-medium text-red-400">{errorMsg}</p>
						<button
							type="button"
							onClick={() => {
								setPhase("idle");
								setBars(new Array(BAR_COUNT).fill(0));
						}}
						className="text-xs text-white/40 hover:text-white/60"
					>
						{t("voiceprintRetry")}
					</button>
				</div>
			)}
			</div>

			<div className="flex gap-3">
				<button
					type="button"
					onClick={onBack}
					className="flex-1 rounded-lg border border-white/10 bg-white/5 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/10"
				>
					{t("prevBtn")}
				</button>
				<button
					type="button"
					onClick={onNext}
					className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-bold text-white shadow-lg shadow-primary/20 transition hover:brightness-110"
				>
					{phase === "done" ? t("nextBtn") : t("skipBtn")}
				</button>
			</div>
		</div>
	);
}
