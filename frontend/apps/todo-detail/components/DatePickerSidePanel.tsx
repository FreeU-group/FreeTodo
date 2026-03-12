"use client";

import { Bell, Calendar, Clock, Globe, Repeat } from "lucide-react";
import type { useTranslations } from "next-intl";
import { ReminderOptions } from "@/components/common/ReminderOptions";
import { cn } from "@/lib/utils";
import { formatDateLabel } from "./datePickerUtils";

type TabKey = "date" | "range";
type DateTarget = "start" | "end";

interface DatePickerSidePanelProps {
	activeTab: TabKey;
	activeDateTarget: DateTarget;
	selectedStartDate: Date | null;
	selectedEndDate: Date | null;
	startTimeInput: string;
	endTimeInput: string;
	onStartTimeChange: (value: string) => void;
	onEndTimeChange: (value: string) => void;
	onActiveDateTargetChange: (value: DateTarget) => void;
	draftReminderOffsets: number[];
	onReminderOffsetsChange: (value: number[]) => void;
	draftRrule: string | null;
	onRruleChange: (value: string | null) => void;
	timeZoneOptions: string[];
	draftTimeZone: string;
	onTimeZoneChange: (value: string) => void;
	tDatePicker: ReturnType<typeof useTranslations<"datePicker">>;
	tReminder: ReturnType<typeof useTranslations<"reminder">>;
}

export function DatePickerSidePanel({
	activeTab,
	activeDateTarget,
	selectedStartDate,
	selectedEndDate,
	startTimeInput,
	endTimeInput,
	onStartTimeChange,
	onEndTimeChange,
	onActiveDateTargetChange,
	draftReminderOffsets,
	onReminderOffsetsChange,
	draftRrule,
	onRruleChange,
	timeZoneOptions,
	draftTimeZone,
	onTimeZoneChange,
	tDatePicker,
	tReminder,
}: DatePickerSidePanelProps) {
	const repeatOptions = [
		{ value: "", label: tDatePicker("repeatNone") },
		{ value: "FREQ=DAILY", label: tDatePicker("repeatDaily") },
		{ value: "FREQ=WEEKLY", label: tDatePicker("repeatWeekly") },
		{ value: "FREQ=MONTHLY", label: tDatePicker("repeatMonthly") },
		{ value: "FREQ=YEARLY", label: tDatePicker("repeatYearly") },
	];

	return (
		<div className="border-l border-border/70 px-4 py-4 space-y-4">
			{activeTab === "date" ? (
				<div className="space-y-4">
					<div className="space-y-2">
						<span className="text-xs font-medium text-muted-foreground">
							{tDatePicker("dateLabel")}
						</span>
						<button
							type="button"
							onClick={() => onActiveDateTargetChange("start")}
							className={cn(
								"flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm",
								activeDateTarget === "start"
									? "border-primary/60 bg-primary/5 text-foreground"
									: "border-border/70 text-muted-foreground",
							)}
						>
							<span className="flex items-center gap-2">
								<Calendar className="h-4 w-4" />
								{formatDateLabel(selectedStartDate) ||
									tDatePicker("pickDate")}
							</span>
						</button>
					</div>
					<div className="space-y-2">
						<span className="text-xs font-medium text-muted-foreground">
							{tDatePicker("timeLabel")}
						</span>
						<div className="flex items-center gap-2">
							<input
								type="time"
								value={startTimeInput}
								onChange={(event) => onStartTimeChange(event.target.value)}
								className={cn(
									"flex-1 rounded-lg border border-border/70 bg-background px-3 py-2 text-sm",
									"focus:outline-none focus:ring-2 focus:ring-primary/30",
								)}
							/>
							<button
								type="button"
								onClick={() => onStartTimeChange("")}
								className={cn(
									"rounded-lg border border-border/70 px-3 py-2 text-xs font-medium",
									!startTimeInput
										? "bg-primary/10 text-primary"
										: "text-muted-foreground hover:bg-muted/60",
								)}
							>
								{tDatePicker("allDay")}
							</button>
						</div>
					</div>

					<div className="space-y-2">
						<span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
							<Bell className="h-3.5 w-3.5" />
							{tReminder("label")}
						</span>
						<div
							className={cn(
								"rounded-lg border border-border/60 bg-background/70 p-2",
								!selectedStartDate && "pointer-events-none opacity-60",
							)}
						>
							<ReminderOptions
								value={draftReminderOffsets}
								onChange={onReminderOffsetsChange}
								compact
								showClear
							/>
						</div>
					</div>

					<div className="space-y-2">
						<span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
							<Repeat className="h-3.5 w-3.5" />
							{tDatePicker("repeatLabel")}
						</span>
						<select
							value={draftRrule ?? ""}
							onChange={(event) => onRruleChange(event.target.value || null)}
							className="w-full rounded-lg border border-border/70 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
						>
							{repeatOptions.map((option) => (
								<option key={option.value} value={option.value}>
									{option.label}
								</option>
							))}
						</select>
					</div>
				</div>
			) : (
				<div className="space-y-4">
					<div className="space-y-2">
						<span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
							<Clock className="h-3.5 w-3.5" />
							{tDatePicker("rangeLabel")}
						</span>
						<div className="flex items-center gap-2">
							<button
								type="button"
								onClick={() => onActiveDateTargetChange("start")}
								className={cn(
									"flex-1 rounded-lg border px-3 py-2 text-left",
									activeDateTarget === "start"
										? "border-primary/60 bg-primary/5"
										: "border-border/70",
								)}
							>
								<div className="text-[11px] text-muted-foreground">
									{tDatePicker("startLabel")}
								</div>
								<div className="text-sm text-foreground">
									{formatDateLabel(selectedStartDate) ||
										tDatePicker("pickDate")}
								</div>
							</button>
							<input
								type="time"
								value={startTimeInput}
								onChange={(event) => onStartTimeChange(event.target.value)}
								className="w-24 rounded-lg border border-border/70 bg-background px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
							/>
						</div>
						<div className="flex items-center gap-2">
							<button
								type="button"
								onClick={() => onActiveDateTargetChange("end")}
								className={cn(
									"flex-1 rounded-lg border px-3 py-2 text-left",
									activeDateTarget === "end"
										? "border-primary/60 bg-primary/5"
										: "border-border/70",
								)}
							>
								<div className="text-[11px] text-muted-foreground">
									{tDatePicker("endLabel")}
								</div>
								<div className="text-sm text-foreground">
									{formatDateLabel(selectedEndDate ?? selectedStartDate) ||
										tDatePicker("pickDate")}
								</div>
							</button>
							<input
								type="time"
								value={endTimeInput}
								onChange={(event) => onEndTimeChange(event.target.value)}
								className="w-24 rounded-lg border border-border/70 bg-background px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
							/>
						</div>
					</div>
				</div>
			)}

			<div className="space-y-2">
				<span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
					<Globe className="h-3.5 w-3.5" />
					{tDatePicker("timeZoneLabel")}
				</span>
				<select
					value={draftTimeZone}
					onChange={(event) => onTimeZoneChange(event.target.value)}
					className="w-full rounded-lg border border-border/70 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
				>
					{timeZoneOptions.map((option) => (
						<option key={option} value={option}>
							{option}
						</option>
					))}
				</select>
			</div>
		</div>
	);
}
