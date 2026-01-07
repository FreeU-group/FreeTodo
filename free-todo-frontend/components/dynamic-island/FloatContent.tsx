"use client";

import { motion } from "framer-motion";
import { Camera, Hexagon, Mic } from "lucide-react";
import type React from "react";

const fadeVariants = {
	initial: { opacity: 0, filter: "blur(8px)", scale: 0.98 },
	animate: {
		opacity: 1,
		filter: "blur(0px)",
		scale: 1,
		transition: { duration: 0.4, delay: 0.1 },
	},
	exit: {
		opacity: 0,
		filter: "blur(8px)",
		scale: 1.05,
		transition: { duration: 0.2 },
	},
};

export interface FloatContentProps {
	onToggleRecording?: () => void;
	onStopRecording?: () => void;
	onScreenshot?: () => void;
	screenshotEnabled?: boolean;
	isCollapsed?: boolean;
	isRecording?: boolean;
	isPaused?: boolean;
	onOpenPanel?: () => void;
}

/**
 * 灵动岛悬浮模式内容
 * 功能性回调暂留，可后续接入录音/截图服务
 */
export function FloatContent({
	onToggleRecording: _onToggleRecording,
	onStopRecording: _onStopRecording,
	onScreenshot,
	screenshotEnabled = false,
	isCollapsed = false,
	isRecording = false,
	isPaused: _isPaused = false,
	onOpenPanel,
}: FloatContentProps) {
	if (isCollapsed) {
		return (
			<motion.div
				variants={fadeVariants}
				initial="initial"
				animate="animate"
				exit="exit"
				className="w-full h-full flex items-center justify-center"
				style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
			>
				<Hexagon
					size={20}
					strokeWidth={2.5}
					className="text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]"
				/>
			</motion.div>
		);
	}

	return (
		<motion.div
			variants={fadeVariants}
			initial="initial"
			animate="animate"
			exit="exit"
			className="w-full h-full flex items-center justify-center gap-4 relative group"
			style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
		>
			<div
				className="flex items-center justify-center cursor-pointer flex-shrink-0"
				title="麦克风（功能暂未接入）"
			>
				<div className="relative flex items-center justify-center">
					{isRecording ? (
						<>
							<motion.div
								className="absolute w-full h-full bg-red-500/30 rounded-full"
								animate={{ scale: [1, 1.8, 1], opacity: [0.3, 0, 0.3] }}
								transition={{
									duration: 1.5,
									repeat: Infinity,
									ease: "easeOut",
								}}
							/>
							<div className="w-2.5 h-2.5 bg-red-500 rounded-full shadow-[0_0_8px_rgba(239,68,68,0.6)] z-10"></div>
						</>
					) : (
						<Mic
							size={18}
							strokeWidth={2.5}
							className="text-red-400 drop-shadow-[0_0_8px_rgba(239,68,68,0.4)] transition-all hover:scale-110"
						/>
					)}
				</div>
			</div>

			<div
				className="relative cursor-pointer hover:opacity-80 transition-opacity flex-shrink-0"
				onClick={(e) => {
					e.stopPropagation();
					onScreenshot?.();
				}}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						onScreenshot?.();
					}
				}}
				role="button"
				tabIndex={0}
				title={screenshotEnabled ? "截屏已开启，单击关闭" : "截屏已关闭，单击开启"}
			>
				<Camera
					size={18}
					strokeWidth={2.5}
					className={
						screenshotEnabled
							? "text-green-400 drop-shadow-[0_0_8px_rgba(34,197,94,0.4)] transition-all hover:scale-110"
							: "text-green-400/60 drop-shadow-[0_0_4px_rgba(34,197,94,0.2)] transition-all hover:scale-110"
					}
				/>
				{screenshotEnabled && (
					<motion.div
						className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-green-500 rounded-full"
						animate={{ scale: [1, 1.2, 1], opacity: [1, 0.7, 1] }}
						transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
					/>
				)}
			</div>

			<button
				type="button"
				className="flex items-center justify-center flex-shrink-0"
				onClick={(e) => {
					e.stopPropagation();
					onOpenPanel?.();
				}}
				title="展开为 Panel"
			>
				<Hexagon
					size={18}
					strokeWidth={2.5}
					className="text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]"
				/>
			</button>
		</motion.div>
	);
}


