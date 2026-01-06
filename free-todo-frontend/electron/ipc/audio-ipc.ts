/**
 * 音频相关 IPC 处理器
 * 处理系统音频捕获和虚拟音频设备配置
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { desktopCapturer, ipcMain } from "electron";
import { logToFile } from "../core/logger";

/**
 * 设置音频相关 IPC 处理器
 */
export function setupAudioIpcHandlers(): void {
	// 注册 IPC 处理器：获取系统音频源
	ipcMain.handle("get-system-audio-sources", async () => {
		try {
			const sources = await desktopCapturer.getSources({
				types: ["screen", "window"],
				thumbnailSize: { width: 0, height: 0 }, // 不需要缩略图
			});

			// 返回所有源（让前端尝试）
			return sources.map((source) => ({
				id: source.id,
				name: source.name,
				display_id: source.display_id,
			}));
		} catch (error) {
			console.error("获取系统音频源失败:", error);
			return [];
		}
	});

	// 注册 IPC 处理器：检查虚拟音频设备
	ipcMain.handle("check-virtual-audio-device", async () => {
		try {
			const platform = process.platform;

			let scriptPath: string;
			let command: string[];

			if (platform === "win32") {
				// Windows: 使用 PowerShell 脚本
				scriptPath = path.join(
					__dirname,
					"../../scripts/audio/setup_virtual_audio_windows.ps1",
				);
				command = [
					"powershell",
					"-ExecutionPolicy",
					"Bypass",
					"-File",
					scriptPath,
					"-CheckOnly",
				];
			} else if (platform === "darwin") {
				// macOS: 使用 shell 脚本
				scriptPath = path.join(
					__dirname,
					"../../scripts/audio/setup_virtual_audio_macos.sh",
				);
				command = ["bash", scriptPath, "--check-only"];
			} else if (platform === "linux") {
				// Linux: 使用 shell 脚本
				scriptPath = path.join(
					__dirname,
					"../../scripts/audio/setup_virtual_audio_linux.sh",
				);
				command = ["bash", scriptPath, "--check-only"];
			} else {
				return { available: false, message: `不支持的操作系统: ${platform}` };
			}

			return new Promise((resolve) => {
				const proc = spawn(command[0], command.slice(1), {
					cwd: path.dirname(scriptPath),
					timeout: 10000,
				});

				let stdout = "";
				let stderr = "";

				proc.stdout.on("data", (data: Buffer) => {
					stdout += data.toString();
				});

				proc.stderr.on("data", (data: Buffer) => {
					stderr += data.toString();
				});

				proc.on("close", (code: number) => {
					const available = code === 0;
					resolve({
						available,
						message: available ? "虚拟音频设备已配置" : "虚拟音频设备未配置",
						details: stdout || stderr,
						platform,
					});
				});

				proc.on("error", (error: Error) => {
					resolve({
						available: false,
						message: `检查失败: ${error.message}`,
						platform,
					});
				});
			});
		} catch (error) {
			console.error("检查虚拟音频设备失败:", error);
			return {
				available: false,
				message: `检查失败: ${error instanceof Error ? error.message : String(error)}`,
				platform: process.platform,
			};
		}
	});

	// 注册 IPC 处理器：设置虚拟音频设备
	ipcMain.handle("setup-virtual-audio-device", async () => {
		try {
			const platform = process.platform;

			let scriptPath: string;
			let command: string[];

			if (platform === "win32") {
				scriptPath = path.join(
					__dirname,
					"../../scripts/audio/setup_virtual_audio_windows.ps1",
				);
				command = [
					"powershell",
					"-ExecutionPolicy",
					"Bypass",
					"-File",
					scriptPath,
				];
			} else if (platform === "darwin") {
				scriptPath = path.join(
					__dirname,
					"../../scripts/audio/setup_virtual_audio_macos.sh",
				);
				command = ["bash", scriptPath];
			} else if (platform === "linux") {
				scriptPath = path.join(
					__dirname,
					"../../scripts/audio/setup_virtual_audio_linux.sh",
				);
				command = ["bash", scriptPath, "--load-module"];
			} else {
				return { success: false, message: `不支持的操作系统: ${platform}` };
			}

			return new Promise((resolve) => {
				const proc = spawn(command[0], command.slice(1), {
					cwd: path.dirname(scriptPath),
					timeout: 30000,
				});

				let stdout = "";
				let stderr = "";

				proc.stdout.on("data", (data: Buffer) => {
					stdout += data.toString();
				});

				proc.stderr.on("data", (data: Buffer) => {
					stderr += data.toString();
				});

				proc.on("close", (code: number) => {
					const success = code === 0;
					resolve({
						success,
						message: success
							? "虚拟音频设备配置成功"
							: "配置失败，请查看详细信息",
						details: stdout || stderr,
						platform,
					});
				});

				proc.on("error", (error: Error) => {
					resolve({
						success: false,
						message: `配置失败: ${error.message}`,
						platform,
					});
				});
			});
		} catch (error) {
			console.error("设置虚拟音频设备失败:", error);
			return {
				success: false,
				message: `设置失败: ${error instanceof Error ? error.message : String(error)}`,
				platform: process.platform,
			};
		}
	});

	// 注册 IPC 处理器：获取系统音频流
	// 注意：Electron 中无法在主进程直接创建 MediaStream，需要在渲染进程中使用 getUserMedia
	// 这里返回源信息，让渲染进程使用 getUserMedia 配合 sourceId 获取流
	ipcMain.handle(
		"get-system-audio-stream",
		async (_event, sourceId?: string) => {
			try {
				// 获取所有可用的桌面源（包括屏幕和窗口）
				const sources = await desktopCapturer.getSources({
					types: ["screen", "window"],
					thumbnailSize: { width: 0, height: 0 }, // 不需要缩略图，提高性能
				});

				if (sources.length === 0) {
					throw new Error("未找到可用的系统音频源");
				}

				// 如果没有指定源ID，优先选择屏幕源（通常包含系统音频）
				if (!sourceId) {
					const screenSource = sources.find((s) => s.id.startsWith("screen:"));
					sourceId = screenSource?.id || sources[0].id;
				} else {
					// 验证指定的源ID是否存在
					const sourceExists = sources.some((s) => s.id === sourceId);
					if (!sourceExists) {
						throw new Error(`指定的音频源不存在: ${sourceId}`);
					}
				}

				// 返回源信息，渲染进程将使用 getUserMedia 配合 sourceId 获取流
				const selectedSource = sources.find((s) => s.id === sourceId);
				return {
					sourceId,
					name: selectedSource?.name || "系统音频",
					success: true,
				};
			} catch (error) {
				console.error("获取系统音频流失败:", error);
				throw error;
			}
		},
	);
}

/**
 * 自动检测和配置虚拟音频设备（在应用启动时）
 */
export async function autoSetupVirtualAudio(): Promise<void> {
	try {
		const platform = process.platform;

		let scriptPath: string;
		let command: string[];

		if (platform === "win32") {
			scriptPath = path.join(
				__dirname,
				"../../scripts/audio/setup_virtual_audio_windows.ps1",
			);
			command = [
				"powershell",
				"-ExecutionPolicy",
				"Bypass",
				"-File",
				scriptPath,
				"-CheckOnly",
			];
		} else if (platform === "darwin") {
			scriptPath = path.join(
				__dirname,
				"../../scripts/audio/setup_virtual_audio_macos.sh",
			);
			command = ["bash", scriptPath, "--check-only"];
		} else if (platform === "linux") {
			scriptPath = path.join(
				__dirname,
				"../../scripts/audio/setup_virtual_audio_linux.sh",
			);
			command = ["bash", scriptPath, "--check-only"];
		} else {
			logToFile(`不支持的操作系统: ${platform}`);
			return;
		}

		const status: {
			available: boolean;
			message: string;
			details: string;
			platform: NodeJS.Platform;
		} = await new Promise((resolve) => {
			const proc = spawn(command[0], command.slice(1), {
				cwd: path.dirname(scriptPath),
				timeout: 10000,
			});

			let stdout = "";
			let stderr = "";

			proc.stdout.on("data", (data: Buffer) => {
				stdout += data.toString();
			});

			proc.stderr.on("data", (data: Buffer) => {
				stderr += data.toString();
			});

			proc.on("close", (code: number) => {
				const available = code === 0;
				resolve({
					available,
					message: available ? "虚拟音频设备已配置" : "虚拟音频设备未配置",
					details: stdout || stderr || "",
					platform,
				});
			});

			proc.on("error", (error: Error) => {
				resolve({
					available: false,
					message: `检查失败: ${error.message}`,
					details: "",
					platform,
				});
			});
		});

		if (!status.available) {
			logToFile("虚拟音频设备未配置，尝试自动配置...");
			// 尝试自动配置（Linux 可以自动加载模块）
			if (process.platform === "linux") {
				const setupResult: {
					success: boolean;
					message: string;
					details?: string;
				} = await new Promise((resolve) => {
					const linuxScriptPath = path.join(
						__dirname,
						"../../scripts/audio/setup_virtual_audio_linux.sh",
					);
					const proc = spawn("bash", [linuxScriptPath, "--load-module"], {
						cwd: path.dirname(linuxScriptPath),
						timeout: 30000,
					});

					let stdout = "";
					let stderr = "";

					proc.stdout.on("data", (data: Buffer) => {
						stdout += data.toString();
					});

					proc.stderr.on("data", (data: Buffer) => {
						stderr += data.toString();
					});

					proc.on("close", (code: number) => {
						resolve({
							success: code === 0,
							message: code === 0 ? "虚拟音频设备配置成功" : "配置失败",
							details: stdout || stderr || "",
						});
					});

					proc.on("error", (error: Error) => {
						resolve({
							success: false,
							message: `配置失败: ${error.message}`,
							details: "",
						});
					});
				});

				if (setupResult.success) {
					logToFile("✅ 虚拟音频设备自动配置成功");
				} else {
					logToFile(`⚠️  虚拟音频设备自动配置失败: ${setupResult.message}`);
				}
			} else {
				logToFile("⚠️  Windows/macOS 需要手动安装虚拟音频设备驱动");
				logToFile(
					"    Windows: 请安装 VB-CABLE (https://vb-audio.com/Cable/)",
				);
				logToFile(
					"    macOS: 请安装 BlackHole (brew install blackhole-2ch)",
				);
			}
		} else {
			logToFile("✅ 虚拟音频设备已配置");
		}
	} catch (error) {
		logToFile(
			`检查虚拟音频设备时出错: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
	}
}
