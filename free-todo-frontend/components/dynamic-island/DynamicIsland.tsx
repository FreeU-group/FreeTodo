"use client";

import { motion } from "framer-motion";
import { useTheme } from "next-themes";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useConfig, useSaveConfig } from "@/lib/query";
import { ContextMenu } from "./ContextMenu";
import { getElectronAPI } from "./electron-api";
import { FloatContent } from "./FloatContent";
import { FullscreenControlBar } from "./FullscreenControlBar";
import { useDynamicIslandClickThrough } from "./hooks/useDynamicIslandClickThrough";
import { useDynamicIslandDrag } from "./hooks/useDynamicIslandDrag";
import { useDynamicIslandHover } from "./hooks/useDynamicIslandHover";
import { useDynamicIslandLayout } from "./hooks/useDynamicIslandLayout";
import { PanelContent } from "./PanelContent";
import { PanelFeatureProvider } from "./PanelFeatureContext";
import { PanelTitleBar } from "./PanelTitleBar";
import { ResizeHandle } from "./ResizeHandle";
import { IslandMode } from "./types";

interface DynamicIslandProps {
	mode: IslandMode;
	onModeChange?: (mode: IslandMode) => void;
	onClose?: () => void;
}

export function DynamicIsland({
	mode,
	onModeChange,
	onClose,
}: DynamicIslandProps) {
	// 录音状态（已移除音频模块，保留UI状态）
	const [isRecording] = useState(false);
	const [isPaused] = useState(false);

	// 拖拽状态（完全手动实现，支持任意位置放置，吸附到最近的边缘）
	const [position, setPosition] = useState<{ x: number; y: number } | null>(
		null,
	);
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

	// 处理录音控制（已移除音频模块）
	const handleToggleRecording = useCallback(() => {
		console.log("[DynamicIsland] 麦克风按钮点击（功能已禁用）");
	}, []);

	// 处理停止录音（已移除音频模块）
	const handleStopRecording = useCallback(() => {
		console.log("[DynamicIsland] 停止录音按钮点击（功能已禁用）");
	}, []);

	// 使用 hooks 管理各种逻辑
	const setIgnoreMouse = useDynamicIslandClickThrough(mode);
	const { isHovered, setIsHovered } = useDynamicIslandHover({
		mode,
		islandRef,
		isDragging: false, // 将在拖拽 hook 中设置
		setIgnoreMouse,
	});
	const { calculateSnapPosition, getLayoutState } = useDynamicIslandLayout({
		mode,
		position,
		isHovered,
	});
	const { isDragging, handleMouseDown } = useDynamicIslandDrag({
		mode,
		islandRef,
		setIgnoreMouse,
		calculateSnapPosition,
		setPosition,
		setIsHovered,
	});

	// 监听模式变化，确保在切换到FLOAT模式后恢复opacity
	useEffect(() => {
		if (mode === IslandMode.FLOAT) {
			// 恢复opacity，移除Electron主进程设置的opacity: 0
			// 使用!important覆盖Electron设置的样式
			const style = document.createElement("style");
			style.id = "restore-opacity-float-mode";
			style.textContent = `
				html {
					opacity: 1 !important;
				}
				body {
					opacity: 1 !important;
				}
				#__next {
					opacity: 1 !important;
				}
				#__next > div {
					opacity: 1 !important;
				}
			`;
			// 移除旧的样式（如果存在）
			const oldStyle = document.getElementById("restore-opacity-float-mode");
			if (oldStyle) {
				oldStyle.remove();
			}
			document.head.appendChild(style);
		}
	}, [mode]);

	useEffect(() => {
		const handleKeyDown = async (e: KeyboardEvent) => {
			if (e.key === "1") {
				const api = getElectronAPI();
				// 先切换前端状态，再执行窗口动画
				onModeChange?.(IslandMode.FLOAT);
				await new Promise((resolve) => setTimeout(resolve, 50));
				await api.electronAPI?.collapseWindow?.();
					// 延迟设置点击穿透和恢复透明度，确保窗口动画完全完成
					// 窗口动画时长是 800ms，加上透明度过渡 350ms，加上等待时间 400ms，总共约 1550ms
					// 我们等待 1600ms 确保所有动画完成，避免瞬闪
					setTimeout(() => {
						api.electronAPI?.setIgnoreMouseEvents?.(true, { forward: true });
						// 恢复透明度
						const style = document.createElement("style");
						style.id = "restore-opacity-keyboard";
						style.textContent = `
							html, body, #__next, #__next > div {
								opacity: 1 !important;
								pointer-events: auto !important;
							}
						`;
						const oldStyle = document.getElementById("restore-opacity-keyboard");
						if (oldStyle) oldStyle.remove();
						document.head.appendChild(style);
					}, 1600);
			} else if (e.key === "4") {
				const api = getElectronAPI();
				// 等待窗口动画完成后再切换状态
				await api.electronAPI?.expandWindow?.();
				onModeChange?.(IslandMode.PANEL);
			} else if (e.key === "5") {
				const api = getElectronAPI();
				// 等待窗口动画完成后再切换状态
				await api.electronAPI?.expandWindowFull?.();
				onModeChange?.(IslandMode.FULLSCREEN);
			} else if (e.key === "Escape") {
				if (mode === IslandMode.FULLSCREEN || mode === IslandMode.PANEL) {
					const api = getElectronAPI();
					// 先切换前端状态，再执行窗口动画
					onModeChange?.(IslandMode.FLOAT);
					onClose?.();
					await new Promise((resolve) => setTimeout(resolve, 50));
					await api.electronAPI?.collapseWindow?.();
					// 延迟设置点击穿透和恢复透明度，确保窗口动画完全完成
					// 窗口动画时长是 800ms，加上透明度过渡 350ms，加上等待时间 400ms，总共约 1550ms
					// 我们等待 1600ms 确保所有动画完成，避免瞬闪
					setTimeout(() => {
						api.electronAPI?.setIgnoreMouseEvents?.(true, { forward: true });
						const style = document.createElement("style");
						style.id = "restore-opacity-escape";
						style.textContent = `
							html, body, #__next, #__next > div {
								opacity: 1 !important;
								pointer-events: auto !important;
							}
						`;
						const oldStyle = document.getElementById("restore-opacity-escape");
						if (oldStyle) oldStyle.remove();
						document.head.appendChild(style);
					}, 1600);
				}
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [mode, onClose, onModeChange]);


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
				api.electronAPI.resizeWindow(deltaX, deltaY, position);
			}
		},
		[],
	);

	const layoutState = getLayoutState();
	const isFullscreen = mode === IslandMode.FULLSCREEN;

	if (mode === IslandMode.FULLSCREEN) {
		return (
			<FullscreenControlBar
				onModeChange={onModeChange}
				onClose={onClose}
			/>
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
						<PanelFeatureProvider>
							<PanelTitleBar
								onModeChange={onModeChange}
								onClose={onClose}
							/>
							<div className="flex-1 min-h-0 overflow-y-auto">
								<PanelContent />
							</div>
						</PanelFeatureProvider>
					</div>
				</motion.div>
			</div>
		);
	}

	return (
		<div
			className="fixed inset-0 pointer-events-none overflow-hidden"
			suppressHydrationWarning
			style={{
				zIndex: 999999, // 使用非常高的 z-index 确保始终置顶
			} as React.CSSProperties}
		>
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
											// 等待窗口动画完成后再切换状态
											await api.electronAPI.expandWindow();
										}
										// 窗口动画完成后，再切换前端状态
										onModeChange?.(IslandMode.PANEL);
									}}
								/>
							</div>
						</motion.div>
					) : (
						// 全屏模式下，显示完整内容
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
