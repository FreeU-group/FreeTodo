/**
 * 端口管理模块
 * 提供端口检测和分配功能
 */

import net from "node:net";
import { logToFile } from "./logger";

/**
 * 检查端口是否可用
 */
export function isPortAvailable(port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const server = net.createServer();
		server.once("error", () => resolve(false));
		server.once("listening", () => {
			server.close();
			resolve(true);
		});
		server.listen(port, "127.0.0.1");
	});
}

/**
 * 查找可用端口
 * 从 startPort 开始，依次尝试直到找到可用端口
 */
export async function findAvailablePort(
	startPort: number,
	maxAttempts = 100,
): Promise<number> {
	for (let offset = 0; offset < maxAttempts; offset++) {
		const port = startPort + offset;
		if (await isPortAvailable(port)) {
			if (offset > 0) {
				logToFile(`Port ${startPort} was occupied, using port ${port} instead`);
			}
			return port;
		}
		logToFile(`Port ${port} is occupied, trying next...`);
	}
	throw new Error(
		`No available port found in range ${startPort}-${startPort + maxAttempts}`,
	);
}
