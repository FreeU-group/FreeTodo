/**
 * 端口管理服务
 * 提供端口可用性检测和动态端口分配功能
 */

import net from "node:net";
import { PORT_CONFIG } from "./config";
import { logger } from "./logger";

/**
 * 端口管理器类
 * 负责检测端口可用性和查找可用端口
 */
class PortManager {
	/**
	 * 检查指定端口是否可用
	 * @param port 要检查的端口号
	 * @returns 端口是否可用
	 */
	async isPortAvailable(port: number): Promise<boolean> {
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
	 * @param startPort 起始端口号
	 * @param maxAttempts 最大尝试次数，默认 100
	 * @returns 可用的端口号
	 * @throws 如果在指定范围内找不到可用端口
	 */
	async findAvailablePort(
		startPort: number,
		maxAttempts: number = PORT_CONFIG.frontend.maxAttempts,
	): Promise<number> {
		for (let offset = 0; offset < maxAttempts; offset++) {
			const port = startPort + offset;
			if (await this.isPortAvailable(port)) {
				if (offset > 0) {
					logger.info(
						`Port ${startPort} was occupied, using port ${port} instead`,
					);
				}
				return port;
			}
			logger.info(`Port ${port} is occupied, trying next...`);
		}

		throw new Error(
			`No available port found in range ${startPort}-${startPort + maxAttempts}`,
		);
	}
}

/**
 * 全局端口管理器实例
 */
export const portManager = new PortManager();
