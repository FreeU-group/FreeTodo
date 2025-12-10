"use client";

import {
	Camera,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	ChevronUp,
	Search,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getEvent, getEvents, getScreenshotImage } from "@/lib/api";
import type { Event, Screenshot } from "@/lib/types/event";
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
				"fixed inset-0 z-[200] flex items-center justify-center p-4",
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
					<h2 className="text-xl font-semibold">截图详情</h2>
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
						aria-label="关闭"
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
											加载中...
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
											aria-label="加载失败"
										>
											<title>加载失败</title>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth={2}
												d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
											/>
										</svg>
										<p className="mt-2 text-sm font-medium">图片加载失败</p>
										<p className="mt-1 text-xs text-muted-foreground">
											截图 ID: {currentScreenshot.id}
										</p>
									</div>
								</div>
							) : (
								// biome-ignore lint/performance/noImgElement: 使用动态URL，Next.js Image需要已知域名
								<img
									key={currentScreenshot.id}
									src={getScreenshotImage(currentScreenshot.id)}
									alt="截图"
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
										aria-label="上一张"
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
										aria-label="下一张"
									>
										<ChevronRight className="h-5 w-5" />
									</button>
								</>
							)}
						</div>

						<div className="border-t border-border p-4 space-y-4">
							<h3 className="text-base font-semibold">详细信息</h3>
							<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
								<div className="space-y-1">
									<div className="text-sm font-medium text-muted-foreground">
										时间
									</div>
									<div className="text-sm text-foreground">
										{formatDateTime(
											currentScreenshot.created_at,
											"YYYY-MM-DD HH:mm:ss",
										)}
									</div>
								</div>
								<div className="space-y-1">
									<div className="text-sm font-medium text-muted-foreground">
										应用
									</div>
									<div className="text-sm text-foreground">
										{currentScreenshot.app_name || "未知"}
									</div>
								</div>
								<div className="space-y-1 sm:col-span-2">
									<div className="text-sm font-medium text-muted-foreground">
										窗口标题
									</div>
									<div className="text-sm text-foreground">
										{currentScreenshot.window_title || "无"}
									</div>
								</div>
								<div className="space-y-1">
									<div className="text-sm font-medium text-muted-foreground">
										尺寸
									</div>
									<div className="text-sm text-foreground">
										{currentScreenshot.width} × {currentScreenshot.height}
									</div>
								</div>
							</div>

							{currentScreenshot.ocr_result?.text_content && (
								<div className="space-y-2 pt-4 border-t border-border">
									<div className="text-sm font-medium text-muted-foreground">
										OCR 结果
									</div>
									<div className="rounded-md border border-border bg-muted/50 p-4 max-h-64 overflow-y-auto">
										<pre className="whitespace-pre-wrap text-sm text-foreground leading-relaxed font-mono">
											{currentScreenshot.ocr_result.text_content}
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
			const response = await getEvent(eventId);
			const eventData = response.data || {};

			// 为每个截图加载 OCR 结果（如果需要）
			if (eventData.screenshots && eventData.screenshots.length > 0) {
				const screenshotsWithOcr = await Promise.all(
					eventData.screenshots.map(async (screenshot: Screenshot) => {
						// 如果已经有 OCR 结果，直接返回
						if (screenshot.ocr_result) {
							return screenshot;
						}

						try {
							// 获取单个截图的详情（包含 OCR 结果）
							const baseUrl =
								typeof window !== "undefined"
									? ""
									: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
							const screenshotResponse = await fetch(
								`${baseUrl}/api/screenshots/${screenshot.id}`,
								{
									headers: {
										"Content-Type": "application/json",
									},
								},
							);

							if (screenshotResponse.ok) {
								const screenshotData = await screenshotResponse.json();
								return {
									...screenshot,
									ocr_result: screenshotData.ocr_result,
								};
							}
						} catch (_error) {
							// 静默失败，继续使用原始截图数据
						}
						return screenshot;
					}),
				);

				eventData.screenshots = screenshotsWithOcr;
			}

			setEventDetails((prev) => {
				if (prev[eventId]) return prev;
				return {
					...prev,
					[eventId]: eventData,
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

				const response = await getEvents(params);

				const responseData = response.data || response;

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
					const eventListResponse = responseData as {
						events?: Event[];
						total_count?: number;
					};
					newEvents = eventListResponse.events || [];
					totalCount = eventListResponse.total_count ?? 0;
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

	// 按日期分组事件，并按时间倒序排列
	const { grouped, sortedDates } = useMemo(() => {
		if (events.length === 0) {
			return {
				grouped: {} as { [date: string]: Event[] },
				sortedDates: [] as string[],
			};
		}

		const sortedEvents = [...events].sort((a, b) => {
			return (
				new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
			);
		});

		const grouped: { [date: string]: Event[] } = {};
		sortedEvents.forEach((event) => {
			const date = formatDateTime(event.start_time, "YYYY-MM-DD");
			if (!grouped[date]) {
				grouped[date] = [];
			}
			grouped[date].push(event);
		});

		Object.keys(grouped).forEach((date) => {
			grouped[date].sort((a, b) => {
				return (
					new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
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

				const response = await getEvents(params);

				const responseData = response.data || response;

				const newEvents = responseData.events || responseData || [];
				const totalCount = responseData.total_count ?? 0;

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
		<div className="flex h-full flex-col overflow-hidden">
			{/* 头部 */}
			<div className="flex h-10 shrink-0 items-center gap-2 bg-orange-50 px-4 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300">
				<Camera className="h-4 w-4" />
				<h2 className="text-sm font-medium">截图管理（开发调试）</h2>
			</div>

			{/* 搜索表单 */}
			<div className="flex-shrink-0 border-b border-border bg-muted/30 p-3 sm:p-4">
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
								开始日期
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
								结束日期
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
								应用名称
							</label>
							<input
								id="app-name"
								type="text"
								placeholder="应用名称"
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
								<span className="hidden sm:inline">搜索</span>
							</button>
						</div>
					</div>
				</form>
			</div>

			{/* 时间轴区域 */}
			<div className="flex-1 overflow-hidden flex flex-col">
				<div className="flex-shrink-0 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-4 border-b border-border bg-muted/30 px-3 sm:px-4 py-2 sm:py-3">
					<h2 className="text-sm font-medium">事件时间轴</h2>
					{!loading && (
						<div className="text-xs text-muted-foreground">
							找到 {totalCount} 个事件
							{events.length < totalCount && `（已加载 ${events.length} 个）`}
						</div>
					)}
				</div>
				<div
					className="flex-1 overflow-y-auto p-3 sm:p-4"
					data-scroll-container
				>
					{loading ? (
						<div className="py-12 text-center text-muted-foreground">
							加载中...
						</div>
					) : events.length === 0 ? (
						<div className="py-12 text-center text-muted-foreground font-medium">
							<p>未找到事件</p>
							<p className="mt-2 text-sm">请调整搜索条件</p>
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
														{eventCount} 个事件
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
													const duration = event.end_time
														? calculateDuration(
																event.start_time,
																event.end_time,
															)
														: null;

													const allOcrText = screenshots
														.map((s: Screenshot) => s.ocr_result?.text_content)
														.filter(Boolean)
														.join("\n\n");

													return (
														<div key={event.id} className="relative">
															<div
																className={cn(
																	"ml-0 border border-border rounded-lg hover:border-primary/50 transition-colors p-3 sm:p-4 bg-card",
																)}
															>
																<div className="flex flex-col sm:flex-row gap-4">
																	<div className="flex-1 min-w-0 space-y-2">
																		<div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 flex-wrap">
																			<h3 className="text-sm sm:text-base font-semibold text-foreground break-words">
																				{event.window_title || "未知窗口"}
																			</h3>
																			<span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
																				{event.app_name}
																			</span>
																		</div>

																		<div className="text-xs sm:text-sm text-muted-foreground">
																			{formatDateTime(
																				event.start_time,
																				"MM/DD HH:mm",
																			)}
																			{event.end_time && (
																				<>
																					{" - "}
																					{formatDateTime(
																						event.end_time,
																						"MM/DD HH:mm",
																					)}
																				</>
																			)}
																			{duration !== null ? (
																				<span>
																					{" "}
																					(时长 {formatDuration(duration)})
																				</span>
																			) : (
																				<span className="text-green-600 dark:text-green-400">
																					{" "}
																					(进行中)
																				</span>
																			)}
																		</div>

																		<div className="text-xs sm:text-sm text-foreground/80 leading-relaxed line-clamp-2 sm:line-clamp-none">
																			{event.ai_summary ||
																				allOcrText?.slice(0, 100) +
																					(allOcrText?.length > 100
																						? "..."
																						: "") ||
																				"无描述"}
																		</div>
																	</div>

																	{screenshots.length > 0 && (
																		<div className="flex-shrink-0 flex justify-start sm:justify-end w-full sm:w-auto">
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
																											alt={`截图 ${index + 1}`}
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
																													"加载失败";
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
																												<div className="absolute inset-0 bg-black/60 flex items-center justify-center">
																													<span className="text-white font-semibold text-xs">
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
																				<div className="absolute bottom-0 right-0 rounded-md bg-black/70 px-1.5 sm:px-2 py-0.5 sm:py-1 text-[10px] sm:text-xs font-semibold text-white z-[60] pointer-events-none">
																					{screenshots.length} 张
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
									加载更多中...
								</div>
							) : (
								<div className="text-sm text-muted-foreground">
									滚动到底部加载更多
								</div>
							)}
						</div>
					)}
					{!loading && !hasMore && events.length > 0 && (
						<div className="mt-6 text-center text-sm text-muted-foreground">
							已加载所有事件
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
		</div>
	);
}
