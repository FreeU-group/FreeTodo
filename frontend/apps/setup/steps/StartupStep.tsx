"use client";

import { useEffect, useState } from "react";
import { Cpu } from "lucide-react";

const STAGES = [
	{ label: "初始化核心引擎", duration: 1200 },
	{ label: "加载配置模块", duration: 1000 },
	{ label: "启动感知服务", duration: 1400 },
	{ label: "初始化记忆模块", duration: 1200 },
	{ label: "就绪", duration: 800 },
];

interface StartupStepProps {
	onComplete: () => void;
}

export function StartupStep({ onComplete }: StartupStepProps) {
	const [stageIdx, setStageIdx] = useState(0);
	const [progress, setProgress] = useState(0);

	useEffect(() => {
		if (stageIdx >= STAGES.length) {
			const t = setTimeout(onComplete, 400);
			return () => clearTimeout(t);
		}

		const stage = STAGES[stageIdx];
		const targetProgress = ((stageIdx + 1) / STAGES.length) * 100;
		const startProgress = (stageIdx / STAGES.length) * 100;
		const step = (targetProgress - startProgress) / (stage.duration / 30);
		let current = startProgress;

		const interval = setInterval(() => {
			current = Math.min(current + step, targetProgress);
			setProgress(current);
			if (current >= targetProgress) {
				clearInterval(interval);
				setStageIdx((i) => i + 1);
			}
		}, 30);

		return () => clearInterval(interval);
	}, [stageIdx, onComplete]);

	const currentLabel =
		stageIdx < STAGES.length ? STAGES[stageIdx].label : "完成";

	return (
		<div className="flex flex-col items-center gap-8">
			{/* Animated logo */}
			<div className="relative flex h-24 w-24 items-center justify-center">
				<div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary" style={{ animationDuration: "2s" }} />
				<div className="absolute inset-2 animate-spin rounded-full border-2 border-transparent border-b-primary/50" style={{ animationDuration: "3s", animationDirection: "reverse" }} />
				<Cpu className="h-10 w-10 text-primary" />
			</div>

			<div className="w-full max-w-xs space-y-3">
				{/* Progress bar */}
				<div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
					<div
						className="h-full rounded-full bg-gradient-to-r from-primary to-primary/70 transition-all duration-100 ease-linear"
						style={{ width: `${progress}%` }}
					/>
				</div>

				{/* Stage label */}
				<p className="text-center text-sm font-medium text-white/80">
					{currentLabel}
				</p>
			</div>
		</div>
	);
}
