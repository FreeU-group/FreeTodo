"use client";

import { useQuery } from "@tanstack/react-query";
import {
	useGetActivityEventsApiActivitiesActivityIdEventsGet,
	useListActivitiesApiActivitiesGet,
} from "@/lib/generated/activity/activity";
import {
	useGetEventDetailApiEventsEventIdGet,
	useListEventsApiEventsGet,
} from "@/lib/generated/event/event";
import type {
	ActivityEventsResponse,
	ActivityListResponse,
	ActivityResponse,
	EventDetailResponse,
	EventListResponse,
} from "@/lib/generated/schemas";
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
 * 将 ActivityResponse 转换为 Activity 类型
 * 处理 null 值转换为 undefined（因为 Activity.created_at 是 string | undefined，不是 string | null | undefined）
 */
function mapActivityResponseToActivity(response: ActivityResponse): Activity {
	return {
		...response,
		created_at: response.created_at ?? undefined,
		updated_at: response.updated_at ?? undefined,
		ai_title: response.ai_title ?? undefined,
		ai_summary: response.ai_summary ?? undefined,
	};
}

/**
 * 获取 Activity 列表的 Query Hook
 * 使用 Orval 生成的 hook
 */
export function useActivities(params?: UseActivitiesParams) {
	return useListActivitiesApiActivitiesGet(
		{
			limit: params?.limit ?? 50,
			offset: params?.offset ?? 0,
			start_date: params?.start_date,
			end_date: params?.end_date,
		},
		{
			query: {
				queryKey: queryKeys.activities.list(params),
				staleTime: 30 * 1000,
				select: (data: ActivityListResponse) => {
					// 处理响应格式，将 ActivityResponse[] 转换为 Activity[]
					return (data?.activities ?? []).map(mapActivityResponseToActivity);
				},
			},
		},
	);
}

/**
 * 获取单个 Activity 的事件 ID 列表
 * 使用 Orval 生成的 hook
 */
export function useActivityEvents(activityId: number | null) {
	return useGetActivityEventsApiActivitiesActivityIdEventsGet(activityId ?? 0, {
		query: {
			queryKey: queryKeys.activities.events(activityId ?? 0),
			enabled: activityId !== null,
			staleTime: 60 * 1000,
			select: (data: ActivityEventsResponse) => {
				// 处理响应格式
				return data?.event_ids ?? [];
			},
		},
	});
}

/**
 * 获取单个 Event 详情的 Query Hook
 * 使用 Orval 生成的 hook
 */
export function useEvent(eventId: number | null) {
	return useGetEventDetailApiEventsEventIdGet(eventId ?? 0, {
		query: {
			queryKey: queryKeys.events.detail(eventId ?? 0),
			enabled: eventId !== null,
			staleTime: 60 * 1000,
			select: (data: EventDetailResponse) => {
				if (!data) return null;

				const screenshots = data.screenshots || [];
				const screenshotCount = screenshots.length ?? 0;
				const firstScreenshotId = screenshots[0]?.id ?? undefined;

				return {
					id: data.id,
					app_name: data.app_name || "",
					window_title: data.window_title || "",
					start_time: data.start_time,
					end_time: data.end_time ?? undefined,
					screenshot_count: screenshotCount,
					first_screenshot_id: firstScreenshotId,
					ai_title: data.ai_title ?? undefined,
					ai_summary: data.ai_summary ?? undefined,
					screenshots,
				} as Event;
			},
		},
	});
}

/**
 * 批量获取多个 Event 详情的 Query Hook
 * 使用自定义查询组合多个 event 请求
 */
export function useEvents(eventIds: number[]) {
	return useQuery({
		queryKey: ["events", "batch", eventIds],
		queryFn: async () => {
			if (eventIds.length === 0) return [];

			// 使用 Orval 生成的 fetcher 函数
			const { getEventDetailApiEventsEventIdGet } = await import(
				"@/lib/generated/event/event"
			);

			const results = await Promise.all(
				eventIds.map(async (id) => {
					try {
						const data = await getEventDetailApiEventsEventIdGet(id);
						if (!data) return null;

						const screenshots = data.screenshots || [];
						const screenshotCount = screenshots.length ?? 0;
						const firstScreenshotId = screenshots[0]?.id ?? undefined;

						return {
							id: data.id,
							app_name: data.app_name || "",
							window_title: data.window_title || "",
							start_time: data.start_time,
							end_time: data.end_time ?? undefined,
							screenshot_count: screenshotCount,
							first_screenshot_id: firstScreenshotId,
							ai_title: data.ai_title ?? undefined,
							ai_summary: data.ai_summary ?? undefined,
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
 * 使用 Orval 生成的 hook
 */
export function useEventsList(params?: UseEventsListParams) {
	return useListEventsApiEventsGet(params, {
		query: {
			queryKey: queryKeys.events.list(params),
			staleTime: 30 * 1000,
			select: (data: EventListResponse) => {
				return data?.events ?? [];
			},
		},
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
