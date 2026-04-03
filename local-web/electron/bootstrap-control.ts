/**
 * Bootstrap cancellation control
 */

import type { ChildProcess } from "node:child_process";

let cancelled = false;
let activeProcess: ChildProcess | null = null;
const listeners = new Set<() => void>();

export function isCancelled(): boolean {
	return cancelled;
}

export function setActiveProcess(proc: ChildProcess | null): void {
	activeProcess = proc;
}

export function clearActiveProcess(proc: ChildProcess | null): void {
	if (activeProcess === proc) {
		activeProcess = null;
	}
}

export function onCancel(handler: () => void): () => void {
	listeners.add(handler);
	return () => listeners.delete(handler);
}

export function cancelBootstrap(): void {
	if (cancelled) {
		return;
	}
	cancelled = true;
	if (activeProcess && !activeProcess.killed) {
		try {
			activeProcess.kill();
		} catch {
			// ignore kill errors
		}
	}
	for (const listener of listeners) {
		try {
			listener();
		} catch {
			// ignore listener errors
		}
	}
}
