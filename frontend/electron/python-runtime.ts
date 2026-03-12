/**
 * Python runtime bootstrapper
 * Ensures Python 3.12 and backend dependencies are installed before starting the backend.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dialog } from "electron";
import { isCancelled } from "./bootstrap-control";
import { emitLog, emitStatus } from "./bootstrap-status";
import { logger } from "./logger";
import { runCommand } from "./python-runtime-command";
import { configureCondaMirror, getPipEnv, getUvEnv } from "./python-runtime-env";
import { installPython312 } from "./python-runtime-installer";

const REQUIRED_PYTHON_MAJOR = 3;
const REQUIRED_PYTHON_MINOR = 12;
const PYTHON_VERSION_SHORT = `${REQUIRED_PYTHON_MAJOR}.${REQUIRED_PYTHON_MINOR}`;
const DEP_MARKER_FILE = ".freetodo-deps.json";
const RUNTIME_MANIFEST_FILE = ".freetodo-runtime.json";

let preferredPythonPath: string | null = null;

type PythonInfo = {
	executable: string;
	version: string;
	prefix: string;
	isConda: boolean;
};

export function setPreferredPythonPath(value: string | null): void {
	preferredPythonPath = value;
}

function getVenvPythonPath(venvDir: string): string {
	if (process.platform === "win32") {
		return path.join(venvDir, "Scripts", "python.exe");
	}
	return path.join(venvDir, "bin", "python3");
}

function getVenvUvPath(venvDir: string): string {
	if (process.platform === "win32") {
		return path.join(venvDir, "Scripts", "uv.exe");
	}
	return path.join(venvDir, "bin", "uv");
}

function readFileHash(filePath: string): string {
	const contents = fs.readFileSync(filePath);
	return crypto.createHash("sha256").update(contents).digest("hex");
}

function readDepsMarker(venvDir: string): { requirementsHash?: string } | null {
	const markerPath = path.join(venvDir, DEP_MARKER_FILE);
	if (!fs.existsSync(markerPath)) {
		return null;
	}
	try {
		const raw = fs.readFileSync(markerPath, "utf8");
		return JSON.parse(raw) as { requirementsHash?: string };
	} catch {
		return null;
	}
}

type RuntimeManifest = {
	pythonPath: string;
	venvPath?: string;
	requirementsHash: string;
	createdAt: string;
};

function readRuntimeManifest(runtimeRoot: string): RuntimeManifest | null {
	const manifestPath = path.join(runtimeRoot, RUNTIME_MANIFEST_FILE);
	if (!fs.existsSync(manifestPath)) {
		return null;
	}
	try {
		const raw = fs.readFileSync(manifestPath, "utf8");
		return JSON.parse(raw) as RuntimeManifest;
	} catch {
		return null;
	}
}

function writeRuntimeManifest(runtimeRoot: string, manifest: RuntimeManifest): void {
	const manifestPath = path.join(runtimeRoot, RUNTIME_MANIFEST_FILE);
	fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

function writeDepsMarker(venvDir: string, requirementsHash: string): void {
	const markerPath = path.join(venvDir, DEP_MARKER_FILE);
	const payload = {
		requirementsHash,
		createdAt: new Date().toISOString(),
	};
	fs.writeFileSync(markerPath, JSON.stringify(payload, null, 2));
}

function isRequiredPython(version: string): boolean {
	return version.trim() === PYTHON_VERSION_SHORT;
}

function normalizeOutput(value: string): string {
	return value.replace(/\r/g, "").trim();
}

function assertNotCancelled(): void {
	if (isCancelled()) {
		throw new Error("Installation cancelled");
	}
}

function getVersionFromOutput(output: string): PythonInfo | null {
	const line = normalizeOutput(output).split("\n")[0];
	if (!line) {
		return null;
	}
	try {
		const parsed = JSON.parse(line) as {
			version?: string;
			executable?: string;
			prefix?: string;
			is_conda?: boolean;
		};
		if (!parsed.version || !parsed.executable || !parsed.prefix) {
			return null;
		}
		return {
			version: parsed.version.trim(),
			executable: parsed.executable.trim(),
			prefix: parsed.prefix.trim(),
			isConda: Boolean(parsed.is_conda),
		};
	} catch {
		return null;
	}
}

async function getPythonInfo(command: string, args: string[]): Promise<PythonInfo | null> {
	const result = await runCommand(command, [
		...args,
		"-c",
		"import json, os, sys; prefix=sys.prefix; is_conda=os.path.exists(os.path.join(prefix, 'conda-meta')); print(json.dumps({'version': f'{sys.version_info[0]}.{sys.version_info[1]}', 'executable': sys.executable, 'prefix': prefix, 'is_conda': is_conda}))",
	]);
	if (result.code !== 0) {
		return null;
	}
	return getVersionFromOutput(result.stdout);
}

export async function validatePythonPath(pythonPath: string): Promise<PythonInfo | null> {
	if (!pythonPath) {
		return null;
	}
	return getPythonInfo(pythonPath, []);
}

export function isRuntimePrepared(
	runtimeRoot: string,
	venvDir: string,
	requirementsPath: string,
): boolean {
	if (!fs.existsSync(requirementsPath)) {
		return false;
	}
	const manifest = readRuntimeManifest(runtimeRoot);
	if (!manifest) {
		return false;
	}
	const requirementsHash = readFileHash(requirementsPath);
	if (manifest.requirementsHash !== requirementsHash) {
		return false;
	}
	if (manifest.venvPath) {
		const venvPython = getVenvPythonPath(venvDir);
		return fs.existsSync(venvPython);
	}
	return fs.existsSync(manifest.pythonPath);
}

async function findInstalledPython312(): Promise<PythonInfo | null> {
	const candidates: Array<{ command: string; args: string[] }> = [];

	if (process.platform === "win32") {
		candidates.push({ command: "py", args: ["-3.12"] });
		candidates.push({ command: "python3.12", args: [] });
		candidates.push({ command: "python", args: [] });
		candidates.push({ command: "python3", args: [] });
	} else {
		candidates.push({ command: "python3.12", args: [] });
		candidates.push({ command: "python3", args: [] });
		candidates.push({ command: "python", args: [] });
	}

	for (const candidate of candidates) {
		const info = await getPythonInfo(candidate.command, candidate.args);
		if (!info || !isRequiredPython(info.version)) {
			continue;
		}
		if (fs.existsSync(info.executable)) {
			return info;
		}
	}

	const fallbackPaths: string[] = [];
	if (process.platform === "win32") {
		const localAppData = process.env.LOCALAPPDATA ?? "";
		const programFiles = process.env.ProgramFiles ?? "";
		const programFilesX86 = process.env["ProgramFiles(x86)"] ?? "";
		fallbackPaths.push(
			path.join(localAppData, "Programs", "Python", "Python312", "python.exe"),
			path.join(programFiles, "Python312", "python.exe"),
			path.join(programFilesX86, "Python312", "python.exe"),
		);
	} else if (process.platform === "darwin") {
		fallbackPaths.push(
			"/usr/local/bin/python3.12",
			"/opt/homebrew/bin/python3.12",
			"/Library/Frameworks/Python.framework/Versions/3.12/bin/python3.12",
		);
	} else {
		fallbackPaths.push("/usr/bin/python3.12", "/usr/local/bin/python3.12");
	}

	for (const candidatePath of fallbackPaths) {
		if (!candidatePath || !fs.existsSync(candidatePath)) {
			continue;
		}
		const info = await getPythonInfo(candidatePath, []);
		if (info && isRequiredPython(info.version)) {
			return info;
		}
	}

	return null;
}

async function ensurePython312Installed(): Promise<PythonInfo> {
	emitStatus({ message: "检查 Python 3.12", progress: 10 });
	if (preferredPythonPath) {
		const preferredInfo = await validatePythonPath(preferredPythonPath);
		if (preferredInfo && isRequiredPython(preferredInfo.version)) {
			emitLog(`Using selected Python: ${preferredInfo.executable}`);
			return preferredInfo;
		}
		emitLog("Selected Python is not compatible with 3.12.");
	}

	const existing = await findInstalledPython312();
	if (existing) {
		emitLog(`Found Python 3.12 at ${existing.executable}`);
		return existing;
	}

	while (true) {
		const response = await dialog.showMessageBox({
			type: "info",
			buttons: ["选择已有 Python", "自动安装", "取消"],
			defaultId: 1,
			cancelId: 2,
			message: "FreeTodo 需要 Python 3.12 才能运行本地后端。",
			detail:
				"你可以选择已有的 Python 3.12 环境，或者让程序自动安装。自动安装需要联网，可能会花费几分钟。",
		});

		if (response.response === 0) {
			const dialogOptions: Electron.OpenDialogOptions = {
				properties: ["openFile"],
				title: "选择 Python 3.12 可执行文件",
			};
			if (process.platform === "win32") {
				dialogOptions.filters = [{ name: "Python", extensions: ["exe"] }];
			}
			const selected = await dialog.showOpenDialog(dialogOptions);
			if (selected.canceled || selected.filePaths.length === 0) {
				continue;
			}
			const chosenPath = selected.filePaths[0];
			const info = await validatePythonPath(chosenPath);
			if (!info || !isRequiredPython(info.version)) {
				dialog.showErrorBox("Python 版本不匹配", "请选择 Python 3.12 的可执行文件。");
				continue;
			}
			preferredPythonPath = info.executable;
			emitStatus({ pythonPath: info.executable });
			return info;
		}

		if (response.response === 1) {
			break;
		}

		throw new Error("Python 3.12 installation cancelled by user.");
	}

	await installPython312();

	const installed = await findInstalledPython312();
	if (!installed) {
		throw new Error("Python 3.12 installation completed but was not detected.");
	}

	return installed;
}

async function ensureVenv(
	systemPythonPath: string,
	venvDir: string,
): Promise<void> {
	if (fs.existsSync(getVenvPythonPath(venvDir))) {
		return;
	}
	emitStatus({ message: "创建 Python 虚拟环境", progress: 45 });
	emitLog(`Creating virtual environment at: ${venvDir}`);
	fs.mkdirSync(venvDir, { recursive: true });
	const uvCheck = await runCommand("uv", ["--version"]);
	const useUv = uvCheck.code === 0;
	const result = useUv
		? await runCommand("uv", ["venv", venvDir, "--python", systemPythonPath], {
				env: getUvEnv(),
		  })
		: await runCommand(systemPythonPath, ["-m", "venv", venvDir]);
	if (result.code !== 0) {
		throw new Error(
			`Failed to create venv: ${result.stderr || result.stdout}`,
		);
	}
}

async function ensureUvInVenv(
	venvPython: string,
	venvDir: string,
): Promise<string> {
	const uvPath = getVenvUvPath(venvDir);
	if (fs.existsSync(uvPath)) {
		return uvPath;
	}
	emitStatus({ message: "安装 uv", progress: 52 });
	emitLog("Installing uv into virtual environment...");
	const env = getPipEnv();
	const install = await runCommand(
		venvPython,
		["-m", "pip", "install", "--upgrade", "uv"],
		{ env, onStdout: emitLog, onStderr: emitLog },
	);
	if (install.code !== 0) {
		throw new Error(`Failed to install uv: ${install.stderr || install.stdout}`);
	}
	if (!fs.existsSync(uvPath)) {
		throw new Error("uv installed but executable was not found in venv.");
	}
	return uvPath;
}

async function ensureDependencies(
	venvPython: string,
	venvDir: string,
	requirementsPath: string,
): Promise<void> {
	if (!fs.existsSync(requirementsPath)) {
		throw new Error(`Requirements file not found: ${requirementsPath}`);
	}
	emitLog(`Using requirements: ${requirementsPath}`);

	const requirementsHash = readFileHash(requirementsPath);
	const marker = readDepsMarker(venvDir);
	if (marker?.requirementsHash === requirementsHash) {
		return;
	}

	await dialog.showMessageBox({
		type: "info",
		buttons: ["Continue"],
		message: "Installing backend dependencies",
		detail:
			"This is the first launch. FreeTodo will now download and install Python dependencies. It may take several minutes depending on your network.",
	});

	assertNotCancelled();
	const uvPath = await ensureUvInVenv(venvPython, venvDir);
	emitStatus({ message: "安装后端依赖", progress: 60 });
	const env = getUvEnv();
	const install = await runCommand(
		uvPath,
		["pip", "install", "-r", requirementsPath, "--python", venvPython],
		{ env, onStdout: emitLog, onStderr: emitLog },
	);
	if (install.code !== 0) {
		throw new Error(`Failed to install dependencies: ${install.stderr || install.stdout}`);
	}

	writeDepsMarker(venvDir, requirementsHash);
}

async function ensureVenvPythonVersion(venvPython: string): Promise<boolean> {
	const info = await getPythonInfo(venvPython, []);
	return !!info && isRequiredPython(info.version);
}

export async function ensurePythonRuntime(
	venvDir: string,
	requirementsPath: string,
): Promise<string> {
	emitStatus({ message: "准备 Python 运行时", progress: 5 });
	const venvPython = getVenvPythonPath(venvDir);
	emitStatus({ venvPath: venvDir });
	assertNotCancelled();
	const runtimeRoot = path.dirname(venvDir);

	if (fs.existsSync(venvPython)) {
		const versionOk = await ensureVenvPythonVersion(venvPython);
		if (versionOk) {
			emitStatus({ message: "检查后端依赖", progress: 55 });
			await ensureDependencies(venvPython, venvDir, requirementsPath);
			emitStatus({ message: "Python 运行时就绪", progress: 70 });
			writeRuntimeManifest(runtimeRoot, {
				pythonPath: venvPython,
				venvPath: venvDir,
				requirementsHash: readFileHash(requirementsPath),
				createdAt: new Date().toISOString(),
			});
			return venvPython;
		}
		logger.warn("Existing venv does not match Python 3.12, recreating.");
		emitLog("Existing venv does not match Python 3.12, recreating.");
	}

	const systemPython = await ensurePython312Installed();
	emitStatus({ pythonPath: systemPython.executable });
	assertNotCancelled();
	if (systemPython.isConda) {
		emitLog("Detected conda environment.");
		await configureCondaMirror();
	}

	await ensureVenv(systemPython.executable, venvDir);
	emitStatus({ pythonPath: venvPython });

	if (!fs.existsSync(venvPython)) {
		throw new Error("Virtual environment was created but python executable is missing.");
	}

	await ensureDependencies(venvPython, venvDir, requirementsPath);
	emitStatus({ message: "Python 运行时就绪", progress: 70 });
	writeRuntimeManifest(runtimeRoot, {
		pythonPath: venvPython,
		venvPath: venvDir,
		requirementsHash: readFileHash(requirementsPath),
		createdAt: new Date().toISOString(),
	});
	return venvPython;
}

export { getVenvPythonPath };
