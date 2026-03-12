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
	Activity,
	ActivityEventsResponse,
	ActivityListResponse,
	ActivityWithEvents,
	Event,
	EventListResponse,
} from "@/lib/types";
import { queryKeys } from "./keys";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Normalize API response to ensure consistent Activity type
 * Now that fetcher auto-converts snake_case -> camelCase
 */
function normalizeActivity(raw: Record<string, unknown>): Activity {
	return {
		id: raw.id as number,
		startTime: raw.startTime as string,
		endTime: raw.endTime as string,
		aiTitle: (raw.aiTitle as string) ?? undefined,
		aiSummary: (raw.aiSummary as string) ?? undefined,
		eventCount: raw.eventCount as number,
		createdAt: (raw.createdAt as string) ?? undefined,
		updatedAt: (raw.updatedAt as string) ?? undefined,
	};
}

/**
 * Normalize API response to ensure consistent Event type
 */
function normalizeEvent(raw: Record<string, unknown>): Event {
	const screenshots = (raw.screenshots as unknown[]) || [];
	const screenshotCount = screenshots.length ?? 0;
	const firstScreenshotId =
		((screenshots[0] as Record<string, unknown>)?.id as number) ?? undefined;

	return {
		id: raw.id as number,
		appName: (raw.appName as string) || "",
		windowTitle: (raw.windowTitle as string) || "",
		startTime: raw.startTime as string,
		endTime: (raw.endTime as string) ?? undefined,
		screenshotCount,
		firstScreenshotId,
		aiTitle: (raw.aiTitle as string) ?? undefined,
		aiSummary: (raw.aiSummary as string) ?? undefined,
		screenshots: screenshots as Event["screenshots"],
	};
}

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
				select: (data: unknown) => {
					// Data is now auto-converted to camelCase by the fetcher
					const response = data as ActivityListResponse;
					return (response?.activities ?? []).map((raw) =>
						normalizeActivity(raw as unknown as Record<string, unknown>),
					);
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
			select: (data: unknown) => {
				// Data is now auto-converted to camelCase by the fetcher
				const response = data as ActivityEventsResponse;
				return response?.eventIds ?? [];
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
			select: (data: unknown) => {
				if (!data) return null;
				return normalizeEvent(data as Record<string, unknown>);
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
						return normalizeEvent(data as unknown as Record<string, unknown>);
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
			select: (data: unknown) => {
				const response = data as EventListResponse;
				return response?.events ?? [];
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
				eventIds,
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
