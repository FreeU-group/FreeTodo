/**
 * 配置管理模块
 * 集中管理环境变量、端口配置和全局状态
 */

import { app } from "electron";

// 强制生产模式：如果应用已打包，必须使用生产模式
// 即使 NODE_ENV 被设置为 development，打包的应用也应该运行生产服务器
export const isDev = !app.isPackaged && process.env.NODE_ENV !== "production";

// 检查是否启用灵动岛模式（透明窗口）
// 默认启用灵动岛模式，可以通过环境变量 ENABLE_DYNAMIC_ISLAND=false 禁用
export const enableDynamicIsland = process.env.ENABLE_DYNAMIC_ISLAND !== "false";

// 默认端口配置（从环境变量读取，如果未设置则使用默认值）
export const DEFAULT_FRONTEND_PORT = Number.parseInt(
	process.env.PORT || "3001",
	10,
);
export const DEFAULT_BACKEND_PORT = Number.parseInt(
	process.env.BACKEND_PORT || "8000",
	10,
);

// 动态端口（运行时确定，支持端口被占用时自动切换）
let actualFrontendPort: number = DEFAULT_FRONTEND_PORT;
let actualBackendPort: number = DEFAULT_BACKEND_PORT;

/**
 * 获取当前前端端口
 */
export function getActualFrontendPort(): number {
	return actualFrontendPort;
}

/**
 * 设置前端端口
 */
export function setActualFrontendPort(port: number): void {
	actualFrontendPort = port;
}

/**
 * 获取当前后端端口
 */
export function getActualBackendPort(): number {
	return actualBackendPort;
}

/**
 * 设置后端端口
 */
export function setActualBackendPort(port: number): void {
	actualBackendPort = port;
}

/**
 * 获取前端服务器 URL
 */
export function getServerUrl(): string {
	return `http://localhost:${actualFrontendPort}`;
}

/**
 * 获取后端服务器 URL
 */
export function getBackendUrl(): string {
	return `http://localhost:${actualBackendPort}`;
}
