/**
 * 日期选择器组件
 * 用于选择要查看的录音日期（以天为单位）
 */

import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { SimpleCalendar } from "./SimpleCalendar";

interface DateSelectorProps {
	selectedDate: Date;
	onDateChange: (date: Date) => void;
	availableDates?: Date[]; // 有录音的日期列表
	audioCounts?: Map<string, number>; // 每个日期的音频数量
	onExport?: () => void;
	onEdit?: () => void;
}

export function DateSelector({
	selectedDate,
	onDateChange,
	availableDates = [],
	audioCounts,
	onExport,
	onEdit,
}: DateSelectorProps) {
	const [isCalendarOpen, setIsCalendarOpen] = useState(false);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const [popupPosition, setPopupPosition] = useState<{
		top: number;
		left: number;
	} | null>(null);

	// 格式化日期显示
	const formatDate = (date: Date): string => {
		const today = new Date();
		const yesterday = new Date(today);
		yesterday.setDate(yesterday.getDate() - 1);
		const tomorrow = new Date(today);
		tomorrow.setDate(tomorrow.getDate() + 1);

		const dateStr = date.toDateString();
		if (dateStr === today.toDateString()) {
			return "今天";
		}
		if (dateStr === yesterday.toDateString()) {
			return "昨天";
		}
		if (dateStr === tomorrow.toDateString()) {
			return "明天";
		}

		// 格式化：12月23日 星期一
		const month = date.getMonth() + 1;
		const day = date.getDate();
		const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
		const weekday = weekdays[date.getDay()];
		return `${month}月${day}日 星期${weekday}`;
	};

	// 切换到前一天
	const goToPreviousDay = useCallback(() => {
		const prevDate = new Date(selectedDate);
		prevDate.setDate(prevDate.getDate() - 1);
		onDateChange(prevDate);
	}, [onDateChange, selectedDate]);

	// 切换到后一天
	const goToNextDay = useCallback(() => {
		const nextDate = new Date(selectedDate);
		nextDate.setDate(nextDate.getDate() + 1);
		onDateChange(nextDate);
	}, [onDateChange, selectedDate]);

	// 检查日期是否有录音
	const hasRecording = (date: Date): boolean => {
		if (availableDates.length === 0) return true; // 如果没有提供列表，默认都有
		return availableDates.some((d) => d.toDateString() === date.toDateString());
	};

	// 点击外部关闭日历
	useEffect(() => {
		if (!isCalendarOpen) return;

		const handleClickOutside = (event: MouseEvent) => {
			if (
				buttonRef.current &&
				!buttonRef.current.contains(event.target as Node)
			) {
				const target = event.target as HTMLElement;
				if (!target.closest("[data-calendar-popup]")) {
					setIsCalendarOpen(false);
					setPopupPosition(null);
				}
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [isCalendarOpen]);

	// 键盘快捷键支持（上下箭头切换日期）
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// 只在当前组件可见时响应
			if (e.key === "ArrowUp" || e.key === "ArrowDown") {
				e.preventDefault();
				if (e.key === "ArrowUp") {
					goToPreviousDay();
				} else {
					goToNextDay();
				}
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [goToNextDay, goToPreviousDay]);

	return (
		<div className="relative flex items-center gap-2">
			{/* 日期选择 */}
			<button
				type="button"
				onClick={goToPreviousDay}
				className={cn(
					"p-1.5 rounded-md hover:bg-muted transition-colors",
					"text-muted-foreground hover:text-foreground",
				)}
				title="前一天 (↑)"
			>
				<ChevronLeft className="w-4 h-4" />
			</button>

			<button
				type="button"
				ref={buttonRef}
				onClick={() => {
					if (buttonRef.current) {
						const rect = buttonRef.current.getBoundingClientRect();
						setPopupPosition({
							top: rect.bottom + window.scrollY + 8,
							left: rect.left + window.scrollX,
						});
					}
					setIsCalendarOpen(!isCalendarOpen);
				}}
				className={cn(
					"flex items-center gap-2 px-4 py-2 rounded-lg",
					"bg-muted/50 hover:bg-muted transition-colors",
					"border border-border/50",
					"text-sm font-medium",
				)}
			>
				<Calendar className="w-4 h-4" />
				<span>{formatDate(selectedDate)}</span>
				{hasRecording(selectedDate) && (
					<span className="w-1.5 h-1.5 rounded-full bg-primary" />
				)}
			</button>

			<button
				type="button"
				onClick={goToNextDay}
				className={cn(
					"p-1.5 rounded-md hover:bg-muted transition-colors",
					"text-muted-foreground hover:text-foreground",
				)}
				title="后一天 (↓)"
			>
				<ChevronRight className="w-4 h-4" />
			</button>

			{/* 快速跳转到今天 */}
			<button
				type="button"
				onClick={() => onDateChange(new Date())}
				className={cn(
					"px-3 py-1.5 text-xs rounded-md",
					"bg-muted/50 hover:bg-muted transition-colors",
					"text-muted-foreground hover:text-foreground",
				)}
			>
				今天
			</button>

			{/* 操作按钮 */}
			{onEdit && (
				<button
					type="button"
					onClick={onEdit}
					className={cn(
						"px-3 py-1.5 text-xs rounded-md",
						"bg-muted/50 hover:bg-muted transition-colors",
						"text-muted-foreground hover:text-foreground",
					)}
				>
					编辑
				</button>
			)}
			{onExport && (
				<button
					type="button"
					onClick={onExport}
					className={cn(
						"px-3 py-1.5 text-xs rounded-md",
						"bg-primary/10 hover:bg-primary/20 transition-colors",
						"text-primary border border-primary/20",
					)}
				>
					导出
				</button>
			)}

			{/* 日历选择器 - 使用Portal渲染到body，避免z-index问题 */}
			{isCalendarOpen &&
				popupPosition &&
				typeof window !== "undefined" &&
				createPortal(
					<div
						data-calendar-popup
						className="fixed z-[9999] bg-background border border-border rounded-lg shadow-2xl p-4 min-w-[280px]"
						style={{
							top: `${popupPosition.top}px`,
							left: `${popupPosition.left}px`,
						}}
						onClick={(e) => e.stopPropagation()}
						onKeyDown={(e) => {
							if (e.key === "Escape") {
								e.stopPropagation();
								setIsCalendarOpen(false);
								setPopupPosition(null);
							}
						}}
						role="dialog"
						tabIndex={-1}
						aria-modal="true"
					>
						<SimpleCalendar
							selectedDate={selectedDate}
							onDateSelect={(date) => {
								onDateChange(date);
								setIsCalendarOpen(false);
								setPopupPosition(null);
							}}
							onClose={() => {
								setIsCalendarOpen(false);
								setPopupPosition(null);
							}}
							audioDates={availableDates}
							audioCounts={audioCounts}
						/>
					</div>,
					document.body,
				)}
		</div>
	);
}
