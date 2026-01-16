"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getElectronAPI } from "@/components/dynamic-island/electron-api";
import { IslandMode } from "@/components/dynamic-island/types";
import { AppHeader } from "@/components/layout/AppHeader";
import { PanelRegion } from "@/components/layout/PanelRegion";
import { PanelWindow } from "@/components/panel/PanelWindow";
import { GlobalDndProvider } from "@/lib/dnd";
import { useElectronClickThrough } from "@/lib/hooks/useElectronClickThrough";
import { useOnboardingTour } from "@/lib/hooks/useOnboardingTour";
import { usePanelResize } from "@/lib/hooks/usePanelResize";
import { usePanelWindowDrag } from "@/lib/hooks/usePanelWindowDrag";
import { usePanelWindowResize } from "@/lib/hooks/usePanelWindowResize";
import { usePanelWindowStyles } from "@/lib/hooks/usePanelWindowStyles";
import { useWindowAdaptivePanels } from "@/lib/hooks/useWindowAdaptivePanels";
import { useConfig, useLlmStatus } from "@/lib/query";
import { getNotificationPoller } from "@/lib/services/notification-poller";
import { useDynamicIslandStore } from "@/lib/store/dynamic-island-store";
import { useNotificationStore } from "@/lib/store/notification-store";
import { useUiStore } from "@/lib/store/ui-store";
import { isElectronEnvironment } from "@/lib/utils/electron";


export default function HomePage() {
	// 所有 hooks 必须在条件返回之前调用（React Hooks 规则）
	const { mode, setMode, hidePanel } = useDynamicIslandStore();

	// 使用 mounted 状态来避免 SSR 水合不匹配
	// 在服务器端和初始客户端渲染时，始终渲染最大化模式
	// 只有在水合完成后（mounted 为 true），才根据实际环境决定显示模式
	const [mounted, setMounted] = useState(false);

	// Panel 模式切换函数
	const onModeChange = useCallback((newMode: IslandMode) => {
		console.log(`[HomePage] onModeChange called: ${newMode}, current mode: ${mode}`);
		const isElectronEnv = mounted ? isElectronEnvironment() : false;
		if (newMode === IslandMode.MAXIMIZE) {
			setMode(IslandMode.MAXIMIZE);
		} else if (newMode === IslandMode.FLOAT) {
			// 切换到 FLOAT 模式时，确保 Panel 关闭
			hidePanel();
		} else {
			if (newMode === IslandMode.PANEL && isElectronEnv) {
				const api = getElectronAPI();
				if (api.electronAPI?.expandWindow) {
					const expandResult = api.electronAPI.expandWindow();
					if (expandResult instanceof Promise) {
						expandResult.then(() => {
							setMode(newMode);
						}).catch(() => {
							setMode(newMode);
						});
					} else {
						setMode(newMode);
					}
					return;
				}
			}
			setMode(newMode);
		}
	}, [setMode, mode, hidePanel, mounted]);
	useEffect(() => {
		setMounted(true);

		// 清理可能残留的蓝色调试框
		const debugDiv = document.getElementById("panel-drag-debug");
		if (debugDiv) {
			debugDiv.remove();
		}

		return () => {
			// 组件卸载时也清理
			const debugDivOnUnmount = document.getElementById("panel-drag-debug");
			if (debugDivOnUnmount) {
				debugDivOnUnmount.remove();
			}
		};
	}, []);

	// MAXIMIZE 进入时，默认打开三列（仍允许用户通过 BottomDock 控制）
	useEffect(() => {
		if (mode !== IslandMode.MAXIMIZE) return;
		const state = useUiStore.getState();
		const next: Partial<typeof state> = {};
		if (!state.isPanelAOpen) next.isPanelAOpen = true;
		if (!state.isPanelBOpen) next.isPanelBOpen = true;
		if (!state.isPanelCOpen) next.isPanelCOpen = true;
		if (Object.keys(next).length > 0) {
			useUiStore.setState(next);
		}
	}, [mode]);

	// 浏览器模式下始终使用最大化模式（不显示灵动岛）
	// 在未挂载时（SSR/初始渲染），始终使用最大化模式以避免水合不匹配
	const isElectron = mounted ? isElectronEnvironment() : false;
	// Panel 模式显示右侧 Panel，MAXIMIZE 显示完整页面；FLOAT 仅悬浮层
	const shouldShowPage = !isElectron || mode === IslandMode.PANEL || mode === IslandMode.MAXIMIZE;
	const isPanelMode = isElectron && mode === IslandMode.PANEL;
	const {
		isPanelCOpen,
		panelCWidth,
		setPanelAWidth,
		setPanelCWidth,
	} = useUiStore();
	const { currentNotification, setNotification } = useNotificationStore();
	const [isDraggingPanelA, setIsDraggingPanelA] = useState(false);
	const [isDraggingPanelC, setIsDraggingPanelC] = useState(false);

	// Panel 窗口状态（需要在 useEffect 之前定义）
	const [panelWindowWidth, setPanelWindowWidth] = useState(520); // 初始宽度（从 480 增加到 520）
	const [panelWindowHeight, setPanelWindowHeight] = useState(0); // 初始会在 mounted 后设置一个更低的默认高度
	const [isResizingPanel, setIsResizingPanel] = useState(false);
	const [panelWindowPosition, setPanelWindowPosition] = useState({ x: 0, y: 0 });
	const [isDraggingPanel, setIsDraggingPanel] = useState(false);
	const [isUserInteracting, setIsUserInteracting] = useState(false); // 用户交互标志，防止定时器干扰

	// ✅ Panel 模式：设置一个更合理的“初始高度”（不要默认接近满屏）
	// panelWindowHeight 表示 PanelRegion 的高度（不含标题栏 48px）
	useEffect(() => {
		if (!mounted) return;
		if (!isElectron) return;
		// 只在第一次初始化（避免用户手动调整后被覆盖）
		if (panelWindowHeight > 0) return;
		if (typeof window === "undefined") return;

		const headerHeight = 48;
		const topOffset = 40;
		const desiredTotal = Math.round(window.innerHeight * 0.8); // 窗口总高度目标
		const desiredRegion = Math.max(250, desiredTotal - headerHeight);
		const maxRegion = window.innerHeight - topOffset - headerHeight;
		setPanelWindowHeight(Math.min(desiredRegion, maxRegion));
	}, [mounted, isElectron, panelWindowHeight]);

	// ✅ 计算 Panel 窗口的 right 值，确保不会移出视口
	const panelWindowRight = useMemo(() => {
		if (panelWindowPosition.x === 0) return 16;
		// 使用 Math.max 确保 right 值不会变成负数
		return Math.max(16, (typeof window !== 'undefined' ? window.innerWidth : 1920) - panelWindowPosition.x - panelWindowWidth);
	}, [panelWindowPosition.x, panelWindowWidth]);

	// 国际化
	const t = useTranslations("todoExtraction");

	// 用户引导 (Onboarding Tour)
	const { startTour, hasCompletedTour } = useOnboardingTour();

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

	// 窗口自适应panel管理（用于完整页面模式）
	useWindowAdaptivePanels(containerRef);

	useEffect(() => {
		// 清理：防止在组件卸载时光标和选择状态残留
		return () => setGlobalResizeCursor(false);
	}, [setGlobalResizeCursor]);

	// 用户引导：首次加载且未完成引导时启动 tour
	// 使用 ref 确保只在组件挂载时检查一次，避免 restartTour 时重复触发
	const hasCheckedTourRef = useRef(false);
	useEffect(() => {
		if (hasCheckedTourRef.current) return;
		hasCheckedTourRef.current = true;

		if (!hasCompletedTour) {
			// 延迟启动，确保页面渲染完成
			const timer = setTimeout(() => {
				startTour();
			}, 800);
			return () => clearTimeout(timer);
		}
	}, [hasCompletedTour, startTour]);

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

	// 使用自定义 hooks 管理 Panel 调整大小
	// 注意：layoutState 由 PanelRegion 内部计算，这里不需要

	const { handlePanelAResizePointerDown, handlePanelCResizePointerDown } = usePanelResize({
		containerRef,
		isPanelCOpen,
		panelCWidth,
		setPanelAWidth,
		setPanelCWidth,
		setIsDraggingPanelA,
		setIsDraggingPanelC,
		setGlobalResizeCursor,
	});

	// Panel 窗口尺寸常量
	const MIN_PANEL_WIDTH = 400;
	const MAX_PANEL_WIDTH = 1500;
	const MIN_PANEL_HEIGHT = 250; // PanelRegion 最小高度（包括 Panels 容器 + BottomDock 60px + Dock 上方间距 12px）
	const MAX_PANEL_HEIGHT = typeof window !== 'undefined'
		? window.innerHeight - 40 - 48 - 12
		: 1000; // PanelRegion 最大高度（窗口高度 - 顶部偏移40px - 标题栏48px - Dock 上方间距12px）

	// 使用自定义 hooks 管理 Panel 窗口功能
	useElectronClickThrough({
		mounted,
		isElectron,
		mode,
		isUserInteracting,
	});

	usePanelWindowStyles({
		isPanelMode,
		panelWindowHeight,
	});

	const { handlePanelDragStart } = usePanelWindowDrag({
		panelWindowWidth,
		isElectron,
		mode,
		shouldShowPage,
		setPanelWindowPosition,
		setIsDraggingPanel,
		setIsUserInteracting,
	});

	const { handlePanelResizeStart } = usePanelWindowResize({
		panelWindowWidth,
		panelWindowPosition,
		panelWindowHeight,
		isElectron,
		MIN_PANEL_WIDTH,
		MAX_PANEL_WIDTH,
		MIN_PANEL_HEIGHT,
		MAX_PANEL_HEIGHT,
		setPanelWindowWidth,
		setPanelWindowPosition,
		setPanelWindowHeight,
		setIsResizingPanel,
		setIsUserInteracting,
	});

	const showContent = shouldShowPage;

	return (
		<GlobalDndProvider>
			<main
				className="relative flex h-screen flex-col overflow-hidden text-foreground"
				style={{
					pointerEvents: showContent ? "auto" : "none",
					// ✅ Panel 模式下，main 背景必须是透明的（左侧需要穿透）
					// MAXIMIZE 模式下，设置背景色确保内容可见
					background: isPanelMode ? "transparent" : (showContent ? "oklch(var(--background))" : "transparent"),
					backgroundColor: isPanelMode ? "transparent" : (showContent ? "oklch(var(--background))" : "transparent"),
					// ✅ MAXIMIZE 模式下，确保 main 元素在最上层
					zIndex: isPanelMode ? 1 : (showContent ? 10 : 0),
					// ✅ Panel 模式下，main 本身应该是透明的，但内容不透明
					opacity: isPanelMode ? 1 : (showContent ? 1 : undefined),
					// ✅ MAXIMIZE 模式下，确保可见性
					visibility: isPanelMode ? "visible" : (showContent ? "visible" : "hidden"),
				}}
			>
				{showContent ? (
					isPanelMode ? (
						<PanelWindow
							panelWindowWidth={panelWindowWidth}
							panelWindowHeight={panelWindowHeight}
							panelWindowPosition={panelWindowPosition}
							panelWindowRight={panelWindowRight}
							isDraggingPanel={isDraggingPanel}
							isDraggingPanelA={isDraggingPanelA}
							isDraggingPanelC={isDraggingPanelC}
							isResizingPanel={isResizingPanel}
							onModeChange={onModeChange}
							onHidePanel={hidePanel}
							onPanelDragStart={handlePanelDragStart}
							onPanelResizeStart={handlePanelResizeStart}
							onPanelAResizePointerDown={handlePanelAResizePointerDown}
							onPanelCResizePointerDown={handlePanelCResizePointerDown}
							containerRef={containerRef}
						/>
					) : (
						// MAXIMIZE 或浏览器模式：原有全页面布局
						<div
							className="relative flex h-screen flex-col text-foreground"
							style={{
								backgroundColor: "oklch(var(--background))",
								background: "oklch(var(--background))",
								height: "100vh",
								width: "100vw",
								overflow: "hidden",
								opacity: 1,
								visibility: "visible",
								zIndex: 1, // 页面内容的 z-index，灵动岛容器使用 pointer-events-none，只有灵动岛本身可交互
								position: "relative",
							}}
						>
							<AppHeader
								mode={mode === IslandMode.MAXIMIZE ? IslandMode.MAXIMIZE : IslandMode.PANEL}
								onModeChange={onModeChange}
								onClose={() => {
									if (mode === IslandMode.MAXIMIZE) {
										onModeChange(IslandMode.FLOAT);
									}
								}}
								isPanelMode={false}
								currentNotification={currentNotification}
								isElectron={isElectron}
						/>
							<div
								className="flex-1 min-h-0 overflow-hidden"
								style={{
									backgroundColor: "oklch(var(--background))",
									background: "oklch(var(--background))",
									height: "calc(100vh - 80px)",
									opacity: 1,
									visibility: "visible",
									position: "relative",
									zIndex: 1,
								}}
							>
								<PanelRegion
									width={typeof window !== "undefined" ? window.innerWidth : 1920}
									isMaximizeMode={mode === IslandMode.MAXIMIZE}
									isInPanelMode={false}
									isDraggingPanelA={isDraggingPanelA}
									isDraggingPanelC={isDraggingPanelC}
									isResizingPanel={false}
									onPanelAResizePointerDown={handlePanelAResizePointerDown}
									onPanelCResizePointerDown={handlePanelCResizePointerDown}
									containerRef={containerRef}
								/>
					</div>
				</div>
					)
				) : null}
			</main>
		</GlobalDndProvider>
	);
}
