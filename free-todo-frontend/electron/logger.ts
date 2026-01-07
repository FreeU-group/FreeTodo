/**
 * Electron 主进程日志服务
 * 封装日志逻辑，支持不同级别和来源标记
 */

import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { LOG_CONFIG } from "./config";

/**
 * 日志级别枚举
 */
type LogLevel = "INFO" | "WARN" | "ERROR" | "FATAL";

/**
 * 日志服务类
 * 提供统一的日志记录接口，支持文件写入和控制台输出
 */
class Logger {
	private logFile: string;
	private logDir: string;

	constructor() {
		this.logDir = app.getPath("logs");
		this.logFile = path.join(this.logDir, LOG_CONFIG.fileName);
		this.ensureLogDir();
	}

	/**
	 * 确保日志目录存在
	 */
	private ensureLogDir(): void {
		try {
			if (!fs.existsSync(this.logDir)) {
				fs.mkdirSync(this.logDir, { recursive: true });
			}
		} catch {
			// 忽略目录创建错误
		}
	}

	/**
	 * 写入日志到文件
	 */
	private write(level: LogLevel, message: string, source?: string): void {
		try {
			const timestamp = new Date().toISOString();
			const sourceTag = source ? `[${source}] ` : "";
			const logLine = `[${timestamp}] [${level}] ${sourceTag}${message}\n`;
			fs.appendFileSync(this.logFile, logLine);
		} catch {
			// 忽略写入错误
		}
	}

	/**
	 * 获取日志文件路径
	 */
	getLogFilePath(): string {
		return this.logFile;
	}

	/**
	 * 记录信息级别日志
	 */
	info(message: string, source?: string): void {
		this.write("INFO", message, source);
	}

	/**
	 * 记录警告级别日志
	 */
	warn(message: string, source?: string): void {
		this.write("WARN", message, source);
	}

	/**
	 * 记录错误级别日志
	 */
	error(message: string, source?: string): void {
		this.write("ERROR", message, source);
	}

	/**
	 * 记录致命错误级别日志
	 */
	fatal(message: string, source?: string): void {
		this.write("FATAL", message, source);
	}

	/**
	 * 记录子进程标准输出
	 */
	stdout(source: string, data: string): void {
		const trimmed = data.trim();
		if (trimmed) {
			this.write("INFO", trimmed, `${source} STDOUT`);
		}
	}

	/**
	 * 记录子进程标准错误输出
	 */
	stderr(source: string, data: string): void {
		const trimmed = data.trim();
		if (trimmed) {
			this.write("INFO", trimmed, `${source} STDERR`);
		}
	}

	/**
	 * 记录带堆栈信息的错误
	 */
	errorWithStack(message: string, error: Error, source?: string): void {
		this.error(message, source);
		if (error.stack) {
			this.error(`Stack: ${error.stack}`, source);
		}
	}

	/**
	 * 同时输出到控制台和日志文件
	 */
	console(message: string, source?: string): void {
		console.log(message);
		this.info(message, source);
	}

	/**
	 * 同时输出错误到控制台和日志文件
	 */
	consoleError(message: string, source?: string): void {
		console.error(message);
		this.error(message, source);
	}
}

/**
 * 全局日志服务实例
 */
export const logger = new Logger();
