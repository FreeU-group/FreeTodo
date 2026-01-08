"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronsUpDown, Maximize2, Minimize2 } from "lucide-react";
import { useTheme } from "next-themes";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useConfig, useSaveConfig } from "@/lib/query";
import { ContextMenu } from "./ContextMenu";
import { FloatContent } from "./FloatContent";
import { PanelContent } from "./PanelContent";
import { ResizeHandle } from "./ResizeHandle";
import { IslandMode } from "./types";

interface DynamicIslandProps {
	mode: IslandMode;
	onModeChange?: (mode: IslandMode) => void;
	onClose?: () => void;
}

type ElectronAPI = typeof window & {
	electronAPI?: {
		collapseWindow?: () => Promise<void> | void;
		expandWindow?: () => Promise<void> | void;
		expandWindowFull?: () => Promise<void> | void;
		setIgnoreMouseEvents?: (ignore: boolean, options?: { forward?: boolean }) => void;
		resizeWindow?: (dx: number, dy: number, pos: string) => void;
		quit?: () => void;
	};
	require?: (module: string) => { ipcRenderer?: { send: (...args: unknown[]) => void } };
};

function getElectronAPI(): ElectronAPI {
	return window as ElectronAPI;
}

export function DynamicIsland({
	mode,
	onModeChange,
	onClose,
}: DynamicIslandProps) {
	// 通过事件系统获取录音状态，而不是直接访问 store
	const [isRecording, setIsRecording] = useState(false);
	const [isPaused, setIsPaused] = useState(false);

	// 拖拽状态（完全手动实现，支持任意位置放置，吸附到最近的边缘）
	const [position, setPosition] = useState<{ x: number; y: number } | null>(
		null,
	);
	const [isDragging, setIsDragging] = useState(false);
	const [isHovered, setIsHovered] = useState(false); // 鼠标悬停状态
	const dragStartPos = useRef<{
		x: number;
		y: number;
		startX: number;
		startY: number;
	} | null>(null);
	const islandRef = useRef<HTMLDivElement>(null);

	// 右键菜单状态（仅 FLOAT 模式下使用）
	const [contextMenuOpen, setContextMenuOpen] = useState(false);
	const [contextMenuPosition, setContextMenuPosition] = useState<{
		x: number;
		y: number;
	}>({ x: 0, y: 0 });

	const { theme, systemTheme } = useTheme();
	const currentTheme = theme === "system" ? systemTheme : theme;
	const isDark = currentTheme === "dark";

	const { data: config } = useConfig();
	const saveConfigMutation = useSaveConfig();
	const recorderEnabled = config?.jobsRecorderEnabled ?? false;

	// 监听录音状态变化事件（从 VoiceModulePanel 发送，如果 voice module 不存在则不会收到事件，但不影响功能）
	useEffect(() => {
		const handleRecordingStatusChange = (event: Event) => {
			const customEvent = event as CustomEvent<{
				isRecording: boolean;
				isPaused: boolean;
			}>;
			const { isRecording: recording, isPaused: paused } = customEvent.detail || {};
			if (typeof recording === "boolean") {
				setIsRecording(recording);
			}
			if (typeof paused === "boolean") {
				setIsPaused(paused);
			}
		};

		if (typeof window !== "undefined") {
			window.addEventListener(
				"voice-module-recording-status",
				handleRecordingStatusChange as EventListener,
			);
			document.addEventListener(
				"voice-module-recording-status",
				handleRecordingStatusChange as EventListener,
			);
		}

		return () => {
			if (typeof window !== "undefined") {
				window.removeEventListener(
					"voice-module-recording-status",
					handleRecordingStatusChange as EventListener,
				);
				document.removeEventListener(
					"voice-module-recording-status",
					handleRecordingStatusChange as EventListener,
				);
			}
		};
	}, []);

	// 处理录音控制 - 通过事件系统触发 VoiceModulePanel 的录音
	// TODO: 暂时注释掉功能，只保留UI
	// 注意：如果 voice module 不存在，事件会被发送但不会有响应，不影响 DynamicIsland 的正常功能
	const handleToggleRecording = useCallback(() => {
		// 暂时注释掉功能，只保留UI
		console.log("[DynamicIsland] 麦克风按钮点击（功能已暂时禁用）");
	}, []);

	// 处理停止录音
	const handleStopRecording = useCallback(() => {
		// 暂时注释掉功能，只保留UI
		console.log("[DynamicIsland] 停止录音按钮点击（功能已暂时禁用）");
	}, []);

	// LOGIC: Electron Click-Through Handling - 完全照搬 island 实现
	const setIgnoreMouse = useCallback((ignore: boolean) => {
		const api = getElectronAPI();
		try {
			if (api.require) {
				const { ipcRenderer } = api.require("electron") ?? {};
				if (ignore) {
					// forward: true lets the mouse move event still reach the browser
					// so we can detect when to turn it back on.
					ipcRenderer?.send("set-ignore-mouse-events", true, {
						forward: true,
					});
				} else {
					ipcRenderer?.send("set-ignore-mouse-events", false);
				}
			} else {
				api.electronAPI?.setIgnoreMouseEvents?.(
					ignore,
					ignore ? { forward: true } : undefined,
				);
			}
		} catch (error) {
			console.error("[DynamicIsland] setIgnoreMouse failed", error);
		}
	}, []);

	useEffect(() => {
		// If we are in FULLSCREEN mode, we always want to capture mouse
		if (mode === IslandMode.FULLSCREEN) {
			setIgnoreMouse(false);
			// 重置拖拽相关状态
			setIsDragging(false);
			setIsHovered(false);
			dragStartPos.current = null;
		}
		// Panel 模式：窗口可交互，不忽略鼠标
		else if (mode === IslandMode.PANEL) {
			setIgnoreMouse(false);
			// 重置拖拽相关状态
			setIsDragging(false);
			setIsHovered(false);
			dragStartPos.current = null;
		}
		// FLOAT 模式：默认忽略鼠标（点击穿透），hover 时会取消忽略
		else {
			// 延迟设置点击穿透，确保窗口状态已更新
			setTimeout(() => {
				setIgnoreMouse(true);
			}, 100);
			// 重置拖拽相关状态，确保切换回FLOAT模式时可以正常拖拽
			setIsDragging(false);
			setIsHovered(false);
			dragStartPos.current = null;
			console.log(
				"[DynamicIsland] 切换到FLOAT模式，重置拖拽状态，将在100ms后启用点击穿透",
			);
		}
	}, [mode, setIgnoreMouse]);

	useEffect(() => {
		const handleKeyDown = async (e: KeyboardEvent) => {
			if (e.key === "1") {
				const api = getElectronAPI();
				await api.electronAPI?.collapseWindow?.();
				setTimeout(() => api.electronAPI?.setIgnoreMouseEvents?.(true, { forward: true }), 120);
				onModeChange?.(IslandMode.FLOAT);
			} else if (e.key === "4") {
				const api = getElectronAPI();
				await api.electronAPI?.expandWindow?.();
				onModeChange?.(IslandMode.PANEL);
			} else if (e.key === "5") {
				const api = getElectronAPI();
				await api.electronAPI?.expandWindowFull?.();
				onModeChange?.(IslandMode.FULLSCREEN);
			} else if (e.key === "Escape") {
				if (mode === IslandMode.FULLSCREEN || mode === IslandMode.PANEL) {
					const api = getElectronAPI();
					await api.electronAPI?.collapseWindow?.();
					setTimeout(() => api.electronAPI?.setIgnoreMouseEvents?.(true, { forward: true }), 120);
					onModeChange?.(IslandMode.FLOAT);
					onClose?.();
				}
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [mode, onClose, onModeChange]);

	// 计算吸附位置（支持任意位置，吸附到最近的边缘或角落）
	const calculateSnapPosition = useCallback(
		(x: number, y: number): { x: number; y: number } => {
			if (typeof window === "undefined") {
				return { x, y };
			}

			const windowWidth = window.innerWidth;
			const windowHeight = window.innerHeight;
			const islandWidth = 150; // 更新为新的宽度
			const islandHeight = 48;
			const margin = 32;
			const snapThreshold = 50; // 吸附阈值：50px

			let snapX = x;
			let snapY = y;

			// 检查是否靠近左边缘
			if (x <= margin + snapThreshold) {
				snapX = margin;
			}
			// 检查是否靠近右边缘
			else if (x >= windowWidth - islandWidth - margin - snapThreshold) {
				snapX = windowWidth - islandWidth - margin;
			}

			// 检查是否靠近上边缘
			if (y <= margin + snapThreshold) {
				snapY = margin;
			}
			// 检查是否靠近下边缘
			else if (y >= windowHeight - islandHeight - margin - snapThreshold) {
				snapY = windowHeight - islandHeight - margin;
			}

			// 限制在屏幕范围内
			snapX = Math.max(
				margin,
				Math.min(snapX, windowWidth - islandWidth - margin),
			);
			snapY = Math.max(
				margin,
				Math.min(snapY, windowHeight - islandHeight - margin),
			);

			return { x: snapX, y: snapY };
		},
		[],
	);

	// 全局鼠标移动监听器：检测鼠标是否在灵动岛区域内
	useEffect(() => {
		// 只在 FLOAT 模式下运行，PANEL 和 FULLSCREEN 模式都不需要
		if (
			mode === IslandMode.FULLSCREEN ||
			mode === IslandMode.PANEL ||
			typeof window === "undefined"
		)
			return;

		const handleGlobalMouseMove = (e: MouseEvent) => {
			if (!islandRef.current) return;

			const rect = islandRef.current.getBoundingClientRect();
			const { clientX, clientY } = e;

			// 检查鼠标是否在灵动岛区域内（包括一些容差，避免边缘抖动）
			const padding = 10; // 容差：10px
			const isInside =
				clientX >= rect.left - padding &&
				clientX <= rect.right + padding &&
				clientY >= rect.top - padding &&
				clientY <= rect.bottom + padding;

			if (isInside && !isHovered) {
				// 鼠标进入区域，展开
				setIsHovered(true);
				setIgnoreMouse(false); // 取消点击穿透，允许交互
				console.log(
					"[DynamicIsland] Mouse entered (global), click-through disabled",
				);
			} else if (!isInside && isHovered && !isDragging) {
				// 鼠标移出区域，折叠（如果不在拖拽中）
				setIsHovered(false);
				setIgnoreMouse(true); // 恢复点击穿透
				console.log(
					"[DynamicIsland] Mouse left (global), click-through enabled",
				);
			}
		};

		// 使用 requestAnimationFrame 优化性能
		let rafId: number | null = null;
		const throttledHandleMouseMove = (e: MouseEvent) => {
			if (rafId) return;
			rafId = requestAnimationFrame(() => {
				handleGlobalMouseMove(e);
				rafId = null;
			});
		};

		window.addEventListener("mousemove", throttledHandleMouseMove, {
			passive: true,
		});

		return () => {
			window.removeEventListener("mousemove", throttledHandleMouseMove);
			if (rafId) {
				cancelAnimationFrame(rafId);
			}
		};
	}, [mode, isHovered, isDragging, setIgnoreMouse]);

	// 手动拖拽实现（完全控制位置，防止飞出屏幕）
	const handleMouseDown = useCallback(
		(e: React.MouseEvent) => {
			if (mode === IslandMode.FULLSCREEN || mode === IslandMode.PANEL) return;

			// 如果点击的是按钮或可交互元素，不拖拽
			const target = e.target as HTMLElement;
			if (
				target.closest('button, a, input, select, textarea, [role="button"]')
			) {
				return;
			}

			if (e.button === 0) {
				// 左键
				// 立即取消点击穿透，确保可以捕获鼠标事件
				setIsHovered(true);
				setIgnoreMouse(false); // 立即取消点击穿透，允许交互和拖拽
				console.log(
					"[DynamicIsland] Mouse down for drag, click-through disabled",
				);

				// 开始拖拽
				setIsDragging(true);
				const rect = islandRef.current?.getBoundingClientRect();
				if (rect) {
					dragStartPos.current = {
						x: e.clientX,
						y: e.clientY,
						startX: rect.left,
						startY: rect.top,
					};
				}
				// 不要 preventDefault，让拖拽可以正常工作
				e.stopPropagation(); // 阻止事件冒泡到内容区域
			}
		},
		[mode, setIgnoreMouse],
	);

	// 处理鼠标移动
	useEffect(() => {
		if (typeof window === "undefined") return;
		// 只在FLOAT模式下允许拖拽
		if (mode !== IslandMode.FLOAT) return;
		if (!isDragging || !dragStartPos.current) return;

		// 确保在拖拽过程中点击穿透保持被取消状态
		setIgnoreMouse(false);

		const handleMouseMove = (e: MouseEvent) => {
			if (!islandRef.current || !dragStartPos.current) return;

			const deltaX = e.clientX - dragStartPos.current.x;
			const deltaY = e.clientY - dragStartPos.current.y;

			// 计算新位置
			let newX = dragStartPos.current.startX + deltaX;
			let newY = dragStartPos.current.startY + deltaY;

			// 限制在屏幕范围内
			const windowWidth = window.innerWidth;
			const windowHeight = window.innerHeight;
			const islandWidth = 150; // 更新为新的宽度
			const islandHeight = 48;

			newX = Math.max(0, Math.min(newX, windowWidth - islandWidth));
			newY = Math.max(0, Math.min(newY, windowHeight - islandHeight));

			// 更新位置（临时位置，不更新 corner）
			islandRef.current.style.left = `${newX}px`;
			islandRef.current.style.top = `${newY}px`;
			islandRef.current.style.right = "auto";
			islandRef.current.style.bottom = "auto";
		};

		const handleMouseUp = (_e: MouseEvent) => {
			if (!islandRef.current || !dragStartPos.current) return;

			const rect = islandRef.current.getBoundingClientRect();
			const currentX = rect.left;
			const currentY = rect.top;

			// 计算吸附位置
			const snapPos = calculateSnapPosition(currentX, currentY);

			// 更新位置状态，framer-motion 会自动平滑移动到新位置
			setPosition(snapPos);
			setIsDragging(false);
			dragStartPos.current = null;

			// 拖拽结束后，检查鼠标是否还在灵动岛区域内
			// 如果不在，恢复点击穿透；如果在，保持可交互状态
			setTimeout(() => {
				if (!islandRef.current) return;
				const finalRect = islandRef.current.getBoundingClientRect();
				const mouseX = _e.clientX;
				const mouseY = _e.clientY;
				const padding = 10;
				const isInside =
					mouseX >= finalRect.left - padding &&
					mouseX <= finalRect.right + padding &&
					mouseY >= finalRect.top - padding &&
					mouseY <= finalRect.bottom + padding;

				if (!isInside && mode === IslandMode.FLOAT) {
					setIsHovered(false);
					setIgnoreMouse(true);
					console.log(
						"[DynamicIsland] Drag ended, mouse outside, click-through enabled",
					);
				}
			}, 100);
		};

		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("mouseup", handleMouseUp);

		return () => {
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseup", handleMouseUp);
		};
	}, [isDragging, calculateSnapPosition, mode, setIgnoreMouse]);

	const handleToggleScreenshot = useCallback(async () => {
		try {
			await saveConfigMutation.mutateAsync({
				data: { jobsRecorderEnabled: !recorderEnabled },
			});
		} catch (error) {
			console.error("[DynamicIsland] toggle screenshot failed", error);
		}
	}, [recorderEnabled, saveConfigMutation]);

	const handleOpenContextMenu = useCallback(
		(event: React.MouseEvent) => {
			if (mode !== IslandMode.FLOAT) return;
			event.preventDefault();
			setContextMenuPosition({ x: event.clientX, y: event.clientY - 8 });
			setContextMenuOpen(true);
		},
		[mode],
	);

	const handleCloseContextMenu = useCallback(() => {
		setContextMenuOpen(false);
	}, []);


	// 处理窗口缩放（用于自定义缩放把手）
	const handleResize = useCallback(
		(deltaX: number, deltaY: number, position: string) => {
			const api = getElectronAPI();
			if (api.electronAPI?.resizeWindow) {
				console.log("[DynamicIsland] 缩放窗口:", { deltaX, deltaY, position });
				api.electronAPI.resizeWindow(deltaX, deltaY, position);
			} else {
				console.warn("[DynamicIsland] electronAPI.resizeWindow 不存在");
			}
		},
		[],
	);

	const getLayoutState = (mode: IslandMode) => {
		const margin = 40;

		switch (mode) {
			case IslandMode.FLOAT: {
				// 默认收起状态：只显示小图标（32x32）
				// 鼠标悬停时展开：显示完整内容（180x48）
				const collapsedLayout = {
					width: 36,
					height: 36,
					borderRadius: 18,
				};
				const expandedLayout = {
					// 三个图标并列，留点间距：18*3 + 16*2(gap) + 32*2(padding) = 54 + 32 + 64 = 150
					width: 135,
					height: 48,
					borderRadius: 24,
				};

				const baseLayout = isHovered ? expandedLayout : collapsedLayout;

				if (position) {
					return {
						...baseLayout,
						left: position.x,
						top: position.y,
						right: "auto",
						bottom: "auto",
					};
				} else {
					// 默认位置：右下角
					return {
						...baseLayout,
						right: margin,
						bottom: margin,
						left: "auto",
						top: "auto",
					};
				}
			}
			case IslandMode.PANEL:
				// Panel模式：窗口化显示，由Electron控制大小和位置
				// 添加圆角（增大到16px，更明显）
				return {
					width: "100%",
					height: "100%",
					borderRadius: 16,
					right: 0,
					bottom: 0,
					left: 0,
					top: 0,
				};
			case IslandMode.FULLSCREEN:
				return {
					width: "100vw",
					height: "100vh",
					borderRadius: 16, // 全屏模式也添加圆角
					right: 0,
					bottom: 0,
					left: 0,
					top: 0,
				};
			default:
				return {
					width: 180,
					height: 48,
					borderRadius: 24,
					right: margin,
					bottom: margin,
					left: "auto",
					top: "auto",
				};
		}
	};

	const layoutState = getLayoutState(mode);
	const isFullscreen = mode === IslandMode.FULLSCREEN;

	if (mode === IslandMode.FULLSCREEN) {
		return (
			<>
				<AnimatePresence>
					<motion.div
						initial={{ opacity: 0, scale: 0.5, rotate: -45 }}
						animate={{ opacity: 1, scale: 1, rotate: 0 }}
						exit={{ opacity: 0, scale: 0.5, rotate: -45 }}
						className="fixed inset-x-0 top-0 z-[100000] pointer-events-none"
					>
						<div
							className="flex items-center justify-end px-4 h-15"
							style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
						>
							<div
								role="toolbar"
								className="flex items-center gap-1.5 rounded-xl bg-background/80 dark:bg-background/80 backdrop-blur-xl border border-[oklch(var(--border))]/40 shadow-sm px-2 py-1 text-[oklch(var(--foreground))]/60 pointer-events-auto mr-50"
								style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
								onMouseDown={(e) => {
									// 确保按钮容器的事件不被拖拽拦截
									e.stopPropagation();
								}}
							>
								<button
									type="button"
									className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-[oklch(var(--muted))]/40 hover:text-[oklch(var(--foreground))] transition-colors cursor-pointer relative z-10"
									title="退出全屏"
									onMouseDown={(e) => {
										// 阻止事件冒泡，确保按钮点击有效
										e.stopPropagation();
									}}
									onClick={async (e) => {
										e.preventDefault();
										e.stopPropagation();
										try {
											const w = window as typeof window & {
												electronAPI?: {
													expandWindow?: () => Promise<void> | void;
													setIgnoreMouseEvents?: (
														ignore: boolean,
														options?: { forward?: boolean },
													) => void;
												};
											};
											if (w.electronAPI?.expandWindow) {
												await w.electronAPI.expandWindow();
											}
											// 全屏切回 Panel 后，仍然保持可交互（不忽略鼠标）
											w.electronAPI?.setIgnoreMouseEvents?.(false);
											onModeChange?.(IslandMode.PANEL);
										} catch (error) {
											console.error("[DynamicIsland] 退出全屏失败:", error);
										}
									}}
								>
									<Minimize2 size={15} />
								</button>
								<button
									type="button"
									className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-[oklch(var(--muted))]/40 hover:text-[oklch(var(--foreground))] transition-colors cursor-pointer relative z-10"
									title="折叠到灵动岛"
									onMouseDown={(e) => {
										// 阻止事件冒泡，确保按钮点击有效
										e.stopPropagation();
									}}
									onClick={async (e) => {
										e.preventDefault();
										e.stopPropagation();
										try {
											const w = window as typeof window & {
												electronAPI?: {
													collapseWindow?: () => Promise<void> | void;
													setIgnoreMouseEvents?: (
														ignore: boolean,
														options?: { forward?: boolean },
													) => void;
												};
											};
											if (w.electronAPI?.collapseWindow) {
												await w.electronAPI.collapseWindow();
											}
											// 折叠回灵动岛时，重新开启点击穿透，避免挡住桌面
											w.electronAPI?.setIgnoreMouseEvents?.(true, {
												forward: true,
											});
											onModeChange?.(IslandMode.FLOAT);
											onClose?.();
										} catch (error) {
											console.error("[DynamicIsland] 关闭面板失败:", error);
											onModeChange?.(IslandMode.FLOAT);
											onClose?.();
										}
									}}
								>
									<ChevronsUpDown size={15} />
								</button>
							</div>
						</div>
					</motion.div>
				</AnimatePresence>
				{/* Fullscreen 模式的缩放把手 - 覆盖整个窗口，但排除顶部控制条区域 */}
				<div className="fixed inset-0 z-[100] pointer-events-none">
					{/* 顶部区域排除，避免拦截控制条 */}
					<div className="absolute top-0 left-0 right-0 h-20 pointer-events-none" />
					<div className="pointer-events-auto">
						<ResizeHandle position="top" onResize={handleResize} />
						<ResizeHandle position="bottom" onResize={handleResize} />
						<ResizeHandle position="left" onResize={handleResize} />
						<ResizeHandle position="right" onResize={handleResize} />
						<ResizeHandle position="top-left" onResize={handleResize} />
						<ResizeHandle position="top-right" onResize={handleResize} />
						<ResizeHandle position="bottom-left" onResize={handleResize} />
						<ResizeHandle position="bottom-right" onResize={handleResize} />
					</div>
				</div>
			</>
		);
	}

	if (mode === IslandMode.PANEL) {
		return (
			<div className="fixed inset-0 z-[30] pointer-events-none overflow-hidden">
				<motion.div
					layout
					initial={false}
					animate={layoutState}
					transition={{
						type: "spring",
						stiffness: 340,
						damping: 28,
						mass: 0.6,
						restDelta: 0.001,
					}}
					className="absolute pointer-events-auto origin-bottom-right bg-background shadow-2xl border-2 border-[oklch(var(--border))]/80 overflow-hidden"
					style={
						{
							borderRadius: "16px",
							clipPath: "inset(0 round 16px)",
						} as React.CSSProperties
					}
				>
					{/* Panel 模式的缩放把手 - 确保在标题栏之上 */}
					<div className="absolute inset-0 pointer-events-none z-50">
						<ResizeHandle position="top" onResize={handleResize} />
						<ResizeHandle position="bottom" onResize={handleResize} />
						<ResizeHandle position="left" onResize={handleResize} />
						<ResizeHandle position="right" onResize={handleResize} />
						<ResizeHandle position="top-left" onResize={handleResize} />
						<ResizeHandle position="top-right" onResize={handleResize} />
						<ResizeHandle position="bottom-left" onResize={handleResize} />
						<ResizeHandle position="bottom-right" onResize={handleResize} />
					</div>
					<div className="flex flex-col w-full h-full text-[oklch(var(--foreground))] relative z-0">
						<div
							className="h-8 px-4 flex items-center justify-between bg-background/95 relative"
							style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
						>
							{/* 排除顶部边缘区域（4px），让 top ResizeHandle 可以工作 */}
							<div
								className="absolute top-0 left-0 right-0 h-1 pointer-events-none"
								style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
							/>
							<div className="text-xs text-[oklch(var(--foreground))]/70 select-none">
								LifeTrace · AI 聊天
							</div>
							{/* 右上角：和全屏模式保持一致的"全屏 / 折叠"按钮 */}
							<div
								className="flex items-center gap-1.5 text-[oklch(var(--foreground))]/60"
								style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
							>
								<button
									type="button"
									className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-[oklch(var(--muted))]/40 hover:text-[oklch(var(--foreground))] transition-colors"
									title="展开为全屏"
									onClick={async (e) => {
										e.stopPropagation();
										try {
											const w = window as typeof window & {
												electronAPI?: {
													expandWindowFull?: () => Promise<void> | void;
												};
											};
											if (w.electronAPI?.expandWindowFull) {
												await w.electronAPI.expandWindowFull();
											}
											onModeChange?.(IslandMode.FULLSCREEN);
										} catch (error) {
											console.error("[DynamicIsland] 切换全屏失败:", error);
										}
									}}
								>
									<Maximize2 size={14} />
								</button>
								<button
									type="button"
									className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-[oklch(var(--muted))]/40 hover:text-[oklch(var(--foreground))] transition-colors"
									title="折叠到灵动岛"
									onClick={async (e) => {
										e.stopPropagation();
										try {
											const w = window as typeof window & {
												electronAPI?: {
													collapseWindow?: () => Promise<void> | void;
													setIgnoreMouseEvents?: (
														ignore: boolean,
														options?: { forward?: boolean },
													) => void;
												};
											};
											if (w.electronAPI?.collapseWindow) {
												await w.electronAPI.collapseWindow();
											}
											// 折叠回灵动岛时，重新开启点击穿透，避免挡住桌面
											w.electronAPI?.setIgnoreMouseEvents?.(true, {
												forward: true,
											});
										} finally {
											onModeChange?.(IslandMode.FLOAT);
											onClose?.();
										}
									}}
								>
									<ChevronsUpDown size={14} />
								</button>
							</div>
						</div>
						<div className="flex-1 min-h-0 overflow-y-auto">
							<PanelContent />
						</div>
					</div>
				</motion.div>
			</div>
		);
	}

	return (
		<div className="fixed inset-0 z-[99999] pointer-events-none overflow-hidden">
			<motion.div
				ref={islandRef}
				layout
				initial={false}
				animate={layoutState}
				onMouseEnter={() => {
					// 只在 FLOAT 模式下处理
					if (mode === IslandMode.FLOAT) {
						setIsHovered(true);
						setIgnoreMouse(false); // 取消点击穿透，允许交互
						console.log(
							"[DynamicIsland] Mouse entered (onMouseEnter), click-through disabled",
						);
					}
				}}
				onMouseLeave={() => {
					// 如果正在拖拽，不要恢复点击穿透，否则会中断拖拽
					if (isDragging) {
						return;
					}

					// 只在 FLOAT 模式下处理
					if (mode === IslandMode.FLOAT) {
						setIsHovered(false);
						setIgnoreMouse(true); // 恢复点击穿透
						console.log(
							"[DynamicIsland] Mouse left (onMouseLeave), click-through enabled",
						);
					}
				}}
				onMouseDown={handleMouseDown}
				onContextMenu={handleOpenContextMenu}
				transition={{
					type: "spring",
					stiffness: 350,
					damping: 30,
					mass: 0.8,
					restDelta: 0.001,
				}}
				className="absolute cursor-grab active:cursor-grabbing overflow-hidden pointer-events-auto"
				style={
					{
						boxShadow: isDark
							? "0px 20px 50px -10px rgba(0, 0, 0, 0.5), 0px 10px 20px -10px rgba(0,0,0,0.3)"
							: "0px 20px 50px -10px rgba(0, 0, 0, 0.15), 0px 10px 20px -10px rgba(0,0,0,0.1)",
						borderRadius: layoutState.borderRadius ? `${layoutState.borderRadius}px` : undefined,
						userSelect: "none",
						backgroundColor: isDark ? "#0a0a0a" : "oklch(var(--primary-foreground))",
					} as React.CSSProperties
				}
			>
					{/* 背景 */}
					<div
						className="absolute inset-0 backdrop-blur-[80px] transition-colors duration-700 ease-out"
						style={{
							backgroundColor: isDark
								? "rgba(8, 8, 8, 0.9)"
								: "oklch(var(--primary-foreground))",
						}}
					></div>
					<div
						className={`absolute inset-0 transition-opacity duration-1000 ${isFullscreen ? "opacity-100" : "opacity-0"}`}
					>
						{isDark ? (
							<>
								<div className="absolute top-[-50%] left-[-20%] w-[100%] h-[100%] rounded-full bg-indigo-500/10 blur-[120px] mix-blend-screen"></div>
								<div className="absolute bottom-[-20%] right-[-20%] w-[80%] h-[80%] rounded-full bg-purple-500/10 blur-[120px] mix-blend-screen"></div>
							</>
						) : null}
					</div>
					<div
						className="absolute inset-0 rounded-[inherit] pointer-events-none transition-opacity duration-500"
						style={{
							border: `1px solid ${isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.08)"}`,
							boxShadow: isDark
								? "inset 0 0 20px rgba(255,255,255,0.03)"
								: "inset 0 0 20px rgba(0,0,0,0.02)",
						}}
					></div>

				{/* 内容区域 */}
				{/* biome-ignore lint/a11y/noStaticElementInteractions: onContextMenu is not a true interaction, it's for custom context menu */}
				<div
					className={`absolute inset-0 w-full h-full font-sans antialiased overflow-hidden ${isDark ? "text-white" : "text-[oklch(var(--foreground))]"}`}
					// 右键打开自定义菜单，屏蔽浏览器/系统默认菜单（包括"退出应用"等文字）
					onContextMenu={handleOpenContextMenu}
				>
					{mode === IslandMode.FLOAT ? (
						<motion.div
							key="float"
							className="absolute inset-0 w-full h-full pointer-events-none"
							onMouseEnter={() => {
								// 只在 FLOAT 模式下处理
								if (mode === IslandMode.FLOAT) {
									setIsHovered(true);
									setIgnoreMouse(false);
								}
							}}
							onMouseLeave={() => {
								if (isDragging) {
									return;
								}
								// 只在 FLOAT 模式下处理
								if (mode === IslandMode.FLOAT) {
									setIsHovered(false);
									setIgnoreMouse(true);
								}
							}}
						>
							<div
								className="w-full h-full pointer-events-auto"
								role="group"
								onMouseDown={(e) => {
									// 如果点击的是按钮，阻止拖拽和事件冒泡
									const target = e.target as HTMLElement;
									if (
										target.closest(
											'button, a, input, select, textarea, [role="button"]',
										)
									) {
										e.stopPropagation();
										return;
									}
									// 如果不是按钮，让事件继续冒泡到外层的 handleMouseDown
									// 不要阻止默认行为，让拖拽可以正常工作
								}}
							>
								<FloatContent
									onToggleRecording={handleToggleRecording}
									onStopRecording={handleStopRecording}
									onScreenshot={handleToggleScreenshot}
									screenshotEnabled={recorderEnabled}
									isCollapsed={!isHovered}
									isRecording={isRecording}
									isPaused={isPaused}
									onOpenPanel={async () => {
										// 完全按照"4键"的逻辑：切换到Panel模式（使用默认位置，简单可靠）
										const api = getElectronAPI();
										if (api.electronAPI?.expandWindow) {
											// 直接使用默认位置，不计算相对位置，避免位置错误
											await api.electronAPI.expandWindow();
										}
										onModeChange?.(IslandMode.PANEL);
									}}
								/>
							</div>
						</motion.div>
					) : (
						// 全屏模式下，显示完整内容（VoiceModulePanel 会在 page.tsx 中渲染）
						<div className="w-full h-full">{/* 内容由 page.tsx 渲染 */}</div>
					)}
				</div>
			</motion.div>

			<ContextMenu
				open={contextMenuOpen}
				position={contextMenuPosition}
				onClose={handleCloseContextMenu}
				onQuit={() => {
					const api = getElectronAPI();
					api.electronAPI?.quit?.();
				}}
			/>
		</div>
	);
}
