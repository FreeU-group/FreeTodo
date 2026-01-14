"use client";

import { type Driver, driver } from "driver.js";
import { useTranslations } from "next-intl";
import { useCallback, useRef } from "react";
import { useOnboardingStore } from "@/lib/store/onboarding-store";
import { useUiStore } from "@/lib/store/ui-store";
import { useOpenSettings } from "./useOpenSettings";

/**
 * 滚动设置面板到顶部
 */
function scrollSettingsPanelToTop(): Promise<void> {
	return new Promise((resolve) => {
		// 查找设置面板的滚动容器
		const settingsContent = document.querySelector(
			'[data-tour="settings-content"]',
		);
		if (settingsContent) {
			settingsContent.scrollTo({ top: 0, behavior: "smooth" });
			// 等待滚动完成
			setTimeout(resolve, 300);
		} else {
			resolve();
		}
	});
}

/**
 * Hook for managing the onboarding tour
 * Provides methods to start, skip, and check tour status
 */
export function useOnboardingTour() {
	const { hasCompletedTour, completeTour, setCurrentStep } =
		useOnboardingStore();
	const { setDockDisplayMode } = useUiStore();
	const { openSettings } = useOpenSettings();
	const t = useTranslations("onboarding");
	const driverRef = useRef<Driver | null>(null);

	/**
	 * Create and start the driver tour
	 */
	const createAndStartTour = useCallback(() => {
		// 初始保持 dock 自动隐藏模式
		setDockDisplayMode("auto-hide");

		const driverObj = driver({
			showProgress: true,
			progressText: "{{current}} / {{total}}",
			allowClose: true,
			overlayColor: "#000",
			overlayOpacity: 0.7,
			stagePadding: 10,
			stageRadius: 8,
			animate: true,
			smoothScroll: true,
			allowKeyboardControl: true,

			// Button text
			nextBtnText: t("nextBtn"),
			prevBtnText: t("prevBtn"),
			doneBtnText: t("doneBtn"),

			// Custom popover class for styling
			popoverClass: "onboarding-popover",

			// Lifecycle hooks
			onHighlightStarted: (_element, _step, { state }) => {
				setCurrentStep(state.activeIndex ?? null);
			},
			onDestroyed: () => {
				completeTour();
				setCurrentStep(null);
				// 引导结束后恢复自动隐藏模式并隐藏触发区域
				setDockDisplayMode("auto-hide");
				window.dispatchEvent(new Event("onboarding:hide-dock-trigger-zone"));
			},

			steps: [
				// Step 1: Welcome modal - 同时打开设置面板准备下一步
				{
					popover: {
						title: t("welcomeTitle"),
						description: t("welcomeDescription"),
						side: "over" as const,
						align: "center" as const,
					},
					onHighlightStarted: () => {
						// 在欢迎步骤就打开设置面板，为下一步做准备
						openSettings();
						// 滚动到顶部
						setTimeout(() => {
							scrollSettingsPanelToTop();
						}, 200);
					},
				},
				// Step 2: API Key 配置
				{
					element: "#llm-api-key",
					popover: {
						title: t("apiKeyStepTitle"),
						description: t("apiKeyStepDescription"),
						side: "bottom" as const,
						align: "start" as const,
					},
					onHighlightStarted: () => {
						// 确保元素可见
						const element = document.getElementById("llm-api-key");
						if (element) {
							element.scrollIntoView({ behavior: "smooth", block: "center" });
						}
					},
				},
				// Step 3: 引导用户下移鼠标（高亮触发区域）
				{
					element: '[data-tour="dock-trigger-zone"]',
					popover: {
						title: t("dockTriggerTitle"),
						description: t("dockTriggerDescription"),
						side: "top" as const,
						align: "center" as const,
					},
					onHighlightStarted: () => {
						// 显示触发区域高亮
						window.dispatchEvent(new Event("onboarding:show-dock-trigger-zone"));
						// 确保 dock 处于自动隐藏模式
						setDockDisplayMode("auto-hide");
						// 让 overlay 允许点击穿透，这样用户可以点击 BottomDock
						const overlay = document.querySelector(".driver-overlay");
						if (overlay) {
							(overlay as HTMLElement).style.pointerEvents = "none";
						}
					},
				},
				// Step 4: Bottom Dock 功能介绍
				{
					element: '[data-tour="bottom-dock"]',
					popover: {
						title: t("dockStepTitle"),
						description: t("dockStepDescription"),
						side: "top" as const,
						align: "center" as const,
					},
					onHighlightStarted: () => {
						// 隐藏触发区域
						window.dispatchEvent(new Event("onboarding:hide-dock-trigger-zone"));
						// 固定显示 dock
						setDockDisplayMode("fixed");
						// 恢复 overlay 的点击阻止功能
						const overlay = document.querySelector(".driver-overlay");
						if (overlay) {
							(overlay as HTMLElement).style.pointerEvents = "";
						}
					},
				},
				// Step 5: 右键点击引导（高亮 Panel B 的 dock item）
				{
					element: '[data-tour="dock-item-panelB"]',
					popover: {
						title: t("dockRightClickTitle"),
						description: t("dockRightClickDescription"),
						side: "top" as const,
						align: "center" as const,
					},
					onHighlightStarted: () => {
						// 让 overlay 允许点击穿透，这样用户可以右键点击
						const overlay = document.querySelector(".driver-overlay");
						if (overlay) {
							(overlay as HTMLElement).style.pointerEvents = "none";
						}

						// 监听 Panel B 上的右键点击事件
						const panelBElement = document.querySelector(
							'[data-tour="dock-item-panelB"]',
						);
						if (panelBElement) {
							const handleContextMenu = () => {
								// 用户已右键点击，菜单会由 BottomDock 自动打开
								// 短暂延迟后进入下一步，等待菜单渲染
								setTimeout(() => {
									driverObj.moveNext();
								}, 100);
								// 移除监听器
								panelBElement.removeEventListener(
									"contextmenu",
									handleContextMenu,
								);
							};
							panelBElement.addEventListener("contextmenu", handleContextMenu);

							// 存储清理函数
							(window as unknown as Record<string, () => void>)
								.__onboardingContextMenuCleanup = () => {
								panelBElement.removeEventListener(
									"contextmenu",
									handleContextMenu,
								);
							};
						}
					},
					onDeselected: () => {
						// 清理事件监听器
						const cleanup = (window as unknown as Record<string, () => void>)
							.__onboardingContextMenuCleanup;
						if (cleanup) {
							cleanup();
							delete (window as unknown as Record<string, () => void>)
								.__onboardingContextMenuCleanup;
						}

						// 恢复 overlay 的点击阻止功能
						const overlay = document.querySelector(".driver-overlay");
						if (overlay) {
							(overlay as HTMLElement).style.pointerEvents = "";
						}

						// 如果菜单还没打开（用户点击了"下一步"按钮），则程序化打开菜单
						const menu = document.querySelector(
							'[data-tour="panel-selector-menu"]',
						);
						if (!menu) {
							window.dispatchEvent(
								new CustomEvent("onboarding:open-dock-menu", {
									detail: { position: "panelB" },
								}),
							);
						}
					},
				},
				// Step 6: 右键菜单高亮（同时高亮 Panel B 和菜单）
				{
					element: '[data-tour="panel-selector-menu"]',
					popover: {
						title: t("dockMenuTitle"),
						description: t("dockMenuDescription"),
						side: "left" as const,
						align: "start" as const,
					},
					onHighlightStarted: () => {
						// 确保菜单已打开（如果从其他方式进入此步骤）
						const menu = document.querySelector(
							'[data-tour="panel-selector-menu"]',
						);
						if (!menu) {
							window.dispatchEvent(
								new CustomEvent("onboarding:open-dock-menu", {
									detail: { position: "panelB" },
								}),
							);
						}

						// 让 overlay 允许点击穿透，让用户可以点击菜单项
						const overlay = document.querySelector(".driver-overlay");
						if (overlay) {
							(overlay as HTMLElement).style.pointerEvents = "none";
						}

						// 监听面板选择事件，用户选择任意面板后自动进入下一步
						const handlePanelSelected = () => {
							// 短暂延迟后进入下一步，让面板切换动画完成
							setTimeout(() => {
								driverObj.moveNext();
							}, 150);
							// 移除监听器
							window.removeEventListener(
								"onboarding:panel-selected",
								handlePanelSelected,
							);
						};
						window.addEventListener(
							"onboarding:panel-selected",
							handlePanelSelected,
						);

						// 存储清理函数
						(window as unknown as Record<string, () => void>)
							.__onboardingPanelSelectedCleanup = () => {
							window.removeEventListener(
								"onboarding:panel-selected",
								handlePanelSelected,
							);
						};
					},
					onDeselected: () => {
						// 清理事件监听器
						const cleanup = (window as unknown as Record<string, () => void>)
							.__onboardingPanelSelectedCleanup;
						if (cleanup) {
							cleanup();
							delete (window as unknown as Record<string, () => void>)
								.__onboardingPanelSelectedCleanup;
						}

						// 恢复 overlay 的点击阻止功能
						const overlay = document.querySelector(".driver-overlay");
						if (overlay) {
							(overlay as HTMLElement).style.pointerEvents = "";
						}
					},
				},
				// Step 7: Completion modal
				{
					popover: {
						title: t("completeTitle"),
						description: t("completeDescription"),
						side: "over" as const,
						align: "center" as const,
					},
				},
			],
		});

		driverRef.current = driverObj;
		driverObj.drive();
	}, [completeTour, setCurrentStep, setDockDisplayMode, openSettings, t]);

	/**
	 * Start the onboarding tour (only if not completed)
	 */
	const startTour = useCallback(() => {
		if (hasCompletedTour) return;
		createAndStartTour();
	}, [hasCompletedTour, createAndStartTour]);

	/**
	 * Restart the tour (reset state and start immediately)
	 * This is used when the user wants to see the tour again
	 */
	const restartTour = useCallback(() => {
		// Reset the tour state first
		useOnboardingStore.getState().resetTour();
		// Start the tour after a short delay to ensure state is updated
		setTimeout(() => {
			createAndStartTour();
		}, 100);
	}, [createAndStartTour]);

	/**
	 * Skip the tour without completing it
	 */
	const skipTour = useCallback(() => {
		if (driverRef.current) {
			driverRef.current.destroy();
		}
		completeTour();
	}, [completeTour]);

	/**
	 * Reset the tour state to allow re-onboarding
	 */
	const resetTour = useCallback(() => {
		useOnboardingStore.getState().resetTour();
	}, []);

	return {
		startTour,
		restartTour,
		skipTour,
		resetTour,
		hasCompletedTour,
	};
}
