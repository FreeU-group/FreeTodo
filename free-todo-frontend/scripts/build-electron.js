/**
 * 构建 Electron 主进程
 * 使用 esbuild 将 TypeScript 编译为 JavaScript
 */

const esbuild = require("esbuild");
const path = require("node:path");

const isWatch = process.argv.includes("--watch");

async function build() {
	const mainOptions = {
		entryPoints: [path.join(__dirname, "..", "electron", "main.ts")],
		bundle: true,
		platform: "node",
		target: "node18",
		outfile: path.join(__dirname, "..", "dist-electron", "main.js"),
		external: ["electron"],
		sourcemap: true,
		minify: process.env.NODE_ENV === "production",
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

build().catch((err) => {
	console.error("Build failed:", err);
	process.exit(1);
});
