"use client";

import { motion } from "framer-motion";
import { Calendar, ChevronLeft, ChevronRight, Mic, MicOff, Radio, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef } from "react";

interface AudioHeaderProps {
	isRecording: boolean;
	selectedDate: Date;
	onDateChange: (date: Date) => void;
	onUpload?: () => void;
	onJumpToCurrentDate?: () => void; // 跳转到当前日期
	onStartRecording?: () => void; // 手动开始录音
	onStopRecording?: () => void; // 手动停止录音
}

export function AudioHeader({
	isRecording,
	selectedDate,
	onDateChange,
	onUpload,
	onJumpToCurrentDate,
	onStartRecording,
	onStopRecording,
}: AudioHeaderProps) {
	const t = useTranslations("page");
	const dateInputRef = useRef<HTMLInputElement | null>(null);

	const formatDate = (date: Date) => {
		const year = date.getFullYear();
		const month = date.getMonth() + 1;
		const day = date.getDate();
		return `${year}年${month}月${day}日 录音`;
	};

	const handlePrevDay = () => {
		const prevDate = new Date(selectedDate);
		prevDate.setDate(prevDate.getDate() - 1);
		onDateChange(prevDate);
	};

	const handleNextDay = () => {
		const nextDate = new Date(selectedDate);
		nextDate.setDate(nextDate.getDate() + 1);
		onDateChange(nextDate);
	};

	const handleToday = () => {
		// 点击“今天”弹出日历选择器（同时可快速选回今天）
		if (dateInputRef.current) {
			dateInputRef.current.showPicker?.();
			dateInputRef.current.click();
		} else {
			onDateChange(new Date());
		}
	};

	return (
		<div className="flex items-center justify-between px-4 py-3 border-b border-[oklch(var(--border))]">
			<div className="flex items-center gap-2">
				<input
					ref={dateInputRef}
					type="date"
					className="sr-only"
					value={selectedDate.toISOString().slice(0, 10)}
					onChange={(e) => {
						const v = e.target.value; // YYYY-MM-DD
						if (v) onDateChange(new Date(`${v}T00:00:00`));
					}}
				/>
				<button
					type="button"
					className="p-1.5 rounded hover:bg-[oklch(var(--muted))] transition-colors"
					onClick={handlePrevDay}
				>
					<ChevronLeft className="h-4 w-4" />
				</button>
				<button
					type="button"
					className="p-1.5 rounded hover:bg-[oklch(var(--muted))] transition-colors"
					onClick={handleToday}
					title="选择日期"
				>
					<Calendar className="h-4 w-4" />
				</button>
				<button
					type="button"
					className="p-1.5 rounded hover:bg-[oklch(var(--muted))] transition-colors"
					onClick={handleNextDay}
				>
					<ChevronRight className="h-4 w-4" />
				</button>
				<span className="text-sm text-[oklch(var(--muted-foreground))] ml-2">
					{formatDate(selectedDate)}
				</span>
			</div>

			<div className="flex items-center gap-3">
				{onUpload && (
					<button
						type="button"
						className="px-3 py-1.5 text-sm rounded-md hover:bg-[oklch(var(--muted))] transition-colors"
						onClick={onUpload}
					>
						<Upload className="h-4 w-4 inline mr-1" />
						测试音频
					</button>
				)}
				{/* 录音控制开关 */}
				<div className="flex items-center gap-2">
					{/* 录音状态指示器（点击可跳转到当前日期） */}
					{isRecording && (
						<button
							type="button"
							onClick={() => {
								if (onJumpToCurrentDate) {
									onJumpToCurrentDate();
								}
							}}
							className="flex items-center gap-2 px-3 py-2 rounded-md bg-red-500/10 hover:bg-red-500/20 transition-colors cursor-pointer"
							title={t("audioRecordingStatus")}
						>
							<div className="relative flex items-center justify-center flex-shrink-0">
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
								<div className="relative z-10 p-1.5 rounded-full bg-red-500/20">
									<Mic className="h-4 w-4 text-red-500" />
								</div>
							</div>
							<span className="text-sm font-medium text-red-500">{t("audioRecording")}</span>
							<motion.div
								className="flex items-center"
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
						</button>
					)}

					{/* 录音开关按钮 */}
					<button
						type="button"
						onClick={() => {
							if (isRecording) {
								onStopRecording?.();
							} else {
								onStartRecording?.();
							}
						}}
						className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${
							isRecording
								? "bg-red-500/10 hover:bg-red-500/20 text-red-500"
								: "bg-green-500/10 hover:bg-green-500/20 text-green-600 dark:text-green-400"
						}`}
						title={isRecording ? t("audioStopRecording") : t("audioStartRecording")}
					>
						{isRecording ? (
							<>
								<MicOff className="h-4 w-4" />
								<span className="text-sm font-medium">{t("audioStopRecording")}</span>
							</>
						) : (
							<>
								<Mic className="h-4 w-4" />
								<span className="text-sm font-medium">{t("audioStartRecording")}</span>
							</>
						)}
					</button>
				</div>
			</div>
		</div>
	);
}
