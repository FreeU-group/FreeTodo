"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";

interface EventSearchFormProps {
	startDate: string;
	endDate: string;
	appName: string;
	onStartDateChange: (value: string) => void;
	onEndDateChange: (value: string) => void;
	onAppNameChange: (value: string) => void;
	onSearch: (e: React.FormEvent) => void;
}

/**
 * 事件搜索表单组件
 * 包含日期范围和应用名称筛选
 */
export function EventSearchForm({
	startDate,
	endDate,
	appName,
	onStartDateChange,
	onEndDateChange,
	onAppNameChange,
	onSearch,
}: EventSearchFormProps) {
	const t = useTranslations("debugCapture");

	return (
		<div className="shrink-0 border-b border-border bg-muted/30 p-3 sm:p-4">
			<form
				onSubmit={onSearch}
				className="flex flex-col gap-3 sm:gap-4 sm:flex-row sm:items-end"
			>
				<div className="flex-1 grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-4">
					<div className="space-y-1">
						<label
							htmlFor="start-date"
							className="text-xs font-medium text-muted-foreground"
						>
							{t("startDate")}
						</label>
						<input
							id="start-date"
							type="date"
							value={startDate}
							onChange={(e) => onStartDateChange(e.target.value)}
							className="w-full rounded-md border border-input bg-background px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm"
						/>
					</div>
					<div className="space-y-1">
						<label
							htmlFor="end-date"
							className="text-xs font-medium text-muted-foreground"
						>
							{t("endDate")}
						</label>
						<input
							id="end-date"
							type="date"
							value={endDate}
							onChange={(e) => onEndDateChange(e.target.value)}
							className="w-full rounded-md border border-input bg-background px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm"
						/>
					</div>
					<div className="space-y-1">
						<label
							htmlFor="app-name"
							className="text-xs font-medium text-muted-foreground"
						>
							{t("appName")}
						</label>
						<input
							id="app-name"
							type="text"
							placeholder={t("appNamePlaceholder")}
							value={appName}
							onChange={(e) => onAppNameChange(e.target.value)}
							className="w-full rounded-md border border-input bg-background px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm"
						/>
					</div>
					<div className="flex items-end">
						<button
							type="submit"
							className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-md bg-primary px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-primary-foreground hover:bg-primary/90"
						>
							<Search className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
							<span className="hidden sm:inline">{t("search")}</span>
						</button>
					</div>
				</div>
			</form>
		</div>
	);
}
