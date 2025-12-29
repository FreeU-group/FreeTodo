"use client";

import { useEffect } from "react";

/**
 * 滚动条控制器组件
 * 监听滚动和键盘事件，控制滚动条的显示/隐藏
 * 只显示正在滚动的 panel 的滚动条
 */
export function ScrollbarController() {
	useEffect(() => {
		const hideTimeouts = new Map<HTMLElement, NodeJS.Timeout>();

		/**
		 * 查找滚动事件发生的 panel 容器
		 */
		const findPanelContainer = (
			target: EventTarget | null,
		): HTMLElement | null => {
			if (!(target instanceof HTMLElement)) return null;

			// 向上查找，找到带有 data-panel 属性的元素
			let element: HTMLElement | null = target;
			while (element) {
				if (element.dataset.panel) {
					return element;
				}
				element = element.parentElement;
			}

			return null;
		};

		const showScrollbar = (panelElement: HTMLElement) => {
			// 清除该 panel 之前的隐藏定时器
			const existingTimeout = hideTimeouts.get(panelElement);
			if (existingTimeout) {
				clearTimeout(existingTimeout);
				hideTimeouts.delete(panelElement);
			}

			// 添加显示类到对应的 panel
			panelElement.classList.add("scrollbar-visible");
		};

		const hideScrollbar = (panelElement: HTMLElement) => {
			// 清除之前的定时器
			const existingTimeout = hideTimeouts.get(panelElement);
			if (existingTimeout) {
				clearTimeout(existingTimeout);
			}

			// 2秒后隐藏滚动条
			const timeout = setTimeout(() => {
				panelElement.classList.remove("scrollbar-visible");
				hideTimeouts.delete(panelElement);
			}, 2000);

			hideTimeouts.set(panelElement, timeout);
		};

		// 处理滚动事件（包括所有滚动容器）
		const handleWheel = (event: WheelEvent) => {
			// 检查是否有垂直或水平滚动
			if (event.deltaY !== 0 || event.deltaX !== 0) {
				const panelElement = findPanelContainer(event.target);
				if (panelElement) {
					showScrollbar(panelElement);
					hideScrollbar(panelElement);
				}
			}
		};

		// 处理滚动容器的滚动事件
		const handleScroll = (event: Event) => {
			const panelElement = findPanelContainer(event.target);
			if (panelElement) {
				showScrollbar(panelElement);
				hideScrollbar(panelElement);
			}
		};

		// 处理键盘滚动事件
		const handleKeyDown = (event: KeyboardEvent) => {
			// 检查是否是滚动相关的按键
			const scrollKeys = [
				"ArrowUp",
				"ArrowDown",
				"ArrowLeft",
				"ArrowRight",
				"PageUp",
				"PageDown",
				"Home",
				"End",
			];

			// 如果按下了滚动键，且没有按 Ctrl/Cmd（避免与快捷键冲突）
			if (scrollKeys.includes(event.key) && !event.ctrlKey && !event.metaKey) {
				const panelElement = findPanelContainer(event.target);
				if (panelElement) {
					showScrollbar(panelElement);
					hideScrollbar(panelElement);
				}
			} else if (
				event.key === " " &&
				!event.ctrlKey &&
				!event.metaKey &&
				event.target instanceof HTMLElement &&
				!["INPUT", "TEXTAREA"].includes(event.target.tagName)
			) {
				// Space 键只在非输入元素时触发
				const panelElement = findPanelContainer(event.target);
				if (panelElement) {
					showScrollbar(panelElement);
					hideScrollbar(panelElement);
				}
			}
		};

		// 处理触摸滚动（移动设备）
		let touchStartY = 0;
		let touchStartX = 0;
		let isTouching = false;

		const handleTouchStart = (event: TouchEvent) => {
			touchStartY = event.touches[0].clientY;
			touchStartX = event.touches[0].clientX;
			isTouching = true;
		};

		const handleTouchMove = (event: TouchEvent) => {
			if (!isTouching) return;

			const touchY = event.touches[0].clientY;
			const touchX = event.touches[0].clientX;

			// 检查是否有滚动
			if (
				Math.abs(touchY - touchStartY) > 5 ||
				Math.abs(touchX - touchStartX) > 5
			) {
				const panelElement = findPanelContainer(event.target);
				if (panelElement) {
					showScrollbar(panelElement);
					hideScrollbar(panelElement);
				}
			}
		};

		const handleTouchEnd = () => {
			isTouching = false;
		};

		// 添加事件监听器
		// 使用捕获阶段来捕获所有滚动事件
		window.addEventListener("wheel", handleWheel, { passive: true });
		window.addEventListener("scroll", handleScroll, {
			passive: true,
			capture: true,
		});
		window.addEventListener("keydown", handleKeyDown);
		window.addEventListener("touchstart", handleTouchStart, {
			passive: true,
		});
		window.addEventListener("touchmove", handleTouchMove, { passive: true });
		window.addEventListener("touchend", handleTouchEnd, { passive: true });

		// 清理函数
		return () => {
			window.removeEventListener("wheel", handleWheel);
			window.removeEventListener("scroll", handleScroll, { capture: true });
			window.removeEventListener("keydown", handleKeyDown);
			window.removeEventListener("touchstart", handleTouchStart);
			window.removeEventListener("touchmove", handleTouchMove);
			window.removeEventListener("touchend", handleTouchEnd);

			// 清理所有定时器
			for (const timeout of hideTimeouts.values()) {
				clearTimeout(timeout);
			}
			hideTimeouts.clear();

			// 移除所有 panel 的滚动条显示类
			const allPanels = document.querySelectorAll("[data-panel]");
			for (const panel of allPanels) {
				panel.classList.remove("scrollbar-visible");
			}
		};
	}, []);

	return null; // 此组件不渲染任何内容
}
