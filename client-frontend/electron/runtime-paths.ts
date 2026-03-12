/**
 * Runtime path helpers
 */

import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { emitLog, emitStatus } from "./bootstrap-status";
import { PROCESS_CONFIG } from "./config";

export function getInstallRoot(): string {
	if (!app.isPackaged) {
		return path.resolve(__dirname, "../..");
	}
	if (process.platform === "darwin") {
		return path.resolve(process.execPath, "..", "..", "..");
	}
	return path.dirname(process.execPath);
}

function canWrite(dir: string): boolean {
	try {
		fs.mkdirSync(dir, { recursive: true });
		const testFile = path.join(dir, ".freetodo-write-test");
		fs.writeFileSync(testFile, "ok");
		fs.unlinkSync(testFile);
		return true;
	} catch {
		return false;
	}
}

export function resolveRuntimeRoot(): string {
	const envOverride = process.env.FREETODO_RUNTIME_DIR;
	if (envOverride) {
		fs.mkdirSync(envOverride, { recursive: true });
		return envOverride;
	}

	const installRoot = getInstallRoot();
	const preferred = path.join(installRoot, PROCESS_CONFIG.backendRuntimeDir);
	if (canWrite(preferred)) {
		return preferred;
	}

	emitLog(`Install directory not writable: ${preferred}`);
	const fallback = path.join(app.getPath("userData"), PROCESS_CONFIG.backendRuntimeDir);
	fs.mkdirSync(fallback, { recursive: true });
	emitStatus({
		message: "安装目录不可写，已切换运行时目录",
		detail: fallback,
		venvPath: fallback,
	});
	return fallback;
}

export function resolveVenvDir(): string {
	const runtimeRoot = resolveRuntimeRoot();
	const venvDir = path.join(runtimeRoot, PROCESS_CONFIG.backendVenvDir);
	return venvDir;
}
