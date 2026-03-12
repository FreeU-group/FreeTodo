import { Clock3 } from "lucide-react";
import { forwardRef } from "react";
import type { Activity } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ActivityCardProps {
	activity: Activity;
	isSelected?: boolean;
	timeLabel: string;
	onSelect?: (activity: Activity) => void;
}

export const ActivityCard = forwardRef<HTMLButtonElement, ActivityCardProps>(
	function ActivityCard(
		{ activity, isSelected = false, timeLabel, onSelect },
		ref,
	) {
		const title = activity.aiTitle || `Activity #${activity.id}`;
		const summary = activity.aiSummary || "No summary available";

		return (
			<button
				ref={ref}
				type="button"
				onClick={() => onSelect?.(activity)}
				className={cn(
					"group relative w-full rounded-md border px-2.5 py-2 pl-6 text-left transition",
					"border-border bg-card",
					"hover:border-primary/50 hover:bg-secondary",
					isSelected && "border-primary/70 bg-secondary ring-1 ring-primary/40",
				)}
			>
				{/* 时间线指示器 - 竖条和蓝点 */}
				<div className="absolute left-0 top-0 bottom-0 w-3 flex items-center justify-center">
					{/* 竖条 - 居中显示 */}
					<div
						className={cn(
							"absolute left-1 top-0 bottom-0 w-0.5 transition-colors rounded-full",
							isSelected
								? "bg-primary"
								: "bg-border/30 group-hover:bg-border/50",
						)}
					/>
					{/* 蓝点 - 仅在选中时显示 */}
					{isSelected && (
						<div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-primary shadow-md shadow-primary/50 z-10" />
					)}
				</div>
				<div className="flex flex-col gap-1">
					<div className="flex items-start justify-between gap-2">
						<div className="flex-1 min-w-0">
							<p className="text-xs font-semibold text-foreground line-clamp-1 leading-tight">
								{title}
							</p>
							<p className="mt-0.5 text-[10px] text-muted-foreground line-clamp-1 leading-tight opacity-0 group-hover:opacity-100 transition-opacity">
								{summary}
							</p>
						</div>
					</div>

					<div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
						<Clock3 className="h-3 w-3 shrink-0" />
						<span className="truncate">{timeLabel}</span>
					</div>
				</div>
			</button>
		);
	},
);
