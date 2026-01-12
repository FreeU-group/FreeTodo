"use client";

import { driver, type Driver } from "driver.js";
import { useTranslations } from "next-intl";
import { useCallback, useRef } from "react";
import { useOnboardingStore } from "@/lib/store/onboarding-store";
import { useUiStore } from "@/lib/store/ui-store";
import { useOpenSettings } from "./useOpenSettings";

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
		// 初始保持 dock 自动隐藏模式，不要一开始就固定显示
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
				// 引导结束后恢复自动隐藏模式
				setDockDisplayMode("auto-hide");
			},

			steps: [
				// Step 1: Welcome modal
				{
					popover: {
						title: t("welcomeTitle"),
						description: t("welcomeDescription"),
						side: "over" as const,
						align: "center" as const,
					},
				},
				// Step 2: Settings toggle button
				{
					element: '[data-tour="settings-toggle"]',
					popover: {
						title: t("settingsStepTitle"),
						description: t("settingsStepDescription"),
						side: "bottom" as const,
						align: "end" as const,
					},
					onHighlightStarted: () => {
						// Open settings panel when this step starts
						openSettings();
					},
				},
				// Step 3: LLM API Key input
				{
					element: "#llm-api-key",
					popover: {
						title: t("apiKeyStepTitle"),
						description: t("apiKeyStepDescription"),
						side: "bottom" as const,
						align: "start" as const,
					},
					onHighlightStarted: () => {
						// Ensure settings is open and scroll to the element
						const element = document.getElementById("llm-api-key");
						if (element) {
							element.scrollIntoView({ behavior: "smooth", block: "center" });
						}
					},
				},
				// Step 4: Dock 从底部滑出的动效演示
				{
					element: '[data-tour="bottom-dock"]',
					popover: {
						title: t("dockStepTitle"),
						description: t("dockStepDescription"),
						side: "top" as const,
						align: "center" as const,
					},
					onHighlightStarted: () => {
						// 先确保 dock 隐藏，然后滑出显示，让用户感知动效
						setDockDisplayMode("auto-hide");
						// 短暂延迟后显示 dock，形成「滑出」效果
						setTimeout(() => {
							setDockDisplayMode("fixed");
						}, 300);
					},
				},
				// Step 5: 右键菜单高亮 - 程序化打开菜单并高亮
				{
					element: '[data-tour="panel-selector-menu"]',
					popover: {
						title: t("dockRightClickTitle"),
						description: t("dockRightClickDescription"),
						side: "left" as const,
						align: "end" as const,
					},
					onHighlightStarted: () => {
						// 程序化打开设置面板的右键菜单
						window.dispatchEvent(
							new CustomEvent("onboarding:open-dock-menu", {
								detail: { feature: "settings" },
							}),
						);
					},
					onDeselected: () => {
						// 离开此步骤时关闭菜单（通过点击其他地方触发）
					},
				},
				// Step 6: Completion modal
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
