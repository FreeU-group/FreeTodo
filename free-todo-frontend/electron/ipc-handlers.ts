/**
 * IPC 通信处理器
 * 集中管理所有主进程与渲染进程之间的 IPC 通信
 */

import { BrowserWindow, ipcMain, net } from "electron";
import type { FloatingWindowManager } from "./floating-window-manager";
import { logger } from "./logger";
import {
	type NotificationData,
	showSystemNotification,
} from "./notification";
import type { WindowManager } from "./window-manager";

/** 截图并提取待办的响应类型 */
interface CaptureAndExtractResponse {
	success: boolean;
	message: string;
	extractedTodos: Array<{
		title: string;
		description?: string;
		confidence: number;
	}>;
	createdCount: number;
}

/**
 * 设置所有 IPC 处理器
 * @param windowManager 窗口管理器实例
 * @param floatingWindowManager 悬浮窗管理器实例（可选）
 */
export function setupIpcHandlers(
	windowManager: WindowManager,
	floatingWindowManager?: FloatingWindowManager,
): void {
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

	// 截图并发送给后端提取待办
	ipcMain.handle(
		"capture-and-extract-todos",
		async (): Promise<CaptureAndExtractResponse> => {
			try {
				if (!floatingWindowManager) {
					return {
						success: false,
						message: "悬浮窗管理器未初始化",
						extractedTodos: [],
						createdCount: 0,
					};
				}

				logger.info("Capturing screen for todo extraction...");

				// 截取屏幕
				const base64Image = await floatingWindowManager.captureScreen();
				if (!base64Image) {
					return {
						success: false,
						message: "截图失败",
						extractedTodos: [],
						createdCount: 0,
					};
				}

				// 移除 data:image/png;base64, 前缀
				const imageData = base64Image.replace(
					/^data:image\/\w+;base64,/,
					"",
				);

				// 发送给后端
				const backendUrl = floatingWindowManager.getBackendUrl();
				const response = await sendToBackend(backendUrl, imageData);

				logger.info(
					`Todo extraction completed: ${response.createdCount} todos created`,
				);

				// 如果创建了待办，通知所有窗口刷新待办列表
				if (response.success && response.createdCount > 0) {
					notifyTodosUpdated(response.createdCount);
				}

				return response;
			} catch (error) {
				const errorMsg = `Failed to capture and extract todos: ${error instanceof Error ? error.message : String(error)}`;
				logger.error(errorMsg);
				return {
					success: false,
					message: errorMsg,
					extractedTodos: [],
					createdCount: 0,
				};
			}
		},
	);

	// 获取后端 URL
	ipcMain.handle("get-backend-url", (): string => {
		return floatingWindowManager?.getBackendUrl() ?? "";
	});

	// 切换悬浮窗显示状态
	ipcMain.handle("toggle-floating-window", (): void => {
		floatingWindowManager?.toggle();
	});
}

/**
 * 通知所有窗口待办已更新
 */
function notifyTodosUpdated(createdCount: number): void {
	const allWindows = BrowserWindow.getAllWindows();
	for (const win of allWindows) {
		// 向所有窗口发送待办更新事件
		win.webContents.send("todos-updated", { createdCount });
	}
	logger.info(`Notified ${allWindows.length} windows about todos update`);
}

/**
 * 发送截图到后端进行待办提取
 */
async function sendToBackend(
	backendUrl: string,
	imageBase64: string,
): Promise<CaptureAndExtractResponse> {
	return new Promise((resolve, reject) => {
		const url = `${backendUrl}/api/floating-capture/extract-todos`;
		const postData = JSON.stringify({
			image_base64: imageBase64,
			create_todos: true,
		});

		const request = net.request({
			method: "POST",
			url,
		});

		request.setHeader("Content-Type", "application/json");

		let responseData = "";

		request.on("response", (response) => {
			response.on("data", (chunk) => {
				responseData += chunk.toString();
			});

			response.on("end", () => {
				try {
					const result = JSON.parse(responseData);
					resolve({
						success: result.success ?? false,
						message: result.message ?? "未知响应",
						extractedTodos:
							result.extracted_todos?.map(
								(todo: {
									title: string;
									description?: string;
									confidence: number;
								}) => ({
									title: todo.title,
									description: todo.description,
									confidence: todo.confidence,
								}),
							) ?? [],
						createdCount: result.created_count ?? 0,
					});
				} catch (error) {
					reject(new Error(`解析响应失败: ${error}`));
				}
			});

			response.on("error", (error) => {
				reject(error);
			});
		});

		request.on("error", (error) => {
			reject(error);
		});

		request.write(postData);
		request.end();
	});
}
