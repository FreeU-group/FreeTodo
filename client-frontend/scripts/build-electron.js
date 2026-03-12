/**
 * 构建 Electron 主进程
 * 使用 esbuild 将 TypeScript 编译为 JavaScript
 */

const esbuild = require("esbuild");
const path = require("node:path");

const isWatch = process.argv.includes("--watch");

// 获取窗口模式（默认为 web）
const windowMode = process.env.WINDOW_MODE || "web";
// 获取后端运行时（script 或 pyinstaller）
const backendRuntime = process.env.BACKEND_RUNTIME || "script";

async function build() {
	console.log(
		`Building Electron with WINDOW_MODE=${windowMode}, BACKEND_RUNTIME=${backendRuntime}`,
	);

	const mainOptions = {
		entryPoints: [path.join(__dirname, "..", "electron", "main.ts")],
		bundle: true,
		platform: "node",
		target: "node18",
		outfile: path.join(__dirname, "..", "dist-electron", "main.js"),
		external: ["electron"],
		sourcemap: true,
		minify: process.env.NODE_ENV === "production",
		// 在编译时注入窗口模式常量
		define: {
			"__DEFAULT_WINDOW_MODE__": JSON.stringify(windowMode),
			"__DEFAULT_BACKEND_RUNTIME__": JSON.stringify(backendRuntime),
		},
	};

	const preloadOptions = {
		entryPoints: [path.join(__dirname, "..", "electron", "preload.ts")],
		bundle: true,
		platform: "node",
		target: "node18",
		outfile: path.join(__dirname, "..", "dist-electron", "preload.js"),
		external: ["electron"],
		sourcemap: true,
		minify: process.env.NODE_ENV === "production",
	};

	if (isWatch) {
		const mainCtx = await esbuild.context(mainOptions);
		const preloadCtx = await esbuild.context(preloadOptions);
		await Promise.all([mainCtx.watch(), preloadCtx.watch()]);
		console.log("Watching for changes...");
	} else {
		await Promise.all([
			esbuild.build(mainOptions),
			esbuild.build(preloadOptions),
		]);
		console.log("Electron main process and preload script built successfully!");
	}
}

// 处理信号，确保正常退出
let isShuttingDown = false;

const gracefulShutdown = async (signal) => {
	if (isShuttingDown) {
		console.log(`Received ${signal} again, forcing exit...`);
		process.exit(1);
		return;
	}

	isShuttingDown = true;
	console.log(`\nReceived ${signal} signal, shutting down gracefully...`);

	// 等待当前构建完成
	setTimeout(() => {
		process.exit(0);
	}, 1000);
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

build().catch((err) => {
	console.error("Build failed:", err);
	process.exit(1);
});
