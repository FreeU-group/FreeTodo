#!/usr/bin/env node
/// <reference types="node" />
/**
 * 检查 TypeScript/TSX 文件的有效代码行数（不含空行和注释行）。
 * 超过指定行数上限的文件将被报告，脚本以非零状态码退出。
 *
 * 使用方法：
 *   # 检查整个目录（单独运行）
 *   node check_code_lines.mts [--include dirs] [--exclude dirs] [--max lines]
 *
 *   # 检查指定文件（pre-commit 模式）
 *   node check_code_lines.mts [options] file1.ts file2.tsx ...
 *
 * 示例：
 *   # 扫描整个前端目录
 *   node check_code_lines.mts --include apps,components,lib --exclude lib/generated --max 500
 *
 *   # 只检查指定文件（pre-commit 会传入暂存的文件）
 *   node check_code_lines.mts apps/chat/ChatPanel.tsx apps/todo/TodoList.tsx
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// 获取脚本所在目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 默认配置
const DEFAULT_INCLUDE = ["apps", "components", "electron", "lib"];
const DEFAULT_EXCLUDE = ["lib/generated"];
const DEFAULT_MAX_LINES = 500;

interface Config {
  includeDirs: string[];
  excludeDirs: string[];
  maxLines: number;
  files: string[]; // 指定的文件列表
}

/**
 * 解析命令行参数
 */
function parseArgs(): Config {
  const args = process.argv.slice(2);
  let includeDirs = DEFAULT_INCLUDE;
  let excludeDirs = DEFAULT_EXCLUDE;
  let maxLines = DEFAULT_MAX_LINES;
  const files: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--include" && args[i + 1]) {
      includeDirs = args[i + 1].split(",").map((d) => d.trim()).filter(Boolean);
      i++;
    } else if (arg === "--exclude" && args[i + 1]) {
      excludeDirs = args[i + 1].split(",").map((d) => d.trim()).filter(Boolean);
      i++;
    } else if (arg === "--max" && args[i + 1]) {
      maxLines = parseInt(args[i + 1], 10);
      i++;
    } else if (!arg.startsWith("--")) {
      // 位置参数视为文件路径
      files.push(arg);
    }
  }

  return { includeDirs, excludeDirs, maxLines, files };
}

/**
 * 判断行是否为注释行
 *
 * 规则：trim() 后以 //、/*、*、*\/ 开头的行视为注释行
 */
function isCommentLine(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.startsWith("//") ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith("*/")
  );
}

/**
 * 统计文件的有效代码行数（不含空行和注释行）
 */
function countCodeLines(filePath: string): number {
  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    let codeLines = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      // 跳过空行
      if (!trimmed) {
        continue;
      }
      // 跳过注释行
      if (isCommentLine(line)) {
        continue;
      }
      // 有效代码行
      codeLines++;
    }

    return codeLines;
  } catch (error) {
    console.error(`警告：无法读取文件 ${filePath}: ${error}`);
    return 0;
  }
}

/**
 * 判断文件是否应该被检查
 */
function shouldCheckFile(
  relPath: string,
  includeDirs: string[],
  excludeDirs: string[]
): boolean {
  // 检查是否在包含目录中
  const inInclude = includeDirs.some((inc) => relPath.startsWith(inc));
  if (!inInclude) {
    return false;
  }

  // 检查是否在排除目录中
  const inExclude = excludeDirs.some((exc) => relPath.startsWith(exc));
  if (inExclude) {
    return false;
  }

  return true;
}

/**
 * 递归遍历目录，获取所有 .ts 和 .tsx 文件
 */
function* walkDir(dir: string): Generator<string> {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        // 跳过 node_modules 和隐藏目录
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
    // 忽略无法访问的目录
  }
}

/**
 * 获取要检查的文件列表
 */
function getFilesToCheck(
  config: Config,
  rootDir: string
): string[] {
  const filesToCheck: string[] = [];

  if (config.files.length > 0) {
    // 模式 1: 检查指定的文件（pre-commit 模式）
    for (const fileStr of config.files) {
      // 处理相对路径和绝对路径
      const filePath = isAbsolute(fileStr) ? fileStr : resolve(fileStr);

      // 只检查 .ts/.tsx 文件
      if (!filePath.endsWith(".ts") && !filePath.endsWith(".tsx")) {
        continue;
      }

      // 检查文件是否存在
      if (!existsSync(filePath)) {
        continue;
      }

      // 获取相对于前端根目录的路径
      let relPath: string;
      try {
        relPath = relative(rootDir, filePath);
        // 如果相对路径以 .. 开头，说明文件不在前端目录下
        if (relPath.startsWith("..")) {
          continue;
        }
      } catch {
        continue;
      }

      // 检查是否在 include/exclude 范围内
      if (shouldCheckFile(relPath, config.includeDirs, config.excludeDirs)) {
        filesToCheck.push(filePath);
      }
    }
  } else {
    // 模式 2: 扫描整个目录（单独运行模式）
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
 * 主函数
 */
function main(): number {
  const config = parseArgs();

  // 获取前端项目根目录（脚本位于 free-todo-frontend/scripts/ 下）
  const rootDir = dirname(__dirname);

  // 获取要检查的文件
  const filesToCheck = getFilesToCheck(config, rootDir);

  if (filesToCheck.length === 0) {
    if (config.files.length > 0) {
      // pre-commit 模式下没有匹配的文件，直接通过
      return 0;
    } else {
      console.log("未找到需要检查的 TS/TSX 文件");
      return 0;
    }
  }

  // 收集超限文件
  const violations: Array<{ path: string; lines: number }> = [];

  for (const filePath of filesToCheck) {
    const relPath = relative(rootDir, filePath);
    const codeLines = countCodeLines(filePath);
    if (codeLines > config.maxLines) {
      violations.push({ path: relPath, lines: codeLines });
    }
  }

  // 输出结果
  if (violations.length > 0) {
    console.log(`❌ 以下文件代码行数超过 ${config.maxLines} 行：`);
    violations.sort((a, b) => a.path.localeCompare(b.path));
    for (const { path, lines } of violations) {
      console.log(`  ${path} -> ${lines} 行`);
    }
    return 1;
  } else {
    const modeDesc = config.files.length > 0 ? `检查了 ${filesToCheck.length} 个文件，` : "";
    console.log(`✓ ${modeDesc}所有 TS/TSX 文件代码行数均不超过 ${config.maxLines} 行`);
    return 0;
  }
}

process.exit(main());
