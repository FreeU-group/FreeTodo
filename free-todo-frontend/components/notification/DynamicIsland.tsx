"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Bell, Check, Clock, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { updateTodoApi } from "@/lib/api";
import { useTranslations } from "@/lib/i18n";
import { useLocaleStore } from "@/lib/store/locale";
import { useNotificationStore } from "@/lib/store/notification-store";
import { useTodoStore } from "@/lib/store/todo-store";
import { toastError, toastSuccess } from "@/lib/toast";

// 简单的相对时间格式化
function formatTime(timestamp: string, locale: string): string {
	const date = new Date(timestamp);
	if (Number.isNaN(date.getTime())) {
		return "";
	}
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMins = Math.floor(diffMs / 60000);
	if (diffMins < 1) {
		return locale === "zh" ? "刚刚" : "just now";
	}
	if (diffMins < 60) {
		return locale === "zh" ? `${diffMins}分钟前` : `${diffMins}m ago`;
	}
	const diffHours = Math.floor(diffMins / 60);
	if (diffHours < 24) {
		return locale === "zh" ? `${diffHours}小时前` : `${diffHours}h ago`;
	}
	const diffDays = Math.floor(diffHours / 24);
	return locale === "zh" ? `${diffDays}天前` : `${diffDays}d ago`;
}

// 格式化当前时间
function formatCurrentTime(locale: string): { time: string; date: string } {
	const now = new Date();

	// 时间格式：HH:MM
	const hours = now.getHours().toString().padStart(2, "0");
	const minutes = now.getMinutes().toString().padStart(2, "0");
	const time = `${hours}:${minutes}`;

	// 日期格式
	const month = (now.getMonth() + 1).toString().padStart(2, "0");
	const day = now.getDate().toString().padStart(2, "0");
	const date = locale === "zh" ? `${month}月${day}日` : `${month}/${day}`;

	return { time, date };
}

export function DynamicIsland() {
	const {
		currentNotification,
		isExpanded,
		toggleExpanded,
		setNotification,
		setExpanded,
	} = useNotificationStore();
	const { refreshTodos } = useTodoStore();
	const { locale } = useLocaleStore();
	const t = useTranslations(locale);
	const containerRef = useRef<HTMLDivElement>(null);
	const [currentTime, setCurrentTime] = useState(() =>
		formatCurrentTime(locale),
	);
	const [isProcessing, setIsProcessing] = useState(false);

	// 检查是否是 draft todo 通知
	const isDraftTodo =
		currentNotification?.source === "draft-todos" &&
		currentNotification?.todoId;

	// 更新时间
	useEffect(() => {
		const updateTime = () => {
			setCurrentTime(formatCurrentTime(locale));
		};

		// 立即更新一次
		updateTime();

		// 每秒更新一次
		const interval = setInterval(updateTime, 1000);

		return () => clearInterval(interval);
	}, [locale]);

	// 点击外部关闭
	useEffect(() => {
		if (!isExpanded || !currentNotification) return;

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
	}, [isExpanded, currentNotification]);

	const handleClose = (e: React.MouseEvent) => {
		e.stopPropagation();
		setNotification(null);
		setExpanded(false);
	};

	// 同意 draft todo
	const handleAccept = async (e: React.MouseEvent) => {
		e.stopPropagation();
		if (!isDraftTodo || !currentNotification?.todoId || isProcessing) return;

		setIsProcessing(true);
		try {
			await updateTodoApi(currentNotification.todoId, {
				status: "active",
			});
			// 接受草稿待办后刷新待办列表，确保待办面板立即显示新待办
			await refreshTodos();
			toastSuccess(t.todoExtraction.acceptSuccess);
			setNotification(null);
			setExpanded(false);
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			toastError(t.todoExtraction.acceptFailed.replace("{error}", errorMsg));
		} finally {
			setIsProcessing(false);
		}
	};

	// 拒绝 draft todo
	const handleReject = async (e: React.MouseEvent) => {
		e.stopPropagation();
		if (!isDraftTodo || !currentNotification?.todoId || isProcessing) return;

		setIsProcessing(true);
		try {
			await updateTodoApi(currentNotification.todoId, {
				status: "canceled",
			});
			// 拒绝草稿待办后也刷新列表，移除对应待办
			await refreshTodos();
			toastSuccess(t.todoExtraction.rejectSuccess);
			setNotification(null);
			setExpanded(false);
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			toastError(t.todoExtraction.rejectFailed.replace("{error}", errorMsg));
		} finally {
			setIsProcessing(false);
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
						onClick={toggleExpanded}
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
						aria-label={isExpanded ? "收起通知" : "展开通知"}
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
											rotate: [0, -10, 10, -10, 0],
										}}
										transition={{
											duration: 0.5,
											repeat: Infinity,
											repeatDelay: 2,
											ease: "easeInOut",
										}}
									>
										<Bell className="h-4 w-4 text-primary shrink-0" />
									</motion.div>
									<span className="text-sm font-medium text-foreground truncate max-w-[120px]">
										{currentNotification.title || "新通知"}
									</span>
								</motion.div>
							) : (
								// 展开状态：显示完整内容（横向布局）
								<motion.div
									key="expanded"
									initial={{ opacity: 0, scale: 0.95 }}
									animate={{ opacity: 1, scale: 1 }}
									exit={{ opacity: 0, scale: 0.95 }}
									transition={{ duration: 0.2 }}
									className="flex items-center gap-3 w-full"
								>
									{/* 左侧：图标 */}
									<Bell className="h-4 w-4 text-primary shrink-0" />
									{/* 中间：标题和内容（一行显示） */}
									<div className="flex-1 min-w-0 flex items-center gap-2">
										<h3 className="text-sm font-semibold text-foreground truncate">
											{currentNotification.title}
										</h3>
										{currentNotification.content && (
											<>
												<span className="text-xs text-muted-foreground/60">
													•
												</span>
												<p className="text-xs text-muted-foreground truncate">
													{currentNotification.content}
												</p>
											</>
										)}
									</div>
									{/* 时间戳 */}
									{currentNotification.timestamp && (
										<span className="text-xs text-muted-foreground/70 shrink-0 whitespace-nowrap">
											{formatTime(currentNotification.timestamp, locale)}
										</span>
									)}
									{/* Draft Todo 操作按钮 */}
									{isDraftTodo && (
										<div className="flex items-center gap-2 shrink-0 border-l border-border/50 pl-3">
											<motion.button
												type="button"
												onClick={handleAccept}
												disabled={isProcessing}
												whileHover={!isProcessing ? { scale: 1.05 } : {}}
												whileTap={!isProcessing ? { scale: 0.95 } : {}}
												className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
												aria-label={t.todoExtraction.accept}
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
														<span>{t.todoExtraction.accepting}</span>
													</>
												) : (
													<>
														<Check className="h-4 w-4" />
														<span>{t.todoExtraction.accept}</span>
													</>
												)}
											</motion.button>
											<motion.button
												type="button"
												onClick={handleReject}
												disabled={isProcessing}
												whileHover={!isProcessing ? { scale: 1.05 } : {}}
												whileTap={!isProcessing ? { scale: 0.95 } : {}}
												className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
												aria-label={t.todoExtraction.reject}
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
														<span>{t.todoExtraction.rejecting}</span>
													</>
												) : (
													<>
														<X className="h-4 w-4" />
														<span>{t.todoExtraction.reject}</span>
													</>
												)}
											</motion.button>
										</div>
									)}
									{/* 关闭按钮 */}
									<motion.button
										type="button"
										onClick={handleClose}
										whileHover={{ scale: 1.1, rotate: 90 }}
										whileTap={{ scale: 0.9 }}
										className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors ml-1"
										aria-label="关闭通知"
									>
										<X className="h-3.5 w-3.5" />
									</motion.button>
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
