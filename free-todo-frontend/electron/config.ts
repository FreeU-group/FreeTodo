/**
 * Electron 主进程配置常量
 * 集中管理所有配置项，消除魔法数字
 */

/**
 * 端口配置
 */
export const PORT_CONFIG = {
	/** 前端服务器端口配置 */
	frontend: {
		/** 默认端口（可通过 PORT 环境变量覆盖） */
		default: Number.parseInt(process.env.PORT || "3001", 10),
		/** 端口探测最大尝试次数 */
		maxAttempts: 100,
	},
	/** 后端服务器端口配置 */
	backend: {
		/** 默认端口（可通过 BACKEND_PORT 环境变量覆盖） */
		default: Number.parseInt(process.env.BACKEND_PORT || "8000", 10),
		/** 端口探测最大尝试次数 */
		maxAttempts: 100,
	},
} as const;

/**
 * 超时配置（毫秒）
 */
export const TIMEOUT_CONFIG = {
	/** 等待后端服务器就绪的超时时间（3 分钟） */
	backendReady: 180_000,
	/** 等待前端服务器就绪的超时时间（30 秒） */
	frontendReady: 30_000,
	/** 单次健康检查的超时时间（5 秒） */
	healthCheck: 5_000,
	/** 健康检查重试间隔（500 毫秒） */
	healthCheckRetry: 500,
	/** 应用退出延迟（让用户看到错误消息，3 秒） */
	quitDelay: 3_000,
} as const;

/**
 * 健康检查间隔配置（毫秒）
 */
export const HEALTH_CHECK_INTERVAL = {
	/** 前端服务器健康检查间隔（10 秒） */
	frontend: 10_000,
	/** 后端服务器健康检查间隔（30 秒） */
	backend: 30_000,
} as const;

/**
 * 窗口配置
 */
export const WINDOW_CONFIG = {
	/** 初始宽度 */
	width: 1200,
	/** 初始高度 */
	height: 800,
	/** 最小宽度 */
	minWidth: 800,
	/** 最小高度 */
	minHeight: 600,
	/** 背景颜色（深色主题） */
	backgroundColor: "#1a1a1a",
} as const;

/**
 * 日志配置
 */
export const LOG_CONFIG = {
	/** 日志文件名 */
	fileName: "freetodo.log",
	/** 日志缓冲区显示的最大字符数 */
	bufferDisplayLimit: 2000,
	/** 错误对话框中显示的日志最大字符数 */
	dialogDisplayLimit: 1000,
} as const;

/**
 * 进程配置
 */
export const PROCESS_CONFIG = {
	/** 后端可执行文件名 */
	backendExecName: process.platform === "win32" ? "lifetrace.exe" : "lifetrace",
	/** 后端数据目录名 */
	backendDataDir: "lifetrace-data",
} as const;

/**
 * 判断当前是否为开发模式
 * 打包的应用始终为生产模式
 */
export function isDevelopment(isPackaged: boolean): boolean {
	return !isPackaged && process.env.NODE_ENV !== "production";
}
