"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import { LanguageToggle } from "@/components/common/LanguageToggle";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { UserAvatar } from "@/components/common/UserAvatar";
import { BottomDock } from "@/components/layout/BottomDock";
import { PanelContainer } from "@/components/layout/PanelContainer";
import type { PanelPosition } from "@/lib/config/panel-config";
import { getFeatureByPosition } from "@/lib/config/panel-config";
import { useTranslations } from "@/lib/i18n";
import { useLocaleStore } from "@/lib/store/locale";
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
	const { locale } = useLocaleStore();
	const t = useTranslations(locale);

	const containerRef = useRef<HTMLDivElement | null>(null);

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
			setPanelAWidth(ratio);
		},
		[setPanelAWidth],
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
		handlePanelADragAtClientX(event.clientX);

		const handlePointerMove = (moveEvent: PointerEvent) => {
			handlePanelADragAtClientX(moveEvent.clientX);
		};

		const handlePointerUp = () => {
			setIsDraggingPanelA(false);
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
		handlePanelCDragAtClientX(event.clientX);

		const handlePointerMove = (moveEvent: PointerEvent) => {
			handlePanelCDragAtClientX(moveEvent.clientX);
		};

		const handlePointerUp = () => {
			setIsDraggingPanelC(false);
			window.removeEventListener("pointermove", handlePointerMove);
			window.removeEventListener("pointerup", handlePointerUp);
		};

		window.addEventListener("pointermove", handlePointerMove);
		window.addEventListener("pointerup", handlePointerUp);
	};

	// 获取位置对应的功能，用于显示翻译文本
	const getFeatureLabel = (position: PanelPosition): string => {
		const feature = getFeatureByPosition(position);
		const labelMap: Record<string, string> = {
			calendar: t.page.calendarLabel,
			todos: t.page.todosLabel,
			chat: t.page.chatLabel,
		};
		return labelMap[feature] || "";
	};

	const getFeaturePlaceholder = (position: PanelPosition): string => {
		const feature = getFeatureByPosition(position);
		const placeholderMap: Record<string, string> = {
			calendar: t.page.calendarPlaceholder,
			todos: t.page.todosPlaceholder,
			chat: t.page.chatPlaceholder,
		};
		return placeholderMap[feature] || "";
	};

	return (
		<main className="relative flex h-screen flex-col overflow-hidden bg-background">
			<div className="relative z-10 flex h-full flex-col">
				<header className="flex h-12 shrink-0 items-center justify-between gap-3 bg-background px-4">
					<div className="flex items-center gap-2">
						<h1 className="text-sm font-semibold tracking-tight text-foreground">
							{t.page.title}
						</h1>
					</div>

					<div className="flex items-center gap-1">
						<ThemeToggle />
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
							>
								<div className="flex h-full flex-col">
									<div className="flex h-10 shrink-0 items-center border-b border-border bg-muted/30 px-4">
										<h2 className="text-sm font-medium text-foreground">
											{getFeatureLabel("panelA")}
										</h2>
									</div>
									<div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
										{getFeaturePlaceholder("panelA")}
									</div>
								</div>
							</PanelContainer>
						)}
					</AnimatePresence>

					<AnimatePresence mode="sync" initial={false}>
						{layoutState.showPanelAResizeHandle && (
							<motion.div
								key="panelA-resize-handle"
								role="separator"
								aria-orientation="vertical"
								onPointerDown={handlePanelAResizePointerDown}
								initial={{ opacity: 0, scaleX: 0 }}
								animate={{ opacity: 1, scaleX: 1 }}
								exit={{ opacity: 0, scaleX: 0 }}
								transition={{ type: "spring", stiffness: 300, damping: 30 }}
								className={`flex items-stretch justify-center ${
									isDraggingPanelA
										? "w-2 cursor-col-resize px-1"
										: "w-1 cursor-col-resize px-0.5"
								}`}
							>
								<div
									className={`h-full rounded-full transition-all duration-200 ${
										isDraggingPanelA
											? "w-1 bg-primary shadow-[0_0_8px_hsl(var(--primary))]"
											: "w-px bg-border"
									}`}
								/>
							</motion.div>
						)}
					</AnimatePresence>

					<AnimatePresence mode="sync" initial={false}>
						{layoutState.showPanelB && (
							<PanelContainer
								position="panelB"
								isVisible={layoutState.showPanelB}
								width={layoutState.panelBWidth}
							>
								<div className="flex h-full flex-col">
									<div className="flex h-10 shrink-0 items-center border-b border-border bg-muted/30 px-4">
										<h2 className="text-sm font-medium text-foreground">
											{getFeatureLabel("panelB")}
										</h2>
									</div>
									<div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
										{getFeaturePlaceholder("panelB")}
									</div>
								</div>
							</PanelContainer>
						)}
					</AnimatePresence>

					<AnimatePresence mode="sync" initial={false}>
						{layoutState.showPanelCResizeHandle && (
							<motion.div
								key="panelC-resize-handle"
								role="separator"
								aria-orientation="vertical"
								onPointerDown={handlePanelCResizePointerDown}
								initial={{ opacity: 0, scaleX: 0 }}
								animate={{ opacity: 1, scaleX: 1 }}
								exit={{ opacity: 0, scaleX: 0 }}
								transition={{ type: "spring", stiffness: 300, damping: 30 }}
								className={`flex items-stretch justify-center ${
									isDraggingPanelC
										? "w-2 cursor-col-resize px-1"
										: "w-1 cursor-col-resize px-0.5"
								}`}
							>
								<div
									className={`h-full rounded-full transition-all duration-200 ${
										isDraggingPanelC
											? "w-1 bg-primary shadow-[0_0_8px_hsl(var(--primary))]"
											: "w-px bg-border"
									}`}
								/>
							</motion.div>
						)}
					</AnimatePresence>

					<AnimatePresence mode="sync" initial={false}>
						{layoutState.showPanelC && (
							<PanelContainer
								position="panelC"
								isVisible={layoutState.showPanelC}
								width={layoutState.panelCWidth}
							>
								<div className="flex h-full flex-col">
									<div className="flex h-10 shrink-0 items-center border-b border-border bg-muted/30 px-4">
										<h2 className="text-sm font-medium text-foreground">
											{getFeatureLabel("panelC")}
										</h2>
									</div>
									<div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
										{getFeaturePlaceholder("panelC")}
									</div>
								</div>
							</PanelContainer>
						)}
					</AnimatePresence>
				</div>
			</div>

			<BottomDock />
		</main>
	);
}
