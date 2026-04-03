/**
 * Electron 主进程日志服务
 * 封装日志逻辑，支持不同级别和来源标记
 * 每次启动生成新的日志文件，文件名格式：YYYY-MM-DD-N.log
 */

import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

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
		this.ensureLogDir();
		this.logFile = this.generateLogFileName();
		this.writeStartMarker();
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
	 * 获取当天的日期字符串（YYYY-MM-DD）
	 */
	private getTodayDateString(): string {
		const now = new Date();
		const year = now.getFullYear();
		const month = String(now.getMonth() + 1).padStart(2, "0");
		const day = String(now.getDate()).padStart(2, "0");
		return `${year}-${month}-${day}`;
	}

	/**
	 * 生成带日期和序列号的日志文件名
	 * 格式：YYYY-MM-DD-N.log（N 为当天第几次启动，从 0 开始）
	 */
	private generateLogFileName(): string {
		const dateStr = this.getTodayDateString();
		const pattern = new RegExp(`^${dateStr}-(\\d+)\\.log$`);

		// 扫描现有日志文件，找出当天的最大序列号
		let maxSeq = -1;
		try {
			const files = fs.readdirSync(this.logDir);
			for (const file of files) {
				const match = file.match(pattern);
				if (match) {
					const seq = Number.parseInt(match[1], 10);
					if (seq > maxSeq) {
						maxSeq = seq;
					}
				}
			}
		} catch {
			// 忽略读取错误
		}

		// 新的序列号 = 最大序列号 + 1
		const newSeq = maxSeq + 1;
		const fileName = `${dateStr}-${newSeq}.log`;

		return path.join(this.logDir, fileName);
	}

	/**
	 * 写入启动标记
	 */
	private writeStartMarker(): void {
		try {
			const timestamp = new Date().toISOString();
			const marker =
				`\n${"=".repeat(80)}\n` +
				`[${timestamp}] [INFO] Application started - Log file: ${path.basename(this.logFile)}\n` +
				`${"=".repeat(80)}\n\n`;
			fs.writeFileSync(this.logFile, marker);
		} catch {
			// 忽略写入错误
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

	/**
	 * 写入结束标记（在应用退出时调用）
	 */
	writeEndMarker(): void {
		try {
			const timestamp = new Date().toISOString();
			const marker =
				`\n${"=".repeat(80)}\n` +
				`[${timestamp}] [INFO] Application ended\n` +
				`${"=".repeat(80)}\n`;
			fs.appendFileSync(this.logFile, marker);
		} catch {
			// 忽略写入错误
		}
	}
}

/**
 * 全局日志服务实例
 */
export const logger = new Logger();
