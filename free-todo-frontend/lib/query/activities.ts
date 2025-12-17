"use client";

import { useQuery } from "@tanstack/react-query";
import {
	getActivities,
	getActivityEvents,
	getEvent,
	getEvents,
} from "@/lib/api";
import type { Activity, ActivityWithEvents } from "@/lib/types/activity";
import type { Event } from "@/lib/types/event";
import { queryKeys } from "./keys";

// ============================================================================
// Query Hooks
// ============================================================================

interface UseActivitiesParams {
	limit?: number;
	offset?: number;
	start_date?: string;
	end_date?: string;
}

/**
 * 获取 Activity 列表的 Query Hook
 */
export function useActivities(params?: UseActivitiesParams) {
	return useQuery({
		queryKey: queryKeys.activities.list(params),
		queryFn: async () => {
			const res = await getActivities({
				limit: params?.limit ?? 50,
				offset: params?.offset ?? 0,
				start_date: params?.start_date,
				end_date: params?.end_date,
			});
			return res.data?.activities ?? [];
		},
		staleTime: 30 * 1000,
	});
}

/**
 * 获取单个 Activity 的事件 ID 列表
 */
export function useActivityEvents(activityId: number | null) {
	return useQuery({
		queryKey: queryKeys.activities.events(activityId ?? 0),
		queryFn: async () => {
			if (activityId === null) return [];
			const res = await getActivityEvents(activityId);
			return res.data?.event_ids ?? [];
		},
		enabled: activityId !== null,
		staleTime: 60 * 1000,
	});
}

/**
 * 获取单个 Event 详情的 Query Hook
 */
export function useEvent(eventId: number | null) {
	return useQuery({
		queryKey: queryKeys.events.detail(eventId ?? 0),
		queryFn: async () => {
			if (eventId === null) return null;
			const res = await getEvent(eventId);
			if (!res.data) return null;

			const eventData = res.data;
			const screenshots = eventData.screenshots || [];
			const screenshotCount =
				eventData.screenshot_count ?? screenshots.length ?? 0;
			const firstScreenshotId =
				eventData.first_screenshot_id ?? screenshots[0]?.id;

			return {
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
			} as Event;
		},
		enabled: eventId !== null,
		staleTime: 60 * 1000,
	});
}

/**
 * 批量获取多个 Event 详情的 Query Hook
 */
export function useEvents(eventIds: number[]) {
	return useQuery({
		queryKey: ["events", "batch", eventIds],
		queryFn: async () => {
			if (eventIds.length === 0) return [];

			const results = await Promise.all(
				eventIds.map(async (id) => {
					try {
						const res = await getEvent(id);
						if (!res.data) return null;

						const eventData = res.data;
						const screenshots = eventData.screenshots || [];
						const screenshotCount =
							eventData.screenshot_count ?? screenshots.length ?? 0;
						const firstScreenshotId =
							eventData.first_screenshot_id ?? screenshots[0]?.id;

						return {
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
						} as Event;
					} catch (error) {
						console.error("Failed to load event", id, error);
						return null;
					}
				}),
			);

			return results.filter((e): e is Event => e !== null);
		},
		enabled: eventIds.length > 0,
		staleTime: 60 * 1000,
	});
}

interface UseEventsListParams {
	limit?: number;
	offset?: number;
	start_date?: string;
	end_date?: string;
	app_name?: string;
}

/**
 * 获取 Event 列表的 Query Hook
 */
export function useEventsList(params?: UseEventsListParams) {
	return useQuery({
		queryKey: queryKeys.events.list(params),
		queryFn: async () => {
			const res = await getEvents(params);
			return res.data?.events ?? [];
		},
		staleTime: 30 * 1000,
	});
}

// ============================================================================
// 组合 Hook：获取 Activity 详情（包含关联的 Events）
// ============================================================================

/**
 * 获取 Activity 详情及其关联的 Events
 * 组合了 activities、activity events 和 event details 三个查询
 */
export function useActivityWithEvents(
	activityId: number | null,
	activities: Activity[],
) {
	// 获取 activity 的事件 ID 列表
	const {
		data: eventIds = [],
		isLoading: isLoadingEvents,
		error: eventsError,
	} = useActivityEvents(activityId);

	// 批量获取事件详情
	const {
		data: events = [],
		isLoading: isLoadingEventDetails,
		error: eventDetailsError,
	} = useEvents(eventIds);

	// 查找当前 activity
	const activity = activityId
		? (activities.find((a) => a.id === activityId) ?? null)
		: null;

	// 构建带事件的 activity
	const activityWithEvents: ActivityWithEvents | null = activity
		? {
				...activity,
				event_ids: eventIds,
				events,
			}
		: null;

	return {
		activity: activityWithEvents,
		events,
		isLoading: isLoadingEvents || isLoadingEventDetails,
		error: eventsError || eventDetailsError,
	};
}
