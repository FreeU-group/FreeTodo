import { execSync } from "node:child_process";
import path from "node:path";

let cachedCommit: string | null = null;

export function getGitCommit(): string | null {
	const envCommit = process.env.FREETODO_GIT_COMMIT || process.env.GIT_COMMIT;
	if (envCommit) {
		return envCommit;
	}

	if (cachedCommit !== null) {
		return cachedCommit;
	}

	const repoRoot = path.resolve(__dirname, "..");
	if (repoRoot.includes(".asar")) {
		cachedCommit = null;
		return cachedCommit;
	}

	try {
		const commit = execSync("git rev-parse HEAD", {
			cwd: repoRoot,
			stdio: ["ignore", "pipe", "ignore"],
		})
			.toString()
			.trim();
		cachedCommit = commit || null;
	} catch {
		cachedCommit = null;
	}

	return cachedCommit;
}
