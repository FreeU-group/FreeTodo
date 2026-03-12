"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { PanelRegion } from "@/components/layout/PanelRegion";
import { GlobalDndProvider } from "@/lib/dnd";
import { useAutoRecording } from "@/lib/hooks/useAutoRecording";
import { useOnboardingTour } from "@/lib/hooks/useOnboardingTour";
import { usePanelResize } from "@/lib/hooks/usePanelResize";
import { useWindowAdaptivePanels } from "@/lib/hooks/useWindowAdaptivePanels";
import { useConfig, useLlmStatus } from "@/lib/query";
import { getNotificationPoller } from "@/lib/services/notification-poller";
import { useNotificationStore } from "@/lib/store/notification-store";
import { useUiStore } from "@/lib/store/ui-store";

export default function HomePageClient() {
	// 全局自动录音：根据配置决定是否在应用启动时自动开始录音
	useAutoRecording();

	// 使用 mounted 状态来避免 SSR 水合不匹配
	const [mounted, setMounted] = useState(false);
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

	// 默认打开三列（仍允许用户通过 BottomDock 控制）
	useEffect(() => {
		const state = useUiStore.getState();
		const next: Partial<typeof state> = {};
		if (!state.isPanelAOpen) next.isPanelAOpen = true;
		if (!state.isPanelBOpen) next.isPanelBOpen = true;
		if (!state.isPanelCOpen) next.isPanelCOpen = true;
		if (Object.keys(next).length > 0) {
			useUiStore.setState(next);
		}
	}, []);

	const {
		isPanelCOpen,
		isPanelBOpen,
		panelCWidth,
		setPanelAWidth,
		setPanelCWidth,
	} = useUiStore();
	const { notifications, upsertNotification, removeNotificationsBySource } =
		useNotificationStore();
	const [isDraggingPanelA, setIsDraggingPanelA] = useState(false);
	const [isDraggingPanelC, setIsDraggingPanelC] = useState(false);

	// 国际化
	const t = useTranslations("todoExtraction");

	// 用户引导 (Onboarding Tour)
	const { startTour, hasCompletedTour } = useOnboardingTour();

	// 使用 TanStack Query 获取配置
	const { data: config } = useConfig();

	// 检查 LLM 配置状态
	const { data: llmStatus } = useLlmStatus();

	// 根据 LLM 配置状态显示或隐藏通知
	const hasLlmConfigNotification = notifications.some(
		(notification) => notification.source === "llm-config",
	);

	useEffect(() => {
		if (!llmStatus) return;

		if (!llmStatus.configured) {
			// LLM 未配置，显示通知提示用户去设置
			if (!hasLlmConfigNotification) {
				upsertNotification({
					id: "llm-config-missing",
					title: t("llmConfigMissing"),
					content: t("llmConfigMissingHint"),
					timestamp: new Date().toISOString(),
					source: "llm-config",
				});
			}
		} else if (hasLlmConfigNotification) {
			// LLM 已配置，清除提示通知
			removeNotificationsBySource("llm-config");
		}
	}, [llmStatus, hasLlmConfigNotification, removeNotificationsBySource, t, upsertNotification]);

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
	const { handlePanelAResizePointerDown, handlePanelCResizePointerDown } =
		usePanelResize({
			containerRef,
			isPanelBOpen,
			isPanelCOpen,
			panelCWidth,
			setPanelAWidth,
			setPanelCWidth,
			setIsDraggingPanelA,
			setIsDraggingPanelC,
			setGlobalResizeCursor,
		});

	return (
		<GlobalDndProvider>
			<main
				className="relative flex h-screen flex-col overflow-hidden text-foreground"
				style={{
					backgroundColor: "oklch(var(--background))",
					background: "oklch(var(--background))",
				}}
			>
				<div
					className="relative flex h-screen flex-col text-foreground"
					style={{
						backgroundColor: "oklch(var(--background))",
						background: "oklch(var(--background))",
						height: "100vh",
						width: "100vw",
						overflow: "hidden",
					}}
				>
					<AppHeader hasNotifications={notifications.length > 0} />
					<div
						className="flex-1 min-h-0 overflow-hidden"
						style={{
							backgroundColor: "oklch(var(--background))",
							background: "oklch(var(--background))",
							height: "calc(100vh - 80px)",
						}}
					>
						<PanelRegion
							width={mounted ? window.innerWidth : 1920}
							isMaximizeMode={true}
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
			</main>
		</GlobalDndProvider>
	);
}
