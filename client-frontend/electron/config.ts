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
 * 窗口模式类型
 * - island: 灵动岛模式（默认，透明悬浮窗）
 * - web: Web 界面模式（普通窗口，类似浏览器）
 */
export type WindowMode = "island" | "web";

/**
 * 编译时注入的默认窗口模式
 * 由 esbuild 在构建时通过 define 选项设置
 * 如果未定义，默认为 "web"
 */
declare const __DEFAULT_WINDOW_MODE__: string | undefined;

/**
 * 后端运行时类型
 * - script: 使用系统 Python + venv
 * - pyinstaller: 使用 PyInstaller 打包的可执行文件
 */
export type BackendRuntime = "script" | "pyinstaller";

/**
 * 编译时注入的默认后端运行时
 */
declare const __DEFAULT_BACKEND_RUNTIME__: string | undefined;

/**
 * 获取当前窗口模式
 *
 * 优先级：
 * 1. 运行时环境变量 WINDOW_MODE（方便调试）
 * 2. 编译时注入的默认值 __DEFAULT_WINDOW_MODE__
 * 3. 硬编码默认值 "web"
 */
export function getWindowMode(): WindowMode {
	// 运行时环境变量优先（方便调试和开发）
	const envMode = process.env.WINDOW_MODE?.toLowerCase();
	if (envMode === "web" || envMode === "island") {
		return envMode;
	}

	// 编译时注入的默认值
	try {
		const buildTimeDefault = typeof __DEFAULT_WINDOW_MODE__ !== "undefined"
			? __DEFAULT_WINDOW_MODE__
			: undefined;
		if (buildTimeDefault === "web") {
			return "web";
		}
	} catch {
		// __DEFAULT_WINDOW_MODE__ 未定义，使用硬编码默认值
	}

	// 硬编码默认值
	return "web";
}

/**
 * 获取后端运行时类型
 *
 * 优先级：
 * 1. 运行时环境变量 FREETODO_BACKEND_RUNTIME
 * 2. 编译时注入的默认值 __DEFAULT_BACKEND_RUNTIME__
 * 3. 硬编码默认值 "script"
 */
export function getBackendRuntime(): BackendRuntime {
	const envRuntime = process.env.FREETODO_BACKEND_RUNTIME?.toLowerCase();
	if (envRuntime === "script" || envRuntime === "pyinstaller") {
		return envRuntime;
	}

	try {
		const buildTimeDefault =
			typeof __DEFAULT_BACKEND_RUNTIME__ !== "undefined"
				? __DEFAULT_BACKEND_RUNTIME__
				: undefined;
		if (buildTimeDefault === "pyinstaller") {
			return "pyinstaller";
		}
	} catch {
		// ignore
	}

	return "script";
}

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
	/** 后端入口脚本（相对 backend 根目录） */
	backendEntryScript: "lifetrace/scripts/start_backend.py",
	/** 后端可执行文件名称 */
	backendExecutable:
		process.platform === "win32" ? "lifetrace.exe" : "lifetrace",
	/** 后端依赖清单（相对 backend 根目录） */
	backendRequirementsFile: "requirements-runtime.txt",
	/** 后端运行时目录名（应用安装目录下） */
	backendRuntimeDir: "runtime",
	/** 后端虚拟环境目录名（运行时目录下） */
	backendVenvDir: "python-venv",
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
