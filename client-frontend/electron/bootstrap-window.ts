/**
 * Bootstrap window (shows install progress and logs)
 */

import { BrowserWindow } from "electron";
import { onComplete, onLog, onStatus } from "./bootstrap-status";

let bootstrapWindow: BrowserWindow | null = null;
let listenersAttached = false;

function getBootstrapHtml(): string {
	return `<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<title>FreeTodo Setup</title>
		<style>
			:root {
				color-scheme: light;
				--bg: #f8f6f1;
				--panel: #ffffff;
				--text: #1c1b1f;
				--muted: #6b6a6f;
				--accent: #2f6bff;
				--accent-soft: #dbe6ff;
				--border: #e5e2ea;
			}
			* { box-sizing: border-box; }
			body {
				margin: 0;
				font-family: "SF Pro Display", "Segoe UI", "Noto Sans", sans-serif;
				background: var(--bg);
				color: var(--text);
			}
			.container {
				padding: 28px 28px 24px;
			}
			.card {
				background: var(--panel);
				border: 1px solid var(--border);
				border-radius: 16px;
				padding: 20px;
				box-shadow: 0 10px 30px rgba(24, 24, 24, 0.08);
			}
			.title {
				font-size: 18px;
				font-weight: 600;
				margin-bottom: 8px;
			}
			.subtitle {
				color: var(--muted);
				font-size: 13px;
				margin-bottom: 16px;
			}
			.progress {
				background: var(--accent-soft);
				border-radius: 999px;
				height: 10px;
				overflow: hidden;
			}
			.progress > div {
				height: 100%;
				width: 0%;
				background: linear-gradient(90deg, #2f6bff, #3fa5ff);
				transition: width 0.25s ease;
			}
			.status {
				margin-top: 16px;
				font-size: 14px;
				font-weight: 500;
			}
			.detail {
				margin-top: 6px;
				font-size: 12px;
				color: var(--muted);
				min-height: 16px;
			}
			.meta {
				margin-top: 12px;
				font-size: 12px;
				color: var(--muted);
				display: grid;
				gap: 6px;
			}
			.meta span {
				color: var(--text);
			}
			.actions {
				margin-top: 14px;
				display: flex;
				justify-content: space-between;
				align-items: center;
				gap: 12px;
			}
			.button {
				background: transparent;
				border: none;
				color: var(--accent);
				font-size: 12px;
				font-weight: 600;
				cursor: pointer;
			}
			.stop-button {
				color: #d93025;
			}
			.start-button {
				background: var(--accent);
				color: #ffffff;
				border-radius: 999px;
				padding: 6px 14px;
				font-size: 12px;
				font-weight: 600;
				border: none;
				cursor: pointer;
				opacity: 0.6;
			}
			.start-button.enabled {
				opacity: 1;
			}
			.log {
				margin-top: 12px;
				display: none;
				border: 1px solid var(--border);
				border-radius: 12px;
				background: #0f1115;
				color: #e5e7eb;
				padding: 12px;
				font-size: 11px;
				height: 160px;
				overflow: auto;
				white-space: pre-wrap;
			}
			.log.visible { display: block; }
		</style>
	</head>
	<body>
		<div class="container">
			<div class="card">
				<div class="title">正在准备 FreeTodo</div>
				<div class="subtitle">首次启动会自动安装 Python 3.12 与依赖。</div>
				<div class="progress"><div id="progressBar"></div></div>
				<div class="status" id="statusText">准备中...</div>
				<div class="detail" id="statusDetail"></div>
				<div class="meta">
					<div>安装位置: <span id="installPath">-</span></div>
					<div>Python 环境: <span id="pythonPath">-</span></div>
					<div>虚拟环境: <span id="venvPath">-</span></div>
				</div>
				<div class="actions">
					<span id="statusPercent">0%</span>
					<div>
						<button class="button" id="selectPython">选择 Python</button>
						<button class="button stop-button" id="stopInstall">停止安装</button>
						<button class="button" id="toggleLog">查看日志</button>
						<button class="start-button" id="startButton" disabled>开始使用</button>
					</div>
				</div>
				<pre class="log" id="logView"></pre>
			</div>
		</div>
		<script>
			const { ipcRenderer } = require("electron");
			const progressBar = document.getElementById("progressBar");
			const statusText = document.getElementById("statusText");
			const statusDetail = document.getElementById("statusDetail");
			const statusPercent = document.getElementById("statusPercent");
			const logView = document.getElementById("logView");
			const toggleLog = document.getElementById("toggleLog");
			const startButton = document.getElementById("startButton");
			const selectPython = document.getElementById("selectPython");
			const stopInstall = document.getElementById("stopInstall");
			const installPath = document.getElementById("installPath");
			const pythonPath = document.getElementById("pythonPath");
			const venvPath = document.getElementById("venvPath");

			let logVisible = false;
			toggleLog.addEventListener("click", () => {
				logVisible = !logVisible;
				logView.classList.toggle("visible", logVisible);
				toggleLog.textContent = logVisible ? "收起日志" : "查看日志";
			});

			startButton.addEventListener("click", () => {
				if (startButton.disabled) return;
				ipcRenderer.send("bootstrap:continue");
			});

			selectPython.addEventListener("click", () => {
				ipcRenderer.send("bootstrap:select-python");
			});

			stopInstall.addEventListener("click", () => {
				ipcRenderer.send("bootstrap:stop");
			});

			ipcRenderer.on("bootstrap:status", (_event, status) => {
				if (status.message) statusText.textContent = status.message;
				if (status.detail) statusDetail.textContent = status.detail;
				if (status.installPath) installPath.textContent = status.installPath;
				if (status.pythonPath) pythonPath.textContent = status.pythonPath;
				if (status.venvPath) venvPath.textContent = status.venvPath;
				if (typeof status.progress === "number") {
					const value = Math.max(0, Math.min(100, status.progress));
					progressBar.style.width = value + "%";
					statusPercent.textContent = value + "%";
				}
			});

			ipcRenderer.on("bootstrap:complete", () => {
				startButton.disabled = false;
				startButton.classList.add("enabled");
			});

			ipcRenderer.on("bootstrap:log", (_event, line) => {
				if (!line) return;
				logView.textContent += line.endsWith("\\n") ? line : line + "\\n";
				logView.scrollTop = logView.scrollHeight;
			});
		</script>
	</body>
</html>`;
}

export function createBootstrapWindow(): BrowserWindow {
	if (bootstrapWindow) {
		return bootstrapWindow;
	}

	bootstrapWindow = new BrowserWindow({
		width: 520,
		height: 400,
		resizable: false,
		show: false,
		title: "FreeTodo Setup",
		closable: true,
		alwaysOnTop: true,
		backgroundColor: "#f8f6f1",
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false,
		},
	});

	bootstrapWindow.setMenuBarVisibility(false);
	bootstrapWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(getBootstrapHtml())}`);
	bootstrapWindow.once("ready-to-show", () => {
		bootstrapWindow?.show();
	});
	bootstrapWindow.on("closed", () => {
		bootstrapWindow = null;
	});

	if (!listenersAttached) {
		onStatus((status) => {
			if (!bootstrapWindow) {
				return;
			}
			bootstrapWindow.webContents.send("bootstrap:status", status);
		});
		onLog((line) => {
			if (!bootstrapWindow) {
				return;
			}
			bootstrapWindow.webContents.send("bootstrap:log", line);
		});
		onComplete(() => {
			if (!bootstrapWindow) {
				return;
			}
			bootstrapWindow.webContents.send("bootstrap:complete");
		});
		listenersAttached = true;
	}

	return bootstrapWindow;
}

export function getBootstrapWindow(): BrowserWindow | null {
	return bootstrapWindow;
}

export function closeBootstrapWindow(): void {
	if (!bootstrapWindow) {
		return;
	}
	bootstrapWindow.close();
	bootstrapWindow = null;
}
