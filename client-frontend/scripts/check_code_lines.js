#!/usr/bin/env node
/**
 * Check effective TypeScript/TSX code lines (excluding blank lines and comments).
 * Files over the limit are reported and the script exits non-zero.
 *
 * Usage:
 *   # Scan the entire directory (standalone)
 *   node check_code_lines.js [--include dirs] [--exclude dirs] [--max lines]
 *
 *   # Check specified files (pre-commit mode)
 *   node check_code_lines.js [options] file1.ts file2.tsx ...
 *
 * Examples:
 *   # Scan the whole frontend directory
 *   node check_code_lines.js --include apps,components,lib --exclude lib/generated --max 500
 *
 *   # Check specific files (pre-commit passes staged files)
 *   node check_code_lines.js apps/chat/ChatPanel.tsx apps/todo/TodoList.tsx
 */

const { existsSync, readdirSync, readFileSync } = require("node:fs");
const { dirname, isAbsolute, join, relative, resolve } = require("node:path");

// Script directory (CommonJS)
// In CommonJS, __dirname and __filename are available by default.

// Default configuration
const DEFAULT_INCLUDE = ["apps", "components", "electron", "lib"];
const DEFAULT_EXCLUDE = ["lib/generated"];
const DEFAULT_MAX_LINES = 500;

/**
 * @typedef {Object} Config
 * @property {string[]} includeDirs
 * @property {string[]} excludeDirs
 * @property {number} maxLines
 * @property {string[]} files - Explicit file list
 */

/**
 * Parse CLI arguments.
 * @returns {Config}
 */
function parseArgs() {
  const args = process.argv.slice(2);
  let includeDirs = DEFAULT_INCLUDE;
  let excludeDirs = DEFAULT_EXCLUDE;
  let maxLines = DEFAULT_MAX_LINES;
  /** @type {string[]} */
  const files = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--include" && args[i + 1]) {
      includeDirs = args[i + 1]
        .split(",")
        .map((d) => d.trim())
        .filter(Boolean);
      i++;
    } else if (arg === "--exclude" && args[i + 1]) {
      excludeDirs = args[i + 1]
        .split(",")
        .map((d) => d.trim())
        .filter(Boolean);
      i++;
    } else if (arg === "--max" && args[i + 1]) {
      maxLines = parseInt(args[i + 1], 10);
      i++;
    } else if (!arg.startsWith("--")) {
      // Positional args are treated as file paths
      files.push(arg);
    }
  }

  return { includeDirs, excludeDirs, maxLines, files };
}

/**
 * Check whether a line is a comment-only line.
 *
 * Rule: after trim(), lines starting with //, /*, *, or * / are comments.
 * @param {string} line
 * @returns {boolean}
 */
function isCommentLine(line) {
  const trimmed = line.trim();
  return (
    trimmed.startsWith("//") ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith("*/")
  );
}

/**
 * Count effective code lines (excluding blank lines and comments).
 * @param {string} filePath
 * @returns {number}
 */
function countCodeLines(filePath) {
  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    let codeLines = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      // Skip blank lines
      if (!trimmed) {
        continue;
      }
      // Skip comment-only lines
      if (isCommentLine(line)) {
        continue;
      }
      // Counted line
      codeLines++;
    }

    return codeLines;
  } catch (error) {
    console.error(`Warning: failed to read file ${filePath}: ${error}`);
    return 0;
  }
}

/**
 * Normalize path separators to / (Windows-friendly).
 * @param {string} p
 * @returns {string}
 */
function normalizePath(p) {
  return p.replace(/\\/g, "/");
}

/**
 * Determine whether a file should be checked.
 * @param {string} relPath
 * @param {string[]} includeDirs
 * @param {string[]} excludeDirs
 * @returns {boolean}
 */
function shouldCheckFile(relPath, includeDirs, excludeDirs) {
  // Normalize to / separators
  const normalizedPath = normalizePath(relPath);

  // Check include directories
  const inInclude = includeDirs.some((inc) =>
    normalizedPath.startsWith(normalizePath(inc))
  );
  if (!inInclude) {
    return false;
  }

  // Check exclude directories
  const inExclude = excludeDirs.some((exc) =>
    normalizedPath.startsWith(normalizePath(exc))
  );
  if (inExclude) {
    return false;
  }

  return true;
}

/**
 * Recursively walk a directory for .ts and .tsx files.
 * @param {string} dir
 * @returns {Generator<string>}
 */
function* walkDir(dir) {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip node_modules and hidden directories
        if (entry.name === "node_modules" || entry.name.startsWith(".")) {
          continue;
        }
        yield* walkDir(fullPath);
      } else if (entry.isFile()) {
        if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
          yield fullPath;
        }
      }
    }
  } catch {
    // Ignore inaccessible directories
  }
}

/**
 * Get the list of files to check.
 * @param {Config} config
 * @param {string} rootDir
 * @returns {string[]}
 */
function getFilesToCheck(config, rootDir) {
  /** @type {string[]} */
  const filesToCheck = [];

  if (config.files.length > 0) {
    // Mode 1: Check specified files (pre-commit mode)
    for (const fileStr of config.files) {
      // Handle relative and absolute paths
      const filePath = isAbsolute(fileStr) ? fileStr : resolve(fileStr);

      // Only check .ts/.tsx files
      if (!filePath.endsWith(".ts") && !filePath.endsWith(".tsx")) {
        continue;
      }

      // Skip missing files
      if (!existsSync(filePath)) {
        continue;
      }

      // Get path relative to frontend root
      /** @type {string} */
      let relPath;
      try {
        relPath = relative(rootDir, filePath);
        // If rel path starts with "..", it's outside the frontend directory
        if (relPath.startsWith("..")) {
          continue;
        }
      } catch {
        continue;
      }

      // Check include/exclude filters
      if (shouldCheckFile(relPath, config.includeDirs, config.excludeDirs)) {
        filesToCheck.push(filePath);
      }
    }
  } else {
    // Mode 2: Scan entire directory (standalone mode)
    for (const filePath of walkDir(rootDir)) {
      const relPath = relative(rootDir, filePath);
      if (shouldCheckFile(relPath, config.includeDirs, config.excludeDirs)) {
        filesToCheck.push(filePath);
      }
    }
  }

  return filesToCheck;
}

/**
 * Main entrypoint.
 * @returns {number}
 */
function main() {
  const config = parseArgs();

  // Frontend root (script lives in free-todo-frontend/scripts/)
  const rootDir = dirname(__dirname);

  // Collect files to check
  const filesToCheck = getFilesToCheck(config, rootDir);

  if (filesToCheck.length === 0) {
    if (config.files.length > 0) {
      // No matching files in pre-commit mode
      return 0;
    } else {
      console.log("No TS/TSX files to check.");
      return 0;
    }
  }

  // Collect violations
  /** @type {Array<{ path: string; lines: number }>} */
  const violations = [];

  for (const filePath of filesToCheck) {
    const relPath = relative(rootDir, filePath);
    const codeLines = countCodeLines(filePath);
    if (codeLines > config.maxLines) {
      violations.push({ path: relPath, lines: codeLines });
    }
  }

  // Output results
  if (violations.length > 0) {
    console.log(
      `[ERROR] The following files exceed ${config.maxLines} code lines:`
    );
    violations.sort((a, b) => a.path.localeCompare(b.path));
    for (const { path, lines } of violations) {
      console.log(`  ${path} -> ${lines} lines`);
    }
    return 1;
  } else {
    const modeDesc =
      config.files.length > 0 ? `Checked ${filesToCheck.length} files, ` : "";
    console.log(
      `[OK] ${modeDesc}all TS/TSX files are within ${config.maxLines} code lines`
    );
    return 0;
  }
}

process.exit(main());
