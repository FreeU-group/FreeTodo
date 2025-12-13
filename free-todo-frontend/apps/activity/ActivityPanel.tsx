/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useEffect, useMemo, useState } from "react";
import { ActivityDetail } from "@/apps/activity/ActivityDetail";
import { ActivityHeader } from "@/apps/activity/ActivityHeader";
import { ActivitySidebar } from "@/apps/activity/ActivitySidebar";
import { groupActivitiesByTime } from "@/apps/activity/utils/timeUtils";
import { getActivities, getActivityEvents, getEvent } from "@/lib/api";
import { useActivityStore } from "@/lib/store/activity-store";
import type { Activity, ActivityWithEvents } from "@/lib/types/activity";
import type { Event } from "@/lib/types/event";

export function ActivityPanel() {
	const [activities, setActivities] = useState<Activity[]>([]);
	const [filteredActivities, setFilteredActivities] = useState<Activity[]>([]);
	const { selectedActivityId, search, setSelectedActivityId, setSearch } =
		useActivityStore();
	const [selectedActivity, setSelectedActivity] =
		useState<ActivityWithEvents | null>(null);
	const [events, setEvents] = useState<Event[]>([]);
	const [loadingList, setLoadingList] = useState(true);
	const [loadingDetail, setLoadingDetail] = useState(false);

	// load activities
	useEffect(() => {
		const load = async () => {
			try {
				setLoadingList(true);
				const res = await getActivities({ limit: 50, offset: 0 });
				const list = res.data?.activities ?? [];
				setActivities(list);
				setFilteredActivities(list);
				if (list.length > 0 && selectedActivityId === null) {
					setSelectedActivityId(list[0].id);
				}
			} catch (e) {
				console.error("Failed to load activities", e);
			} finally {
				setLoadingList(false);
			}
		};
		load();
	}, [selectedActivityId, setSelectedActivityId]);

	// filter by search
	useEffect(() => {
		if (!search.trim()) {
			setFilteredActivities(activities);
			return;
		}
		const keyword = search.toLowerCase();
		setFilteredActivities(
			activities.filter(
				(item) =>
					item.ai_title?.toLowerCase().includes(keyword) ||
					item.ai_summary?.toLowerCase().includes(keyword),
			),
		);
	}, [search, activities]);

	// load detail when selectedId changes
	useEffect(() => {
		const loadDetail = async (activityId: number) => {
			try {
				setLoadingDetail(true);
				const base =
					filteredActivities.find((a) => a.id === activityId) ||
					activities.find((a) => a.id === activityId);
				if (!base) return;
				setSelectedActivity(base);

				const relRes = await getActivityEvents(activityId);
				const ids = relRes.data?.event_ids ?? [];
				if (ids.length === 0) {
					setEvents([]);
					return;
				}
				const detailList: Event[] = [];
				await Promise.all(
					ids.map(async (id) => {
						try {
							const evRes = await getEvent(id);
							const eventData = evRes.data;
							if (!eventData) return;

							const screenshots = eventData.screenshots || [];
							const screenshotCount =
								eventData.screenshot_count ?? screenshots.length ?? 0;
							const firstScreenshotId =
								eventData.first_screenshot_id ?? screenshots[0]?.id;

							// align to Event shape for detail display
							detailList.push({
								id: eventData.id,
								app_name: eventData.app_name || "",
								window_title: eventData.window_title || "",
								start_time: eventData.start_time,
								end_time: eventData.end_time ?? undefined,
								screenshot_count: screenshotCount,
								first_screenshot_id: firstScreenshotId ?? undefined,
								ai_title: eventData.ai_title ?? undefined,
								ai_summary: eventData.ai_summary ?? undefined,
								screenshots,
							});
						} catch (error) {
							console.error("Failed to load event", id, error);
						}
					}),
				);
				setEvents(detailList);
			} catch (e) {
				console.error("Failed to load activity detail", e);
			} finally {
				setLoadingDetail(false);
			}
		};

		if (selectedActivityId != null) {
			loadDetail(selectedActivityId);
		} else {
			setSelectedActivity(null);
			setEvents([]);
		}
	}, [selectedActivityId, filteredActivities, activities]);

	const groups = useMemo(
		() => groupActivitiesByTime(filteredActivities),
		[filteredActivities],
	);

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
