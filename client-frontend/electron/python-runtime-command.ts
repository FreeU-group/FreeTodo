/**
 * Shared command runner for Python runtime bootstrap
 */

import { spawn } from "node:child_process";
import {
	clearActiveProcess,
	isCancelled,
	onCancel,
	setActiveProcess,
} from "./bootstrap-control";

export type CommandResult = {
	code: number | null;
	stdout: string;
	stderr: string;
};

export type CommandOptions = {
	cwd?: string;
	env?: NodeJS.ProcessEnv;
	windowsHide?: boolean;
	onStdout?: (chunk: string) => void;
	onStderr?: (chunk: string) => void;
};

export async function runCommand(
	command: string,
	args: string[],
	options: CommandOptions = {},
): Promise<CommandResult> {
	if (isCancelled()) {
		return { code: 1, stdout: "", stderr: "Installation cancelled" };
	}
	return new Promise((resolve) => {
		const child = spawn(command, args, {
			cwd: options.cwd,
			env: options.env,
			windowsHide: options.windowsHide ?? true,
		});
		setActiveProcess(child);
		const unsubscribe = onCancel(() => {
			try {
				child.kill();
			} catch {
				// ignore kill errors
			}
		});

		let stdout = "";
		let stderr = "";

		child.stdout?.on("data", (data) => {
			stdout += data.toString();
			options.onStdout?.(data.toString());
		});
		child.stderr?.on("data", (data) => {
			stderr += data.toString();
			options.onStderr?.(data.toString());
		});

		child.on("close", (code) => {
			unsubscribe();
			clearActiveProcess(child);
			resolve({ code, stdout, stderr });
		});

		child.on("error", (error) => {
			unsubscribe();
			clearActiveProcess(child);
			resolve({ code: 1, stdout: "", stderr: error.message });
		});
	});
}
