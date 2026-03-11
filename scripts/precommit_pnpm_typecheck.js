#!/usr/bin/env node
const { execFileSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const { join, resolve } = require("node:path");

function run(args, cwd) {
	return execFileSync("git", args, {
		cwd,
		stdio: ["ignore", "pipe", "pipe"],
		encoding: "utf8",
	}).trim();
}

function getRepoRoot() {
	try {
		return run(["rev-parse", "--show-toplevel"], process.cwd());
	} catch {
		return null;
	}
}

function hasPnpm(cwd) {
	try {
		execFileSync("pnpm", ["-v"], { cwd, stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}

function main() {
	const repoRoot = getRepoRoot();
	if (!repoRoot) {
		console.error("pre-commit: failed to locate repo root; skipping type-check.");
		return 0;
	}

	const frontendDir = resolve(repoRoot, "free-todo-frontend");
	if (!existsSync(frontendDir)) {
		console.error(`pre-commit: missing ${frontendDir}; skipping type-check.`);
		return 0;
	}

	if (!hasPnpm(frontendDir)) {
		console.error("pre-commit: pnpm not found in PATH; skipping type-check.");
		return 0;
	}

	try {
		execFileSync("pnpm", ["run", "type-check"], {
			cwd: frontendDir,
			stdio: "inherit",
		});
		return 0;
	} catch (error) {
		return typeof error?.status === "number" ? error.status : 1;
	}
}

process.exit(main());
