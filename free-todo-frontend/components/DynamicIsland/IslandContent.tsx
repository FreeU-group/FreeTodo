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

// --- 1. FLOAT STATE: 录音控制 + Logo ---
export const FloatContent: React.FC<{
	onToggleRecording?: () => void;
	onStopRecording?: () => void;
	onScreenshot?: () => void; // 切换截屏开关
	screenshotEnabled?: boolean; // 截屏开关状态
	isCollapsed?: boolean; // 是否收起状态
	isRecording?: boolean; // 录音状态（通过 props 传递）
	isPaused?: boolean; // 暂停状态（通过 props 传递）
	onOpenPanel?: () => void; // 点击最右侧图标展开 Panel
}> = ({
	onToggleRecording: _onToggleRecording, // TODO: 暂时未使用，功能已禁用
	onStopRecording: _onStopRecording, // TODO: 暂时未使用，功能已禁用
	onScreenshot,
	screenshotEnabled = false,
	isCollapsed = false,
	isRecording = false,
	isPaused: _isPaused = false, // TODO: 暂时未使用，功能已禁用
	onOpenPanel,
}) => {

	// 收起状态：只显示六边形图标
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

	// 展开状态：显示完整内容 - 三个图标并列，留点间距
	return (
		<motion.div
			variants={fadeVariants}
			initial="initial"
			animate="animate"
			exit="exit"
			className="w-full h-full flex items-center justify-center gap-4 relative group"
			style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties} // 录音按钮区域不允许拖拽
		>
			{/* Left: Recording Status - 可点击区域 */}
			{/* TODO: 暂时注释掉功能回调，只保留UI */}
			<div
				className="flex items-center justify-center cursor-pointer flex-shrink-0"
				// onClick={(e) => {
				// 	e.stopPropagation();
				// 	// 单击开始/暂停/恢复录音
				// 	onToggleRecording?.();
				// }}
				// onDoubleClick={(e) => {
				// 	e.stopPropagation();
				// 	// 双击停止录音
				// 	if (isRecording && onStopRecording) {
				// 		onStopRecording();
				// 	}
				// }}
				// onKeyDown={(e) => {
				// 	if (e.key === "Enter" || e.key === " ") {
				// 		e.preventDefault();
				// 		onToggleRecording?.();
				// 	}
				// }}
				// role="button"
				// tabIndex={0}
				title="麦克风（功能暂时禁用）"
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

			{/* Center: 截屏开关按钮 */}
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
				title={
					screenshotEnabled ? "截屏已开启，单击关闭" : "截屏已关闭，单击开启"
				}
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

			{/* Right: Logo 图标，点击切换到 Panel 模式 */}
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
};

// --- 2. FULLSCREEN STATE: 全屏模式下不渲染内容，让系统前端页面显示 ---
// 注意：全屏模式下，这个组件不会被渲染
// 全屏时灵动岛容器会被隐藏，直接显示底层应用
export const FullScreenContent: React.FC = () => {
	return null; // 全屏模式下不渲染任何内容，让底层应用显示
};
