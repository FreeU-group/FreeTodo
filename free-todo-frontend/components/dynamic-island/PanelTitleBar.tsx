"use client";

import { ChevronsUpDown, Maximize2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useContext } from "react";
import type { PanelFeature } from "@/lib/config/panel-config";
import { FEATURE_ICON_MAP } from "@/lib/config/panel-config";
import { PanelFeatureContext } from "./PanelFeatureContext";
import { IslandMode } from "./types";

interface PanelTitleBarProps {
	onModeChange?: (mode: IslandMode) => void;
	onClose?: () => void;
}

// Panel模式标题栏组件 - 显示当前功能名称
export function PanelTitleBar({
	onModeChange,
	onClose,
}: PanelTitleBarProps) {
	const t = useTranslations("bottomDock");
	const context = useContext(PanelFeatureContext);
	const currentFeature = context?.currentFeature ?? "chat";

	const featureLabelMap: Partial<Record<PanelFeature, string>> = {
		calendar: "calendar",
		activity: "activity",
		todos: "todos",
		chat: "chat",
		todoDetail: "todoDetail",
		diary: "diary",
		settings: "settings",
		costTracking: "costTracking",
		achievements: "achievements",
	};

	const labelKey = featureLabelMap[currentFeature] ?? "chat";
	const Icon = FEATURE_ICON_MAP[currentFeature];

	return (
		<div
			className="h-8 px-4 flex items-center justify-between bg-background/95 relative"
			style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
		>
			{/* 排除顶部边缘区域（4px），让 top ResizeHandle 可以工作 */}
			<div
				className="absolute top-0 left-0 right-0 h-1 pointer-events-none"
				style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
			/>
			<div className="flex items-center gap-2 text-xs text-[oklch(var(--foreground))]/70 select-none">
				{Icon && <Icon className="h-3.5 w-3.5" />}
				<span>LifeTrace · {t(labelKey)}</span>
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
							// 关键修复：在窗口动画开始前，先切换前端状态到 FLOAT 模式
							// 这样窗口变大时，显示的是 FLOAT 模式的小岛，而不是 PANEL 内容被放大
							onModeChange?.(IslandMode.FLOAT);
							onClose?.();

							// 等待一小段时间，确保前端状态切换完成，React 已经重新渲染为 FLOAT 模式
							await new Promise((resolve) => setTimeout(resolve, 50));

							if (w.electronAPI?.collapseWindow) {
								// 现在窗口动画时，前端已经是 FLOAT 模式，显示的是小岛
								await w.electronAPI.collapseWindow();
							}

							// 延迟恢复opacity和点击穿透，确保窗口动画完全完成
							// 窗口动画时长是 800ms，加上透明度过渡 350ms，加上等待时间 400ms，总共约 1550ms
							// 我们等待 1600ms 确保所有动画完成，避免瞬闪
							setTimeout(() => {
								// 关键：恢复opacity，移除Electron主进程设置的opacity: 0
								// 使用!important覆盖Electron设置的样式
								const style = document.createElement("style");
								style.id = "restore-opacity-after-collapse";
								style.textContent = `
									html {
										opacity: 1 !important;
										pointer-events: auto !important;
									}
									body {
										opacity: 1 !important;
										pointer-events: auto !important;
									}
									#__next {
										opacity: 1 !important;
										pointer-events: auto !important;
									}
									#__next > div {
										opacity: 1 !important;
										pointer-events: auto !important;
									}
								`;
								// 移除旧的样式（如果存在）
								const oldStyle = document.getElementById("restore-opacity-after-collapse");
								if (oldStyle) {
									oldStyle.remove();
								}
								document.head.appendChild(style);

								w.electronAPI?.setIgnoreMouseEvents?.(true, {
									forward: true,
								});
							}, 1600);
						} catch (error) {
							console.error("[DynamicIsland] 折叠失败:", error);
							// 即使失败也切换状态，避免卡住
							onModeChange?.(IslandMode.FLOAT);
							onClose?.();
						}
					}}
				>
					<ChevronsUpDown size={14} />
				</button>
			</div>
		</div>
	);
}
