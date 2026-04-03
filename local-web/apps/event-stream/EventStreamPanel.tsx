"use client";

import {
	CalendarDays,
	ChevronLeft,
	ChevronRight,
	Clock,
	Loader2,
	RefreshCw,
	ScrollText,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { PanelHeader } from "@/components/common/layout/PanelHeader";
import { DateOnlyPickerPopover } from "@/components/date-picker/DateOnlyPickerPopover";
import { cn } from "@/lib/utils";

function renderInlineMarkdown(text: string): ReactNode {
	const parts = text.split(/(\*\*[^*]+\*\*)/g);
	if (parts.length === 1) return text;
	return parts.map((part) => {
		const bold = part.match(/^\*\*(.+)\*\*$/);
		if (bold) {
			return (
				<strong key={part} className="font-semibold text-foreground">
					{bold[1]}
				</strong>
			);
		}
		return part;
	});
}

function todayStr(): string {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shiftDate(dateStr: string, days: number): string {
	const d = new Date(dateStr);
	d.setDate(d.getDate() + days);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface EventBlock {
	time: string;
	title: string;
	lines: string[];
}

function parseEventsMarkdown(markdown: string): EventBlock[] {
	const blocks: EventBlock[] = [];
	const lines = markdown.split("\n");
	let current: EventBlock | null = null;

	for (const line of lines) {
		const h2 = line.match(/^##\s+(.+)/);
		if (h2) {
			if (current) blocks.push(current);
			const raw = h2[1].trim();
			const timeMatch = raw.match(/^(\d{1,2}:\d{2}(?::\d{2})?)\s*[-–—]\s*(.+)/);
			if (timeMatch) {
				current = { time: timeMatch[1], title: timeMatch[2], lines: [] };
			} else {
				current = { time: "", title: raw, lines: [] };
			}
			continue;
		}

		const h3 = line.match(/^###\s+(.+)/);
		if (h3) {
			if (current) blocks.push(current);
			current = { time: "", title: h3[1].trim(), lines: [] };
			continue;
		}

		if (current) {
			if (line.trim()) current.lines.push(line);
		}
	}
	if (current) blocks.push(current);
	return blocks;
}

function EventCard({ block }: { block: EventBlock }) {
	return (
		<div className="rounded-lg border border-border bg-card p-3.5 transition-all hover:shadow-sm">
			<div className="mb-2 flex items-center gap-2">
				{block.time && (
					<span className="flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
						<Clock className="h-3 w-3" />
						{block.time}
					</span>
				)}
				<h3 className="text-sm font-medium text-foreground">
					{block.title}
				</h3>
			</div>
			{block.lines.length > 0 && (
				<div className="space-y-1 text-sm leading-relaxed text-muted-foreground">
					{block.lines.map((line, lineIdx) => {
						const trimmed = line.replace(/^[-*]\s*/, "").trim();
						if (!trimmed) return null;
						const key = `${block.title}-${lineIdx}`;

						if (line.match(/^[-*]\s/)) {
							return (
								<div key={key} className="flex gap-2">
									<span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
									<span>{renderInlineMarkdown(trimmed)}</span>
								</div>
							);
						}
						return <p key={key}>{renderInlineMarkdown(trimmed)}</p>;
					})}
				</div>
			)}
		</div>
	);
}

export function EventStreamPanel() {
	const t = useTranslations("page");
	const tEvent = useTranslations("eventStream");

	const [date, setDate] = useState(todayStr);
	const [content, setContent] = useState<string>("");
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [availableDates, setAvailableDates] = useState<string[]>([]);
	const [calendarOpen, setCalendarOpen] = useState(false);
	const dateButtonRef = useRef<HTMLButtonElement>(null);

	const isToday = date === todayStr();

	const fetchDates = useCallback(async (signal?: AbortSignal) => {
		try {
			const resp = await fetch("/api/memory/dates", { signal });
			if (resp.ok) {
				const data = await resp.json();
				setAvailableDates(data.dates ?? []);
			}
		} catch {
			// ignore (includes AbortError)
		}
	}, []);

	const fetchEvents = useCallback(async (dateStr: string, signal?: AbortSignal) => {
		try {
			setLoading(true);
			setError(null);
			const resp = await fetch(`/api/memory/date/${dateStr}`, { signal });
			if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
			const data = await resp.json();
			setContent(data.content || "");
		} catch (e) {
			if (e instanceof DOMException && e.name === "AbortError") return;
			setError(e instanceof Error ? e.message : String(e));
			setContent("");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		const ac = new AbortController();
		fetchDates(ac.signal);
		const interval = setInterval(() => fetchDates(), 60000);
		return () => { ac.abort(); clearInterval(interval); };
	}, [fetchDates]);

	useEffect(() => {
		const ac = new AbortController();
		fetchEvents(date, ac.signal);
		const interval = setInterval(() => fetchEvents(date), 30000);
		return () => { ac.abort(); clearInterval(interval); };
	}, [date, fetchEvents]);

	const blocks = content ? parseEventsMarkdown(content) : [];
	const hasContent = blocks.length > 0;
	const hasPrev = availableDates.some((d) => d < date);

	return (
		<div className="relative flex h-full flex-col overflow-hidden bg-background">
			<PanelHeader
				icon={ScrollText}
				title={t("eventStreamLabel")}
				actions={
					<button
						type="button"
						onClick={() => fetchEvents(date)}
						disabled={loading}
						className={cn(
							"flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
							"text-muted-foreground hover:bg-muted/50 hover:text-foreground",
							"disabled:pointer-events-none disabled:opacity-50",
						)}
						aria-label={tEvent("refresh")}
					>
						<RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
					</button>
				}
			/>

			{/* Date navigator */}
			<div className="flex items-center justify-between border-b border-border px-4 py-2">
				<button
					type="button"
					onClick={() => setDate(shiftDate(date, -1))}
					disabled={!hasPrev}
					className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-30"
					aria-label={tEvent("prevDay")}
				>
					<ChevronLeft className="h-4 w-4" />
				</button>

				<div className="flex items-center gap-2">
					<button
						ref={dateButtonRef}
						type="button"
						onClick={() => setCalendarOpen((v) => !v)}
						className={cn(
							"flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-1.5 text-sm font-medium transition-colors",
							"hover:bg-muted/50 hover:border-primary/30",
							calendarOpen && "border-primary/50 ring-2 ring-primary/20",
						)}
					>
						<CalendarDays className="h-3.5 w-3.5 text-primary" />
						<span className="text-foreground">{date}</span>
					</button>
					{calendarOpen && (
						<DateOnlyPickerPopover
							anchorRef={dateButtonRef}
							selectedDate={new Date(date)}
							onSelectDate={(d) => {
								const y = d.getFullYear();
								const m = String(d.getMonth() + 1).padStart(2, "0");
								const day = String(d.getDate()).padStart(2, "0");
								setDate(`${y}-${m}-${day}`);
							}}
							onClose={() => setCalendarOpen(false)}
						/>
					)}
					{!isToday && (
						<button
							type="button"
							onClick={() => setDate(todayStr())}
							className="rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20"
						>
							{tEvent("today")}
						</button>
					)}
				</div>

				<button
					type="button"
					onClick={() => setDate(shiftDate(date, 1))}
					disabled={isToday}
					className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-30"
					aria-label={tEvent("nextDay")}
				>
					<ChevronRight className="h-4 w-4" />
				</button>
			</div>

			{/* Content */}
			<div className="flex-1 overflow-y-auto px-4 py-4">
				{loading && (
					<div className="flex h-full items-center justify-center">
						<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
					</div>
				)}

				{error && !loading && (
					<div className="flex h-full flex-col items-center justify-center gap-3 text-center">
						<p className="text-sm text-muted-foreground">{tEvent("loadError")}</p>
						<button
							type="button"
							onClick={() => fetchEvents(date)}
							className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
						>
							{tEvent("retry")}
						</button>
					</div>
				)}

				{!loading && !error && !hasContent && (
					<div className="flex h-full flex-col items-center justify-center gap-3 text-center">
						<ScrollText className="h-10 w-10 text-muted-foreground/30" />
						<p className="text-sm text-muted-foreground">
							{tEvent("empty", { date })}
						</p>
					</div>
				)}

				{!loading && !error && hasContent && (
					<div className="space-y-3">
						<p className="text-xs text-muted-foreground">
							{tEvent("eventCount", { count: blocks.length })}
						</p>
						{blocks.map((block, idx) => (
							<EventCard key={`${block.time}-${idx}`} block={block} />
						))}
					</div>
				)}
			</div>
		</div>
	);
}
