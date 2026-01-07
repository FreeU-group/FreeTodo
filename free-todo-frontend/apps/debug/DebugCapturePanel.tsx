"use client";

import { Camera, ChevronDown, ChevronUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { TodoExtractionModal } from "@/apps/todo-list/TodoExtractionModal";
import { PanelHeader } from "@/components/common/layout/PanelHeader";
import type { Screenshot } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";
import {
	EventCard,
	EventSearchForm,
	ScreenshotModal,
	SelectedEventsBar,
} from "./components";
import { useEventActions, useEventData } from "./hooks";

/**
 * 调试面板主组件
 * 显示事件时间轴，支持截图预览、事件聚合、待办提取等功能
 */
export function DebugCapturePanel() {
	const t = useTranslations("todoExtraction");
	const tDebug = useTranslations("debugCapture");

	// 事件数据管理
	const {
		events,
		totalCount,
		eventDetails,
		groupedEvents,
		loading,
		loadingMore,
		hasMore,
		startDate,
		endDate,
		appName,
		setStartDate,
		setEndDate,
		setAppName,
		expandedDates,
		toggleDateGroup,
		loadEvents,
	} = useEventData();

	// 事件操作管理
	const {
		selectedEvents,
		isAggregating,
		extractingTodos,
		extractionResult,
		isExtractionModalOpen,
		toggleEventSelection,
		clearSelection,
		handleAggregateEvents,
		handleExtractTodos,
		closeExtractionModal,
	} = useEventActions({ events, t, tDebug });

	// UI 状态
	const [isMobile, setIsMobile] = useState(false);
	const [selectedScreenshot, setSelectedScreenshot] =
		useState<Screenshot | null>(null);

	// 检测移动端
	useEffect(() => {
		const checkMobile = () => setIsMobile(window.innerWidth < 640);
		checkMobile();
		window.addEventListener("resize", checkMobile);
		return () => window.removeEventListener("resize", checkMobile);
	}, []);

	// 滚动加载更多
	useEffect(() => {
		const handleScroll = (e: UIEvent) => {
			if (loading || loadingMore || !hasMore) return;

			const target = e.currentTarget as HTMLElement;
			const { scrollTop, scrollHeight, clientHeight } = target;

			if (scrollTop + clientHeight >= scrollHeight - 100) {
				loadEvents(false);
			}
		};

		const scrollContainer = document.querySelector("[data-scroll-container]");
		if (scrollContainer) {
			scrollContainer.addEventListener("scroll", handleScroll as EventListener);
			return () =>
				scrollContainer.removeEventListener(
					"scroll",
					handleScroll as EventListener,
				);
		}
	}, [loading, loadingMore, hasMore, loadEvents]);

	// 搜索事件
	const handleSearch = (e: React.FormEvent) => {
		e.preventDefault();
		loadEvents(true);
	};

	// 获取选中截图所属事件的所有截图
	const getScreenshotsForSelectedScreenshot = () => {
		if (!selectedScreenshot) return null;

		const eventWithScreenshot = events.find((event) => {
			const detail = eventDetails[event.id];
			return detail?.screenshots?.some(
				(s: Screenshot) => s.id === selectedScreenshot.id,
			);
		});

		if (eventWithScreenshot) {
			return eventDetails[eventWithScreenshot.id]?.screenshots;
		}
		return null;
	};

	const { grouped, sortedDates } = groupedEvents;

	return (
		<div className="flex h-full flex-col overflow-hidden bg-background">
			{/* 头部 */}
			<PanelHeader icon={Camera} title={tDebug("title")} />

			{/* 选中事件提示栏 */}
			<SelectedEventsBar
				selectedCount={selectedEvents.size}
				isAggregating={isAggregating}
				onAggregate={handleAggregateEvents}
				onClear={clearSelection}
			/>

			{/* 搜索表单 */}
			<EventSearchForm
				startDate={startDate}
				endDate={endDate}
				appName={appName}
				onStartDateChange={setStartDate}
				onEndDateChange={setEndDate}
				onAppNameChange={setAppName}
				onSearch={handleSearch}
			/>

			{/* 时间轴区域 */}
			<div className="flex-1 overflow-hidden flex flex-col">
				{/* 统计信息 */}
				<div className="shrink-0 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-4 border-b border-border bg-muted/30 px-3 sm:px-4 py-2 sm:py-3">
					<h2 className="text-sm font-medium">{tDebug("eventTimeline")}</h2>
					{!loading && (
						<div className="text-xs text-muted-foreground">
							{tDebug("foundEvents", { total: totalCount })}
							{events.length < totalCount &&
								` ${tDebug("loadedEvents", { loaded: events.length })}`}
						</div>
					)}
				</div>

				{/* 事件列表 */}
				<div
					className="flex-1 overflow-y-auto p-3 sm:p-4"
					data-scroll-container
				>
					{loading ? (
						<div className="py-12 text-center text-muted-foreground">
							{tDebug("loading")}
						</div>
					) : events.length === 0 ? (
						<div className="py-12 text-center text-muted-foreground font-medium">
							<p>{tDebug("noEventsFound")}</p>
							<p className="mt-2 text-sm">{tDebug("adjustSearchCriteria")}</p>
						</div>
					) : (
						<div className="space-y-6">
							{sortedDates.map((date) => (
								<DateGroup
									key={date}
									date={date}
									events={grouped[date]}
									eventDetails={eventDetails}
									isExpanded={expandedDates.has(date)}
									selectedEvents={selectedEvents}
									extractingTodos={extractingTodos}
									isMobile={isMobile}
									onToggleExpand={() => toggleDateGroup(date)}
									onToggleSelection={toggleEventSelection}
									onExtractTodos={handleExtractTodos}
									onScreenshotClick={setSelectedScreenshot}
									tDebug={tDebug}
								/>
							))}
						</div>
					)}

					{/* 加载状态 */}
					<LoadingIndicator
						loading={loading}
						loadingMore={loadingMore}
						hasMore={hasMore}
						eventsCount={events.length}
						tDebug={tDebug}
					/>
				</div>
			</div>

			{/* 截图模态框 */}
			{selectedScreenshot && (
				<ScreenshotModal
					screenshot={selectedScreenshot}
					screenshots={getScreenshotsForSelectedScreenshot() || undefined}
					onClose={() => setSelectedScreenshot(null)}
				/>
			)}

			{/* 待办提取确认弹窗 */}
			{extractionResult && (
				<TodoExtractionModal
					isOpen={isExtractionModalOpen}
					onClose={closeExtractionModal}
					todos={extractionResult.todos}
					eventId={extractionResult.eventId}
					appName={extractionResult.appName}
				/>
			)}
		</div>
	);
}

// ============== 子组件 ==============

interface DateGroupProps {
	date: string;
	events: import("@/lib/types").Event[];
	eventDetails: Record<number, { screenshots?: Screenshot[] }>;
	isExpanded: boolean;
	selectedEvents: Set<number>;
	extractingTodos: Set<number>;
	isMobile: boolean;
	onToggleExpand: () => void;
	onToggleSelection: (eventId: number, e?: React.MouseEvent) => void;
	onExtractTodos: (eventId: number, appName: string) => void;
	onScreenshotClick: (screenshot: Screenshot) => void;
	tDebug: (key: string, params?: Record<string, string | number | Date>) => string;
}

/** 日期分组组件 */
function DateGroup({
	date,
	events,
	eventDetails,
	isExpanded,
	selectedEvents,
	extractingTodos,
	isMobile,
	onToggleExpand,
	onToggleSelection,
	onExtractTodos,
	onScreenshotClick,
	tDebug,
}: DateGroupProps) {
	return (
		<div className="space-y-4">
			{/* 日期头部 */}
			<button
				type="button"
				onClick={onToggleExpand}
				className="w-full flex items-center justify-between px-3 sm:px-4 py-2 sm:py-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors"
			>
				<div className="flex items-center gap-3">
					{isExpanded ? (
						<ChevronUp className="h-4 w-4 text-muted-foreground" />
					) : (
						<ChevronDown className="h-4 w-4 text-muted-foreground" />
					)}
					<div className="text-left">
						<div className="text-sm font-medium text-foreground">
							{formatDateTime(`${date}T00:00:00`, "YYYY-MM-DD")}
						</div>
						<div className="text-xs text-muted-foreground">
							{tDebug("eventsCount", { count: events.length })}
						</div>
					</div>
				</div>
			</button>

			{/* 事件列表 */}
			{isExpanded && (
				<div className="relative pl-6 space-y-4">
					<div className="absolute left-0 top-0 bottom-0 w-px bg-border" />
					{events.map((event) => (
						<EventCard
							key={event.id}
							event={event}
							screenshots={eventDetails[event.id]?.screenshots || []}
							isSelected={selectedEvents.has(event.id)}
							isExtracting={extractingTodos.has(event.id)}
							isMobile={isMobile}
							onToggleSelection={onToggleSelection}
							onExtractTodos={onExtractTodos}
							onScreenshotClick={onScreenshotClick}
						/>
					))}
				</div>
			)}
		</div>
	);
}

interface LoadingIndicatorProps {
	loading: boolean;
	loadingMore: boolean;
	hasMore: boolean;
	eventsCount: number;
	tDebug: (key: string, params?: Record<string, string | number | Date>) => string;
}

/** 加载状态指示器 */
function LoadingIndicator({
	loading,
	loadingMore,
	hasMore,
	eventsCount,
	tDebug,
}: LoadingIndicatorProps) {
	if (loading) return null;

	if (hasMore) {
		return (
			<div className="mt-6 flex justify-center">
				<div className="text-sm text-muted-foreground">
					{loadingMore ? tDebug("loadingMore") : tDebug("scrollToLoadMore")}
				</div>
			</div>
		);
	}

	if (eventsCount > 0) {
		return (
			<div className="mt-6 text-center text-sm text-muted-foreground">
				{tDebug("allEventsLoaded")}
			</div>
		);
	}

	return null;
}
