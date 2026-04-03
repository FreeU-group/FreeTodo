/**
 * Python runtime environment helpers (mirrors, region detection)
 */

import { app } from "electron";
import { emitLog } from "./bootstrap-status";
import { runCommand } from "./python-runtime-command";

const PIP_INDEX_CN = "https://pypi.tuna.tsinghua.edu.cn/simple";
const PIP_INDEX_GLOBAL = "https://pypi.org/simple";

let pipMirrorLogged = false;
let condaMirrorConfigured = false;

function isMainlandChina(): boolean {
	const override = process.env.FREETODO_REGION?.toLowerCase();
	if (override === "cn") {
		return true;
	}
	if (override === "global" || override === "intl") {
		return false;
	}
	const locale = app.getLocale?.() ?? "";
	const languages = app.getPreferredSystemLanguages?.() ?? [];
	const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
	if (locale.toLowerCase().startsWith("zh-cn")) {
		return true;
	}
	if (languages.some((lang) => lang.toLowerCase().startsWith("zh-cn"))) {
		return true;
	}
	return [
		"Asia/Shanghai",
		"Asia/Chongqing",
		"Asia/Harbin",
		"Asia/Urumqi",
		"Asia/Beijing",
	].includes(timeZone);
}

export function getPipEnv(): NodeJS.ProcessEnv {
	const useCn = isMainlandChina();
	if (!pipMirrorLogged) {
		const label = useCn ? "清华源" : "PyPI 官方源";
		emitLog(`Pip index selected: ${label}`);
		pipMirrorLogged = true;
	}
	const baseEnv: NodeJS.ProcessEnv = {
		...process.env,
		PIP_DISABLE_PIP_VERSION_CHECK: "1",
		PIP_NO_INPUT: "1",
	};
	if (useCn) {
		return {
			...baseEnv,
			PIP_INDEX_URL: PIP_INDEX_CN,
			PIP_EXTRA_INDEX_URL: PIP_INDEX_GLOBAL,
		};
	}
	return {
		...baseEnv,
		PIP_INDEX_URL: PIP_INDEX_GLOBAL,
	};
}

export function getUvEnv(): NodeJS.ProcessEnv {
	const pipEnv = getPipEnv();
	const useCn = isMainlandChina();
	if (useCn) {
		return {
			...pipEnv,
			UV_INDEX_URL: PIP_INDEX_CN,
			UV_EXTRA_INDEX_URL: PIP_INDEX_GLOBAL,
		};
	}
	return {
		...pipEnv,
		UV_INDEX_URL: PIP_INDEX_GLOBAL,
	};
}

export async function configureCondaMirror(): Promise<void> {
	if (condaMirrorConfigured || !isMainlandChina()) {
		return;
	}
	const condaCheck = await runCommand("conda", ["--version"]);
	if (condaCheck.code !== 0) {
		emitLog("Conda not found; skipping mirror config.");
		return;
	}
	const commands: string[][] = [
		["config", "--set", "show_channel_urls", "yes"],
		[
			"config",
			"--add",
			"channels",
			"https://mirrors.tuna.tsinghua.edu.cn/anaconda/pkgs/main/",
		],
		[
			"config",
			"--add",
			"channels",
			"https://mirrors.tuna.tsinghua.edu.cn/anaconda/pkgs/free/",
		],
		[
			"config",
			"--add",
			"channels",
			"https://mirrors.tuna.tsinghua.edu.cn/anaconda/pkgs/r/",
		],
	];
	for (const args of commands) {
		const result = await runCommand("conda", args);
		if (result.code !== 0) {
			emitLog(`Conda mirror config failed: ${result.stderr || result.stdout}`);
			return;
		}
	}
	condaMirrorConfigured = true;
	emitLog("Conda mirror configured to Tsinghua.");
}
