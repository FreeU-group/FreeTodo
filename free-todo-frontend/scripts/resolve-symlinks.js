/**
 * 解析 standalone 构建中的 pnpm 符号链接
 * 将符号链接替换为实际文件，以便在打包的应用中正常工作
 */

const fs = require("node:fs");
const path = require("node:path");

function resolveSymlinks(dir) {
	const entries = fs.readdirSync(dir, { withFileTypes: true });

	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);

		if (entry.isSymbolicLink()) {
			try {
				const target = fs.readlinkSync(fullPath);
				const resolvedPath = path.isAbsolute(target)
					? target
					: path.resolve(path.dirname(fullPath), target);

				// 检查目标是否存在
				if (fs.existsSync(resolvedPath)) {
					// 删除符号链接
					fs.unlinkSync(fullPath);

					// 如果是目录，复制整个目录
					if (fs.statSync(resolvedPath).isDirectory()) {
						copyDirectory(resolvedPath, fullPath);
					} else {
						// 如果是文件，复制文件
						fs.copyFileSync(resolvedPath, fullPath);
					}

					console.log(`Resolved symlink: ${entry.name} -> ${resolvedPath}`);
				} else {
					console.warn(`Symlink target not found: ${fullPath} -> ${target}`);
				}
			} catch (error) {
				console.error(`Error resolving symlink ${fullPath}:`, error.message);
			}
		} else if (entry.isDirectory()) {
			// 递归处理子目录
			resolveSymlinks(fullPath);
		}
	}
}

function copyDirectory(src, dest) {
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
}

const standaloneDir = path.join(
	__dirname,
	"..",
	".next",
	"standalone",
	"node_modules",
);

if (fs.existsSync(standaloneDir)) {
	console.log("Resolving symlinks in standalone node_modules...");
	resolveSymlinks(standaloneDir);
	console.log("Symlink resolution complete!");
} else {
	console.warn(`Standalone node_modules not found at: ${standaloneDir}`);
	console.warn("Skipping symlink resolution.");
}
