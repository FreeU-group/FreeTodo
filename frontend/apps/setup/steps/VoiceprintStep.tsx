"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface VoiceprintStepProps {
	onNext: () => void;
	onBack: () => void;
}

const RECORD_SECONDS = 5;

export function VoiceprintStep({ onNext, onBack }: VoiceprintStepProps) {
	const [phase, setPhase] = useState<"idle" | "recording" | "done">("idle");
	const [elapsed, setElapsed] = useState(0);
	const [levels, setLevels] = useState<number[]>([]);
	const mediaRef = useRef<MediaStream | null>(null);
	const analyserRef = useRef<AnalyserNode | null>(null);
	const animRef = useRef<number>(0);

	const cleanup = useCallback(() => {
		if (animRef.current) cancelAnimationFrame(animRef.current);
		if (mediaRef.current) {
			for (const t of mediaRef.current.getTracks()) t.stop();
			mediaRef.current = null;
		}
	}, []);

	useEffect(() => () => cleanup(), [cleanup]);

	const startRecording = async () => {
		setPhase("recording");
		setElapsed(0);
		setLevels([]);

		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			mediaRef.current = stream;

			const ctx = new AudioContext();
			const source = ctx.createMediaStreamSource(stream);
			const analyser = ctx.createAnalyser();
			analyser.fftSize = 256;
			source.connect(analyser);
			analyserRef.current = analyser;

			const dataArray = new Uint8Array(analyser.frequencyBinCount);
			const startTime = Date.now();

			const tick = () => {
				const now = Date.now();
				const sec = (now - startTime) / 1000;
				setElapsed(Math.min(sec, RECORD_SECONDS));

				analyser.getByteFrequencyData(dataArray);
				const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
				setLevels((prev) => [...prev.slice(-59), avg / 255]);

				if (sec >= RECORD_SECONDS) {
					cleanup();
					setPhase("done");
					return;
				}
				animRef.current = requestAnimationFrame(tick);
			};
			animRef.current = requestAnimationFrame(tick);
		} catch {
			setPhase("idle");
		}
	};

	const barCount = 40;

	return (
		<div className="flex w-full max-w-md flex-col gap-5">
			<div className="text-center">
				<div className="mb-2 text-3xl">🎙️</div>
				<h2 className="text-xl font-bold text-white">声纹录制</h2>
				<p className="mt-1 text-sm text-white/60">
					朗读下面的文字，帮助 Agent 学会识别你的声音
				</p>
			</div>

			{/* Sample text to read */}
			<div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center">
				<p className="text-sm leading-relaxed text-white/80">
					「今天天气真不错，我想出去走走，顺便买杯咖啡。」
				</p>
			</div>

			{/* Waveform visualizer */}
			<div className="flex h-16 items-end justify-center gap-[2px] rounded-xl border border-white/10 bg-black/20 px-4">
				{Array.from({ length: barCount }).map((_, i) => {
					const level = levels[levels.length - barCount + i] ?? 0;
					const h = Math.max(4, level * 56);
					return (
						<div
							key={i}
							className="w-1.5 rounded-full transition-all duration-75"
							style={{
								height: `${h}px`,
								background:
									phase === "recording"
										? `linear-gradient(to top, oklch(var(--primary)), oklch(var(--primary) / 0.5))`
										: "rgba(255,255,255,0.15)",
							}}
						/>
					);
				})}
			</div>

			{/* Timer / status */}
			<div className="text-center">
				{phase === "idle" && (
					<button
						type="button"
						onClick={startRecording}
						className="inline-flex items-center gap-2 rounded-full bg-red-500/80 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-red-500/20 transition hover:bg-red-500"
					>
						<span className="h-2.5 w-2.5 rounded-full bg-white" />
						开始录制（{RECORD_SECONDS} 秒）
					</button>
				)}
				{phase === "recording" && (
					<div className="space-y-1">
						<div className="flex items-center justify-center gap-2">
							<span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
							<span className="text-sm font-medium text-red-400">录音中</span>
						</div>
						<div className="text-xs text-white/40">
							{elapsed.toFixed(1)}s / {RECORD_SECONDS}s
						</div>
						{/* Progress bar */}
						<div className="mx-auto h-1 w-32 overflow-hidden rounded-full bg-white/10">
							<div
								className="h-full rounded-full bg-red-500 transition-all duration-100"
								style={{ width: `${(elapsed / RECORD_SECONDS) * 100}%` }}
							/>
						</div>
					</div>
				)}
				{phase === "done" && (
					<div className="space-y-2">
						<p className="text-sm font-medium text-green-400">
							✅ 录制完成！声纹已保存
						</p>
						<button
							type="button"
							onClick={() => {
								setPhase("idle");
								setLevels([]);
							}}
							className="text-xs text-white/40 hover:text-white/60"
						>
							重新录制
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
					上一步
				</button>
				<button
					type="button"
					onClick={onNext}
					className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-bold text-white shadow-lg shadow-primary/20 transition hover:brightness-110"
				>
					{phase === "done" ? "下一步" : "跳过"}
				</button>
			</div>
		</div>
	);
}
