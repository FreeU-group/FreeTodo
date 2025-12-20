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
			<div className="flex flex-col gap-3 rounded-xl border bg-background/95 p-4 shadow-xl backdrop-blur">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<Calendar className="h-4 w-4" />
						<span>
							{t("createOnDate", { date: formatHumanDate(targetDate) })}
						</span>
					</div>
					<button
						type="button"
						onClick={onCancel}
						className="rounded-md p-1 text-muted-foreground hover:bg-muted/50"
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
						className="flex-1 rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
					/>
					<div className="flex items-center gap-2">
						<input
							type="time"
							value={time}
							onChange={(e) => onTimeChange(e.target.value)}
							className="rounded-md border px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
						/>
						<button
							type="button"
							onClick={onConfirm}
							disabled={!value.trim()}
							className={cn(
								"inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors",
								!value.trim() && "opacity-60",
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
