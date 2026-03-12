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
			 * 设置窗口是否忽略鼠标事件
			 */
			setIgnoreMouseEvents: (ignore: boolean, options?: { forward?: boolean }) => void;

			/**
			 * 获取屏幕信息
			 */
			getScreenInfo: () => Promise<{ screenWidth: number; screenHeight: number }>;

			/**
			 * 移动窗口到指定位置
			 */
			moveWindow: (x: number, y: number) => void;

			/**
			 * 获取窗口当前位置
			 */
			getWindowPosition: () => Promise<{ x: number; y: number }>;

			/**
			 * 退出应用
			 */
			quit: () => void;

			/**
			 * 设置窗口背景色
			 */
			setWindowBackgroundColor: (color: string) => void;

			/**
			 * 选择本地文件用于预览
			 */
			previewOpenFile?: () => Promise<{
				canceled: boolean;
				path?: string;
			}>;

			/**
			 * 读取本地文件内容用于预览
			 */
			previewReadFile?: (payload: {
				path: string;
				mode: "text" | "binary";
				maxBytes?: number;
			}) => Promise<{
				ok: boolean;
				path?: string;
				name?: string;
				size?: number;
				modifiedAt?: number;
				text?: string;
				base64?: string;
				error?: string;
			}>;

			/**
			 * 使用系统默认应用打开文件
			 */
			previewOpenExternal?: (path: string) => Promise<{
				ok: boolean;
				error?: string;
			}>;

			/**
			 * 在文件管理器中显示文件
			 */
			previewRevealInFolder?: (path: string) => Promise<{
				ok: boolean;
				error?: string;
			}>;

			/**
		 * 触发通知弹窗（由自动待办检测等事件调用）
		 * @param data 可选的弹窗内容数据
		 */
		triggerNotificationPopup?: (data?: { title?: string; message?: string }) => void;

		// ========== Island 动态岛相关 API ==========

		/**
		 * 调整 Island 窗口大小（切换模式）
		 * @param mode Island 模式: "FLOAT" | "POPUP" | "SIDEBAR" | "FULLSCREEN"
		 */
		islandResizeWindow: (mode: string) => void;

		/**
		 * 调整 SIDEBAR 模式窗口大小（多栏展开/收起）
		 * @param columnCount 栏数: 1 | 2 | 3
		 */
		islandResizeSidebar: (columnCount: number) => void;

		/**
		 * 显示 Island 窗口
		 */
		islandShow: () => void;

			/**
			 * 隐藏 Island 窗口
			 */
			islandHide: () => void;

		/**
		 * 切换 Island 窗口显示/隐藏
		 */
		islandToggle: () => void;

		/**
		 * Island 窗口拖拽开始（自定义拖拽）
		 * @param mouseY 鼠标屏幕 Y 坐标
		 */
		islandDragStart: (mouseY: number) => void;

		/**
		 * Island 窗口拖拽移动（自定义拖拽）
		 * @param mouseY 鼠标屏幕 Y 坐标
		 */
		islandDragMove: (mouseY: number) => void;

		/**
		 * Island 窗口拖拽结束（自定义拖拽）
		 */
		islandDragEnd: () => void;

		/**
		 * 设置 Island SIDEBAR 模式的固定状态
		 * @param isPinned true = 固定（始终在顶部），false = 非固定（正常窗口行为）
		 */
		islandSetPinned: (isPinned: boolean) => void;

		/**
		 * 监听 Island 窗口位置更新（拖拽时实时更新）
		 * @param callback 回调函数，接收位置数据 { y: number, screenHeight: number }
		 * @returns 清理函数，用于取消监听
		 */
		onIslandPositionUpdate: (callback: (data: { y: number; screenHeight: number }) => void) => () => void;

		/**
		 * 监听 Island 窗口锚点更新（模式切换时更新）
		 * @param callback 回调函数，接收锚点数据 { anchor: 'top' | 'bottom' | null, y: number }
		 * @returns 清理函数，用于取消监听
		 */
		onIslandAnchorUpdate: (callback: (data: { anchor: 'top' | 'bottom' | null; y: number }) => void) => () => void;

		// ========== Future Extensions ==========

			/**
			 * 监听 Island 窗口可见性变化（未来功能）
			 * @param callback 回调函数，接收可见性状态
			 */
			onIslandVisibilityChange?: (callback: (visible: boolean) => void) => void;

			/**
			 * 取消监听 Island 窗口可见性变化（未来功能）
			 */
			offIslandVisibilityChange?: (callback: (visible: boolean) => void) => void;
		};
	}
}
