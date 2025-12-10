/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useEffect, useMemo, useState } from "react";
import { ActivityDetail } from "@/components/activity/ActivityDetail";
import { ActivityHeader } from "@/components/activity/ActivityHeader";
import { ActivitySidebar } from "@/components/activity/ActivitySidebar";
import { groupActivitiesByTime } from "@/components/activity/utils/timeUtils";
import { getActivities, getActivityEvents, getEvent } from "@/lib/api";
import type { Activity, ActivityWithEvents } from "@/lib/types/activity";
import type { Event } from "@/lib/types/event";

export function ActivityPanel() {
	const [activities, setActivities] = useState<Activity[]>([]);
	const [filteredActivities, setFilteredActivities] = useState<Activity[]>([]);
	const [selectedId, setSelectedId] = useState<number | null>(null);
	const [selectedActivity, setSelectedActivity] =
		useState<ActivityWithEvents | null>(null);
	const [events, setEvents] = useState<Event[]>([]);
	const [loadingList, setLoadingList] = useState(true);
	const [loadingDetail, setLoadingDetail] = useState(false);
	const [search, setSearch] = useState("");

	// load activities
	useEffect(() => {
		const load = async () => {
			try {
				setLoadingList(true);
				const res = await getActivities({ limit: 50, offset: 0 });
				const list = res.data?.activities ?? [];
				setActivities(list);
				setFilteredActivities(list);
				if (list.length > 0) {
					setSelectedId(list[0].id);
				}
			} catch (e) {
				console.error("Failed to load activities", e);
			} finally {
				setLoadingList(false);
			}
		};
		load();
	}, []);

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
							const screenshots = evRes.data?.screenshots;
							// adapt to existing Event shape (minimal)
							detailList.push({
								id,
								app_name: "",
								window_title: "",
								start_time: "",
								screenshot_count: screenshots?.length ?? 0,
								first_screenshot_id: screenshots?.[0]?.id,
								ai_summary: "",
							} as Event);
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

		if (selectedId != null) {
			loadDetail(selectedId);
		} else {
			setSelectedActivity(null);
			setEvents([]);
		}
	}, [selectedId, filteredActivities, activities]);

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
					selectedId={selectedId}
					onSelect={(activity) => setSelectedId(activity.id)}
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
