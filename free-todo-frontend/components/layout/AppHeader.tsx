/**
 * 可复用的应用 Header 组件
 * 左侧：Logo + 应用名称
 * 中间：通知区域（可选，仅在 Fullscreen 模式下显示）
 * 右侧：工具按钮（LayoutSelector, ThemeToggle, LanguageToggle, SettingsToggle）+ 根据模式显示不同的控制按钮
 */

"use client";

import { Minimize2, Square, X } from "lucide-react";
import Image from "next/image";
import { LayoutSelector } from "@/components/common/layout/LayoutSelector";
import { ThemeToggle } from "@/components/common/theme/ThemeToggle";
import { LanguageToggle } from "@/components/common/ui/LanguageToggle";
import { SettingsToggle } from "@/components/common/ui/SettingsToggle";
import { IslandMode } from "@/components/dynamic-island/types";
import { HeaderIsland } from "@/components/notification/HeaderIsland";

interface AppHeaderProps {
	/** 当前模式 */
	mode: IslandMode;
	/** 模式切换回调 */
	onModeChange?: (mode: IslandMode) => void;
	/** 关闭回调 */
	onClose?: () => void;
	/** 是否在 Panel 模式下 */
	isPanelMode?: boolean;
	/** 当前通知（可选，仅在 Fullscreen 模式下显示） */
	currentNotification?: { id: string; title: string; content: string; timestamp: string; source?: string } | null;
	/** 是否是 Electron 环境 */
	isElectron?: boolean;
}

export function AppHeader({
	mode,
	onModeChange,
	onClose,
	isPanelMode = false,
	currentNotification = null,
	isElectron = false,
}: AppHeaderProps) {
	// Panel 模式：最大化按钮 + 关闭 Panel 按钮
	// 全屏模式：切换回 Panel 按钮 + 关闭全屏按钮
	const isFullscreenMode = mode === IslandMode.FULLSCREEN;
	const showNotification = isFullscreenMode && currentNotification && isElectron;

	return (
		<header className="relative flex h-15 shrink-0 items-center bg-primary-foreground dark:bg-accent px-4 text-foreground overflow-visible">
			{/* 左侧：Logo + 应用名称（复用 FullscreenHeader 的样式） */}
			<div className="flex items-center gap-2 shrink-0">
				<div className="relative h-8 w-8 shrink-0">
					{/* 浅色模式图标 */}
					<Image
						src="/free-todo-logos/free_todo_icon_4_dark_with_grid.png"
						alt="Free Todo Logo"
						width={32}
						height={32}
						className="object-contain block dark:hidden"
					/>
					{/* 深色模式图标 */}
					<Image
						src="/free-todo-logos/free_todo_icon_4_with_grid.png"
						alt="Free Todo Logo"
						width={32}
						height={32}
						className="object-contain hidden dark:block"
					/>
				</div>
				<h1 className="text-lg font-semibold tracking-tight text-foreground">
					Free Todo: Your AI Secretary
				</h1>
			</div>

			{/* 中间：通知区域（灵动岛） - 只在全屏模式且有通知时且是 Electron 环境时显示 */}
			{showNotification ? (
				<div className="flex-1 flex items-center justify-center relative min-w-0 overflow-visible">
					<HeaderIsland />
				</div>
			) : (
				/* 占位符：当没有通知时保持布局平衡 */
				<div className="flex-1" />
			)}

			{/* 右侧：工具按钮 + 根据模式显示不同的控制按钮 */}
			<div className="flex items-center gap-2 shrink-0">
				{/* 工具按钮：LayoutSelector, ThemeToggle, LanguageToggle, SettingsToggle */}
				<LayoutSelector showChevron={false} />
				<ThemeToggle />
				<LanguageToggle />
				<SettingsToggle />

				{/* 根据模式显示不同的控制按钮 */}
				{isPanelMode ? (
					<>
						{/* Panel 模式：最大化按钮 */}
						<button
							type="button"
							className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-[oklch(var(--muted))]/40 hover:text-[oklch(var(--foreground))] transition-colors"
							title="最大化"
							onMouseDown={(e) => e.stopPropagation()}
							onClick={async (e) => {
								e.stopPropagation();
								e.preventDefault();
								// 先调用 Electron API 最大化窗口
								const w = window as typeof window & {
									electronAPI?: {
										expandWindowFull?: () => Promise<void> | void;
									};
								};
								if (w.electronAPI?.expandWindowFull) {
									await w.electronAPI.expandWindowFull();
								}
								// 然后切换前端状态
								onModeChange?.(IslandMode.FULLSCREEN);
							}}
							style={{ pointerEvents: "auto" }}
						>
							{/* 使用方形图标以匹配系统窗口的“最大化”视觉 */}
							<Square size={14} />
						</button>
						{/* Panel 模式：关闭 Panel 按钮 */}
						<button
							type="button"
							className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-[oklch(var(--muted))]/40 hover:text-[oklch(var(--foreground))] transition-colors"
							title="关闭 Panel"
							onMouseDown={(e) => e.stopPropagation()}
							onClick={(e) => {
								e.stopPropagation();
								e.preventDefault();
								onClose?.();
							}}
							style={{ pointerEvents: "auto" }}
						>
							<X size={14} />
						</button>
					</>
				) : isFullscreenMode ? (
					<>
						{/* 全屏模式：切换回 Panel 按钮 */}
						<button
							type="button"
							className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-[oklch(var(--muted))]/40 hover:text-[oklch(var(--foreground))] transition-colors"
							title="Exit fullscreen"
							onMouseDown={(e) => e.stopPropagation()}
							onClick={async (e) => {
								e.stopPropagation();
								console.log("[AppHeader] Exit fullscreen button clicked");
								// ✅ 关键改动：从 FULLSCREEN 退到 PANEL 时不再缩小 Electron 窗口，只切换前端模式
								// 这样灵动岛和左下角 N 徽章的屏幕绝对位置保持不变
								onModeChange?.(IslandMode.PANEL);
							}}
						>
							<Minimize2 size={15} />
						</button>
						{/* 全屏模式：关闭全屏按钮（折叠回灵动岛） */}
						<button
							type="button"
							className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-[oklch(var(--muted))]/40 hover:text-[oklch(var(--foreground))] transition-colors"
							title="Collapse to Dynamic Island"
							onMouseDown={(e) => e.stopPropagation()}
							onClick={async (e) => {
								e.stopPropagation();
								console.log("[AppHeader] Collapse button clicked");
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
									onModeChange?.(IslandMode.FLOAT);
									onClose?.();

									await new Promise((resolve) => setTimeout(resolve, 50));

									if (w.electronAPI?.collapseWindow) {
										await w.electronAPI.collapseWindow();
									}

									setTimeout(() => {
										w.electronAPI?.setIgnoreMouseEvents?.(true, {
											forward: true,
										});
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
									console.error("[AppHeader] 折叠失败:", error);
									onModeChange?.(IslandMode.FLOAT);
									onClose?.();
								}
							}}
						>
							{/* 使用 X 图标，表示关闭当前最大化模式并回到灵动岛（FLOAT） */}
							<X size={15} />
						</button>
					</>
				) : null}
			</div>
		</header>
	);
}
