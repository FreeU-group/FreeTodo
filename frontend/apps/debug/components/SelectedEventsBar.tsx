"use client";

import { Activity, Check } from "lucide-react";
import { useTranslations } from "next-intl";

interface SelectedEventsBarProps {
	selectedCount: number;
	isAggregating: boolean;
	onAggregate: () => void;
	onClear: () => void;
}

/**
 * 选中事件提示栏组件
 * 显示已选中的事件数量，并提供聚合和清除操作
 */
export function SelectedEventsBar({
	selectedCount,
	isAggregating,
	onAggregate,
	onClear,
}: SelectedEventsBarProps) {
	const t = useTranslations("debugCapture");

	if (selectedCount === 0) {
		return null;
	}

	return (
		<div className="shrink-0 flex items-center justify-between rounded-lg mx-3 sm:mx-4 mt-3 sm:mt-4 px-4 py-3 border bg-primary/10 border-primary/20">
			<div className="flex items-center gap-2">
				<Check className="h-5 w-5 text-primary" />
				<span className="font-medium text-primary">
					{t("selectedEvents", { count: selectedCount })}
				</span>
			</div>
			<div className="flex items-center gap-2">
				<button
					type="button"
					onClick={onAggregate}
					disabled={isAggregating || selectedCount === 0}
					className="flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{isAggregating ? (
						<>
							<div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
							<span>{t("aggregating")}</span>
						</>
					) : (
						<>
							<Activity className="h-4 w-4" />
							<span>{t("aggregateActivity", { count: selectedCount })}</span>
						</>
					)}
				</button>
				<button
					type="button"
					onClick={onClear}
					disabled={isAggregating}
					className="rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{t("clearSelection")}
				</button>
			</div>
		</div>
	);
}
