"use client";

import { useTranslations } from "next-intl";
import { useId, useMemo, useState } from "react";
import {
	formatReminderOffset,
	REMINDER_PRESET_MINUTES,
	type ReminderUnit,
	sanitizeReminderOffsets,
} from "@/lib/reminders";
import { cn } from "@/lib/utils";

interface ReminderOptionsProps {
	value: number[];
	onChange: (value: number[]) => void;
	compact?: boolean;
	showClear?: boolean;
}

export function ReminderOptions({
	value,
	onChange,
	compact = false,
	showClear = true,
}: ReminderOptionsProps) {
	const t = useTranslations("reminder");
	const customInputId = useId();
	const [customValue, setCustomValue] = useState("");
	const [customUnit, setCustomUnit] = useState<ReminderUnit>("minutes");

	const selected = useMemo(() => new Set(value), [value]);

	const toggleOffset = (minutes: number) => {
		const next = selected.has(minutes)
			? value.filter((item) => item !== minutes)
			: [...value, minutes];
		onChange(sanitizeReminderOffsets(next));
	};

	const handleAddCustom = () => {
		const amount = Number.parseInt(customValue, 10);
		if (!Number.isFinite(amount) || amount <= 0) {
			return;
		}
		const multiplier =
			customUnit === "days" ? 1440 : customUnit === "hours" ? 60 : 1;
		const minutes = amount * multiplier;
		onChange(sanitizeReminderOffsets([...value, minutes]));
		setCustomValue("");
	};

	const sizeClasses = compact
		? "px-2 py-1 text-xs"
		: "px-2.5 py-1.5 text-xs";

	return (
		<div className="flex flex-col gap-2">
			<div className={cn("grid gap-2", compact ? "grid-cols-3" : "grid-cols-2")}>
				{REMINDER_PRESET_MINUTES.map((minutes) => (
					<button
						key={minutes}
						type="button"
						onClick={() => toggleOffset(minutes)}
						className={cn(
							"rounded-md border text-left transition-colors",
							sizeClasses,
							selected.has(minutes)
								? "border-primary/60 bg-primary/10 text-primary"
								: "border-border/60 text-muted-foreground hover:bg-muted/60",
						)}
					>
						{formatReminderOffset(t, minutes)}
					</button>
				))}
			</div>
			<div className="flex flex-wrap items-center gap-2">
				<label
					className="text-xs text-muted-foreground"
					htmlFor={customInputId}
				>
					{t("custom")}
				</label>
				<input
					id={customInputId}
					type="number"
					min={1}
					value={customValue}
					onChange={(event) => setCustomValue(event.target.value)}
					className={cn(
						"w-20 rounded-md border border-border bg-background px-2 py-1 text-xs",
						"focus:outline-none focus:ring-2 focus:ring-primary/30",
					)}
				/>
				<select
					value={customUnit}
					onChange={(event) =>
						setCustomUnit(event.target.value as ReminderUnit)
					}
					className={cn(
						"rounded-md border border-border bg-background px-2 py-1 text-xs",
						"focus:outline-none focus:ring-2 focus:ring-primary/30",
					)}
				>
					<option value="minutes">{t("unit.minutes")}</option>
					<option value="hours">{t("unit.hours")}</option>
					<option value="days">{t("unit.days")}</option>
				</select>
				<button
					type="button"
					onClick={handleAddCustom}
					className="rounded-md border border-primary/40 px-2 py-1 text-xs text-primary transition-colors hover:bg-primary/10"
				>
					{t("add")}
				</button>
				{showClear && (
					<button
						type="button"
						onClick={() => onChange([])}
						className="rounded-md border border-destructive/40 px-2 py-1 text-xs text-destructive transition-colors hover:bg-destructive/10"
					>
						{t("clear")}
					</button>
				)}
			</div>
		</div>
	);
}
