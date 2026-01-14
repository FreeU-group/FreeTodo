import type messages from "./lib/i18n/messages/zh.json";

type Messages = typeof messages;

declare global {
	// Use type safe message keys with `auto-complete`
	interface IntlMessages extends Messages {}

	// Cookie Store API 类型声明
	interface CookieStoreSetOptions {
		name: string;
		value: string;
		expires?: number | Date;
		maxAge?: number;
		domain?: string;
		path?: string;
		sameSite?: "strict" | "lax" | "none";
		secure?: boolean;
		partitioned?: boolean;
	}

	interface CookieStoreApi {
		set(options: CookieStoreSetOptions): Promise<void>;
		set(name: string, value: string): Promise<void>;
		get(name: string): Promise<{ name: string; value: string } | null>;
		delete(name: string): Promise<void>;
	}

	/** 截图并提取待办的响应 */
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

	/** 待办更新事件数据 */
	interface TodosUpdatedData {
		createdCount: number;
	}

	interface Window {
		cookieStore?: CookieStoreApi;
		electronAPI?: {
			/**
			 * 显示系统通知
			 * @param data 通知数据
			 */
			showNotification: (data: {
				id: string;
				title: string;
				content: string;
				timestamp: string;
			}) => Promise<void>;

			/**
			 * 截图并提取待办事项
			 * 截取当前屏幕，发送给后端视觉模型分析，提取待办
			 */
			captureAndExtractTodos: () => Promise<CaptureAndExtractResponse>;

			/**
			 * 获取后端 URL
			 */
			getBackendUrl: () => Promise<string>;

			/**
			 * 切换悬浮窗显示状态
			 */
			toggleFloatingWindow: () => Promise<void>;

			/**
			 * 监听待办更新事件
			 * 当悬浮窗提取待办后，主窗口会收到此事件
			 */
			onTodosUpdated: (callback: (data: TodosUpdatedData) => void) => () => void;
		};
	}
}
