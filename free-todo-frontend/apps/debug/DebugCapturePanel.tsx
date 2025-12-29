"use client";

import {
	Activity,
	Camera,
	Check,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	ChevronUp,
	ClipboardList,
	Search,
	Square,
	X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TodoExtractionModal } from "@/apps/todo-list/TodoExtractionModal";
import { PanelHeader } from "@/components/common/layout/PanelHeader";
import type { ExtractedTodo, TodoExtractionResponse } from "@/lib/api";
import { getScreenshotImage } from "@/lib/api";
import { useCreateActivityManualApiActivitiesManualPost } from "@/lib/generated/activity/activity";
import {
	getEventDetailApiEventsEventIdGet,
	listEventsApiEventsGet,
} from "@/lib/generated/event/event";
import { getScreenshotApiScreenshotsScreenshotIdGet } from "@/lib/generated/screenshot/screenshot";
import { useExtractTodosFromEventApiTodoExtractionExtractPost } from "@/lib/generated/todo-extraction/todo-extraction";
import { toastError, toastInfo, toastSuccess } from "@/lib/toast";
import type { Event, Screenshot } from "@/lib/types";
import {
	calculateDuration,
	cn,
	formatDateTime,
	formatDuration,
} from "@/lib/utils";

// 格式化日期为 YYYY-MM-DD（使用本地时区）
function formatDate(date: Date) {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

// 白名单应用列表
const WHITELIST_APPS = [
	"微信",
	"WeChat",
	"飞书",
	"Feishu",
	"Lark",
	"钉钉",
	"DingTalk",
];

function isWhitelistApp(appName: string | null | undefined): boolean {
	if (!appName) return false;
	const appLower = appName.toLowerCase();
	return WHITELIST_APPS.some((app) => appLower.includes(app.toLowerCase()));
}

// 截图模态框组件
function ScreenshotModal({
	screenshot,
	screenshots,
	onClose,
}: {
	screenshot: Screenshot;
	screenshots?: Screenshot[];
	onClose: () => void;
}) {
	const t = useTranslations("debugCapture");
	const allScreenshots = screenshots || [screenshot];
	const initialIndex = allScreenshots.findIndex((s) => s.id === screenshot.id);
	const [currentIndex, setCurrentIndex] = useState(
		initialIndex >= 0 ? initialIndex : 0,
	);
	const [isOpen, setIsOpen] = useState(false);
	const [imageError, setImageError] = useState(false);
	const [imageLoading, setImageLoading] = useState(true);
	const currentScreenshot = allScreenshots[currentIndex];

	// 上一张
	const goToPrevious = useCallback(() => {
		setCurrentIndex((prev) =>
			prev > 0 ? prev - 1 : allScreenshots.length - 1,
		);
		setImageError(false);
		setImageLoading(true);
	}, [allScreenshots.length]);

	// 下一张
	const goToNext = useCallback(() => {
		setCurrentIndex((prev) =>
			prev < allScreenshots.length - 1 ? prev + 1 : 0,
		);
		setImageError(false);
		setImageLoading(true);
	}, [allScreenshots.length]);

	useEffect(() => {
		setIsOpen(true);
		document.body.style.overflow = "hidden";

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onClose();
			} else if (e.key === "ArrowLeft") {
				goToPrevious();
			} else if (e.key === "ArrowRight") {
				goToNext();
			}
		};
		document.addEventListener("keydown", handleKeyDown);

		return () => {
			document.body.style.overflow = "unset";
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [onClose, goToPrevious, goToNext]);

	useEffect(() => {
		const newIndex = allScreenshots.findIndex((s) => s.id === screenshot.id);
		if (newIndex >= 0) {
			setCurrentIndex(newIndex);
			setImageError(false);
			setImageLoading(true);
		}
	}, [screenshot.id, allScreenshots]);

	return (
		<div
			role="button"
			tabIndex={0}
			className={cn(
				"fixed inset-0 z-200 flex items-center justify-center p-4",
				"bg-black/80 backdrop-blur-sm",
				"transition-opacity duration-200",
				isOpen ? "opacity-100" : "opacity-0",
			)}
			onClick={onClose}
			onKeyDown={(e) => {
				if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
					onClose();
				}
			}}
		>
			<div
				role="dialog"
				className={cn(
					"relative w-full max-w-5xl max-h-[90vh]",
					"bg-background border border-border",
					"rounded-lg shadow-lg",
					"overflow-hidden",
					"transition-all duration-200",
					isOpen ? "scale-100 opacity-100" : "scale-95 opacity-0",
				)}
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => {
					// 阻止键盘事件冒泡，但不处理任何键盘操作
					e.stopPropagation();
				}}
			>
				<div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/95 backdrop-blur-sm px-4 py-3">
					<h2 className="text-xl font-semibold">{t("screenshotDetail")}</h2>
					<button
						type="button"
						onClick={onClose}
						className={cn(
							"rounded-md p-1.5",
							"text-muted-foreground hover:text-foreground",
							"hover:bg-muted",
							"transition-colors",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
						)}
						aria-label={t("close")}
					>
						<X className="h-5 w-5" />
					</button>
				</div>

				<div className="overflow-y-auto max-h-[calc(90vh-65px)]">
					<div className="space-y-0">
						<div className="relative overflow-hidden bg-muted/30 min-h-[400px] flex items-center justify-center">
							{imageLoading && !imageError && (
								<div className="absolute inset-0 flex items-center justify-center bg-muted/50">
									<div className="text-center">
										<div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
										<p className="mt-2 text-sm text-muted-foreground">
											{t("loading")}
										</p>
									</div>
								</div>
							)}
							{imageError ? (
								<div className="flex h-full w-full items-center justify-center text-muted-foreground">
									<div className="text-center">
										<svg
											className="mx-auto h-12 w-12"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											role="img"
											aria-label={t("loadFailed")}
										>
											<title>{t("loadFailed")}</title>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth={2}
												d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
											/>
										</svg>
										<p className="mt-2 text-sm font-medium">
											{t("imageLoadFailed")}
										</p>
										<p className="mt-1 text-xs text-muted-foreground">
											{t("screenshotId")}: {currentScreenshot.id}
										</p>
									</div>
								</div>
							) : (
								// biome-ignore lint/performance/noImgElement: 使用动态URL，Next.js Image需要已知域名
								<img
									key={currentScreenshot.id}
									src={getScreenshotImage(currentScreenshot.id)}
									alt={t("screenshot")}
									className={`w-full h-auto object-contain ${imageLoading ? "opacity-0" : "opacity-100"} transition-opacity`}
									onLoad={() => {
										setImageLoading(false);
										setImageError(false);
									}}
									onError={() => {
										setImageError(true);
										setImageLoading(false);
									}}
								/>
							)}

							{allScreenshots.length > 1 && (
								<div className="absolute bottom-3 right-3 rounded-md bg-black/80 backdrop-blur-sm px-3 py-1.5 text-sm font-medium text-white shadow-lg">
									{currentIndex + 1} / {allScreenshots.length}
								</div>
							)}

							{allScreenshots.length > 1 && (
								<>
									<button
										type="button"
										onClick={(e) => {
											e.stopPropagation();
											goToPrevious();
										}}
										className={cn(
											"absolute left-3 top-1/2 -translate-y-1/2",
											"rounded-md bg-background/90 backdrop-blur-sm border border-border",
											"p-2 text-foreground",
											"shadow-lg",
											"transition-all",
											"hover:bg-background hover:scale-105",
											"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
										)}
										aria-label={t("previous")}
									>
										<ChevronLeft className="h-5 w-5" />
									</button>
									<button
										type="button"
										onClick={(e) => {
											e.stopPropagation();
											goToNext();
										}}
										className={cn(
											"absolute right-3 top-1/2 -translate-y-1/2",
											"rounded-md bg-background/90 backdrop-blur-sm border border-border",
											"p-2 text-foreground",
											"shadow-lg",
											"transition-all",
											"hover:bg-background hover:scale-105",
											"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
										)}
										aria-label={t("next")}
									>
										<ChevronRight className="h-5 w-5" />
									</button>
								</>
							)}
						</div>

						<div className="border-t border-border p-4 space-y-4">
							<h3 className="text-base font-semibold">{t("details")}</h3>
							<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
								<div className="space-y-1">
									<div className="text-sm font-medium text-muted-foreground">
										{t("time")}
									</div>
									<div className="text-sm text-foreground">
										{formatDateTime(
											currentScreenshot.createdAt,
											"YYYY-MM-DD HH:mm:ss",
										)}
									</div>
								</div>
								<div className="space-y-1">
									<div className="text-sm font-medium text-muted-foreground">
										{t("app")}
									</div>
									<div className="text-sm text-foreground">
										{currentScreenshot.appName || t("unknown")}
									</div>
								</div>
								<div className="space-y-1 sm:col-span-2">
									<div className="text-sm font-medium text-muted-foreground">
										{t("windowTitle")}
									</div>
									<div className="text-sm text-foreground">
										{currentScreenshot.windowTitle || t("none")}
									</div>
								</div>
								<div className="space-y-1">
									<div className="text-sm font-medium text-muted-foreground">
										{t("size")}
									</div>
									<div className="text-sm text-foreground">
										{currentScreenshot.width} × {currentScreenshot.height}
									</div>
								</div>
							</div>

							{currentScreenshot.ocrResult?.textContent && (
								<div className="space-y-2 pt-4 border-t border-border">
									<div className="text-sm font-medium text-muted-foreground">
										{t("ocrResult")}
									</div>
									<div className="rounded-md border border-border bg-muted/50 p-4 max-h-64 overflow-y-auto">
										<pre className="whitespace-pre-wrap text-sm text-foreground leading-relaxed font-mono">
											{currentScreenshot.ocrResult.textContent}
										</pre>
									</div>
								</div>
							)}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

export function DebugCapturePanel() {
	const t = useTranslations("todoExtraction");
	const tDebug = useTranslations("debugCapture");
	const [events, setEvents] = useState<Event[]>([]);
	const [totalCount, setTotalCount] = useState(0);
	const [loading, setLoading] = useState(true);
	const [loadingMore, setLoadingMore] = useState(false);
	const [hasMore, setHasMore] = useState(true);
	const [startDate, setStartDate] = useState("");
	const [endDate, setEndDate] = useState("");
	const [appName, setAppName] = useState("");
	const [offset, setOffset] = useState(0);
	const [eventDetails, setEventDetails] = useState<{
		[key: number]: { screenshots?: Screenshot[] };
	}>({});
	const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
	const [selectedScreenshot, setSelectedScreenshot] =
		useState<Screenshot | null>(null);
	const [isMobile, setIsMobile] = useState(false);
	const [selectedEvents, setSelectedEvents] = useState<Set<number>>(new Set());
	const [aggregating, setAggregating] = useState(false);
	const [extractingTodos, setExtractingTodos] = useState<Set<number>>(
		new Set(),
	);

	// Mutation hooks
	const createActivityMutation =
		useCreateActivityManualApiActivitiesManualPost();
	const extractTodosMutation =
		useExtractTodosFromEventApiTodoExtractionExtractPost();

	const isAggregating = aggregating || createActivityMutation.isPending;
	const [extractionResult, setExtractionResult] = useState<{
		todos: ExtractedTodo[];
		eventId: number;
		appName: string | null;
	} | null>(null);
	const [isExtractionModalOpen, setIsExtractionModalOpen] = useState(false);

	const pageSize = 10;

	// 检测移动端
	useEffect(() => {
		const checkMobile = () => {
			setIsMobile(window.innerWidth < 640);
		};
		checkMobile();
		window.addEventListener("resize", checkMobile);
		return () => window.removeEventListener("resize", checkMobile);
	}, []);

	// 加载事件详情（包含截图）
	const loadEventDetail = useCallback(async (eventId: number) => {
		try {
			const eventData = await getEventDetailApiEventsEventIdGet(eventId);
			// API响应经过fetcher自动转换为camelCase，使用unknown作为中间类型
			const eventDataTyped = (eventData || {}) as unknown as Partial<Event> & {
				screenshots?: Screenshot[];
			};

			// 为每个截图加载 OCR 结果（如果需要）
			if (eventDataTyped.screenshots && eventDataTyped.screenshots.length > 0) {
				const screenshotsWithOcr = await Promise.all(
					eventDataTyped.screenshots.map(async (screenshot: Screenshot) => {
						// 如果已经有 OCR 结果，直接返回
						if (screenshot.ocrResult) {
							return screenshot;
						}

						try {
							// 获取单个截图的详情（包含 OCR 结果）
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
							// 静默失败，继续使用原始截图数据
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

	// 加载事件列表
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
					limit: pageSize,
					offset: currentOffset,
				};

				if (startDate) params.start_date = `${startDate}T00:00:00`;
				if (endDate) params.end_date = `${endDate}T23:59:59`;
				if (appName) params.app_name = appName;

				const response = await listEventsApiEventsGet(params);

				const responseData = response || {};

				let newEvents: Event[] = [];
				let totalCount = 0;

				if (Array.isArray(responseData)) {
					newEvents = responseData;
					totalCount = responseData.length;
				} else if (
					responseData &&
					typeof responseData === "object" &&
					"events" in responseData
				) {
					// API响应经过fetcher自动转换为camelCase
					const eventListResponse = responseData as unknown as {
						events?: Event[];
						total?: number;
					};
					newEvents = eventListResponse.events || [];
					totalCount = eventListResponse.total ?? 0;
				} else {
					newEvents = [];
					totalCount = 0;
				}

				if (reset) {
					setEvents(newEvents);
					setTotalCount(totalCount);
					setOffset(pageSize);
					setHasMore(newEvents.length < totalCount);
				} else {
					setEvents((prev) => {
						const eventMap = new Map(prev.map((e) => [e.id, e]));
						newEvents.forEach((event: Event) => {
							eventMap.set(event.id, event);
						});
						const updatedEvents = Array.from(eventMap.values());

						setHasMore(updatedEvents.length < totalCount);
						return updatedEvents;
					});
					setOffset((prev) => prev + pageSize);
					if (totalCount > 0) {
						setTotalCount(totalCount);
					}
				}

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

	// 滚动到底部时加载更多
	useEffect(() => {
		const handleScroll = (e: UIEvent) => {
			if (loading || loadingMore || !hasMore) return;

			const target = e.currentTarget as HTMLElement;
			const scrollTop = target.scrollTop;
			const scrollHeight = target.scrollHeight;
			const clientHeight = target.clientHeight;

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

	// 切换事件选中状态
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

	// 手动聚合选中事件为活动
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
			const activity = response;

			alert(
				tDebug("activityCreated", {
					title: activity?.ai_title || tDebug("activity"),
					count: eventIds.length,
				}),
			);

			// 清空选中状态
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

	// 提取待办事项
	const handleExtractTodos = async (eventId: number, eventAppName: string) => {
		if (!isWhitelistApp(eventAppName)) {
			toastError(t("notWhitelistApp"));
			return;
		}

		setExtractingTodos((prev) => new Set(prev).add(eventId));
		toastInfo(t("extracting"));

		try {
			const response: TodoExtractionResponse =
				await extractTodosMutation.mutateAsync({
					data: { event_id: eventId },
				});

			if (response.error_message) {
				toastError(t("extractFailed", { error: response.error_message }));
				return;
			}

			const todos = response.todos || [];
			if (todos.length === 0) {
				toastInfo(t("noTodosFound"));
				return;
			}

			toastSuccess(t("extractSuccess", { count: todos.length }));

			// 打开确认弹窗
			setExtractionResult({
				todos,
				eventId: response.event_id,
				appName: response.app_name || null,
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

	// 按日期分组事件，并按时间倒序排列
	const { grouped, sortedDates } = useMemo(() => {
		if (events.length === 0) {
			return {
				grouped: {} as { [date: string]: Event[] },
				sortedDates: [] as string[],
			};
		}

		const sortedEvents = [...events].sort((a, b) => {
			return new Date(b.startTime).getTime() - new Date(a.startTime).getTime();
		});

		const grouped: { [date: string]: Event[] } = {};
		sortedEvents.forEach((event) => {
			const date = formatDateTime(event.startTime, "YYYY-MM-DD");
			if (!grouped[date]) {
				grouped[date] = [];
			}
			grouped[date].push(event);
		});

		Object.keys(grouped).forEach((date) => {
			grouped[date].sort((a, b) => {
				return (
					new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
				);
			});
		});

		const sortedDates = Object.keys(grouped).sort((a, b) => {
			return new Date(b).getTime() - new Date(a).getTime();
		});

		return { grouped, sortedDates };
	}, [events]);

	// 切换日期组的展开/折叠状态
	const toggleDateGroup = (date: string) => {
		setExpandedDates((prev) => {
			const newSet = new Set(prev);
			if (newSet.has(date)) {
				newSet.delete(date);
			} else {
				newSet.add(date);
			}
			return newSet;
		});
	};

	// 默认展开所有日期组
	useEffect(() => {
		if (sortedDates.length > 0) {
			setExpandedDates((prev) => {
				const hasNewDate = sortedDates.some((date) => !prev.has(date));
				if (!hasNewDate) {
					return prev;
				}
				const newSet = new Set(prev);
				for (const date of sortedDates) {
					newSet.add(date);
				}
				return newSet;
			});
		}
	}, [sortedDates]);

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
				const params: {
					limit: number;
					offset: number;
					start_date: string;
					end_date: string;
				} = {
					limit: pageSize,
					offset: 0,
					start_date: `${weekAgoStr}T00:00:00`,
					end_date: `${todayStr}T23:59:59`,
				};

				const response = await listEventsApiEventsGet(params);

				// API响应经过fetcher自动转换为camelCase
				const responseData = (response || {}) as unknown as {
					events?: Event[];
					total?: number;
				};

				const newEvents = responseData.events || [];
				const totalCount = responseData.total ?? 0;

				setEvents(newEvents);
				setTotalCount(totalCount);
				setOffset(pageSize);
				setHasMore(newEvents.length < totalCount);

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

	return (
		<div className="flex h-full flex-col overflow-hidden bg-background">
			{/* 头部 */}
			<PanelHeader icon={Camera} title={tDebug("title")} />

			{/* 选中事件提示 */}
			{selectedEvents.size > 0 && (
				<div className="shrink-0 flex items-center justify-between rounded-lg mx-3 sm:mx-4 mt-3 sm:mt-4 px-4 py-3 border bg-primary/10 border-primary/20">
					<div className="flex items-center gap-2">
						<Check className="h-5 w-5 text-primary" />
						<span className="font-medium text-primary">
							{tDebug("selectedEvents", { count: selectedEvents.size })}
						</span>
					</div>
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={handleAggregateEvents}
							disabled={isAggregating || selectedEvents.size === 0}
							className="flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
						>
							{isAggregating ? (
								<>
									<div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
									<span>{tDebug("aggregating")}</span>
								</>
							) : (
								<>
									<Activity className="h-4 w-4" />
									<span>
										{tDebug("aggregateActivity", {
											count: selectedEvents.size,
										})}
									</span>
								</>
							)}
						</button>
						<button
							type="button"
							onClick={() => setSelectedEvents(new Set())}
							disabled={isAggregating}
							className="rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
						>
							{tDebug("clearSelection")}
						</button>
					</div>
				</div>
			)}

			{/* 搜索表单 */}
			<div className="shrink-0 border-b border-border bg-muted/30 p-3 sm:p-4">
				<form
					onSubmit={handleSearch}
					className="flex flex-col gap-3 sm:gap-4 sm:flex-row sm:items-end"
				>
					<div className="flex-1 grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-4">
						<div className="space-y-1">
							<label
								htmlFor="start-date"
								className="text-xs font-medium text-muted-foreground"
							>
								{tDebug("startDate")}
							</label>
							<input
								id="start-date"
								type="date"
								value={startDate}
								onChange={(e) => setStartDate(e.target.value)}
								className="w-full rounded-md border border-input bg-background px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm"
							/>
						</div>
						<div className="space-y-1">
							<label
								htmlFor="end-date"
								className="text-xs font-medium text-muted-foreground"
							>
								{tDebug("endDate")}
							</label>
							<input
								id="end-date"
								type="date"
								value={endDate}
								onChange={(e) => setEndDate(e.target.value)}
								className="w-full rounded-md border border-input bg-background px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm"
							/>
						</div>
						<div className="space-y-1">
							<label
								htmlFor="app-name"
								className="text-xs font-medium text-muted-foreground"
							>
								{tDebug("appName")}
							</label>
							<input
								id="app-name"
								type="text"
								placeholder={tDebug("appNamePlaceholder")}
								value={appName}
								onChange={(e) => setAppName(e.target.value)}
								className="w-full rounded-md border border-input bg-background px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm"
							/>
						</div>
						<div className="flex items-end">
							<button
								type="submit"
								className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-md bg-primary px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-primary-foreground hover:bg-primary/90"
							>
								<Search className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
								<span className="hidden sm:inline">{tDebug("search")}</span>
							</button>
						</div>
					</div>
				</form>
			</div>

			{/* 时间轴区域 */}
			<div className="flex-1 overflow-hidden flex flex-col">
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
							{sortedDates.map((date) => {
								const dateEvents = grouped[date];
								const isExpanded = expandedDates.has(date);
								const eventCount = dateEvents.length;

								return (
									<div key={date} className="space-y-4">
										<button
											type="button"
											onClick={() => toggleDateGroup(date)}
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
														{tDebug("eventsCount", { count: eventCount })}
													</div>
												</div>
											</div>
										</button>

										{isExpanded && (
											<div className="relative pl-6 space-y-4">
												<div className="absolute left-0 top-0 bottom-0 w-px bg-border" />

												{dateEvents.map((event) => {
													const detail = eventDetails[event.id];
													const screenshots = detail?.screenshots || [];
													const duration = event.endTime
														? calculateDuration(event.startTime, event.endTime)
														: null;

													const allOcrText = screenshots
														.map((s: Screenshot) => s.ocrResult?.textContent)
														.filter(Boolean)
														.join("\n\n");

													const isSelected = selectedEvents.has(event.id);

													return (
														<div key={event.id} className="relative">
															<div
																role="button"
																tabIndex={0}
																className={cn(
																	"ml-0 border rounded-lg hover:border-primary/50 transition-colors p-3 sm:p-4 bg-card cursor-pointer relative group",
																	isSelected
																		? "border-primary bg-primary/5"
																		: "border-border",
																)}
																onClick={() => toggleEventSelection(event.id)}
																onKeyDown={(e) => {
																	if (e.key === "Enter" || e.key === " ") {
																		e.preventDefault();
																		toggleEventSelection(event.id);
																	}
																}}
															>
																{/* 选择按钮 */}
																<button
																	type="button"
																	onClick={(e) =>
																		toggleEventSelection(event.id, e)
																	}
																	className={cn(
																		"absolute left-2 bottom-2 z-10 rounded p-0.5 transition-all",
																		isSelected
																			? "opacity-100"
																			: "opacity-0 group-hover:opacity-100",
																		"hover:bg-muted",
																	)}
																	aria-label={
																		isSelected
																			? tDebug("deselect")
																			: tDebug("select")
																	}
																>
																	{isSelected ? (
																		<Check className="h-5 w-5 text-primary" />
																	) : (
																		<Square className="h-5 w-5 text-primary/60 transition-colors" />
																	)}
																</button>

																{/* 提取待办按钮（仅白名单应用显示） */}
																{isWhitelistApp(event.appName) && (
																	<button
																		type="button"
																		onClick={(e) => {
																			e.stopPropagation();
																			handleExtractTodos(
																				event.id,
																				event.appName,
																			);
																		}}
																		disabled={extractingTodos.has(event.id)}
																		className={cn(
																			"absolute right-2 top-2 z-50",
																			"flex items-center gap-1.5",
																			"rounded-md px-2 py-1.5",
																			"text-xs font-medium",
																			"bg-background/95 backdrop-blur-sm text-primary border border-primary/30 shadow-lg",
																			"hover:bg-background hover:border-primary/50",
																			"transition-all",
																			"opacity-0 group-hover:opacity-100",
																			"disabled:opacity-50 disabled:cursor-not-allowed",
																		)}
																		aria-label={t("extractButton")}
																	>
																		{extractingTodos.has(event.id) ? (
																			<>
																				<div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
																				<span className="hidden sm:inline">
																					{t("extracting")}
																				</span>
																			</>
																		) : (
																			<>
																				<ClipboardList className="h-3.5 w-3.5" />
																				<span className="hidden sm:inline">
																					{t("extractButton")}
																				</span>
																			</>
																		)}
																	</button>
																)}
																<div className="flex flex-col sm:flex-row gap-4">
																	<div className="flex-1 min-w-0 space-y-2">
																		<div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 flex-wrap">
																			<h3 className="text-sm sm:text-base font-semibold text-foreground wrap-break-word">
																				{event.windowTitle ||
																					tDebug("unknownWindow")}
																			</h3>
																			<span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
																				{event.appName}
																			</span>
																		</div>

																		<div className="text-xs sm:text-sm text-muted-foreground">
																			{formatDateTime(
																				event.startTime,
																				"MM/DD HH:mm",
																			)}
																			{event.endTime && (
																				<>
																					{" - "}
																					{formatDateTime(
																						event.endTime,
																						"MM/DD HH:mm",
																					)}
																				</>
																			)}
																			{duration !== null ? (
																				<span>
																					{" "}
																					(
																					{tDebug("duration", {
																						duration: formatDuration(duration),
																					})}
																					)
																				</span>
																			) : (
																				<span className="text-green-600 dark:text-green-400">
																					{" "}
																					({tDebug("inProgress")})
																				</span>
																			)}
																		</div>

																		<div className="text-xs sm:text-sm text-foreground/80 leading-relaxed line-clamp-2 sm:line-clamp-none">
																			{event.aiSummary ||
																				allOcrText?.slice(0, 100) +
																					(allOcrText?.length > 100
																						? "..."
																						: "") ||
																				tDebug("noDescription")}
																		</div>
																	</div>

																	{screenshots.length > 0 && (
																		<div className="shrink-0 flex justify-start sm:justify-end w-full sm:w-auto">
																			<div
																				className="relative h-24 sm:h-32"
																				style={{
																					width: `calc(${Math.min(screenshots.length, 10)} * 16px + 96px)`,
																				}}
																			>
																				{screenshots
																					.slice(0, 10)
																					.map(
																						(
																							screenshot: Screenshot,
																							index: number,
																						) => {
																							const zIndex = 10 - index;
																							const isLast =
																								index ===
																									screenshots.length - 1 ||
																								index === 9;

																							return (
																								<button
																									type="button"
																									key={`${event.id}-${screenshot.id}`}
																									className="absolute cursor-pointer transition-all duration-200 hover:scale-105 hover:z-50 border-0 bg-transparent p-0 top-0"
																									style={{
																										left: isMobile
																											? `${index * 16}px`
																											: `${index * 20}px`,
																										zIndex: zIndex,
																									}}
																									onClick={(e) => {
																										e.stopPropagation();
																										setSelectedScreenshot(
																											screenshot,
																										);
																									}}
																								>
																									<div className="relative rounded-md overflow-hidden border border-border bg-muted w-24 h-24 sm:w-32 sm:h-32 shadow-sm">
																										{/* biome-ignore lint/performance/noImgElement: 使用动态URL，Next.js Image需要已知域名 */}
																										<img
																											src={getScreenshotImage(
																												screenshot.id,
																											)}
																											alt={`${tDebug("screenshot")} ${index + 1}`}
																											className="w-full h-full object-cover"
																											loading="lazy"
																											onError={(e) => {
																												const target =
																													e.currentTarget;
																												target.style.display =
																													"none";
																												const errorDiv =
																													document.createElement(
																														"div",
																													);
																												errorDiv.className =
																													"flex h-full w-full items-center justify-center text-muted-foreground text-xs bg-destructive/10";
																												errorDiv.textContent =
																													tDebug("loadFailed");
																												if (
																													target.parentElement
																												) {
																													target.parentElement.appendChild(
																														errorDiv,
																													);
																												}
																											}}
																										/>
																										{isLast &&
																											screenshots.length >
																												10 && (
																												<div className="absolute inset-0 bg-[oklch(var(--overlay))] flex items-center justify-center">
																													<span className="text-[oklch(var(--foreground))] font-semibold text-xs">
																														+
																														{screenshots.length -
																															10}
																													</span>
																												</div>
																											)}
																									</div>
																								</button>
																							);
																						},
																					)}
																				<div className="absolute bottom-0 right-0 rounded-md bg-[oklch(var(--overlay))] px-1.5 sm:px-2 py-0.5 sm:py-1 text-[10px] sm:text-xs font-semibold text-[oklch(var(--foreground))] z-60 pointer-events-none">
																					{tDebug("screenshotCount", {
																						count: screenshots.length,
																					})}
																				</div>
																			</div>
																		</div>
																	)}
																</div>
															</div>
														</div>
													);
												})}
											</div>
										)}
									</div>
								);
							})}
						</div>
					)}

					{!loading && hasMore && (
						<div className="mt-6 flex justify-center">
							{loadingMore ? (
								<div className="text-sm text-muted-foreground">
									{tDebug("loadingMore")}
								</div>
							) : (
								<div className="text-sm text-muted-foreground">
									{tDebug("scrollToLoadMore")}
								</div>
							)}
						</div>
					)}
					{!loading && !hasMore && events.length > 0 && (
						<div className="mt-6 text-center text-sm text-muted-foreground">
							{tDebug("allEventsLoaded")}
						</div>
					)}
				</div>
			</div>

			{/* 截图查看模态框 */}
			{selectedScreenshot &&
				(() => {
					const eventWithScreenshot = events.find((event) => {
						const detail = eventDetails[event.id];
						const screenshots = detail?.screenshots || [];
						return screenshots.some(
							(s: Screenshot) => s.id === selectedScreenshot.id,
						);
					});

					if (eventWithScreenshot) {
						const detail = eventDetails[eventWithScreenshot.id];
						const screenshots = detail?.screenshots || [];
						return (
							<ScreenshotModal
								screenshot={selectedScreenshot}
								screenshots={screenshots}
								onClose={() => setSelectedScreenshot(null)}
							/>
						);
					}

					return (
						<ScreenshotModal
							screenshot={selectedScreenshot}
							onClose={() => setSelectedScreenshot(null)}
						/>
					);
				})()}

			{/* 待办提取确认弹窗 */}
			{extractionResult && (
				<TodoExtractionModal
					isOpen={isExtractionModalOpen}
					onClose={() => {
						setIsExtractionModalOpen(false);
						setExtractionResult(null);
					}}
					todos={extractionResult.todos}
					eventId={extractionResult.eventId}
					appName={extractionResult.appName}
				/>
			)}
		</div>
	);
}
