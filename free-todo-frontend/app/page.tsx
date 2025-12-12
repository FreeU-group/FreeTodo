"use client";

import { AnimatePresence } from "framer-motion";
import Image from "next/image";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LanguageToggle } from "@/components/common/LanguageToggle";
import { ThemeStyleSelect } from "@/components/common/ThemeStyleSelect";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { UserAvatar } from "@/components/common/UserAvatar";
import { BottomDock } from "@/components/layout/BottomDock";
import { PanelContainer } from "@/components/layout/PanelContainer";
import { PanelContent } from "@/components/layout/PanelContent";
import { ResizeHandle } from "@/components/layout/ResizeHandle";
import { useUiStore } from "@/lib/store/ui-store";

export default function HomePage() {
	const {
		isPanelAOpen,
		isPanelBOpen,
		isPanelCOpen,
		panelAWidth,
		panelCWidth,
		setPanelAWidth,
		setPanelCWidth,
	} = useUiStore();
	const [isDraggingPanelA, setIsDraggingPanelA] = useState(false);
	const [isDraggingPanelC, setIsDraggingPanelC] = useState(false);

	const containerRef = useRef<HTMLDivElement | null>(null);
	const setGlobalResizeCursor = useCallback((enabled: boolean) => {
		if (typeof document === "undefined") return;
		document.body.style.cursor = enabled ? "col-resize" : "";
		document.body.style.userSelect = enabled ? "none" : "";
	}, []);

	useEffect(() => {
		// 清理：防止在组件卸载时光标和选择状态残留
		return () => setGlobalResizeCursor(false);
	}, [setGlobalResizeCursor]);

	const layoutState = useMemo(() => {
		// 计算基础宽度（不包括 panelC）
		const baseWidth = isPanelCOpen ? 1 - panelCWidth : 1;
		const actualPanelCWidth = isPanelCOpen ? panelCWidth : 0;

		// 所有面板都关闭的情况
		if (!isPanelAOpen && !isPanelBOpen && !isPanelCOpen) {
			return {
				showPanelA: false,
				showPanelB: false,
				showPanelC: false,
				panelAWidth: 0,
				panelBWidth: 0,
				panelCWidth: 0,
				showPanelAResizeHandle: false,
				showPanelCResizeHandle: false,
			};
		}

		if (isPanelAOpen && isPanelBOpen && isPanelCOpen) {
			// 三个面板都打开
			return {
				showPanelA: true,
				showPanelB: true,
				showPanelC: true,
				panelAWidth: panelAWidth * baseWidth,
				panelBWidth: (1 - panelAWidth) * baseWidth,
				panelCWidth: actualPanelCWidth,
				showPanelAResizeHandle: true,
				showPanelCResizeHandle: true,
			};
		}

		if (isPanelAOpen && isPanelBOpen) {
			// 只有 panelA 和 panelB 打开
			return {
				showPanelA: true,
				showPanelB: true,
				showPanelC: false,
				panelAWidth: panelAWidth,
				panelBWidth: 1 - panelAWidth,
				panelCWidth: 0,
				showPanelAResizeHandle: true,
				showPanelCResizeHandle: false,
			};
		}

		if (isPanelBOpen && isPanelCOpen) {
			// 只有 panelB 和 panelC 打开
			return {
				showPanelA: false,
				showPanelB: true,
				showPanelC: true,
				panelAWidth: 0,
				panelBWidth: baseWidth,
				panelCWidth: actualPanelCWidth,
				showPanelAResizeHandle: false,
				showPanelCResizeHandle: true,
			};
		}

		if (isPanelAOpen && isPanelCOpen) {
			// 只有 panelA 和 panelC 打开
			return {
				showPanelA: true,
				showPanelB: false,
				showPanelC: true,
				panelAWidth: baseWidth,
				panelBWidth: 0,
				panelCWidth: actualPanelCWidth,
				showPanelAResizeHandle: false,
				showPanelCResizeHandle: true,
			};
		}

		if (isPanelAOpen && !isPanelBOpen) {
			// 只有 panelA 打开
			return {
				showPanelA: true,
				showPanelB: false,
				showPanelC: isPanelCOpen,
				panelAWidth: baseWidth,
				panelBWidth: 0,
				panelCWidth: actualPanelCWidth,
				showPanelAResizeHandle: false,
				showPanelCResizeHandle: isPanelCOpen,
			};
		}

		if (!isPanelAOpen && isPanelBOpen) {
			// 只有 panelB 打开
			return {
				showPanelA: false,
				showPanelB: true,
				showPanelC: isPanelCOpen,
				panelAWidth: 0,
				panelBWidth: baseWidth,
				panelCWidth: actualPanelCWidth,
				showPanelAResizeHandle: false,
				showPanelCResizeHandle: isPanelCOpen,
			};
		}

		// 只有 panelC 打开
		return {
			showPanelA: false,
			showPanelB: false,
			showPanelC: true,
			panelAWidth: 0,
			panelBWidth: 0,
			panelCWidth: actualPanelCWidth,
			showPanelAResizeHandle: false,
			showPanelCResizeHandle: false,
		};
	}, [isPanelAOpen, isPanelBOpen, isPanelCOpen, panelAWidth, panelCWidth]);

	const handlePanelADragAtClientX = useCallback(
		(clientX: number) => {
			const container = containerRef.current;
			if (!container) return;

			const rect = container.getBoundingClientRect();
			if (rect.width <= 0) return;

			const relativeX = clientX - rect.left;
			const ratio = relativeX / rect.width;

			// 当 panelC 打开时，panelA 的宽度是相对于 baseWidth 的比例
			// baseWidth = 1 - panelCWidth
			// 所以需要将 ratio 转换为相对于 baseWidth 的比例
			if (isPanelCOpen) {
				const baseWidth = 1 - panelCWidth;
				if (baseWidth > 0) {
					const adjustedRatio = ratio / baseWidth;
					setPanelAWidth(adjustedRatio);
				} else {
					setPanelAWidth(0.5);
				}
			} else {
				setPanelAWidth(ratio);
			}
		},
		[setPanelAWidth, isPanelCOpen, panelCWidth],
	);

	const handlePanelCDragAtClientX = useCallback(
		(clientX: number) => {
			const container = containerRef.current;
			if (!container) return;

			const rect = container.getBoundingClientRect();
			if (rect.width <= 0) return;

			const relativeX = clientX - rect.left;
			const ratio = relativeX / rect.width;
			// panelCWidth 是从右侧开始计算的，所以是 1 - ratio
			setPanelCWidth(1 - ratio);
		},
		[setPanelCWidth],
	);

	const handlePanelAResizePointerDown = (
		event: ReactPointerEvent<HTMLDivElement>,
	) => {
		event.preventDefault();
		event.stopPropagation();

		setIsDraggingPanelA(true);
		setGlobalResizeCursor(true);
		handlePanelADragAtClientX(event.clientX);

		const handlePointerMove = (moveEvent: PointerEvent) => {
			handlePanelADragAtClientX(moveEvent.clientX);
		};

		const handlePointerUp = () => {
			setIsDraggingPanelA(false);
			setGlobalResizeCursor(false);
			window.removeEventListener("pointermove", handlePointerMove);
			window.removeEventListener("pointerup", handlePointerUp);
		};

		window.addEventListener("pointermove", handlePointerMove);
		window.addEventListener("pointerup", handlePointerUp);
	};

	const handlePanelCResizePointerDown = (
		event: ReactPointerEvent<HTMLDivElement>,
	) => {
		event.preventDefault();
		event.stopPropagation();

		setIsDraggingPanelC(true);
		setGlobalResizeCursor(true);
		handlePanelCDragAtClientX(event.clientX);

		const handlePointerMove = (moveEvent: PointerEvent) => {
			handlePanelCDragAtClientX(moveEvent.clientX);
		};

		const handlePointerUp = () => {
			setIsDraggingPanelC(false);
			setGlobalResizeCursor(false);
			window.removeEventListener("pointermove", handlePointerMove);
			window.removeEventListener("pointerup", handlePointerUp);
		};

		window.addEventListener("pointermove", handlePointerMove);
		window.addEventListener("pointerup", handlePointerUp);
	};

	return (
		<main className="relative flex h-screen flex-col overflow-hidden bg-background text-foreground">
			<div className="relative z-10 flex h-full flex-col text-foreground">
				<header className="flex h-12 shrink-0 items-center justify-between gap-3 bg-background px-4 text-foreground">
					<div className="flex items-center gap-2">
						<Image
							src="/logo.png"
							alt="Free Todo Logo"
							width={24}
							height={24}
							className="shrink-0"
						/>
						<h1 className="text-sm font-semibold tracking-tight text-foreground">
							Free Todo
						</h1>
					</div>

					<div className="flex items-center gap-2">
						<ThemeToggle />
						<ThemeStyleSelect />
						<LanguageToggle />
						<UserAvatar />
					</div>
				</header>

				<div
					ref={containerRef}
					className="relative flex min-h-0 flex-1 gap-1.5 overflow-hidden p-3"
				>
					<AnimatePresence mode="sync" initial={false}>
						{layoutState.showPanelA && (
							<PanelContainer
								position="panelA"
								isVisible={layoutState.showPanelA}
								width={layoutState.panelAWidth}
								isDragging={isDraggingPanelA || isDraggingPanelC}
							>
								<PanelContent position="panelA" />
							</PanelContainer>
						)}
					</AnimatePresence>

					<AnimatePresence mode="sync" initial={false}>
						{layoutState.showPanelAResizeHandle && (
							<ResizeHandle
								key="panelA-resize-handle"
								onPointerDown={handlePanelAResizePointerDown}
								isDragging={isDraggingPanelA}
							/>
						)}
					</AnimatePresence>

					<AnimatePresence mode="sync" initial={false}>
						{layoutState.showPanelB && (
							<PanelContainer
								position="panelB"
								isVisible={layoutState.showPanelB}
								width={layoutState.panelBWidth}
								isDragging={isDraggingPanelA || isDraggingPanelC}
							>
								<PanelContent position="panelB" />
							</PanelContainer>
						)}
					</AnimatePresence>

					<AnimatePresence mode="sync" initial={false}>
						{layoutState.showPanelCResizeHandle && (
							<ResizeHandle
								key="panelC-resize-handle"
								onPointerDown={handlePanelCResizePointerDown}
								isDragging={isDraggingPanelC}
							/>
						)}
					</AnimatePresence>

					<AnimatePresence mode="sync" initial={false}>
						{layoutState.showPanelC && (
							<PanelContainer
								position="panelC"
								isVisible={layoutState.showPanelC}
								width={layoutState.panelCWidth}
								isDragging={isDraggingPanelA || isDraggingPanelC}
							>
								<PanelContent position="panelC" />
							</PanelContainer>
						)}
					</AnimatePresence>
				</div>
			</div>

			<BottomDock />
		</main>
	);
}
