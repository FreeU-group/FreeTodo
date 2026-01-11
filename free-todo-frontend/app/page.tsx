"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LayoutSelector } from "@/components/common/layout/LayoutSelector";
import { ThemeToggle } from "@/components/common/theme/ThemeToggle";
import { LanguageToggle } from "@/components/common/ui/LanguageToggle";
import { SettingsToggle } from "@/components/common/ui/SettingsToggle";
// import { UserAvatar } from "@/components/common/ui/UserAvatar";
import { BottomDock } from "@/components/layout/BottomDock";
import { PanelContainer } from "@/components/layout/PanelContainer";
import { PanelContent } from "@/components/layout/PanelContent";
import { ResizeHandle } from "@/components/layout/ResizeHandle";
import { HeaderIsland } from "@/components/notification/HeaderIsland";
import { GlobalDndProvider } from "@/lib/dnd";
import { useWindowAdaptivePanels } from "@/lib/hooks/useWindowAdaptivePanels";
import { useConfig, useLlmStatus } from "@/lib/query";
import { getNotificationPoller } from "@/lib/services/notification-poller";
import { useNotificationStore } from "@/lib/store/notification-store";
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
	const { currentNotification, setNotification } = useNotificationStore();
	const [isDraggingPanelA, setIsDraggingPanelA] = useState(false);
	const [isDraggingPanelC, setIsDraggingPanelC] = useState(false);

	// 国际化
	const t = useTranslations("todoExtraction");

	// 使用 TanStack Query 获取配置
	const { data: config } = useConfig();

	// 检查 LLM 配置状态
	const { data: llmStatus } = useLlmStatus();

	// 根据 LLM 配置状态显示或隐藏通知
	useEffect(() => {
		if (!llmStatus) return;

		if (!llmStatus.configured) {
			// LLM 未配置，显示通知提示用户去设置
			setNotification({
				id: "llm-config-missing",
				title: t("llmConfigMissing"),
				content: t("llmConfigMissingHint"),
				timestamp: new Date().toISOString(),
				source: "llm-config",
			});
		} else {
			// LLM 已配置，如果当前显示的是 LLM 配置通知，则清除它
			if (currentNotification?.source === "llm-config") {
				setNotification(null);
			}
		}
	}, [llmStatus, currentNotification?.source, setNotification, t]);

	const containerRef = useRef<HTMLDivElement | null>(null);
	const setGlobalResizeCursor = useCallback((enabled: boolean) => {
		if (typeof document === "undefined") return;
		document.body.style.cursor = enabled ? "col-resize" : "";
		document.body.style.userSelect = enabled ? "none" : "";
	}, []);

	// 窗口自适应panel管理
	useWindowAdaptivePanels(containerRef);

	useEffect(() => {
		// 清理：防止在组件卸载时光标和选择状态残留
		return () => setGlobalResizeCursor(false);
	}, [setGlobalResizeCursor]);

	// 初始化并管理轮询
	useEffect(() => {
		const poller = getNotificationPoller();
		const store = useNotificationStore.getState();

		// 同步当前所有端点
		const syncEndpoints = () => {
			const allEndpoints = store.getAllEndpoints();

			// 更新或注册已启用的端点
			for (const endpoint of allEndpoints) {
				if (endpoint.enabled) {
					poller.updateEndpoint(endpoint);
				} else {
					poller.unregisterEndpoint(endpoint.id);
				}
			}
		};

		// 使用 TanStack Query 获取的配置初始化 draft todo 轮询
		const autoTodoDetectionEnabled =
			(config?.jobsAutoTodoDetectionEnabled as boolean) ?? false;

		// 注册或更新 draft todo 轮询端点
		const existingEndpoint = store.getEndpoint("draft-todos");
		if (!existingEndpoint) {
			store.registerEndpoint({
				id: "draft-todos",
				url: "/api/todos?status=draft&limit=1",
				interval: 1000, // 1秒轮询一次，实现近实时更新
				enabled: autoTodoDetectionEnabled,
			});
		} else if (existingEndpoint.enabled !== autoTodoDetectionEnabled) {
			// 配置变化时更新端点状态
			store.registerEndpoint({
				...existingEndpoint,
				enabled: autoTodoDetectionEnabled,
			});
		}

		console.log(
			`[DraftTodo轮询] 自动待办检测配置: ${autoTodoDetectionEnabled ? "已启用" : "已禁用"}`,
		);

		// 注册 DDL 提醒轮询端点
		const ddlReminderEndpoint = store.getEndpoint("ddl-reminder");
		if (!ddlReminderEndpoint) {
			store.registerEndpoint({
				id: "ddl-reminder",
				url: "/api/notifications",
				interval: 10000, // 10秒轮询一次，显著短于后端检查间隔（30秒）
				enabled: true, // 默认启用
			});
			console.log("[DDL提醒轮询] 已注册，间隔: 10秒");
		}

		// 初始同步
		syncEndpoints();

		// 订阅端点变化
		const unsubscribe = useNotificationStore.subscribe(() => {
			syncEndpoints();
		});

		// 清理函数
		return () => {
			unsubscribe();
		};
	}, [config]);

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
		<GlobalDndProvider>
			<main className="relative flex h-screen flex-col overflow-hidden text-foreground">
				<div className="relative z-10 flex h-full flex-col text-foreground">
					<header className="relative flex h-15 shrink-0 items-center bg-primary-foreground dark:bg-accent px-4 text-foreground overflow-visible">
						{/* 左侧：Logo */}
						<div className="flex items-center gap-2 shrink-0">
							<Image
								src="/free-todo-logos/free_todo_icon_with_grid.png"
								alt="Free Todo Logo"
								width={32}
								height={32}
								className="shrink-0"
							/>
							<h1 className="text-lg font-semibold tracking-tight text-foreground">
								Free Todo: Your AI Secretary
							</h1>
						</div>

						{/* 中间：通知区域（灵动岛） - 只在有通知时显示 */}
						{currentNotification && (
							<div className="flex-1 flex items-center justify-center relative min-w-0 overflow-visible">
								<HeaderIsland />
							</div>
						)}

						{/* 占位符：当没有通知时保持布局平衡 */}
						{!currentNotification && <div className="flex-1" />}

						{/* 右侧：工具 */}
						<div className="flex items-center gap-2 shrink-0">
							<LayoutSelector showChevron={false} />
							<ThemeToggle />
							<LanguageToggle />
							<SettingsToggle />
							{/* <UserAvatar /> */}
						</div>
					</header>

					<div
						ref={containerRef}
						className="relative bg-primary-foreground dark:bg-accent flex min-h-0 flex-1 overflow-hidden px-3 pb-7"
					>
						{/* 始终渲染所有面板和 ResizeHandle，通过 isVisible 控制动画，避免 DOM 移除导致的布局跳跃 */}
						<PanelContainer
							key="panelA"
							position="panelA"
							isVisible={layoutState.showPanelA}
							width={layoutState.showPanelA ? layoutState.panelAWidth : 0}
							isDragging={isDraggingPanelA || isDraggingPanelC}
						>
							<PanelContent position="panelA" />
						</PanelContainer>

						<ResizeHandle
							key="panelA-resize-handle"
							onPointerDown={handlePanelAResizePointerDown}
							isDragging={isDraggingPanelA}
							isVisible={layoutState.showPanelAResizeHandle}
						/>

						<PanelContainer
							key="panelB"
							position="panelB"
							isVisible={layoutState.showPanelB}
							width={layoutState.showPanelB ? layoutState.panelBWidth : 0}
							isDragging={isDraggingPanelA || isDraggingPanelC}
						>
							<PanelContent position="panelB" />
						</PanelContainer>

						<ResizeHandle
							key="panelC-resize-handle"
							onPointerDown={handlePanelCResizePointerDown}
							isDragging={isDraggingPanelC}
							isVisible={layoutState.showPanelCResizeHandle}
						/>

						<PanelContainer
							key="panelC"
							position="panelC"
							isVisible={layoutState.showPanelC}
							width={layoutState.showPanelC ? layoutState.panelCWidth : 0}
							isDragging={isDraggingPanelA || isDraggingPanelC}
						>
							<PanelContent position="panelC" />
						</PanelContainer>
					</div>
				</div>

				<BottomDock />
			</main>
		</GlobalDndProvider>
	);
}
