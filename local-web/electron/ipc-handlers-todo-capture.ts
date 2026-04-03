/**
 * 待办提取相关的 IPC 处理器
 * 从 ipc-handlers.ts 中提取，以保持文件大小在限制内
 */

import { desktopCapturer, ipcMain, net, screen } from "electron";
import { Jimp } from "jimp";
import { logger } from "./logger";
import type { WindowManager } from "./window-manager";

type JimpScanContext = {
	bitmap: {
		data: Buffer;
	};
};

/**
 * 发送截图到后端进行待办提取
 */
async function sendToBackend(
	apiUrl: string,
	imageBase64: string,
	createTodos: boolean = true,
): Promise<{
	success: boolean;
	message: string;
	extractedTodos: Array<{
		title: string;
		description?: string;
		time_info?: Record<string, unknown>;
		source_text?: string;
		confidence: number;
	}>;
	createdCount: number;
}> {
	return new Promise((resolve, reject) => {
		const postData = JSON.stringify({
			image_base64: imageBase64,
			create_todos: createTodos, // 自动创建 draft 状态的待办
		});

		const request = net.request({
			method: "POST",
			url: apiUrl,
		});

		request.setHeader("Content-Type", "application/json");

		let responseData = "";

		request.on("response", (response) => {
			response.on("data", (chunk) => {
				responseData += chunk.toString();
			});

			response.on("end", () => {
				try {
					const result = JSON.parse(responseData);
					resolve({
						success: result.success ?? false,
						message: result.message ?? "未知响应",
						extractedTodos:
							result.extracted_todos?.map(
								(todo: {
									title: string;
									description?: string;
									time_info?: Record<string, unknown>;
									source_text?: string;
									confidence: number;
								}) => ({
									title: todo.title,
									description: todo.description,
									time_info: todo.time_info,
									source_text: todo.source_text,
									confidence: todo.confidence ?? 0.5,
								}),
							) ?? [],
						createdCount: result.created_count ?? 0,
					});
				} catch (error) {
					reject(new Error(`解析响应失败: ${error}`));
				}
			});

			response.on("error", (error) => {
				reject(error);
			});
		});

		request.on("error", (error) => {
			reject(error);
		});

		request.write(postData);
		request.end();
	});
}

/**
 * 在截图上绘制遮罩，遮住面板区域
 * @param imageBuffer 图片的 Buffer
 * @param windowBounds 窗口位置和尺寸（屏幕坐标）
 * @param screenBounds 屏幕位置和尺寸
 * @returns 处理后的图片 Buffer
 */
async function maskWindowArea(
	imageBuffer: Buffer,
	windowBounds: { x: number; y: number; width: number; height: number },
	screenBounds: { x: number; y: number; width: number; height: number },
): Promise<Buffer> {
	try {
		// 使用 Jimp 加载图片
		const image = await Jimp.read(imageBuffer);
		const imageWidth = image.width;
		const imageHeight = image.height;

		// 计算窗口相对于屏幕的位置
		// 截图是屏幕的截图，窗口位置是相对于主显示器的
		const relativeX = windowBounds.x - screenBounds.x;
		const relativeY = windowBounds.y - screenBounds.y;

		// 计算缩放比例（截图可能被缩放了）
		const scaleX = imageWidth / screenBounds.width;
		const scaleY = imageHeight / screenBounds.height;

		// 将窗口坐标缩放以匹配截图尺寸
		const scaledX = relativeX * scaleX;
		const scaledY = relativeY * scaleY;
		const scaledWidth = windowBounds.width * scaleX;
		const scaledHeight = windowBounds.height * scaleY;

		// 确保遮罩区域在图片范围内
		const maskX = Math.max(0, Math.min(Math.round(scaledX), imageWidth));
		const maskY = Math.max(0, Math.min(Math.round(scaledY), imageHeight));
		const maskWidth = Math.min(
			Math.round(scaledWidth),
			imageWidth - maskX,
		);
		const maskHeight = Math.min(
			Math.round(scaledHeight),
			imageHeight - maskY,
		);

		// 如果窗口不在截图范围内，直接返回原图
		if (maskWidth <= 0 || maskHeight <= 0) {
			logger.warn(
				"Window is outside screenshot bounds, skipping mask",
			);
			return imageBuffer;
		}

		// 创建遮罩：使用半透明黑色矩形（90% 不透明度）
		// 使用 Jimp 的 scan 方法直接操作像素
		image.scan(
			maskX,
			maskY,
			maskWidth,
			maskHeight,
			function (this: JimpScanContext, _x: number, _y: number, idx: number) {
				// 获取当前像素的颜色（RGBA 格式）
				// Jimp 的 bitmap.data 是 RGBA 格式：R, G, B, A
				const r = this.bitmap.data[idx] || 0;
				const g = this.bitmap.data[idx + 1] || 0;
				const b = this.bitmap.data[idx + 2] || 0;
				const a = this.bitmap.data[idx + 3] || 255;

				// 混合黑色遮罩（90% 不透明度）
				// 使用简单的 alpha 混合：result = source * (1 - alpha) + mask * alpha
				const alpha = 0.9;
				const newR = Math.round(r * (1 - alpha) + 0 * alpha);
				const newG = Math.round(g * (1 - alpha) + 0 * alpha);
				const newB = Math.round(b * (1 - alpha) + 0 * alpha);

				// 设置新颜色（保持原始 alpha 通道）
				this.bitmap.data[idx] = newR;
				this.bitmap.data[idx + 1] = newG;
				this.bitmap.data[idx + 2] = newB;
				// alpha 通道保持不变
				this.bitmap.data[idx + 3] = a;
			},
		);

		// 返回处理后的图片 Buffer
		return await image.getBuffer("image/png");
	} catch (error) {
		logger.error(
			`Failed to mask window area: ${error instanceof Error ? error.message : String(error)}`,
		);
		// 如果遮罩失败，返回原图
		return imageBuffer;
	}
}

/**
 * 设置待办提取相关的 IPC 处理器
 */
export function setupTodoCaptureIpcHandlers(
	windowManager: WindowManager,
): void {
	// 截图并提取待办
	ipcMain.handle(
		"capture-and-extract-todos",
		async (
			_event,
			panelBounds?: { x: number; y: number; width: number; height: number } | null,
		): Promise<{
			success: boolean;
			message: string;
			extractedTodos: Array<{
				title: string;
				description?: string;
				time_info?: Record<string, unknown>;
				source_text?: string;
				confidence: number;
			}>;
			createdCount: number;
		}> => {
			try {
				logger.info("Capturing screen for todo extraction...");

				// 不再隐藏窗口，直接截图
				const mainWin = windowManager.getWindow();
				if (!mainWin) {
					throw new Error("主窗口不存在");
				}

				// 获取窗口位置和尺寸（屏幕坐标）
				const windowBounds = mainWin.getBounds();

				// 获取主显示器的信息
				const primaryDisplay = screen.getPrimaryDisplay();
				const screenBounds = primaryDisplay.bounds;
				const displaySize = primaryDisplay.size;

				// 计算 panel 在屏幕上的绝对位置
				// panelBounds 是相对于视口的位置，需要转换为屏幕坐标
				let targetBounds: { x: number; y: number; width: number; height: number } | null = null;
				if (panelBounds) {
					// panelBounds 已经是相对于视口的位置（通过 getBoundingClientRect 获取）
					// 需要加上窗口在屏幕上的位置，转换为屏幕坐标
					targetBounds = {
						x: windowBounds.x + panelBounds.x,
						y: windowBounds.y + panelBounds.y,
						width: panelBounds.width,
						height: panelBounds.height,
					};
				}

				// 获取所有屏幕源（使用实际屏幕尺寸）
				const sources = await desktopCapturer.getSources({
					types: ["screen"],
					thumbnailSize: {
						width: displaySize.width,
						height: displaySize.height,
					},
				});

				if (sources.length === 0) {
					logger.error("No screen sources found");
					return {
						success: false,
						message: "未找到屏幕源",
						extractedTodos: [],
						createdCount: 0,
					};
				}

				// 使用主屏幕的截图
				const primarySource = sources[0];
				const thumbnail = primarySource.thumbnail;

				// 将 nativeImage 转换为 Buffer
				const pngBuffer = thumbnail.toPNG();

				// 在截图上绘制遮罩，遮住面板区域（只遮罩 panel，不是整个窗口）
				// 如果 targetBounds 为 null，不遮罩（直接使用原图）
				const maskedBuffer = targetBounds
					? await maskWindowArea(
							pngBuffer,
							targetBounds,
							screenBounds,
						)
					: pngBuffer;

				// 将处理后的图片转换为 base64
				const base64Data = maskedBuffer.toString("base64");

				// 获取后端 URL（从 next-server 模块）
				const nextServerModule = await import("./next-server");
				const backendUrl = nextServerModule.getBackendUrl();
				if (!backendUrl) {
					throw new Error("后端 URL 未设置，请等待后端服务器启动");
				}
				const apiUrl = `${backendUrl}/api/floating-capture/extract-todos`;

				// 发送到后端（自动创建 draft 状态的待办）
				const response = await sendToBackend(apiUrl, base64Data, true);

				logger.info(
					`Todo extraction completed: ${response.extractedTodos.length} todos extracted`,
				);

				return response;
			} catch (error) {
				const errorMsg = `Failed to capture and extract todos: ${error instanceof Error ? error.message : String(error)}`;
				logger.error(errorMsg);
				return {
					success: false,
					message: errorMsg,
					extractedTodos: [],
					createdCount: 0,
				};
			}
		},
	);
}
