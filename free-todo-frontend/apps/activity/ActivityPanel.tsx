"use client";

import { useMemo } from "react";
import { ActivityDetail } from "@/apps/activity/ActivityDetail";
import { ActivityHeader } from "@/apps/activity/ActivityHeader";
import { ActivitySidebar } from "@/apps/activity/ActivitySidebar";
import { groupActivitiesByTime } from "@/apps/activity/utils/timeUtils";
import { useActivities, useActivityWithEvents } from "@/lib/query";
import { useActivityStore } from "@/lib/store/activity-store";
import type { Activity } from "@/lib/types/activity";

export function ActivityPanel() {
	const { selectedActivityId, search, setSelectedActivityId, setSearch } =
		useActivityStore();

	// 使用 TanStack Query 获取 activities
	const {
		data: activities = [],
		isLoading: loadingList,
		error: listError,
	} = useActivities({ limit: 50, offset: 0 });

	// 根据搜索过滤 activities
	const filteredActivities = useMemo(() => {
		if (!search.trim()) {
			return activities;
		}
		const keyword = search.toLowerCase();
		return activities.filter(
			(item: Activity) =>
				item.ai_title?.toLowerCase().includes(keyword) ||
				item.ai_summary?.toLowerCase().includes(keyword),
		);
	}, [search, activities]);

	// 自动选中第一个 activity
	useMemo(() => {
		if (
			filteredActivities.length > 0 &&
			selectedActivityId === null &&
			!loadingList
		) {
			setSelectedActivityId(filteredActivities[0].id);
		}
	}, [
		filteredActivities,
		selectedActivityId,
		loadingList,
		setSelectedActivityId,
	]);

	// 使用组合 hook 获取 activity 详情和 events
	const {
		activity: selectedActivity,
		events,
		isLoading: loadingDetail,
	} = useActivityWithEvents(selectedActivityId, activities);

	const groups = useMemo(
		() => groupActivitiesByTime(filteredActivities),
		[filteredActivities],
	);

	if (listError) {
		const errorMessage =
			listError instanceof Error
				? listError.message
				: String(listError) || "Unknown error";
		return (
			<div className="flex h-full items-center justify-center text-destructive">
				加载失败: {errorMessage}
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col gap-4 bg-background p-4">
			<ActivityHeader searchValue={search} onSearchChange={setSearch} />
			<div className="flex min-h-0 flex-1 gap-4 overflow-hidden">
				<ActivitySidebar
					groups={groups}
					selectedId={selectedActivityId}
					onSelect={(activity) => setSelectedActivityId(activity.id)}
					loading={loadingList}
				/>
				<div className="flex-1 min-w-[500px] shrink-0 overflow-hidden">
					<ActivityDetail
						activity={selectedActivity}
						events={events}
						loading={loadingDetail}
					/>
				</div>
			</div>
		</div>
	);
}
