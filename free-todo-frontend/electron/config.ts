/**
 * Electron 主进程配置常量
 * 集中管理所有配置项，消除魔法数字
 */

import { app } from "electron";

/**
 * 服务器模式类型
 * - dev: 开发模式（从源码运行或 pnpm dev）
 * - build: 打包模式（Electron 打包后运行）
 */
export type ServerMode = "dev" | "build";

/**
 * 获取当前服务器模式
 * 打包后的应用为 "build" 模式，开发时为 "dev" 模式
 */
export function getServerMode(): ServerMode {
	// 如果 app.isPackaged 为 true，说明是打包后的应用
	// 注意：此函数必须在 app ready 之后调用才能获得正确的 isPackaged 值
	// 但 PORT_CONFIG 是在模块加载时就需要的，所以我们使用环境变量来判断
	// 在开发模式下 NODE_ENV 通常不是 "production" 或者 app.isPackaged 为 false

	// 首先检查显式设置的环境变量
	if (process.env.SERVER_MODE === "build") {
		return "build";
	}
	if (process.env.SERVER_MODE === "dev") {
		return "dev";
	}

	// 尝试使用 app.isPackaged（如果 app 已经初始化）
	try {
		return app.isPackaged ? "build" : "dev";
	} catch {
		// app 未初始化，使用 NODE_ENV 判断
		return process.env.NODE_ENV === "production" ? "build" : "dev";
	}
}

/**
 * 端口范围配置
 * DEV 模式和 Build 模式使用不同的端口范围，避免冲突
 */
const PORT_RANGES = {
	/** DEV 模式端口范围 */
	dev: {
		frontend: 3001, // DEV 前端从 3001 开始
		backend: 8001, // DEV 后端从 8001 开始
	},
	/** Build 模式端口范围 */
	build: {
		frontend: 3100, // Build 前端从 3100 开始
		backend: 8100, // Build 后端从 8100 开始
	},
} as const;

/**
 * 端口配置
 * 根据服务器模式动态选择端口范围
 */
export const PORT_CONFIG = {
	/** 前端服务器端口配置 */
	frontend: {
		/** 默认端口（可通过 PORT 环境变量覆盖） */
		get default(): number {
			if (process.env.PORT) {
				return Number.parseInt(process.env.PORT, 10);
			}
			const mode = getServerMode();
			return PORT_RANGES[mode].frontend;
		},
		/** 端口探测最大尝试次数 */
		maxAttempts: 50,
	},
	/** 后端服务器端口配置 */
	backend: {
		/** 默认端口（可通过 BACKEND_PORT 环境变量覆盖） */
		get default(): number {
			if (process.env.BACKEND_PORT) {
				return Number.parseInt(process.env.BACKEND_PORT, 10);
			}
			const mode = getServerMode();
			return PORT_RANGES[mode].backend;
		},
		/** 端口探测最大尝试次数 */
		maxAttempts: 50,
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
