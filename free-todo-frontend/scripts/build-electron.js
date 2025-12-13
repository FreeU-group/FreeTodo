/**
 * 构建 Electron 主进程
 * 使用 esbuild 将 TypeScript 编译为 JavaScript
 */

const esbuild = require("esbuild");
const path = require("path");

const isWatch = process.argv.includes("--watch");

async function build() {
	const options = {
		entryPoints: [path.join(__dirname, "..", "electron", "main.ts")],
		bundle: true,
		platform: "node",
		target: "node18",
		outfile: path.join(__dirname, "..", "dist-electron", "main.js"),
		external: ["electron"],
		sourcemap: true,
		minify: process.env.NODE_ENV === "production",
	};

	if (isWatch) {
		const ctx = await esbuild.context(options);
		await ctx.watch();
		console.log("Watching for changes...");
	} else {
		await esbuild.build(options);
		console.log("Electron main process built successfully!");
	}
}

build().catch((err) => {
	console.error("Build failed:", err);
	process.exit(1);
});
