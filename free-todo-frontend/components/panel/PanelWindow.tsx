/**
 * Panel 窗口组件
 * 用于 Electron Panel 模式的窗口渲染
 */

"use client";

import { IslandMode } from "@/components/dynamic-island/types";
import { AppHeader } from "@/components/layout/AppHeader";
import { PanelRegion } from "@/components/layout/PanelRegion";

interface PanelWindowProps {
	panelWindowWidth: number;
	panelWindowHeight: number;
	panelWindowPosition: { x: number; y: number };
	panelWindowRight: number;
	isDraggingPanel: boolean;
	isDraggingPanelA: boolean;
	isDraggingPanelC: boolean;
	isResizingPanel: boolean;
	onModeChange: (mode: IslandMode) => void;
	onHidePanel: () => void;
	onPanelDragStart: (e: React.MouseEvent) => void;
	onPanelResizeStart: (e: React.PointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>, side: 'left' | 'right' | 'top' | 'bottom') => void;
	onPanelAResizePointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
	onPanelCResizePointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
	containerRef: React.RefObject<HTMLDivElement | null>;
}

export function PanelWindow({
	panelWindowWidth,
	panelWindowHeight,
	panelWindowPosition,
	panelWindowRight,
	isDraggingPanel,
	isDraggingPanelA,
	isDraggingPanelC,
	isResizingPanel,
	onModeChange,
	onHidePanel,
	onPanelDragStart,
	onPanelResizeStart,
	onPanelAResizePointerDown,
	onPanelCResizePointerDown,
	containerRef,
}: PanelWindowProps) {
	return (
		<>
			{/* 左侧透明穿透区域 */}
			<div
				className="fixed inset-y-0 left-0"
				style={{
					width: `calc(100vw - ${panelWindowWidth}px - 32px)`,
					pointerEvents: "none",
					background: "transparent",
					zIndex: 1,
				}}
			/>
			{/* 右侧 Panel 窗口：圆角、降低高度、可拖动调整宽度 */}
			<div
				data-panel-window
				className="fixed bg-primary-foreground dark:bg-accent shadow-2xl border border-[oklch(var(--border))]/80 overflow-hidden flex flex-col"
				style={{
					width: `${panelWindowWidth}px`,
					right: `${panelWindowRight}px`,
					top: panelWindowPosition.y === 0 ? 40 : `${40 + panelWindowPosition.y}px`,
					// ✅ 使用 panelWindowHeight，如果为 0 则使用默认高度
					// ✅ 修复：panelWindowHeight 是 PanelRegion 的高度（包括 Panels 容器 + BottomDock 60px + Dock 上方间距 6px）
					// PanelWindow 结构：标题栏(48px) + PanelRegion(panelWindowHeight)
					// PanelRegion 结构：Panels容器(flex-1) + Dock 上方间距(6px) + BottomDock(60px)
					// 窗口总高度 = 标题栏(48px) + PanelRegion(panelWindowHeight)
					// 默认情况下，PanelRegion 高度 = 100vh - 顶部偏移(40px) - 标题栏(48px) - Dock 上方间距(6px) = 100vh - 94px
					// 窗口总高度 = 48px + (100vh - 94px) = 100vh - 46px
					height: panelWindowHeight > 0
						? `${panelWindowHeight + 48}px`
						: `calc(100vh - 48px)`, // 默认窗口总高度（标题栏48px + PanelRegion，降低高度）
					pointerEvents: "auto",
					borderRadius: "16px",
					zIndex: 999999, // ✅ 修复：降低 z-index，确保 BottomDock (z-50) 可以显示在上面
					cursor: isDraggingPanel ? "grabbing" : "default",
					WebkitAppRegion: "no-drag",
					display: "flex",
					flexDirection: "column",
					willChange: "transform",
					position: "fixed",
					// ✅ 在 style prop 中也设置，作为备用
					opacity: 1,
					// ✅ Panel 模式外壳背景与内部 PanelRegion 一致，避免顶部出现白色条
					backgroundColor: "oklch(var(--primary-foreground))",
					background: "oklch(var(--primary-foreground))",
					visibility: "visible",
				} as React.CSSProperties}
				ref={(el) => {
					// ✅ 关键修复：使用 ref 回调直接设置 DOM 样式，避免 React style prop 覆盖
					// 每次 ref 更新时都重新设置，确保样式不被覆盖
					if (el) {
						// 使用 requestAnimationFrame 确保在 React 应用 style 之后执行
						requestAnimationFrame(() => {
							requestAnimationFrame(() => {
								if (el) {
									el.style.setProperty('opacity', '1', 'important');
									// ✅ 强制使用 primary-foreground 作为整体背景色
									el.style.setProperty('background-color', 'oklch(var(--primary-foreground))', 'important');
									el.style.setProperty('background', 'oklch(var(--primary-foreground))', 'important');
									el.style.setProperty('visibility', 'visible', 'important');
									el.style.setProperty('display', 'flex', 'important');
									el.style.setProperty('z-index', '1000001', 'important');
									el.style.setProperty('position', 'fixed', 'important');
								}
							});
						});
					}
				}}
			>
				{/* 顶部高度调整区域 - 参考左右调整区域，使用 w-1 (4px) */}
				<div
					role="button"
					tabIndex={-1}
					// 略微减小高度，让顶部调整条更细一点
					className="resize-handle absolute top-0 left-0 right-0 h-px cursor-ns-resize bg-primary-foreground dark:bg-accent hover:bg-[oklch(var(--primary))]/20 transition-colors z-50"
					onPointerDown={(e: React.PointerEvent<HTMLDivElement>) => {
						e.stopPropagation();
						onPanelResizeStart(e, 'top');
					}}
					onMouseDown={(e: React.MouseEvent<HTMLDivElement>) => {
						e.stopPropagation();
						onPanelResizeStart(e, 'top');
					}}
					style={{ pointerEvents: "auto" }}
				/>
				{/* 标题栏区域（可拖动，但顶部2px区域用于高度调整） */}
				<div
					role="button"
					tabIndex={0}
					className="panel-drag-handle relative cursor-grab active:cursor-grabbing"
					style={{ pointerEvents: "auto", marginTop: "2px" }}
					onMouseDown={(e) => {
						const target = e.target as HTMLElement;
						if (target.closest("button") || target.closest(".flex.items-center.gap-1")) {
							return;
						}
						// 检查是否在顶部2px区域内
						const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
						const relativeY = e.clientY - rect.top;
						if (relativeY <= 2) {
							// 在顶部2px区域内，不触发拖动（应该触发高度调整）
							return;
						}
						onPanelDragStart(e);
					}}
				>
					<AppHeader
						mode={IslandMode.PANEL}
						onModeChange={onModeChange}
						onClose={onHidePanel}
						isPanelMode={true}
					/>
				</div>
				{/* 左侧拖动调整宽度的手柄 */}
				<div
					role="button"
					tabIndex={-1}
					// 略微减小宽度，让左右调整条更细一点
					className="resize-handle absolute left-0 top-12 bottom-0 w-px cursor-ew-resize hover:bg-[oklch(var(--primary))]/20 transition-colors z-50"
					onPointerDown={(e: React.PointerEvent<HTMLDivElement>) => {
						e.stopPropagation();
						onPanelResizeStart(e, 'left');
					}}
					onMouseDown={(e: React.MouseEvent<HTMLDivElement>) => {
						e.stopPropagation();
						onPanelResizeStart(e, 'left');
					}}
					style={{ pointerEvents: "auto" }}
				/>
				{/* 右侧拖动调整宽度的手柄 */}
				<div
					role="button"
					tabIndex={-1}
					// 略微减小宽度，让左右调整条更细一点
					className="resize-handle absolute right-0 top-12 bottom-0 w-px cursor-ew-resize hover:bg-[oklch(var(--primary))]/20 transition-colors z-50"
					onPointerDown={(e: React.PointerEvent<HTMLDivElement>) => {
						e.stopPropagation();
						onPanelResizeStart(e, 'right');
					}}
					onMouseDown={(e: React.MouseEvent<HTMLDivElement>) => {
						e.stopPropagation();
						onPanelResizeStart(e, 'right');
					}}
					style={{ pointerEvents: "auto" }}
				/>
				{/* 底部高度调整区域 - 参考顶部调整区域，使用 h-1 (4px) */}
				<div
					role="button"
					tabIndex={-1}
					// 略微减小高度，让底部调整条更细一点
					className="resize-handle absolute bottom-0 left-0 right-0 h-px cursor-ns-resize hover:bg-[oklch(var(--primary))]/20 transition-colors z-50"
					onPointerDown={(e: React.PointerEvent<HTMLDivElement>) => {
						e.stopPropagation();
						onPanelResizeStart(e, 'bottom');
					}}
					onMouseDown={(e: React.MouseEvent<HTMLDivElement>) => {
						e.stopPropagation();
						onPanelResizeStart(e, 'bottom');
					}}
					style={{ pointerEvents: "auto" }}
				/>
				{/* PanelRegion：可复用组件，包含 Panels 和 BottomDock */}
				<PanelRegion
					width={panelWindowWidth}
					height={panelWindowHeight} // ✅ 传递 PanelRegion 总高度，用于计算 Panels 容器固定高度
					isInPanelMode={true}
					isDraggingPanelA={isDraggingPanelA}
					isDraggingPanelC={isDraggingPanelC}
					isResizingPanel={isResizingPanel}
					onPanelAResizePointerDown={onPanelAResizePointerDown}
					onPanelCResizePointerDown={onPanelCResizePointerDown}
					containerRef={containerRef}
				/>
			</div>
		</>
	);
}
