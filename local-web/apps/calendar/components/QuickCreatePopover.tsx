"use client";

/**
 * 日历内就地创建 Popover
 */

import { Calendar, Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { ReminderOptions } from "@/components/common/ReminderOptions";
import { cn } from "@/lib/utils";
import { formatHumanDate } from "../utils";

export function QuickCreatePopover({
	targetDate,
	value,
	time,
	reminderOffsets,
	onChange,
	onTimeChange,
	onReminderChange,
	onConfirm,
	onCancel,
}: {
	targetDate: Date | null;
	value: string;
	time: string;
	reminderOffsets: number[];
	onChange: (v: string) => void;
	onTimeChange: (v: string) => void;
	onReminderChange: (v: number[]) => void;
	onConfirm: () => void;
	onCancel: () => void;
}) {
	const t = useTranslations("calendar");
	const tReminder = useTranslations("reminder");
	const containerRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (targetDate) {
			inputRef.current?.focus();
		}
	}, [targetDate]);

	useEffect(() => {
		if (!targetDate) return;

		const handlePointerDown = (event: MouseEvent) => {
			if (!containerRef.current) return;
			if (!containerRef.current.contains(event.target as Node)) {
				onCancel();
			}
		};

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				onCancel();
			}
		};

		document.addEventListener("mousedown", handlePointerDown);
		document.addEventListener("keydown", handleKeyDown);

		return () => {
			document.removeEventListener("mousedown", handlePointerDown);
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [onCancel, targetDate]);

	if (!targetDate) return null;

	return (
		<div
			ref={containerRef}
			data-quick-create
			onPointerDown={(event) => event.stopPropagation()}
			onMouseDown={(event) => event.stopPropagation()}
			onClick={(event) => event.stopPropagation()}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.stopPropagation();
				}
			}}
			role="button"
			tabIndex={0}
			className={cn(
				"relative flex flex-col gap-3 rounded-2xl border border-border/70 bg-gradient-to-br from-background/95 via-background/90 to-muted/60 p-4 shadow-[0_20px_60px_-30px_oklch(var(--primary)/0.6)] backdrop-blur-xl",
				"before:pointer-events-none before:absolute before:inset-x-4 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-primary/60 before:to-transparent before:content-['']",
			)}
		>
			<div className="flex items-center justify-between gap-2">
				<div className="flex min-w-0 items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
					<Calendar className="h-3.5 w-3.5" />
					<span className="min-w-0 truncate">
						{t("createOnDate", { date: formatHumanDate(targetDate) })}
					</span>
				</div>
				<button
					type="button"
					onPointerDown={(event) => {
						event.preventDefault();
						event.stopPropagation();
						onCancel();
					}}
					onMouseDown={(event) => {
						event.preventDefault();
						event.stopPropagation();
					}}
					onClick={(event) => {
						event.stopPropagation();
						onCancel();
					}}
					className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-background/70 text-muted-foreground transition hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
					aria-label={t("closeCreate")}
				>
					<X className="h-4 w-4" />
				</button>
			</div>
			<div className="flex flex-col gap-2">
				<input
					ref={inputRef}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					placeholder={t("inputTodoTitle")}
					className="w-full rounded-lg border border-border/70 bg-background/80 px-3 py-2 text-sm shadow-sm transition focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/60"
				/>
				<div className="flex flex-wrap items-center gap-2">
					<input
						type="time"
						value={time}
						onChange={(e) => onTimeChange(e.target.value)}
						className="w-24 rounded-lg border border-border/70 bg-background/80 px-2 py-2 text-sm shadow-sm transition focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/30"
					/>
					<button
						type="button"
						onClick={onConfirm}
						disabled={!value.trim()}
						className={cn(
							"inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-[0_12px_24px_-16px_oklch(var(--primary)/0.7)] transition-all",
							"hover:-translate-y-[1px] hover:shadow-[0_16px_32px_-18px_oklch(var(--primary)/0.85)]",
							"active:translate-y-0 active:scale-[0.98]",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
							"disabled:cursor-not-allowed",
							!value.trim() &&
								"opacity-60 shadow-none hover:translate-y-0 hover:shadow-none",
						)}
					>
						<Plus className="h-4 w-4" />
						{t("create")}
					</button>
				</div>
				<div className="flex items-center justify-between text-xs text-muted-foreground">
					<span>{tReminder("label")}</span>
				</div>
				<div className="rounded-lg border border-border/60 bg-background/70 p-2">
					<ReminderOptions
						value={reminderOffsets}
						onChange={onReminderChange}
						compact
						showClear
					/>
				</div>
			</div>
		</div>
	);
}
