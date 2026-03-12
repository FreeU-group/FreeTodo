/**
 * Bootstrap status broadcaster (main process only)
 */

import { EventEmitter } from "node:events";

export type BootstrapStatus = {
	message?: string;
	progress?: number;
	detail?: string;
	level?: "info" | "warn" | "error";
	installPath?: string;
	pythonPath?: string;
	venvPath?: string;
};

const emitter = new EventEmitter();

export function emitStatus(status: BootstrapStatus): void {
	emitter.emit("status", status);
}

export function emitLog(line: string): void {
	emitter.emit("log", line);
}

export function emitComplete(): void {
	emitter.emit("complete");
}

export function onStatus(handler: (status: BootstrapStatus) => void): void {
	emitter.on("status", handler);
}

export function onLog(handler: (line: string) => void): void {
	emitter.on("log", handler);
}

export function onComplete(handler: () => void): void {
	emitter.on("complete", handler);
}
