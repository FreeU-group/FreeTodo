/**
 * Panel 窗口调整大小 Hook
 * 处理 Panel 窗口的宽度调整逻辑
 */

import { useCallback } from "react";
import { getElectronAPI } from "@/lib/utils/electron-api";

interface UsePanelWindowResizeOptions {
	panelWindowWidth: number;
	panelWindowPosition: { x: number; y: number };
	panelWindowHeight: number;
	isElectron: boolean;
	MIN_PANEL_WIDTH: number;
	MAX_PANEL_WIDTH: number;
	MIN_PANEL_HEIGHT: number;
	MAX_PANEL_HEIGHT: number;
	setPanelWindowWidth: (width: number) => void;
	setPanelWindowPosition: (position: { x: number; y: number }) => void;
	setPanelWindowHeight: (height: number) => void;
	setIsResizingPanel: (isResizing: boolean) => void;
	setIsUserInteracting: (isInteracting: boolean) => void;
}

export function usePanelWindowResize({
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
}: UsePanelWindowResizeOptions) {
	const handlePanelResizeStart = useCallback((e: React.PointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>, resizeSide: 'left' | 'right' | 'top' | 'bottom') => {
		e.preventDefault();
		e.stopPropagation();

		// ✅ 设置交互标志，防止定时器干扰
		setIsUserInteracting(true);
		setIsResizingPanel(true);

		// ✅ 立即禁用点击穿透（只调用一次，避免频繁 IPC 调用）
		if (isElectron) {
			const api = getElectronAPI();
			api.electronAPI?.setIgnoreMouseEvents?.(false);
		}

		const startX = e.clientX;
		const startY = e.clientY;
		const startWidth = panelWindowWidth;
		// ✅ 修复：参考左右调整的实现，只在开始时获取一次高度，避免卡顿
		// panelWindowHeight 是 PanelRegion 的高度（包括 Panels 容器 + BottomDock 60px）
		// 如果 panelWindowHeight 为 0，使用默认 PanelRegion 高度计算
		let actualStartHeight: number;
		if (panelWindowHeight > 0) {
			actualStartHeight = panelWindowHeight; // PanelRegion 高度
		} else {
			// 如果高度为 0，使用默认 PanelRegion 高度（参考左右调整，不查询 DOM）
			// PanelRegion 高度 = 窗口高度 - 顶部偏移(40px) - 标题栏(48px)
			actualStartHeight = typeof window !== 'undefined' ? window.innerHeight - 40 - 48 : 1000;
		}
		const startHeight = actualStartHeight; // 这是 PanelRegion 的高度
		const startXPosition = panelWindowPosition.x;
		const startYPosition = panelWindowPosition.y;

		// ✅ 参考左右调整的完美实现：不使用 requestAnimationFrame，直接更新状态
		const handlePointerMove = (moveEvent: PointerEvent | MouseEvent) => {
			if (resizeSide === 'top') {
				// ✅ 顶部调整：参考左边调整的逻辑
				// 向上拖拽（deltaY < 0）增加高度，向下拖拽（deltaY > 0）减少高度
				// deltaY = moveEvent.clientY - startY
				// 向上拖拽时，鼠标向上移动，deltaY < 0，高度应该增加
				// 向下拖拽时，鼠标向下移动，deltaY > 0，高度应该减少
				// 所以：newHeight = startHeight - deltaY
				const deltaY = moveEvent.clientY - startY;
				const newHeight = Math.max(
					MIN_PANEL_HEIGHT,
					Math.min(MAX_PANEL_HEIGHT, startHeight - deltaY)
				);
				// 当高度改变时，y 位置也需要调整，以保持底部边界不变
				// 高度增加了 deltaHeight，y 位置需要减少相同的量（向上移动）
				const deltaHeight = newHeight - startHeight;
				const newY = Math.max(0, startYPosition - deltaHeight);
				setPanelWindowHeight(newHeight);
				setPanelWindowPosition({ ...panelWindowPosition, y: newY });
			} else if (resizeSide === 'bottom') {
				// ✅ 底部调整：参考右边调整的逻辑
				// 向下拖拽（deltaY > 0）增加高度，向上拖拽（deltaY < 0）减少高度
				// deltaY = moveEvent.clientY - startY
				// 向下拖拽时，鼠标向下移动，deltaY > 0，高度应该增加
				// 向上拖拽时，鼠标向上移动，deltaY < 0，高度应该减少
				// 所以：newHeight = startHeight + deltaY
				const deltaY = moveEvent.clientY - startY;
				const newHeight = Math.max(
					MIN_PANEL_HEIGHT,
					Math.min(MAX_PANEL_HEIGHT, startHeight + deltaY)
				);
				// 底部调整时，y 位置不变，只改变高度
				setPanelWindowHeight(newHeight);
			} else if (resizeSide === 'left') {
				// 左边调整：向左拖拽增加宽度，向右拖拽减少宽度
				// deltaX > 0 表示向左移动（增加宽度），deltaX < 0 表示向右移动（减少宽度）
				const deltaX = startX - moveEvent.clientX;
				const newWidth = Math.max(
					MIN_PANEL_WIDTH,
					Math.min(MAX_PANEL_WIDTH, startWidth + deltaX)
				);
				// 当宽度改变时，x 位置也需要调整，以保持右边界不变
				// 宽度增加了 deltaWidth，x 位置需要减少相同的量
				const deltaWidth = newWidth - startWidth;
				const newX = Math.max(0, startXPosition - deltaWidth);
				setPanelWindowWidth(newWidth);
				setPanelWindowPosition({ ...panelWindowPosition, x: newX });
			} else {
				// 右边调整：向右拖拽增加宽度，向左拖拽减少宽度
				// deltaX < 0 表示向左移动（减少宽度），deltaX > 0 表示向右移动（增加宽度）
				const deltaX = moveEvent.clientX - startX;
				const newWidth = Math.max(
					MIN_PANEL_WIDTH,
					Math.min(MAX_PANEL_WIDTH, startWidth + deltaX)
				);
				// 右边调整时，x 位置不变，只改变宽度
				setPanelWindowWidth(newWidth);
			}
		};

		const handlePointerUp = () => {
			setIsResizingPanel(false);
			// ✅ 清除交互标志
			setIsUserInteracting(false);

			// ✅ 清理后确保点击穿透仍然关闭
			if (isElectron) {
				const api = getElectronAPI();
				api.electronAPI?.setIgnoreMouseEvents?.(false);
			}
			document.removeEventListener("pointermove", handlePointerMove);
			document.removeEventListener("pointerup", handlePointerUp);
			document.removeEventListener("mousemove", handlePointerMove);
			document.removeEventListener("mouseup", handlePointerUp);
		};

		// 同时监听 pointer 和 mouse 事件以确保兼容性
		document.addEventListener("pointermove", handlePointerMove);
		document.addEventListener("pointerup", handlePointerUp);
		document.addEventListener("mousemove", handlePointerMove);
		document.addEventListener("mouseup", handlePointerUp);
	}, [panelWindowWidth, panelWindowPosition, panelWindowHeight, isElectron, MIN_PANEL_WIDTH, MAX_PANEL_WIDTH, MIN_PANEL_HEIGHT, MAX_PANEL_HEIGHT, setPanelWindowWidth, setPanelWindowPosition, setPanelWindowHeight, setIsResizingPanel, setIsUserInteracting]);

	return { handlePanelResizeStart };
}
