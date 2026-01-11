/**
 * IPC 通信处理器
 * 集中管理所有主进程与渲染进程之间的 IPC 通信
 */

import { app, BrowserWindow, ipcMain, screen } from "electron";
import { enableDynamicIsland } from "./config";
import { logger } from "./logger";
import {
	type NotificationData,
	showSystemNotification,
} from "./notification";
import type { WindowManager } from "./window-manager";

/**
 * 设置所有 IPC 处理器
 * @param windowManager 窗口管理器实例
 */
export function setupIpcHandlers(windowManager: WindowManager): void {
	// 处理来自渲染进程的通知请求
	ipcMain.handle(
		"show-notification",
		async (_event, data: NotificationData) => {
			try {
				logger.info(`Received notification request: ${data.id} - ${data.title}`);
				showSystemNotification(data, windowManager);
			} catch (error) {
				const errorMsg = `Failed to handle notification request: ${error instanceof Error ? error.message : String(error)}`;
				logger.error(errorMsg);
				throw error;
			}
		},
	);

	// ========== 灵动岛相关 IPC 处理器 ==========

	// 设置窗口是否忽略鼠标事件（用于透明窗口点击穿透）
	ipcMain.on(
		"set-ignore-mouse-events",
		(event, ignore: boolean, options?: { forward?: boolean }) => {
			const win = BrowserWindow.fromWebContents(event.sender);
			if (win) {
				win.setIgnoreMouseEvents(ignore, options || {});
			}
		},
	);

	// 移动窗口到指定位置（用于拖拽）
	ipcMain.on("move-window", (event, x: number, y: number) => {
		const win = BrowserWindow.fromWebContents(event.sender);
		if (win && enableDynamicIsland) {
			win.setPosition(Math.round(x), Math.round(y));
		}
	});

	// 获取窗口当前位置
	ipcMain.handle("get-window-position", () => {
		const win = windowManager.getWindow();
		if (win) {
			const [x, y] = win.getPosition();
			return { x, y };
		}
		return { x: 0, y: 0 };
	});

	// 获取屏幕信息
	ipcMain.handle("get-screen-info", () => {
		const { width, height } = screen.getPrimaryDisplay().workAreaSize;
		return { screenWidth: width, screenHeight: height };
	});

	// 缓动函数：easeInOutCubic，用于更平滑的过渡（开始和结束都更平滑）
	function easeInOutCubic(t: number): number {
		return t < 0.5
			? 4 * t * t * t
			: 1 - (-2 * t + 2) ** 3 / 2;
	}

	// 缓动函数：easeOutCubic，用于平滑过渡
	function easeOutCubic(t: number): number {
		return 1 - (1 - t) ** 3;
	}

	// 动画函数：平滑过渡窗口边界
	// 使用高频率更新（约 60fps）让动画更流畅自然
	async function animateWindowBounds(
		win: BrowserWindow,
		startBounds: Electron.Rectangle,
		endBounds: Electron.Rectangle,
		duration: number,
		useEaseInOut: boolean = false,
	): Promise<void> {
		const startTime = Date.now();
		return new Promise((resolve) => {
			let timeoutId: NodeJS.Timeout | null = null;

			const animate = () => {
				const elapsed = Date.now() - startTime;
				const progress = Math.min(elapsed / duration, 1);
				// 根据参数选择缓动函数
				const eased = useEaseInOut
					? easeInOutCubic(progress)
					: easeOutCubic(progress);

				const currentBounds = {
					x: Math.round(startBounds.x + (endBounds.x - startBounds.x) * eased),
					y: Math.round(startBounds.y + (endBounds.y - startBounds.y) * eased),
					width: Math.round(
						startBounds.width + (endBounds.width - startBounds.width) * eased,
					),
					height: Math.round(
						startBounds.height +
							(endBounds.height - startBounds.height) * eased,
					),
				};
				win.setBounds(currentBounds);

				if (progress < 1) {
					timeoutId = setTimeout(animate, 16); // 约 60fps
				} else {
					resolve();
				}
			};

			animate();

			// 如果窗口被销毁，取消动画
			win.once("closed", () => {
				if (timeoutId !== null) {
					clearTimeout(timeoutId);
				}
			});
		});
	}

	// 折叠窗口到小尺寸（FLOAT 模式）
	ipcMain.handle("collapse-window", async () => {
		const win = windowManager.getWindow();
		const originalBounds = windowManager.getOriginalBounds();
		if (!win || !enableDynamicIsland || !originalBounds) return;

		// 恢复为不可调整大小和不可移动
		win.setResizable(false);
		win.setMovable(false);

		// 获取当前窗口边界，用于平滑过渡
		const currentBounds = win.getBounds();

		// 关键修复：在动画开始前，先让内容完全透明，避免窗口尺寸变化时看到内容闪现
		// 注意：前端状态已经在窗口动画开始前切换到 FLOAT 模式，所以这里的内容应该是 FLOAT 模式的小岛
		// 但为了保险，我们仍然让内容透明，直到窗口动画完成
		// 使用更长的过渡时间（0.35s），让透明度变化更平滑，避免瞬闪
		win.webContents
			.insertCSS(`
			html {
				border-radius: 0 !important;
				clip-path: none !important;
				opacity: 0 !important;
				transition: opacity 0.35s cubic-bezier(0.4, 0, 0.2, 1) !important;
				pointer-events: none !important;
			}
			body {
				border-radius: 0 !important;
				clip-path: none !important;
				opacity: 0 !important;
				transition: opacity 0.35s cubic-bezier(0.4, 0, 0.2, 1) !important;
				pointer-events: none !important;
			}
			#__next {
				border-radius: 0 !important;
				clip-path: none !important;
				opacity: 0 !important;
				transition: opacity 0.35s cubic-bezier(0.4, 0, 0.2, 1) !important;
				pointer-events: none !important;
			}
			#__next > div {
				border-radius: 0 !important;
				clip-path: none !important;
				opacity: 0 !important;
				transition: opacity 0.35s cubic-bezier(0.4, 0, 0.2, 1) !important;
				pointer-events: none !important;
			}
		`)
			.catch(() => {});

		// 等待 CSS 生效，确保内容完全透明后再开始窗口动画
		// 等待时间要大于透明度过渡时间（0.35s），确保透明度完全过渡完成，避免瞬闪
		await new Promise((resolve) => setTimeout(resolve, 400));

		// 从 PANEL/FULLSCREEN 模式切换到 FLOAT 模式：
		// - currentBounds: 当前窗口尺寸（PANEL 或 FULLSCREEN）
		// - originalBounds: FLOAT 模式的全屏尺寸（screenWidth x screenHeight）
		// - 如果窗口是最大化状态，先取消最大化，然后平滑过渡到 FLOAT 尺寸
		if (win.isMaximized()) {
			// 取消最大化，但保持内容透明
			// 注意：unmaximize() 有系统动画，我们需要等待它完成
			win.unmaximize();
			// 等待取消最大化完成，获取实际的窗口尺寸
			// 系统取消最大化的动画通常需要 200-300ms，我们等待 300ms 确保完成
			await new Promise((resolve) => setTimeout(resolve, 300));
			// 重新获取当前边界，因为取消最大化后尺寸可能变化
			const unmaximizedBounds = win.getBounds();
			// 使用与 Panel→Float 相同的动画时长（800ms）和缓动函数，保持一致的过渡体验
			await animateWindowBounds(win, unmaximizedBounds, originalBounds, 800, true);
		} else {
			// 使用与 Panel→Float 相同的动画时长（800ms）和缓动函数，保持一致的过渡体验
			await animateWindowBounds(win, currentBounds, originalBounds, 800, true);
		}

		// 确保窗口仍然置顶（FLOAT 模式需要）
		win.setAlwaysOnTop(true);

		// 重新启用点击穿透（FLOAT 模式需要）
		win.setIgnoreMouseEvents(true, { forward: true });

		// 注意：前端会在模式切换后重新渲染透明背景，opacity 会由前端控制
		// 这里不需要恢复 opacity，因为前端会处理
	});

	// 展开窗口到面板模式（PANEL 模式）
	ipcMain.handle("expand-window", async () => {
		const win = windowManager.getWindow();
		if (!win || !enableDynamicIsland) return;

		const { width: screenWidth, height: screenHeight } =
			screen.getPrimaryDisplay().workAreaSize;
		const expandedWidth = 500;
		const expandedHeight = Math.round(screenHeight * 0.8);
		const margin = 24;
		const top = Math.round((screenHeight - expandedHeight) / 2);

		// 必须设置可调整和可移动（因为创建时是 false）
		win.setResizable(true);
		win.setMovable(true);

		// 确保窗口仍然置顶
		win.setAlwaysOnTop(true);

		// 获取当前窗口边界，用于平滑过渡
		const currentBounds = win.getBounds();
		const endBounds = {
			x: screenWidth - expandedWidth - margin,
			y: top,
			width: expandedWidth,
			height: expandedHeight,
		};

		// 使用动画平滑过渡，避免瞬闪
		// 使用与 Panel→Float 相同的动画时长（800ms）和缓动函数，保持一致的过渡体验
		await animateWindowBounds(win, currentBounds, endBounds, 800, true);

		// 注入窗口圆角 CSS（Panel 模式，增大到16px），使用 clip-path 实现完美圆角
		win.webContents
			.insertCSS(`
			html {
				border-radius: 16px !important;
				overflow: hidden !important;
				clip-path: inset(0 round 16px) !important;
			}
			body {
				border-radius: 16px !important;
				overflow: hidden !important;
				clip-path: inset(0 round 16px) !important;
				background-color: transparent !important;
			}
			#__next {
				border-radius: 16px !important;
				overflow: hidden !important;
				clip-path: inset(0 round 16px) !important;
				background-color: transparent !important;
			}
			#__next > div {
				border-radius: 16px !important;
				overflow: hidden !important;
				clip-path: inset(0 round 16px) !important;
			}
		`)
			.catch(() => {});

		// 禁用点击穿透
		win.setIgnoreMouseEvents(false);
	});

	// 展开窗口到全屏模式（FULLSCREEN 模式）
	ipcMain.handle("expand-window-full", async () => {
		const win = windowManager.getWindow();
		if (!win || !enableDynamicIsland) return;

		// FULLSCREEN 模式改为使用「最大化」而不是固定宽高
		// 这样更符合用户预期：占满屏幕，由操作系统负责过渡动画（更自然，不突兀）
		// 固定窗口，不允许拖动和调整大小
		win.setResizable(false);
		win.setMovable(false);

		// 使用最大化而不是 setBounds 固定尺寸，避免在不同分辨率下出现黑边或尺寸不一致
		// 让操作系统来处理过渡动画，会比频繁 setBounds 更平滑
		// 注意：maximize() 本身已经有系统级的平滑动画，不需要额外动画
		if (!win.isMaximized()) {
			win.maximize();
		}

		// FULLSCREEN 模式下不需要任何圆角或 clip-path，恢复为真正的全屏矩形窗口
		// 这里重置 html/body/#__next 上的圆角样式，避免从 PANEL 切到 FULLSCREEN 时残留 16px 圆角
		win.webContents
			.insertCSS(`
			html {
				border-radius: 0 !important;
				clip-path: none !important;
				overflow: visible !important;
			}
			body {
				border-radius: 0 !important;
				clip-path: none !important;
				overflow: visible !important;
				background-color: transparent !important;
			}
			#__next {
				border-radius: 0 !important;
				clip-path: none !important;
				overflow: visible !important;
				background-color: transparent !important;
			}
			#__next > div {
				border-radius: 0 !important;
				clip-path: none !important;
				overflow: visible !important;
			}
		`)
			.catch(() => {});

		// FULLSCREEN 下仍然保持窗口置顶，确保在所有窗口之上
		win.setAlwaysOnTop(true);

		// 禁用点击穿透
		win.setIgnoreMouseEvents(false);
	});

	// 调整窗口大小（用于自定义缩放把手）
	// 左边伸缩时右边固定，上边伸缩时下边固定，确保流畅不卡顿
	// 关键：前端传递的是总移动量（相对于初始鼠标位置），后端基于初始边界和总移动量计算
	ipcMain.on(
		"resize-window",
		(event, totalDeltaX: number, totalDeltaY: number, position: string) => {
			const win = BrowserWindow.fromWebContents(event.sender);
			if (!win || !enableDynamicIsland) return;

			// 获取或初始化拖动状态（使用窗口对象的自定义属性）
			type ResizeAnchor = {
				initialBounds: { x: number; y: number; width: number; height: number };
				fixedRightEdge: number; // 固定的右边界（屏幕坐标）
				fixedBottomEdge: number; // 固定的下边界（屏幕坐标）
				lastPosition: string;
			};
			const winWithAnchor = win as unknown as { __resizeAnchor?: ResizeAnchor };
			let anchor = winWithAnchor.__resizeAnchor;

			// 如果位置改变或没有保存的初始边界，重新初始化
			if (!anchor || anchor.lastPosition !== position) {
				const bounds = win.getBounds();
				// 确保使用整数坐标，避免精度问题
				const fixedRightEdge = Math.round(bounds.x + bounds.width); // 固定的右边界（屏幕坐标）
				const fixedBottomEdge = Math.round(bounds.y + bounds.height); // 固定的下边界（屏幕坐标）
				anchor = {
					initialBounds: {
						x: Math.round(bounds.x),
						y: Math.round(bounds.y),
						width: Math.round(bounds.width),
						height: Math.round(bounds.height),
					},
					fixedRightEdge,
					fixedBottomEdge,
					lastPosition: position,
				};
				winWithAnchor.__resizeAnchor = anchor;
			}

			const {
				initialBounds,
				fixedRightEdge,
				fixedBottomEdge,
			} = anchor;

			let newWidth = initialBounds.width;
			let newHeight = initialBounds.height;
			let newX = initialBounds.x;
			let newY = initialBounds.y;

			// 根据位置和总移动量计算新尺寸和位置
			// 关键：基于初始边界和总移动量计算，确保固定边界不变
			switch (position) {
				case "right":
					// 右边伸缩：左边界固定
					newWidth = Math.max(200, initialBounds.width + totalDeltaX);
					break;
				case "left":
					// 左边伸缩：右边界固定（使用固定的屏幕坐标）
					// 先计算新的 x 位置
					newX = initialBounds.x + totalDeltaX;
					// 基于固定右边界计算宽度（确保右边界固定）
					newWidth = fixedRightEdge - newX;
					// 确保最小宽度
					if (newWidth < 200) {
						newWidth = 200;
						newX = fixedRightEdge - 200;
					}
					// 强制确保右边界固定：直接使用 fixedRightEdge 计算，避免任何累积误差
					newWidth = fixedRightEdge - newX;
					break;
				case "bottom":
					// 下边伸缩：上边界固定
					newHeight = Math.max(200, initialBounds.height + totalDeltaY);
					break;
				case "top":
					// 上边伸缩：下边界固定（使用固定的屏幕坐标）
					newY = initialBounds.y + totalDeltaY;
					newHeight = fixedBottomEdge - newY;
					if (newHeight < 200) {
						newHeight = 200;
						newY = fixedBottomEdge - 200;
					}
					break;
			}

			// 直接更新，保持流畅度
			// 使用 Math.round 确保整数坐标，避免精度问题导致的闪烁
			win.setBounds({
				x: Math.round(newX),
				y: Math.round(newY),
				width: Math.round(newWidth),
				height: Math.round(newHeight),
			});
		},
	);

	// 在指定位置展开窗口（Panel模式 - 从灵动岛上方展开）
	ipcMain.handle(
		"expand-window-at-position",
		(_event, x: number, y: number, width: number, height: number) => {
			const win = windowManager.getWindow();
			if (!win || !enableDynamicIsland) return;

			// 必须设置可调整和可移动（因为创建时是 false）
			win.setResizable(true);
			win.setMovable(true);

			// 直接使用传入的位置和尺寸，不做任何限制
			win.setBounds({
				x,
				y,
				width,
				height,
			});
		},
	);

	// 退出应用
	ipcMain.on("app-quit", () => {
		app.quit();
	});

	// 透明背景就绪通知
	// 注意：这个监听器现在在 window-manager.ts 的 create 方法内部注册，确保每次创建窗口时都重新注册
	// 这里保留一个全局监听器用于设置窗口背景色（如果需要）
	ipcMain.on("transparent-background-ready", () => {
		const win = windowManager.getWindow();
		if (win) {
			win.setBackgroundColor("#00000000");
		}
	});

	// 显示窗口（用于全屏模式）
	ipcMain.on("show-window", (event) => {
		const win = BrowserWindow.fromWebContents(event.sender);
		if (win) {
			win.show();
			// 全屏模式下，取消点击穿透，确保可以交互
			win.setIgnoreMouseEvents(false);
			// 确保窗口在最前面
			win.focus();
			logger.info("Window shown (fullscreen mode)");
		}
	});

	// 隐藏窗口（用于退出全屏模式）
	ipcMain.on("hide-window", (event) => {
		const win = BrowserWindow.fromWebContents(event.sender);
		if (win) {
			// 隐藏窗口前，重新启用点击穿透（如果启用灵动岛模式）
			if (enableDynamicIsland) {
				win.setIgnoreMouseEvents(true, { forward: true });
			}
			win.hide();
			logger.info("Window hidden (exit fullscreen mode)");
		}
	});
}
