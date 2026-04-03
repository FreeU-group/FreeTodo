/**
 * Python 3.12 installer helpers (download + system install)
 */

import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { app } from "electron";
import { onCancel } from "./bootstrap-control";
import { emitLog, emitStatus } from "./bootstrap-status";
import { logger } from "./logger";
import { runCommand } from "./python-runtime-command";

const PYTHON_VERSION_FALLBACK = "3.12.9";
const PYTHON_DOWNLOAD_BASE = "https://www.python.org/ftp/python";
const PYTHON_RELEASES_API =
	"https://www.python.org/api/v2/downloads/release/?is_published=1";

type PythonRelease = {
	version?: string;
	name?: string;
};

async function fetchJson<T>(url: string): Promise<T> {
	return await new Promise<T>((resolve, reject) => {
		const request = https.get(url, (response) => {
			const status = response.statusCode ?? 0;
			if (status !== 200) {
				reject(new Error(`Request failed (${status}) from ${url}`));
				return;
			}
			const chunks: Array<Buffer> = [];
			response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
			response.on("end", () => {
				try {
					const json = JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
					resolve(json);
				} catch (error) {
					reject(error);
				}
			});
		});

		const unsubscribe = onCancel(() => {
			request.destroy(new Error("Installation cancelled"));
		});

		request.on("error", (error) => {
			unsubscribe();
			reject(error);
		});
	});
}

function compareSemver(a: string, b: string): number {
	const aParts = a.split(".").map((part) => Number(part));
	const bParts = b.split(".").map((part) => Number(part));
	const length = Math.max(aParts.length, bParts.length);
	for (let index = 0; index < length; index += 1) {
		const aValue = aParts[index] ?? 0;
		const bValue = bParts[index] ?? 0;
		if (aValue !== bValue) {
			return aValue - bValue;
		}
	}
	return 0;
}

async function getLatestPython312Version(): Promise<string> {
	try {
		const releases = await fetchJson<PythonRelease[]>(PYTHON_RELEASES_API);
		const versions = releases
			.map((release) => release.version ?? release.name ?? "")
			.filter((version) => version.startsWith("3.12."));

		if (versions.length === 0) {
			logger.warn("No Python 3.12 release found, using fallback.");
			return PYTHON_VERSION_FALLBACK;
		}

		const sorted = versions.sort(compareSemver);
		const latest = sorted[sorted.length - 1] ?? PYTHON_VERSION_FALLBACK;
		logger.info(`Resolved Python 3.12 version: ${latest}`);
		return latest;
	} catch (error) {
		logger.warn(`Failed to resolve latest Python 3.12: ${String(error)}`);
		return PYTHON_VERSION_FALLBACK;
	}
}

async function downloadFile(
	url: string,
	destination: string,
	redirectsLeft = 5,
): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		const request = https.get(url, (response) => {
			const status = response.statusCode ?? 0;
			const location = response.headers.location;
			if (status >= 300 && status < 400 && location && redirectsLeft > 0) {
				response.resume();
				const redirectUrl = new URL(location, url).toString();
				downloadFile(redirectUrl, destination, redirectsLeft - 1)
					.then(resolve)
					.catch(reject);
				return;
			}
			if (status !== 200) {
				reject(new Error(`Download failed (${status}) from ${url}`));
				return;
			}
			const fileStream = fs.createWriteStream(destination);
			pipeline(response, fileStream)
				.then(() => {
					unsubscribe();
					resolve();
				})
				.catch((error) => {
					unsubscribe();
					reject(error);
				});
		});

		const unsubscribe = onCancel(() => {
			request.destroy(new Error("Installation cancelled"));
		});

		request.on("error", (error) => {
			unsubscribe();
			reject(error);
		});
	});
}

async function installPythonWindows(version: string): Promise<void> {
	emitStatus({ message: "安装 Python 3.12", progress: 20 });
	const wingetCheck = await runCommand("winget", ["--version"]);
	if (wingetCheck.code === 0) {
		logger.info("Installing Python via winget...");
		emitLog("Using winget to install Python 3.12...");
		const install = await runCommand(
			"winget",
			[
				"install",
				"--id",
				"Python.Python.3.12",
				"--exact",
				"--silent",
				"--accept-source-agreements",
				"--accept-package-agreements",
				"--scope",
				"user",
			],
			{ onStdout: emitLog, onStderr: emitLog },
		);
		if (install.code === 0) {
			emitLog("Winget install completed.");
			return;
		}
		logger.warn(`Winget install failed: ${install.stderr || install.stdout}`);
		emitLog(`Winget install failed: ${install.stderr || install.stdout}`);
	}

	const arch = process.arch === "arm64" ? "arm64" : "amd64";
	const fileName = `python-${version}-${arch}.exe`;
	const url = `${PYTHON_DOWNLOAD_BASE}/${version}/${fileName}`;
	const tempDir = path.join(app.getPath("temp"), "freetodo-python");
	fs.mkdirSync(tempDir, { recursive: true });
	const installerPath = path.join(tempDir, fileName);

	logger.info(`Downloading Python installer from ${url}`);
	emitStatus({ message: "下载 Python 安装包", progress: 25, detail: url });
	await downloadFile(url, installerPath);

	logger.info("Running Python installer...");
	emitStatus({ message: "运行 Python 安装程序", progress: 35 });
	const install = await runCommand(installerPath, [
		"/quiet",
		"InstallAllUsers=0",
		"PrependPath=1",
		"Include_test=0",
	]);

	if (install.code !== 0) {
		throw new Error(`Python installer failed: ${install.stderr || install.stdout}`);
	}
}

async function installPythonMac(version: string): Promise<void> {
	emitStatus({ message: "安装 Python 3.12", progress: 20 });
	const fileName = `python-${version}-macos11.pkg`;
	const url = `${PYTHON_DOWNLOAD_BASE}/${version}/${fileName}`;
	const tempDir = path.join(app.getPath("temp"), "freetodo-python");
	fs.mkdirSync(tempDir, { recursive: true });
	const pkgPath = path.join(tempDir, fileName);

	logger.info(`Downloading Python installer from ${url}`);
	emitStatus({ message: "下载 Python 安装包", progress: 25, detail: url });
	await downloadFile(url, pkgPath);

	const installerCommand = `installer -pkg "${pkgPath}" -target /`;
	const script = `do shell script "${installerCommand.replace(/"/g, '\\"')}" with administrator privileges`;

	logger.info("Running Python installer with admin privileges...");
	emitStatus({ message: "运行 Python 安装程序", progress: 35 });
	const install = await runCommand("osascript", ["-e", script]);
	if (install.code !== 0) {
		throw new Error(`Python installer failed: ${install.stderr || install.stdout}`);
	}
}

async function installPythonLinux(): Promise<void> {
	emitStatus({ message: "安装 Python 3.12", progress: 20 });
	const installers: Array<{ command: string; args: string[] }> = [
		{ command: "apt-get", args: ["install", "-y", "python3.12", "python3.12-venv"] },
		{ command: "dnf", args: ["install", "-y", "python3.12"] },
		{ command: "zypper", args: ["--non-interactive", "install", "python312"] },
	];

	for (const installer of installers) {
		emitLog(`Attempting ${installer.command} install...`);
		const result = await runCommand("pkexec", [
			installer.command,
			...installer.args,
		]);
		if (result.code === 0) {
			emitLog(`${installer.command} install completed.`);
			return;
		}
		logger.warn(`Linux installer failed: ${result.stderr || result.stdout}`);
		emitLog(`Linux installer failed: ${result.stderr || result.stdout}`);
	}

	throw new Error("Automatic Python install failed on Linux.");
}

export async function installPython312(): Promise<void> {
	const version = await getLatestPython312Version();
	if (process.platform === "win32") {
		await installPythonWindows(version);
		return;
	}
	if (process.platform === "darwin") {
		await installPythonMac(version);
		return;
	}
	if (process.platform === "linux") {
		await installPythonLinux();
		return;
	}
	throw new Error("Unsupported platform for Python install.");
}
