/**
 * 构建 Electron 主进程
 * 使用 esbuild 将 TypeScript 编译为 JavaScript
 */

const esbuild = require("esbuild");
const path = require("node:path");

const isWatch = process.argv.includes("--watch");

async function build() {
	const distDir = path.join(__dirname, "..", "dist-electron");

	// 确保 dist-electron 目录存在
	const fs = require("node:fs");
	if (!fs.existsSync(distDir)) {
		fs.mkdirSync(distDir, { recursive: true });
	}

	// 构建主进程
	const mainOptions = {
		entryPoints: [path.join(__dirname, "..", "electron", "main.ts")],
		bundle: true,
		platform: "node",
		target: "node18",
		outfile: path.join(distDir, "main.js"),
		external: ["electron"],
		sourcemap: true,
		minify: process.env.NODE_ENV === "production",
	};

	// 构建 preload 脚本
	const preloadOptions = {
		entryPoints: [path.join(__dirname, "..", "electron", "preload.ts")],
		bundle: true,
		platform: "node",
		target: "node18",
		outfile: path.join(distDir, "preload.js"),
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

build().catch((err) => {
	console.error("Build failed:", err);
	process.exit(1);
});
