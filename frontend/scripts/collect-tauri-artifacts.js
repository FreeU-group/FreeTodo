const fs = require("node:fs");
const path = require("node:path");

function parseArgs() {
	const args = process.argv.slice(2);
	const result = {};
	for (let i = 0; i < args.length; i += 1) {
		const key = args[i];
		const value = args[i + 1];
		if (key?.startsWith("--") && value && !value.startsWith("--")) {
			result[key.slice(2)] = value;
			i += 0;
		}
	}
	return result;
}

function ensureDir(dir) {
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
}

function copyDir(src, dest) {
	if (!fs.existsSync(src)) {
		throw new Error(`Source directory not found: ${src}`);
	}
	ensureDir(dest);
	fs.cpSync(src, dest, { recursive: true, force: true });
}

const args = parseArgs();
const variant = args.variant;
const runtime = args.runtime;
const target = args.target;

if (!variant || !runtime || !target) {
	console.error(
		"Usage: node scripts/collect-tauri-artifacts.js --variant <web|island> --runtime <script|pyinstaller> --target <target-triple>",
	);
	process.exit(1);
}

const rootDir = path.resolve(__dirname, "..");
const sourceDir = path.join(rootDir, "src-tauri", "target", target, "release", "bundle");
const destDir = path.join(
	rootDir,
	"dist-artifacts",
	"tauri",
	variant,
	runtime,
	target,
);

try {
	copyDir(sourceDir, destDir);
	console.log(`Tauri artifacts copied to: ${destDir}`);
} catch (error) {
	console.error(`Failed to collect Tauri artifacts: ${error.message}`);
	process.exit(1);
}
