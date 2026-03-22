"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { PanelRegion } from "@/components/layout/PanelRegion";
import { SetupWizard } from "@/apps/setup/SetupWizard";
import { GlobalDndProvider } from "@/lib/dnd";
import { useAutoRecording } from "@/lib/hooks/useAutoRecording";
import { useOnboardingTour } from "@/lib/hooks/useOnboardingTour";
import { usePanelResize } from "@/lib/hooks/usePanelResize";
import { useWindowAdaptivePanels } from "@/lib/hooks/useWindowAdaptivePanels";
import { useConfig } from "@/lib/query";
import { useSetupStatus } from "@/lib/query/setup";
import { useUiStore } from "@/lib/store/ui-store";

export default function HomePageClient() {
	// 初始化向导门控
	const { data: setupStatus, isLoading: setupLoading } = useSetupStatus();
	const [setupDone, setSetupDone] = useState(false);
	const needsSetup = !setupLoading && setupStatus && !setupStatus.completed && !setupDone;

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

	// 初始化默认布局（确保只有A和B打开，且宽度比例为 1:2，A为待办，B为聊天）
	useEffect(() => {
		const state = useUiStore.getState();
		const next: Partial<typeof state> = {};

		// 确保 A 和 B 打开，C 关闭
		if (!state.isPanelAOpen) next.isPanelAOpen = true;
		if (!state.isPanelBOpen) next.isPanelBOpen = true;
		if (state.isPanelCOpen) next.isPanelCOpen = false;

		// 确保宽度比例为 1/3 (Panel A 占 1/3，剩下的 2/3 给 Panel B)
		if (state.panelAWidth !== 1/3) next.panelAWidth = 1/3;

		// 确保功能分配正确：A为待办，B为聊天
		let featureMapChanged = false;
		const newFeatureMap = { ...state.panelFeatureMap };

		if (newFeatureMap.panelA !== "todos") {
			newFeatureMap.panelA = "todos";
			featureMapChanged = true;
		}
		if (newFeatureMap.panelB !== "chat") {
			newFeatureMap.panelB = "chat";
			featureMapChanged = true;
		}

		if (featureMapChanged) {
			next.panelFeatureMap = newFeatureMap;
		}

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
	const [isDraggingPanelA, setIsDraggingPanelA] = useState(false);
	const [isDraggingPanelC, setIsDraggingPanelC] = useState(false);

	// 用户引导 (Onboarding Tour)
	const { startTour, hasCompletedTour } = useOnboardingTour();

	// 使用 TanStack Query 获取配置
	const { data: config } = useConfig();

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

	// 通知轮询已迁移到系统级 signal-sensor 守护进程，浏览器端不再轮询
	void config;

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

	if (needsSetup) {
		return <SetupWizard onSetupComplete={() => setSetupDone(true)} />;
	}

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
						width: "100%",
						overflow: "hidden",
					}}
				>
					<AppHeader hasNotifications={false} />
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
