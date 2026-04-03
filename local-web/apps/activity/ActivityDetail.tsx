import { AppWindow, Clock3, ListChecks } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ActivitySummary } from "@/apps/activity/ActivitySummary";
import {
	formatRelativeTime,
	formatTimeRange,
} from "@/apps/activity/utils/timeUtils";
import type { Activity, Event } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ActivityDetailProps {
	activity?: Activity | null;
	events?: Event[];
	loading?: boolean;
}

export function ActivityDetail({
	activity,
	events = [],
	loading = false,
}: ActivityDetailProps) {
	if (loading) {
		return (
			<div className="flex h-full items-center justify-center rounded-xl border border-border bg-card text-sm text-muted-foreground">
				Loading activity...
			</div>
		);
	}

	if (!activity) {
		return (
			<div className="flex h-full items-center justify-center rounded-xl border border-dashed border-border bg-card text-sm text-muted-foreground">
				Select an activity to view details.
			</div>
		);
	}

	const title = activity.aiTitle || `Activity #${activity.id}`;
	const timeRange = formatTimeRange(activity.startTime, activity.endTime);
	const relative = formatRelativeTime(activity.startTime);
	const uniqueApps = Array.from(
		new Set(events.map((e) => e.appName).filter(Boolean)),
	).slice(0, 6);

	return (
		<section className="flex h-full flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-xl overflow-hidden">
			<div className="shrink-0 space-y-3">
				<h1 className="text-xl font-semibold text-foreground">{title}</h1>
				<div className="flex flex-wrap items-center gap-2 text-xs text-foreground">
					<span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-3 py-1">
						<Clock3 className="h-4 w-4 text-primary" />
						{timeRange}
					</span>
					<span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-3 py-1">
						<ListChecks className="h-4 w-4 text-emerald-500" />
						{activity.eventCount ?? 0} Events
					</span>
					<span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-3 py-1">
						<Clock3 className="h-4 w-4 text-muted-foreground" />
						{relative}
					</span>
				</div>
			</div>

			<div className="shrink-0 flex flex-wrap items-center gap-2">
				{uniqueApps.length === 0 ? (
					<span className="text-xs text-muted-foreground">Apps: N/A</span>
				) : (
					uniqueApps.map((app) => (
						<span
							key={app}
							className={cn(
								"inline-flex items-center gap-2 rounded-full border border-primary/30",
								"bg-primary/10 px-3 py-1 text-xs font-medium text-primary",
							)}
						>
							<AppWindow className="h-4 w-4" />
							{app}
						</span>
					))
				)}
			</div>

			<div className="flex-1 min-h-0 flex flex-col">
				<ActivitySummary summary={activity.aiSummary} />
			</div>

			{events.length > 0 && (
				<div className="shrink-0 space-y-3 rounded-lg border border-border bg-secondary p-4">
					<h4 className="text-sm font-semibold text-foreground">Events</h4>
					<div
						className="space-y-2 max-h-[200px] overflow-y-auto"
						style={{ scrollbarWidth: "thin" }}
					>
						{events.map((ev) => (
							<div
								key={ev.id}
								className="rounded-lg border border-border bg-card p-3 text-sm text-foreground"
							>
								<div className="flex items-center justify-between text-xs text-muted-foreground">
									<span>#{ev.id}</span>
									<span>{formatRelativeTime(ev.startTime)}</span>
								</div>
								<p className="mt-1 text-[13px] font-semibold text-foreground line-clamp-1">
									{ev.aiTitle || ev.windowTitle || "Untitled Event"}
								</p>
								<div className="mt-1 text-xs text-muted-foreground prose prose-sm max-w-none line-clamp-3">
									<ReactMarkdown
										remarkPlugins={[remarkGfm]}
										components={{
											p: ({ node, ...props }) => (
												<p
													className="text-xs text-muted-foreground leading-snug my-1"
													{...props}
												/>
											),
											ul: ({ node, ...props }) => (
												<ul
													className="list-disc list-inside text-xs text-muted-foreground my-1 space-y-0.5"
													{...props}
												/>
											),
											ol: ({ node, ...props }) => (
												<ol
													className="list-decimal list-inside text-xs text-muted-foreground my-1 space-y-0.5"
													{...props}
												/>
											),
											li: ({ node, ...props }) => (
												<li
													className="text-xs text-muted-foreground"
													{...props}
												/>
											),
											strong: ({ node, ...props }) => (
												<strong
													className="font-semibold text-foreground"
													{...props}
												/>
											),
											em: ({ node, ...props }) => (
												<em
													className="italic text-muted-foreground"
													{...props}
												/>
											),
										}}
									>
										{ev.aiSummary || "No summary"}
									</ReactMarkdown>
								</div>
							</div>
						))}
					</div>
				</div>
			)}
		</section>
	);
}
