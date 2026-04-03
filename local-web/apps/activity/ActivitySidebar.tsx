import { ActivityCard } from "@/apps/activity/ActivityCard";
import type { ActivityGroup } from "@/apps/activity/utils/timeUtils";
import { formatTimeRange } from "@/apps/activity/utils/timeUtils";
import type { Activity } from "@/lib/types";

interface ActivitySidebarProps {
	groups: ActivityGroup[];
	selectedId?: number | null;
	onSelect?: (activity: Activity) => void;
	loading?: boolean;
}

export function ActivitySidebar({
	groups,
	selectedId,
	onSelect,
	loading = false,
}: ActivitySidebarProps) {
	const allActivities = groups.flatMap((group) => group.items);
	const selectedIndex = selectedId
		? allActivities.findIndex((activity) => activity.id === selectedId)
		: -1;

	return (
		<aside className="relative flex h-full w-[280px] min-w-[220px] max-w-[320px] shrink flex-col overflow-hidden rounded-xl border border-border bg-card">
			<div className="flex items-center justify-between px-3 py-2">
				<h3 className="text-xs font-semibold text-foreground">Timeline</h3>
				{loading && (
					<span className="text-[10px] text-muted-foreground">Loading...</span>
				)}
			</div>
			<div className="h-px w-full bg-border" />

			<div className="relative flex-1 space-y-3 overflow-y-auto px-3 py-3">
				{/* 时间线竖栏 - 仅在选中项存在时显示 */}
				{selectedIndex >= 0 && (
					<div className="absolute left-3 top-0 bottom-0 w-0.5 bg-border/30 pointer-events-none" />
				)}

				{groups.map((group) => (
					<div key={group.label} className="space-y-1.5">
						<div className="flex items-center text-[10px] uppercase tracking-wide text-muted-foreground px-1">
							<span>{group.label}</span>
						</div>
						<div className="space-y-2">
							{group.items.map((activity) => (
								<ActivityCard
									key={activity.id}
									activity={activity}
									isSelected={activity.id === selectedId}
									timeLabel={formatTimeRange(
										activity.startTime,
										activity.endTime,
									)}
									onSelect={onSelect}
								/>
							))}
						</div>
					</div>
				))}
				{!loading && groups.length === 0 && (
					<div className="rounded-md border border-dashed border-border bg-secondary/40 p-3 text-xs text-muted-foreground">
						No activities found.
					</div>
				)}
			</div>

		</aside>
	);
}
