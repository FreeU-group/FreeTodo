"use client";

import { motion } from "framer-motion";
import { Mic, Radio } from "lucide-react";
import { useEffect, useState } from "react";

interface RecordingStatusProps {
	isRecording: boolean;
	recordingStartedAt?: number; // 录音开始时间（Date.now() 毫秒时间戳）
	duration?: number; // 录音时长（秒，预留用于外部传入）
}

export function RecordingStatus({ isRecording, recordingStartedAt }: RecordingStatusProps) {
	const [elapsedTime, setElapsedTime] = useState(0);

	// 实时更新录音时长（基于录音开始时间，不会因为组件重新挂载而重置）
	useEffect(() => {
		if (!isRecording || !recordingStartedAt) {
			setElapsedTime(0);
			return;
		}

		// 使用 Date.now() 计算经过时间（与 store 中 recordingStartedAt 的时间基准一致）
		const updateElapsedTime = () => {
			const elapsed = Math.floor((Date.now() - recordingStartedAt) / 1000);
			setElapsedTime(Math.max(0, elapsed));
		};

		updateElapsedTime(); // 立即更新一次

		const interval = setInterval(updateElapsedTime, 1000);

		return () => clearInterval(interval);
	}, [isRecording, recordingStartedAt]);

	const formatTime = (seconds: number) => {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins}:${secs.toString().padStart(2, "0")}`;
	};

	return (
		<div className="px-4 py-3 flex items-center gap-3 border-t border-[oklch(var(--border))] bg-[oklch(var(--muted))]/30">
			{/* 录音指示器 */}
			<div className="relative flex items-center justify-center flex-shrink-0">
				{isRecording ? (
					<>
						{/* 脉冲动画 */}
						<motion.div
							className="absolute w-full h-full bg-red-500/30 rounded-full"
							animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0, 0.3] }}
							transition={{
								duration: 1.5,
								repeat: Infinity,
								ease: "easeOut",
							}}
						/>
						<div className="relative z-10 p-2 rounded-full bg-red-500/20">
							<Mic className="h-4 w-4 text-red-500" />
						</div>
					</>
				) : (
					<div className="p-2 rounded-full bg-[oklch(var(--muted))]">
						<Mic className="h-4 w-4 text-[oklch(var(--muted-foreground))]" />
					</div>
				)}
			</div>

			{/* 状态信息 */}
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-2">
					{isRecording ? (
						<>
							<span className="text-sm font-medium text-red-500">正在录音</span>
							<motion.div
								className="flex items-center gap-1"
								initial={{ opacity: 0 }}
								animate={{ opacity: [0, 1, 0] }}
								transition={{
									duration: 1.5,
									repeat: Infinity,
									ease: "easeInOut",
								}}
							>
								<Radio className="h-3 w-3 text-red-500" />
							</motion.div>
						</>
					) : (
						<span className="text-sm text-[oklch(var(--muted-foreground))]">待机中</span>
					)}
				</div>
				<div className="flex items-center gap-2 mt-1">
					<span className="text-xs text-[oklch(var(--muted-foreground))]">
						时长: {formatTime(elapsedTime)}
					</span>
					{isRecording && (
						<div className="flex items-center gap-1">
							<div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
							<span className="text-xs text-red-500">实时转录中</span>
						</div>
					)}
				</div>
			</div>

			{/* 波形指示器（可选） */}
			{isRecording && (
				<div className="flex items-center gap-1 h-6">
					{[0, 1, 2, 3].map((i) => (
						<motion.div
							key={i}
							className="w-1 bg-red-500 rounded-full"
							animate={{
								height: [4, 16, 4],
								opacity: [0.5, 1, 0.5],
							}}
							transition={{
								duration: 0.8,
								repeat: Infinity,
								delay: i * 0.1,
								ease: "easeInOut",
							}}
						/>
					))}
				</div>
			)}
		</div>
	);
}
