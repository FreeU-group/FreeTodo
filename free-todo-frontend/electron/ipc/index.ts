/**
 * IPC 处理器模块导出
 */

export * from "./app-ipc";
export * from "./audio-ipc";
export * from "./notification-ipc";

import { setupWindowIpcHandlers } from "../window/window-ipc";
import { setupAppIpcHandlers } from "./app-ipc";
import { setupAudioIpcHandlers } from "./audio-ipc";
import { setupNotificationIpcHandlers } from "./notification-ipc";

/**
 * 设置所有 IPC 处理器
 */
export function setupAllIpcHandlers(): void {
	setupAudioIpcHandlers();
	setupNotificationIpcHandlers();
	setupAppIpcHandlers();
	setupWindowIpcHandlers();
}
