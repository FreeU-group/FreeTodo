"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useWindowAdaptivePanels } from "@/lib/hooks/useWindowAdaptivePanels";
import { useUiStore } from "@/lib/store/ui-store";
import { cn } from "@/lib/utils";
import { BottomDock } from "./BottomDock";
import { PanelContainer } from "./PanelContainer";
import { PanelContent } from "./PanelContent";
import { ResizeHandle } from "./ResizeHandle";

// ========== 布局常量 ==========
/** BottomDock 容器的高度 (px) */
const BOTTOM_DOCK_HEIGHT = 60;
/** Dock 和面板内容区之间的间距 (px) */
const DOCK_MARGIN_TOP = 0;

interface PanelRegionProps {
	/** Panel 区域的宽度（用于计算显示多少个 Panel） */
	width: number;
	/** PanelRegion 的总高度（包括 Panels 容器 + BottomDock），用于计算 Panels 容器固定高度 */
	height?: number;
	/** 是否在 MAXIMIZE 模式下（MAXIMIZE 模式下始终显示 3 个 panel，PANEL 模式下根据宽度显示） */
	isMaximizeMode?: boolean;
	/** 是否在 PANEL 模式下（用于 BottomDock 的显示逻辑） */
	isInPanelMode?: boolean;
	/** 是否正在拖拽 Panel A */
	isDraggingPanelA?: boolean;
	/** 是否正在拖拽 Panel C */
	isDraggingPanelC?: boolean;
	/** 是否正在调整 Panel 窗口大小 */
	isResizingPanel?: boolean;
	/** Panel A 调整宽度的回调 */
	onPanelAResizePointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
	/** Panel C 调整宽度的回调 */
	onPanelCResizePointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
	/** 容器引用（用于拖动计算） */
	containerRef?: React.RefObject<HTMLDivElement | null>;
}

/**
 * PanelRegion 组件：可复用的 Panel 区域
 * 包含 Panels 容器和 BottomDock
 * 用于 Panel 窗口和完整页面
 */
export function PanelRegion({
	width,
	height, // PanelRegion 总高度（包括 Panels 容器 + BottomDock）
	// isMaximizeMode 目前仅用于 props 兼容，逻辑上宽度规则一致，故不再解构使用
	isInPanelMode = true,
	isDraggingPanelA = false,
	isDraggingPanelC = false,
	isResizingPanel = false,
	onPanelAResizePointerDown,
	onPanelCResizePointerDown,
	containerRef: externalContainerRef,
}: PanelRegionProps) {
	const internalContainerRef = useRef<HTMLDivElement>(null);
	const containerRef = externalContainerRef || internalContainerRef;
	// BottomDock 容器 ref（用于鼠标位置检测）
	const bottomDockContainerRef = useRef<HTMLDivElement>(null);

	// 确保客户端 hydration 完成后再渲染，避免 SSR 和客户端不一致
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	// 获取 panel 的打开状态和当前宽度配置
	const { isPanelAOpen, isPanelBOpen, isPanelCOpen, panelAWidth, panelCWidth } =
		useUiStore();

	// 使用 useWindowAdaptivePanels 进行自适应管理
	useWindowAdaptivePanels(containerRef);

	// 根据宽度决定显示哪些 Panel 槽位（只受宽度影响）
	// 无论 MAXIMIZE 还是 PANEL 模式，都按统一阈值：
	// - width < 800：只显示 A
	// - 800 <= width < 1200：显示 A / B
	// - width >= 1200：显示 A / B / C
	const PANEL_DUAL_THRESHOLD = 800;
	const PANEL_TRIPLE_THRESHOLD = 1200;
	// 在 SSR 时使用默认值，避免 hydration 不匹配
	const shouldShowPanelB = mounted ? width >= PANEL_DUAL_THRESHOLD : false;
	const shouldShowPanelC = mounted ? width >= PANEL_TRIPLE_THRESHOLD : false;

	// 面板可见性：由 store 控制（在 MAXIMIZE 入口处会确保三者默认打开）
	// 在 SSR 时使用默认值，避免 hydration 不匹配
	const panelAVisible = mounted ? isPanelAOpen : true;
	const panelBVisible = mounted ? isPanelBOpen : false;
	const panelCVisible = mounted ? isPanelCOpen : false;

	// 实际应该渲染的 Panel（需要同时满足：宽度允许该槽位 + 该 Panel 处于打开状态）
	const showPanelA = panelAVisible;
	const showPanelB = shouldShowPanelB && panelBVisible;
	const showPanelC = shouldShowPanelC && panelCVisible;
	const showPanelAHandle = showPanelA && showPanelB;
	const showPanelCHandle = showPanelC && (showPanelB || showPanelA);
	const isACOnly = showPanelA && showPanelC && !showPanelB;

	// 计算实际显示的 panel 槽位数量（用于 BottomDock）
	// - 只由宽度阈值决定（1 / 2 / 3），和页面上可分配的槽位数保持同步
	const visiblePanelCount = useMemo(() => {
		if (shouldShowPanelC) return 3;
		if (shouldShowPanelB) return 2;
		return 1;
	}, [shouldShowPanelB, shouldShowPanelC]);

	// 计算 layoutState：根据「实际可见」的 Panel 数量 + 当前 store 中的宽度配置分配宽度
	// 在 SSR 时使用默认值，避免 hydration 不匹配
	const layoutState = useMemo(() => {
		// SSR 时返回默认布局（只有 Panel A）
		if (!mounted) {
			return {
				panelAWidth: 1,
				panelBWidth: 0,
				panelCWidth: 0,
			};
		}

		const clampedPanelA = Math.min(Math.max(panelAWidth, 0.1), 0.9);

		// 三栏场景：A / B / C（A/B/C 都可见）
		if (showPanelA && showPanelB && showPanelC) {
			// panelCWidth 是右侧占比，panelAWidth 是左侧在剩余宽度中的比例
			const baseWidth = 1 - panelCWidth;
			const safeBase = baseWidth > 0 ? baseWidth : 1;
			const a = safeBase * clampedPanelA;
			const c = panelCWidth;
			const b = Math.max(0, 1 - a - c);

			return {
				panelAWidth: a,
				panelBWidth: b,
				panelCWidth: c,
			};
		}

		// 双栏场景 1：A / C（A 和 C 可见，B 不可见）
		if (showPanelA && !showPanelB && showPanelC) {
			return {
				panelAWidth: clampedPanelA,
				panelBWidth: 0,
				panelCWidth: 1 - clampedPanelA,
			};
		}

		// 双栏场景 2：A / B（A 和 B 可见，C 不可见）
		if (showPanelA && showPanelB && !showPanelC) {
			return {
				panelAWidth: clampedPanelA,
				panelBWidth: 1 - clampedPanelA,
				panelCWidth: 0,
			};
		}

		// 双栏场景 3：B / C（只有 B 和 C 可见）
		if (!showPanelA && showPanelB && showPanelC) {
			const baseWidth = 1 - panelCWidth;
			const safeBase = baseWidth > 0 ? baseWidth : 1;
			const b = safeBase; // 左侧全部给 B
			const c = panelCWidth;
			return {
				panelAWidth: 0,
				panelBWidth: b,
				panelCWidth: c,
			};
		}

		// 单栏场景 1：只有 A
		if (showPanelA && !showPanelB && !showPanelC) {
			return {
				panelAWidth: 1,
				panelBWidth: 0,
				panelCWidth: 0,
			};
		}

		// 单栏场景 2：只有 B
		if (!showPanelA && showPanelB && !showPanelC) {
			return {
				panelAWidth: 0,
				panelBWidth: 1,
				panelCWidth: 0,
			};
		}

		// 单栏场景 3：只有 C
		if (!showPanelA && !showPanelB && showPanelC) {
			return {
				panelAWidth: 0,
				panelBWidth: 0,
				panelCWidth: 1,
			};
		}

		// 兜底：没有任何 Panel 被认为可见时，仍然保留 A
		return {
			panelAWidth: 1,
			panelBWidth: 0,
			panelCWidth: 0,
		};
	}, [mounted, showPanelA, showPanelB, showPanelC, panelAWidth, panelCWidth]);

	// 计算 Panels 容器的固定高度：PanelRegion 总高度 - BottomDock 高度 - Dock 上方间距
	const panelsContainerHeight = useMemo(() => {
		if (height && height > 0) {
			return height - BOTTOM_DOCK_HEIGHT - DOCK_MARGIN_TOP;
		}
		return undefined; // 如果没有提供 height，使用 flex-1 自适应（兼容完整页面模式）
	}, [height]);

	// ✅ 关键修复：使用 useLayoutEffect 持续确保底部容器高度固定，不受宽度变化影响
	useLayoutEffect(() => {
		const container = bottomDockContainerRef.current;
		if (!container) return;

		// 使用双重 requestAnimationFrame 确保在 React 应用 style 之后执行
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				if (container) {
					// 强制设置高度，使用 !important 确保优先级
					container.style.setProperty('height', '60px', 'important');
					container.style.setProperty('min-height', '60px', 'important');
					container.style.setProperty('max-height', '60px', 'important');
				}
			});
		});
	}, []); // 只在挂载时设置一次

	// ✅ 关键修复：使用 useLayoutEffect 持续确保 Panels 容器高度固定
	// biome-ignore lint/correctness/useExhaustiveDependencies: containerRef.current is stable and doesn't need to be in deps
	useLayoutEffect(() => {
		const panelsContainer = containerRef.current;
		if (!panelsContainer || !panelsContainerHeight) return;

		// 使用双重 requestAnimationFrame 确保在 React 应用 style 之后执行
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				if (panelsContainer && panelsContainerHeight) {
					// 强制设置高度，使用 !important 确保优先级
					panelsContainer.style.setProperty('height', `${panelsContainerHeight}px`, 'important');
					panelsContainer.style.setProperty('min-height', `${panelsContainerHeight}px`, 'important');
					panelsContainer.style.setProperty('max-height', `${panelsContainerHeight}px`, 'important');
				}
			});
		});
	}, [panelsContainerHeight]); // 只在高度变化时重新设置

	return (
		<div className="flex flex-col h-full w-full bg-primary-foreground dark:bg-accent" style={{ opacity: 1 }}>
			{/* Panels 容器：固定高度 = PanelRegion 总高度 - BottomDock 高度 - 间距 */}
			<div
				ref={containerRef}
				className={cn(
					"relative bg-primary-foreground dark:bg-accent flex min-h-0 overflow-hidden px-3",
					panelsContainerHeight ? "" : "flex-1" // 如果有固定高度，不使用 flex-1；否则使用 flex-1（兼容完整页面模式）
				)}
				style={{
					pointerEvents: "auto",
					opacity: 1,
					...(panelsContainerHeight
						? {
						height: `${panelsContainerHeight}px`,
						minHeight: `${panelsContainerHeight}px`,
						maxHeight: `${panelsContainerHeight}px`,
					  }
						: {})
				}}
			>
				{/* 根据窗口宽度显示对应数量的 Panel */}
				<PanelContainer
					key="panelA"
					position="panelA"
					isVisible={panelAVisible}
					width={
						shouldShowPanelC
							? layoutState.panelAWidth
							: shouldShowPanelB
								? layoutState.panelAWidth
								: 1
					}
					isDragging={isDraggingPanelA || isDraggingPanelC || isResizingPanel}
					// 当只有 A / C 两个 Panel（B 被关闭）时，A/C 中间不再额外加双倍边距，只留中间一条分隔条
					className={
						"mx-1"
					}
				>
					<PanelContent position="panelA" />
				</PanelContainer>

				{shouldShowPanelB && (
					<>
						<ResizeHandle
							key="panelA-resize-handle"
							onPointerDown={onPanelAResizePointerDown || (() => {})}
							isDragging={isDraggingPanelA}
							// 当中间 Panel 实际关闭时，隐藏这条分隔线，避免出现双分隔条
							isVisible={showPanelAHandle}
						/>

						<PanelContainer
							key="panelB"
							position="panelB"
							isVisible={panelBVisible}
							width={
								shouldShowPanelC
									? layoutState.panelBWidth
									: 1 - layoutState.panelAWidth
							}
							isDragging={isDraggingPanelA || isDraggingPanelC || isResizingPanel}
							className="mx-1"
						>
							<PanelContent position="panelB" />
						</PanelContainer>
					</>
				)}

				{shouldShowPanelC && (
					<>
						<ResizeHandle
							key="panelC-resize-handle"
							onPointerDown={
								(isACOnly
									? onPanelAResizePointerDown
									: onPanelCResizePointerDown) || (() => {})
							}
							isDragging={isACOnly ? isDraggingPanelA : isDraggingPanelC}
							// 右侧分隔线只在右侧 Panel 实际可见时显示
							isVisible={showPanelCHandle}
						/>

						<PanelContainer
							key="panelC"
							position="panelC"
							isVisible={panelCVisible}
							width={layoutState.panelCWidth}
							isDragging={isDraggingPanelA || isDraggingPanelC || isResizingPanel}
							className={
								"mx-1"
							}
						>
							<PanelContent position="panelC" />
						</PanelContainer>
					</>
				)}
			</div>

			{/* BottomDock 底部区域 */}
			<div
				ref={(el) => {
					bottomDockContainerRef.current = el;
					// 强制固定高度，防止随内容抖动
					if (el) {
						requestAnimationFrame(() => {
							if (el) {
								el.style.setProperty("height", `${BOTTOM_DOCK_HEIGHT}px`, "important");
								el.style.setProperty("min-height", `${BOTTOM_DOCK_HEIGHT}px`, "important");
								el.style.setProperty("max-height", `${BOTTOM_DOCK_HEIGHT}px`, "important");
							}
						});
					}
				}}
				className="relative flex shrink-0 items-center justify-center bg-primary-foreground dark:bg-accent"
				style={{
					pointerEvents: "auto",
					height: BOTTOM_DOCK_HEIGHT,
					marginTop: DOCK_MARGIN_TOP,
				}}
			>
				<BottomDock
					className={isInPanelMode ? "!relative !bottom-auto !left-auto !translate-x-0" : undefined}
					isInPanelMode={isInPanelMode}
					panelContainerRef={bottomDockContainerRef as React.RefObject<HTMLElement | null>}
					visiblePanelCount={visiblePanelCount}
				/>
			</div>
		</div>
	);
}
