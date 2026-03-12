"use client";

import { useState } from "react";
import { unwrapApiData } from "@/lib/api/fetcher";
import { useCreateActivityManualApiActivitiesManualPost } from "@/lib/generated/activity/activity";
import type {
	LifetraceSchemasTodoExtractionExtractedTodo,
	ManualActivityCreateResponse,
	TodoExtractionResponse,
} from "@/lib/generated/schemas";
import { useExtractTodosFromEventApiTodoExtractionExtractPost } from "@/lib/generated/todo-extraction/todo-extraction";
import { toastError, toastInfo, toastSuccess } from "@/lib/toast";
import type { Event } from "@/lib/types";
import { isWhitelistApp } from "../utils";

interface ExtractionResult {
	todos: LifetraceSchemasTodoExtractionExtractedTodo[];
	eventId: number;
	appName: string | null;
}

type TranslationFunction = (
	key: string,
	params?: Record<string, string | number | Date>,
) => string;

interface UseEventActionsOptions {
	events: Event[];
	t: TranslationFunction;
	tDebug: TranslationFunction;
}

/**
 * 事件操作 Hook
 * 处理事件选择、聚合活动、提取待办等操作
 */
export function useEventActions({
	events,
	t,
	tDebug,
}: UseEventActionsOptions) {
	// 选中状态
	const [selectedEvents, setSelectedEvents] = useState<Set<number>>(new Set());
	const [aggregating, setAggregating] = useState(false);
	const [extractingTodos, setExtractingTodos] = useState<Set<number>>(
		new Set(),
	);

	// 待办提取结果
	const [extractionResult, setExtractionResult] =
		useState<ExtractionResult | null>(null);
	const [isExtractionModalOpen, setIsExtractionModalOpen] = useState(false);

	// Mutation hooks
	const createActivityMutation =
		useCreateActivityManualApiActivitiesManualPost();
	const extractTodosMutation =
		useExtractTodosFromEventApiTodoExtractionExtractPost();

	const isAggregating = aggregating || createActivityMutation.isPending;

	/**
	 * 切换事件选中状态
	 */
	const toggleEventSelection = (eventId: number, e?: React.MouseEvent) => {
		e?.stopPropagation();
		const newSet = new Set(selectedEvents);
		if (newSet.has(eventId)) {
			newSet.delete(eventId);
		} else {
			newSet.add(eventId);
		}
		setSelectedEvents(newSet);
	};

	/**
	 * 清除选中状态
	 */
	const clearSelection = () => {
		setSelectedEvents(new Set());
	};

	/**
	 * 聚合选中事件为活动
	 */
	const handleAggregateEvents = async () => {
		if (selectedEvents.size === 0) {
			alert(tDebug("selectEventsPrompt"));
			return;
		}

		// 检查是否有未结束的事件
		const unendedEvents = Array.from(selectedEvents).filter((eventId) => {
			const event = events.find((e) => e.id === eventId);
			return event && !event.endTime;
		});

		if (unendedEvents.length > 0) {
			alert(tDebug("unendedEventsError"));
			return;
		}

		setAggregating(true);
		try {
			const eventIds = Array.from(selectedEvents);
			const response = await createActivityMutation.mutateAsync({
				data: { event_ids: eventIds },
			});
			const created = unwrapApiData<ManualActivityCreateResponse>(response);

			alert(
				tDebug("activityCreated", {
					title: created?.ai_title || tDebug("activity"),
					count: eventIds.length,
				}),
			);

			setSelectedEvents(new Set());
		} catch (error: unknown) {
			console.error("聚合事件失败:", error);
			const errorMsg =
				error instanceof Error ? error.message : tDebug("aggregateFailed");
			alert(errorMsg);
		} finally {
			setAggregating(false);
		}
	};

	/**
	 * 提取待办事项
	 */
	const handleExtractTodos = async (eventId: number, eventAppName: string) => {
		if (!isWhitelistApp(eventAppName)) {
			toastError(t("notWhitelistApp"));
			return;
		}

		setExtractingTodos((prev) => new Set(prev).add(eventId));
		toastInfo(t("extracting"));

		try {
			const response = await extractTodosMutation.mutateAsync({
				data: { event_id: eventId },
			});
			const extracted = unwrapApiData<TodoExtractionResponse>(response);
			if (!extracted) {
				throw new Error("Invalid extraction response");
			}

			if (extracted.error_message) {
				toastError(t("extractFailed", { error: extracted.error_message }));
				return;
			}

			const todos = extracted.todos || [];
			if (todos.length === 0) {
				toastInfo(t("noTodosFound"));
				return;
			}

			toastSuccess(t("extractSuccess", { count: todos.length }));

			setExtractionResult({
				todos,
				eventId: extracted.event_id,
				appName: extracted.app_name || null,
			});
			setIsExtractionModalOpen(true);
		} catch (error: unknown) {
			console.error("提取待办失败:", error);
			const errorMsg =
				error instanceof Error ? error.message : tDebug("extractFailed");
			toastError(t("extractFailed", { error: errorMsg }));
		} finally {
			setExtractingTodos((prev) => {
				const newSet = new Set(prev);
				newSet.delete(eventId);
				return newSet;
			});
		}
	};

	/**
	 * 关闭待办提取弹窗
	 */
	const closeExtractionModal = () => {
		setIsExtractionModalOpen(false);
		setExtractionResult(null);
	};

	return {
		// 选中状态
		selectedEvents,
		isAggregating,
		extractingTodos,

		// 待办提取
		extractionResult,
		isExtractionModalOpen,

		// 操作方法
		toggleEventSelection,
		clearSelection,
		handleAggregateEvents,
		handleExtractTodos,
		closeExtractionModal,
	};
}
