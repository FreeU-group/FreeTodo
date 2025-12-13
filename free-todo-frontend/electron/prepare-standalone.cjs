const fs = require("fs");
const path = require("path");

function copyDir(src, dest) {
	if (!fs.existsSync(src)) return;
	fs.rmSync(dest, { recursive: true, force: true });
	fs.mkdirSync(path.dirname(dest), { recursive: true });
	fs.cpSync(src, dest, { recursive: true });
}

function main() {
	const root = path.join(__dirname, "..");
	const standaloneDir = path.join(root, ".next", "standalone");
	if (!fs.existsSync(standaloneDir)) {
		throw new Error(
			`standalone 目录不存在：${standaloneDir}\n请确认 next.config.mjs 已启用 output: "standalone" 且 next build 成功。`,
		);
	}

	// Next standalone 运行时需要：
	// - .next/standalone/.next/static
	// - .next/standalone/public
	const staticSrc = path.join(root, ".next", "static");
	const staticDest = path.join(standaloneDir, ".next", "static");
	const publicSrc = path.join(root, "public");
	const publicDest = path.join(standaloneDir, "public");

	copyDir(staticSrc, staticDest);
	copyDir(publicSrc, publicDest);

	console.log("standalone 资源准备完成：");
	console.log("- static:", staticDest);
	console.log("- public:", publicDest);
}

main();
