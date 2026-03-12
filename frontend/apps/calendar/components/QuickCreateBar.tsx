/**
 * 快捷创建 Todo 栏组件
 */

import { Calendar, Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { formatHumanDate } from "../utils";

export function QuickCreateBar({
	targetDate,
	value,
	time,
	onChange,
	onTimeChange,
	onConfirm,
	onCancel,
}: {
	targetDate: Date | null;
	value: string;
	time: string;
	onChange: (v: string) => void;
	onTimeChange: (v: string) => void;
	onConfirm: () => void;
	onCancel: () => void;
}) {
	const t = useTranslations("calendar");
	if (!targetDate) return null;
	return (
		<div className="fixed bottom-24 left-1/2 z-40 w-full max-w-4xl -translate-x-1/2 px-3">
			<div className="relative flex flex-col gap-3 rounded-2xl border border-border/70 bg-gradient-to-br from-background/95 via-background/90 to-muted/60 p-4 shadow-[0_20px_60px_-30px_oklch(var(--primary)/0.6)] backdrop-blur-xl">
				<div className="flex items-center justify-between gap-2">
					<div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
						<Calendar className="h-3.5 w-3.5" />
						<span>
							{t("createOnDate", { date: formatHumanDate(targetDate) })}
						</span>
					</div>
					<button
						type="button"
						onClick={onCancel}
						className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-background/70 text-muted-foreground transition hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
						aria-label={t("closeCreate")}
					>
						<X className="h-4 w-4" />
					</button>
				</div>
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center">
					<input
						value={value}
						onChange={(e) => onChange(e.target.value)}
						placeholder={t("inputTodoTitle")}
						className="flex-1 rounded-lg border border-border/70 bg-background/80 px-3 py-2 text-sm shadow-sm transition focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/60"
					/>
					<div className="flex items-center gap-2">
						<input
							type="time"
							value={time}
							onChange={(e) => onTimeChange(e.target.value)}
							className="rounded-lg border border-border/70 bg-background/80 px-2 py-2 text-sm shadow-sm transition focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/30"
						/>
						<button
							type="button"
							onClick={onConfirm}
							disabled={!value.trim()}
							className={cn(
								"inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-[0_12px_24px_-16px_oklch(var(--primary)/0.7)] transition-all",
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
				</div>
			</div>
		</div>
	);
}
