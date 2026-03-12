"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Bell, Check, Clock, Settings, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { deleteNotificationApiNotificationsNotificationIdDelete } from "@/lib/generated/notifications/notifications";
import { useOpenSettings } from "@/lib/hooks/useOpenSettings";
import { useUpdateTodo } from "@/lib/query";
import { useNotificationStore } from "@/lib/store/notification-store";
import { toastError, toastSuccess } from "@/lib/toast";

// 简单的相对时间格式化
function formatTime(
	timestamp: string,
	t: ReturnType<typeof useTranslations>,
): string {
	const date = new Date(timestamp);
	if (Number.isNaN(date.getTime())) {
		return "";
	}
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMins = Math.floor(diffMs / 60000);
	if (diffMins < 1) {
		return t("justNow");
	}
	if (diffMins < 60) {
		return t("minutesAgo", { count: diffMins });
	}
	const diffHours = Math.floor(diffMins / 60);
	if (diffHours < 24) {
		return t("hoursAgo", { count: diffHours });
	}
	const diffDays = Math.floor(diffHours / 24);
	return t("daysAgo", { count: diffDays });
}

// 格式化当前时间
function formatCurrentTime(t: ReturnType<typeof useTranslations>): {
	time: string;
	date: string;
} {
	const now = new Date();

	// 时间格式：HH:MM
	const hours = now.getHours().toString().padStart(2, "0");
	const minutes = now.getMinutes().toString().padStart(2, "0");
	const time = `${hours}:${minutes}`;

	// 日期格式
	const month = (now.getMonth() + 1).toString().padStart(2, "0");
	const day = now.getDate().toString().padStart(2, "0");
	const date = t("dateFormat", { month, day });

	return { time, date };
}

export function HeaderIsland() {
	const {
		notifications,
		isExpanded,
		toggleExpanded,
		removeNotification,
		removeNotificationsBySource,
		setExpanded,
	} = useNotificationStore();
	const t = useTranslations("todoExtraction");
	const tLayout = useTranslations("layout");
	const containerRef = useRef<HTMLDivElement>(null);
	const [currentTime, setCurrentTime] = useState(() => formatCurrentTime(t));
	const updateTodoMutation = useUpdateTodo();
	const isProcessing = updateTodoMutation.isPending;

	const currentNotification = notifications[0] ?? null;
	const notificationCount = notifications.length;

	// 使用共享的打开设置 hook
	const { openSettings } = useOpenSettings();
	const openLlmSettings = useCallback(() => {
		openSettings();
		setTimeout(() => {
			window.dispatchEvent(
				new CustomEvent("settings:set-category", {
					detail: { category: "ai" },
				}),
			);
			const apiKeyInput = document.getElementById("llm-api-key");
			if (apiKeyInput) {
				apiKeyInput.scrollIntoView({ behavior: "smooth", block: "center" });
			} else {
				const settingsContent = document.querySelector(
					'[data-tour="settings-content"]',
				);
				settingsContent?.scrollTo({ top: 0, behavior: "smooth" });
			}
		}, 200);
	}, [openSettings]);

	// 检查是否是 LLM 配置通知
	const isLlmConfigNotification = currentNotification?.source === "llm-config";

	// 更新时间
	useEffect(() => {
		const updateTime = () => {
			setCurrentTime(formatCurrentTime(t));
		};

		// 立即更新一次
		updateTime();

		// 每秒更新一次
		const interval = setInterval(updateTime, 1000);

		return () => clearInterval(interval);
	}, [t]);

	// 点击外部关闭
	useEffect(() => {
		if (!isExpanded || notifications.length === 0) return;

		const handleClickOutside = (event: MouseEvent) => {
			if (
				containerRef.current &&
				!containerRef.current.contains(event.target as Node)
			) {
				useNotificationStore.getState().setExpanded(false);
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, [isExpanded, notifications.length]);

	const closeNotification = async (notificationId: string, source?: string) => {
		if (source === "ddl-reminder" && notificationId) {
			try {
				await deleteNotificationApiNotificationsNotificationIdDelete(notificationId);
			} catch (error) {
				// 静默处理错误，即使删除失败也关闭前端通知
				console.warn("Failed to delete notification from backend:", error);
			}
		}

		removeNotification(notificationId);
		if (useNotificationStore.getState().notifications.length === 0) {
			setExpanded(false);
		}
	};

	// 同意 draft todo
	const handleAccept = async (
		todoId: number | undefined,
		e: React.MouseEvent,
	) => {
		e.stopPropagation();
		if (!todoId || isProcessing) return;

		try {
			await updateTodoMutation.mutateAsync({
				id: todoId,
				input: { status: "active" },
			});
			toastSuccess(t("acceptSuccess"));
			removeNotificationsBySource("draft-todos");
			setExpanded(false);
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			// 如果是 404 错误（todo 已被删除），静默关闭通知
			if (
				errorMsg.includes("404") ||
				errorMsg.includes("Not Found") ||
				errorMsg.includes("不存在")
			) {
				removeNotificationsBySource("draft-todos");
				setExpanded(false);
				return;
			}
			toastError(t("acceptFailed", { error: errorMsg }));
		}
	};

	// 拒绝 draft todo
	const handleReject = async (
		todoId: number | undefined,
		e: React.MouseEvent,
	) => {
		e.stopPropagation();
		if (!todoId || isProcessing) return;

		try {
			await updateTodoMutation.mutateAsync({
				id: todoId,
				input: { status: "canceled" },
			});
			toastSuccess(t("rejectSuccess"));
			removeNotificationsBySource("draft-todos");
			setExpanded(false);
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			// 如果是 404 错误（todo 已被删除），静默关闭通知
			if (
				errorMsg.includes("404") ||
				errorMsg.includes("Not Found") ||
				errorMsg.includes("不存在")
			) {
				removeNotificationsBySource("draft-todos");
				setExpanded(false);
				return;
			}
			toastError(t("rejectFailed", { error: errorMsg }));
		}
	};

	return (
		<div
			ref={containerRef}
			className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50"
		>
			<motion.div
				initial={false}
				animate={{
					width: isExpanded ? "auto" : "auto",
					height: isExpanded ? "auto" : "auto",
					minWidth: isExpanded ? 800 : currentNotification ? 400 : 200,
					maxWidth: isExpanded ? 1200 : currentNotification ? 500 : 300,
				}}
				transition={{
					type: "spring",
					stiffness: 300,
					damping: 30,
				}}
				className="relative"
			>
				{currentNotification ? (
					// 有通知时显示通知内容
					<motion.div
						onClick={() => {
							if (!isExpanded && isLlmConfigNotification) {
								openLlmSettings();
								return;
							}
							toggleExpanded();
						}}
						whileHover={{
							scale: 1.02,
							y: -2,
						}}
						whileTap={{
							scale: 0.98,
						}}
						role="button"
						tabIndex={0}
						onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									if (!isExpanded && isLlmConfigNotification) {
										openLlmSettings();
										return;
									}
									toggleExpanded();
								}
						}}
						className={`
						relative flex items-center gap-2 overflow-hidden rounded-full
						bg-background/95 backdrop-blur-sm border border-border/50
						shadow-lg transition-all duration-300 cursor-pointer
						hover:shadow-2xl hover:shadow-primary/10 hover:border-primary/30
						hover:bg-background
						focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
						${isExpanded ? "px-4 py-2.5" : "px-3 py-2"}
					`}
						aria-label={
							isExpanded ? t("collapseNotification") : t("expandNotification")
						}
					>
						<AnimatePresence mode="wait">
							{!isExpanded ? (
								// 收起状态：显示简略内容
								<motion.div
									key="collapsed"
									initial={{ opacity: 0, scale: 0.8 }}
									animate={{ opacity: 1, scale: 1 }}
									exit={{ opacity: 0, scale: 0.8 }}
									transition={{ duration: 0.2 }}
									className="flex items-center gap-2"
								>
									<motion.div
										animate={{
											rotate: isLlmConfigNotification
												? [0, 360]
												: [0, -10, 10, -10, 0],
										}}
										transition={
											isLlmConfigNotification
												? {
													duration: 2,
													repeat: Infinity,
													ease: "linear",
												}
												: {
													duration: 0.5,
													repeat: Infinity,
													repeatDelay: 2,
													ease: "easeInOut",
												}
										}
									>
										{isLlmConfigNotification ? (
											<Settings className="h-4 w-4 text-amber-500 shrink-0" />
										) : (
											<Bell className="h-4 w-4 text-primary shrink-0" />
										)}
									</motion.div>
									<span className="text-sm font-medium text-foreground truncate max-w-[200px]">
										{currentNotification.title || t("newNotification")}
										{currentNotification.content && (
											<span className="text-muted-foreground/70">
												{" "}
												（{currentNotification.content}）
											</span>
										)}
									</span>
									{notificationCount > 1 && (
										<span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
											{notificationCount}
										</span>
									)}
								</motion.div>
							) : (
								// 展开状态：显示完整列表
								<motion.div
									key="expanded"
									initial={{ opacity: 0, scale: 0.95 }}
									animate={{ opacity: 1, scale: 1 }}
									exit={{ opacity: 0, scale: 0.95 }}
									transition={{ duration: 0.2 }}
									className="flex flex-col gap-2 w-full max-h-[60vh] overflow-y-auto"
								>
									{notifications.map((notification) => {
										const isDraftTodo =
											notification.source === "draft-todos" &&
											notification.todoId;
										const isLlmConfig =
											notification.source === "llm-config";

										return (
											<div
												key={notification.id}
												className="flex items-center gap-3 w-full border border-border/40 rounded-2xl px-3 py-2 bg-background/80"
											>
												{isLlmConfig ? (
													<Settings className="h-4 w-4 text-amber-500 shrink-0" />
												) : (
													<Bell className="h-4 w-4 text-primary shrink-0" />
												)}
												<div className="flex-1 min-w-0 flex items-center gap-2">
													<h3 className="text-sm font-semibold text-foreground truncate max-w-[500px]">
														{notification.title || t("newNotification")}
														{notification.content && (
															<span className="text-muted-foreground/70">
																{" "}
																（{notification.content}）
															</span>
														)}
													</h3>
												</div>
												{notification.timestamp && (
													<span className="text-xs text-muted-foreground/70 shrink-0 whitespace-nowrap">
														{formatTime(notification.timestamp, t)}
													</span>
												)}
												{isLlmConfig && (
													<motion.button
														type="button"
													onClick={(e) => {
														e.stopPropagation();
														openLlmSettings();
													}}
														whileHover={{ scale: 1.05 }}
														whileTap={{ scale: 0.95 }}
														className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-600"
													>
														{tLayout("openSettings")}
													</motion.button>
												)}
												{isDraftTodo && (
													<div className="flex items-center gap-2 shrink-0 border-l border-border/50 pl-3">
														<motion.button
															type="button"
															onClick={(e) =>
															handleAccept(notification.todoId, e)
														}
															disabled={isProcessing}
															whileHover={!isProcessing ? { scale: 1.05 } : {}}
															whileTap={!isProcessing ? { scale: 0.95 } : {}}
															className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
															aria-label={t("accept")}
														>
															{isProcessing ? (
																<>
																	<motion.div
																		animate={{ rotate: 360 }}
																		transition={{
																			duration: 1,
																			repeat: Infinity,
																			ease: "linear",
																		}}
																	>
																		<Clock className="h-4 w-4" />
																	</motion.div>
																	<span>{t("accepting")}</span>
																</>
																) : (
																	<>
																		<Check className="h-4 w-4" />
																		<span>{t("accept")}</span>
																	</>
																)}
															</motion.button>
														<motion.button
															type="button"
															onClick={(e) =>
															handleReject(notification.todoId, e)
														}
															disabled={isProcessing}
															whileHover={!isProcessing ? { scale: 1.05 } : {}}
															whileTap={!isProcessing ? { scale: 0.95 } : {}}
															className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
															aria-label={t("reject")}
														>
															{isProcessing ? (
																<>
																	<motion.div
																		animate={{ rotate: 360 }}
																		transition={{
																			duration: 1,
																			repeat: Infinity,
																			ease: "linear",
																		}}
																	>
																		<Clock className="h-4 w-4" />
																	</motion.div>
																	<span>{t("rejecting")}</span>
																</>
																) : (
																	<>
																		<X className="h-4 w-4" />
																		<span>{t("reject")}</span>
																	</>
																)}
															</motion.button>
													</div>
												)}
												<motion.button
													type="button"
													onClick={(e) => {
														e.stopPropagation();
														closeNotification(
															notification.id,
															notification.source,
														);
													}}
													whileHover={{ scale: 1.1, rotate: 90 }}
													whileTap={{ scale: 0.9 }}
													className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors ml-1"
													aria-label={t("closeNotification")}
												>
													<X className="h-3.5 w-3.5" />
												</motion.button>
											</div>
										);
									})}
								</motion.div>
							)}
						</AnimatePresence>
					</motion.div>
				) : (
					// 没有通知时显示当前时间
					<motion.div
						initial={{ opacity: 0, scale: 0.9 }}
						animate={{ opacity: 1, scale: 1 }}
						whileHover={{
							scale: 1.03,
							y: -2,
						}}
						transition={{
							duration: 0.3,
						}}
						className="relative flex items-center gap-2 overflow-hidden rounded-full
						bg-background/95 backdrop-blur-sm border border-border/50
						shadow-lg px-3 py-2
						hover:shadow-2xl hover:shadow-primary/5 hover:border-primary/20
						hover:bg-background transition-all duration-300
						cursor-default"
					>
						<Clock className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
						<div className="flex items-baseline gap-1.5">
							<motion.span
								key={currentTime.time}
								initial={{ opacity: 0, y: -4 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ duration: 0.2 }}
								className="text-sm font-medium text-foreground tabular-nums"
							>
								{currentTime.time}
							</motion.span>
							<span className="text-xs text-muted-foreground/70 font-normal">
								{currentTime.date}
							</span>
						</div>
					</motion.div>
				)}
			</motion.div>
		</div>
	);
}
