/**
 * 日志系统模块
 * 提供统一的日志记录功能
 */

import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

// 日志文件路径
export const logFile = path.join(app.getPath("logs"), "freetodo.log");

/**
 * 安全地写入日志文件
 */
export function logToFile(message: string): void {
	try {
		const logDir = path.dirname(logFile);
		if (!fs.existsSync(logDir)) {
			fs.mkdirSync(logDir, { recursive: true });
		}
		const timestamp = new Date().toISOString();
		fs.appendFileSync(logFile, `[${timestamp}] ${message}\n`);
	} catch (_error) {
		// 如果无法写入日志文件，忽略错误
	}
}
