/**
 * 复制 Next.js standalone 构建中缺失的依赖
 * Next.js standalone 可能不会包含所有运行时需要的依赖
 */

const fs = require("node:fs");
const path = require("node:path");

function copyDirectory(src, dest) {
	if (!fs.existsSync(src)) {
		console.warn(`Source not found: ${src}`);
		return false;
	}

	fs.mkdirSync(dest, { recursive: true });
	const entries = fs.readdirSync(src, { withFileTypes: true });

	for (const entry of entries) {
		const srcPath = path.join(src, entry.name);
		const destPath = path.join(dest, entry.name);

		if (entry.isDirectory()) {
			copyDirectory(srcPath, destPath);
		} else {
			fs.copyFileSync(srcPath, destPath);
		}
	}
	return true;
}

// 需要复制的缺失依赖（Next.js 运行时需要的但 standalone 可能不包含的）
// 这些是 Next.js 内部使用的依赖，standalone 构建可能不会自动包含
const missingDeps = [
	"styled-jsx",
	"@swc/helpers",
	"@next/env",
	"client-only",
	"buffer-from",
	"detect-libc",
	// 可以根据需要添加更多依赖
];

const standaloneNodeModules = path.join(
	__dirname,
	"..",
	".next",
	"standalone",
	"node_modules",
);
const mainNodeModules = path.join(__dirname, "..", "node_modules");

if (!fs.existsSync(standaloneNodeModules)) {
	console.warn(
		`Standalone node_modules not found at: ${standaloneNodeModules}`,
	);
	process.exit(1);
}

console.log("Copying missing dependencies to standalone build...");

for (const dep of missingDeps) {
	const srcPath = path.join(mainNodeModules, ".pnpm");
	const destPath = path.join(standaloneNodeModules, dep);

	// 对于 scoped packages (@scope/package)，pnpm 使用 + 代替 /
	const pnpmDepName = dep.replace(/\//g, "+");

	// 查找依赖在 .pnpm 中的位置
	const pnpmDirs = fs
		.readdirSync(srcPath)
		.filter((dir) => dir.startsWith(`${pnpmDepName}@`));

	if (pnpmDirs.length > 0) {
		const pnpmPath = path.join(srcPath, pnpmDirs[0], "node_modules", dep);

		if (fs.existsSync(pnpmPath)) {
			if (!fs.existsSync(destPath)) {
				console.log(`Copying ${dep}...`);
				copyDirectory(pnpmPath, destPath);
				console.log(`✓ Copied ${dep}`);
			} else {
				console.log(`✓ ${dep} already exists`);
			}
		} else {
			console.warn(`Could not find ${dep} at: ${pnpmPath}`);
		}
	} else {
		console.warn(
			`Could not find ${dep} (looking for ${pnpmDepName}@) in .pnpm directory`,
		);
	}
}

console.log("Missing dependencies copy complete!");
