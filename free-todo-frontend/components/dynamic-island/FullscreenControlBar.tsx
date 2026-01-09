"use client";

import { ChevronsUpDown, Minimize2 } from "lucide-react";
import type React from "react";
import { IslandMode } from "./types";

interface FullscreenControlBarProps {
	onModeChange?: (mode: IslandMode) => void;
	onClose?: () => void;
}

export function FullscreenControlBar({
	onModeChange,
	onClose,
}: FullscreenControlBarProps) {
	return (
		<div
			className="fixed inset-x-0 top-0 z-[100010] pointer-events-none"
			style={{
				pointerEvents: "none",
				zIndex: 100010,
			} as React.CSSProperties}
		>
			<div
				className="flex items-center justify-end px-4 h-15"
				style={{
					WebkitAppRegion: "no-drag", // FULLSCREEN模式固定窗口，不允许拖动
					pointerEvents: "auto",
					zIndex: 100011,
					position: "relative",
				} as React.CSSProperties}
			>
				<div
					role="toolbar"
					className="flex items-center gap-1.5 rounded-xl bg-background/80 dark:bg-background/80 backdrop-blur-xl border border-[oklch(var(--border))]/40 shadow-sm px-2 py-1 text-[oklch(var(--foreground))]/60 pointer-events-auto mr-50"
					style={{
						WebkitAppRegion: "no-drag",
						zIndex: 100012,
						position: "relative",
					} as React.CSSProperties}
				>
					<button
						type="button"
						className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-[oklch(var(--muted))]/40 hover:text-[oklch(var(--foreground))] transition-colors cursor-pointer relative z-[100013]"
						title="Exit fullscreen"
						onMouseDown={(e) => {
							// Stop propagation to prevent drag events
							e.stopPropagation();
						}}
						onClick={async (e) => {
							e.stopPropagation();
							console.log("[FullscreenControlBar] Exit fullscreen button clicked");
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
									// 等待窗口动画完成后再切换状态
									await w.electronAPI.expandWindow();
								}
								w.electronAPI?.setIgnoreMouseEvents?.(false);
								// 窗口动画完成后，再切换前端状态
								onModeChange?.(IslandMode.PANEL);
							} catch (error) {
								console.error("[DynamicIsland] Failed to exit fullscreen:", error);
							}
						}}
					>
						<Minimize2 size={15} />
					</button>
					<button
						type="button"
						className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-[oklch(var(--muted))]/40 hover:text-[oklch(var(--foreground))] transition-colors cursor-pointer relative z-[100013]"
						title="Collapse to Dynamic Island"
						onMouseDown={(e) => {
							// Stop propagation to prevent drag events
							e.stopPropagation();
						}}
						onClick={async (e) => {
							e.stopPropagation();
							console.log("[FullscreenControlBar] Collapse button clicked");
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
								// 关键修复：在窗口动画开始前，先切换前端状态到 FLOAT 模式
								onModeChange?.(IslandMode.FLOAT);
								onClose?.();

								// 等待一小段时间，确保前端状态切换完成
								await new Promise((resolve) => setTimeout(resolve, 50));

								if (w.electronAPI?.collapseWindow) {
									// 现在窗口动画时，前端已经是 FLOAT 模式
									await w.electronAPI.collapseWindow();
								}

								// 延迟设置点击穿透和恢复透明度，确保窗口动画完全完成
								// 窗口动画时长是 800ms，加上透明度过渡 350ms，加上等待时间 400ms，总共约 1550ms
								// 我们等待 1600ms 确保所有动画完成，避免瞬闪
								setTimeout(() => {
									w.electronAPI?.setIgnoreMouseEvents?.(true, {
										forward: true,
									});
									// 恢复透明度
									const style = document.createElement("style");
									style.id = "restore-opacity-fullscreen-collapse";
									style.textContent = `
										html, body, #__next, #__next > div {
											opacity: 1 !important;
											pointer-events: auto !important;
										}
									`;
									const oldStyle = document.getElementById("restore-opacity-fullscreen-collapse");
									if (oldStyle) oldStyle.remove();
									document.head.appendChild(style);
								}, 1600);
							} catch (error) {
								console.error("[FullscreenControlBar] 折叠失败:", error);
								// 即使失败也切换状态，避免卡住
								onModeChange?.(IslandMode.FLOAT);
								onClose?.();
							}
						}}
					>
						<ChevronsUpDown size={15} />
					</button>
				</div>
			</div>
		</div>
	);
}
