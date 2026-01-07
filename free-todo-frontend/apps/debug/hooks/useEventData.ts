"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
	getEventDetailApiEventsEventIdGet,
	listEventsApiEventsGet,
} from "@/lib/generated/event/event";
import { getScreenshotApiScreenshotsScreenshotIdGet } from "@/lib/generated/screenshot/screenshot";
import type { Event, Screenshot } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";
import { formatDate } from "../utils";

/** 每页加载的事件数量 */
const PAGE_SIZE = 10;

/** 事件详情类型（包含截图） */
interface EventDetail {
	screenshots?: Screenshot[];
}

/** 分组后的事件数据 */
interface GroupedEvents {
	grouped: Record<string, Event[]>;
	sortedDates: string[];
}

/**
 * 事件数据管理 Hook
 * 负责加载、分页、搜索事件列表和事件详情
 */
export function useEventData() {
	// 事件列表状态
	const [events, setEvents] = useState<Event[]>([]);
	const [totalCount, setTotalCount] = useState(0);
	const [loading, setLoading] = useState(true);
	const [loadingMore, setLoadingMore] = useState(false);
	const [hasMore, setHasMore] = useState(true);
	const [offset, setOffset] = useState(0);

	// 搜索筛选状态
	const [startDate, setStartDate] = useState("");
	const [endDate, setEndDate] = useState("");
	const [appName, setAppName] = useState("");

	// 事件详情状态（包含截图）
	const [eventDetails, setEventDetails] = useState<Record<number, EventDetail>>(
		{},
	);

	// 日期展开状态
	const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());

	/**
	 * 加载单个事件的详情（包含截图和 OCR）
	 */
	const loadEventDetail = useCallback(async (eventId: number) => {
		try {
			const eventData = await getEventDetailApiEventsEventIdGet(eventId);
			const eventDataTyped = (eventData || {}) as unknown as Partial<Event> & {
				screenshots?: Screenshot[];
			};

			// 为每个截图加载 OCR 结果（如果需要）
			if (eventDataTyped.screenshots && eventDataTyped.screenshots.length > 0) {
				const screenshotsWithOcr = await Promise.all(
					eventDataTyped.screenshots.map(async (screenshot: Screenshot) => {
						if (screenshot.ocrResult) {
							return screenshot;
						}

						try {
							const screenshotData =
								await getScreenshotApiScreenshotsScreenshotIdGet(screenshot.id);
							if (screenshotData) {
								const data = screenshotData as {
									ocrResult?: { textContent: string };
									[id: string]: unknown;
								};
								return {
									...screenshot,
									ocrResult: data.ocrResult,
								};
							}
						} catch (_error) {
							// 静默失败
						}
						return screenshot;
					}),
				);
				eventDataTyped.screenshots = screenshotsWithOcr;
			}

			setEventDetails((prev) => {
				if (prev[eventId]) return prev;
				return {
					...prev,
					[eventId]: eventDataTyped,
				};
			});
		} catch (_error) {
			// 静默失败
		}
	}, []);

	/**
	 * 加载事件列表
	 */
	const loadEvents = useCallback(
		async (reset = false) => {
			if (reset) {
				setLoading(true);
				setOffset(0);
				setEvents([]);
			} else {
				setLoadingMore(true);
			}

			try {
				const currentOffset = reset ? 0 : offset;
				const params: {
					limit: number;
					offset: number;
					start_date?: string;
					end_date?: string;
					app_name?: string;
				} = {
					limit: PAGE_SIZE,
					offset: currentOffset,
				};

				if (startDate) params.start_date = `${startDate}T00:00:00`;
				if (endDate) params.end_date = `${endDate}T23:59:59`;
				if (appName) params.app_name = appName;

				const response = await listEventsApiEventsGet(params);
				const responseData = response || {};

				let newEvents: Event[] = [];
				let total = 0;

				if (Array.isArray(responseData)) {
					newEvents = responseData;
					total = responseData.length;
				} else if (
					responseData &&
					typeof responseData === "object" &&
					"events" in responseData
				) {
					const eventListResponse = responseData as unknown as {
						events?: Event[];
						total?: number;
					};
					newEvents = eventListResponse.events || [];
					total = eventListResponse.total ?? 0;
				}

				if (reset) {
					setEvents(newEvents);
					setTotalCount(total);
					setOffset(PAGE_SIZE);
					setHasMore(newEvents.length < total);
				} else {
					setEvents((prev) => {
						const eventMap = new Map(prev.map((e) => [e.id, e]));
						newEvents.forEach((event: Event) => {
							eventMap.set(event.id, event);
						});
						const updatedEvents = Array.from(eventMap.values());
						setHasMore(updatedEvents.length < total);
						return updatedEvents;
					});
					setOffset((prev) => prev + PAGE_SIZE);
					if (total > 0) {
						setTotalCount(total);
					}
				}

				// 加载每个事件的详情
				newEvents.forEach((event: Event) => {
					loadEventDetail(event.id);
				});
			} catch (_error) {
				// 静默失败
			} finally {
				setLoading(false);
				setLoadingMore(false);
			}
		},
		[offset, startDate, endDate, appName, loadEventDetail],
	);

	/**
	 * 按日期分组事件，并按时间倒序排列
	 */
	const groupedEvents: GroupedEvents = useMemo(() => {
		if (events.length === 0) {
			return { grouped: {}, sortedDates: [] };
		}

		const sortedEvents = [...events].sort(
			(a, b) =>
				new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
		);

		const grouped: Record<string, Event[]> = {};
		sortedEvents.forEach((event) => {
			const date = formatDateTime(event.startTime, "YYYY-MM-DD");
			if (!grouped[date]) {
				grouped[date] = [];
			}
			grouped[date].push(event);
		});

		// 每组内按时间倒序
		Object.keys(grouped).forEach((date) => {
			grouped[date].sort(
				(a, b) =>
					new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
			);
		});

		const sortedDates = Object.keys(grouped).sort(
			(a, b) => new Date(b).getTime() - new Date(a).getTime(),
		);

		return { grouped, sortedDates };
	}, [events]);

	/**
	 * 切换日期组的展开/折叠状态
	 */
	const toggleDateGroup = useCallback((date: string) => {
		setExpandedDates((prev) => {
			const newSet = new Set(prev);
			if (newSet.has(date)) {
				newSet.delete(date);
			} else {
				newSet.add(date);
			}
			return newSet;
		});
	}, []);

	// 默认展开所有日期组
	useEffect(() => {
		if (groupedEvents.sortedDates.length > 0) {
			setExpandedDates((prev) => {
				const hasNewDate = groupedEvents.sortedDates.some(
					(date) => !prev.has(date),
				);
				if (!hasNewDate) return prev;
				const newSet = new Set(prev);
				for (const date of groupedEvents.sortedDates) {
					newSet.add(date);
				}
				return newSet;
			});
		}
	}, [groupedEvents.sortedDates]);

	// 初始化：设置默认日期并加载事件
	useEffect(() => {
		const today = new Date();
		const weekAgo = new Date(today);
		weekAgo.setDate(today.getDate() - 7);

		const todayStr = formatDate(today);
		const weekAgoStr = formatDate(weekAgo);

		setEndDate(todayStr);
		setStartDate(weekAgoStr);

		const loadInitialEvents = async () => {
			setLoading(true);
			try {
				const params = {
					limit: PAGE_SIZE,
					offset: 0,
					start_date: `${weekAgoStr}T00:00:00`,
					end_date: `${todayStr}T23:59:59`,
				};

				const response = await listEventsApiEventsGet(params);
				const responseData = (response || {}) as unknown as {
					events?: Event[];
					total?: number;
				};

				const newEvents = responseData.events || [];
				const total = responseData.total ?? 0;

				setEvents(newEvents);
				setTotalCount(total);
				setOffset(PAGE_SIZE);
				setHasMore(newEvents.length < total);

				newEvents.forEach((event: Event) => {
					loadEventDetail(event.id);
				});
			} catch (_error) {
				// 静默失败
			} finally {
				setLoading(false);
			}
		};

		loadInitialEvents();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [loadEventDetail]);

	return {
		// 事件数据
		events,
		totalCount,
		eventDetails,
		groupedEvents,

		// 加载状态
		loading,
		loadingMore,
		hasMore,

		// 搜索筛选
		startDate,
		endDate,
		appName,
		setStartDate,
		setEndDate,
		setAppName,

		// 日期展开
		expandedDates,
		toggleDateGroup,

		// 操作方法
		loadEvents,
	};
}
