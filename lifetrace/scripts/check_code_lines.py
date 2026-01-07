#!/usr/bin/env python3
"""
检查 Python 文件的有效代码行数（不含空行和注释行）。
超过指定行数上限的文件将被报告，脚本以非零状态码退出。

使用方法：
    # 检查整个目录（单独运行）
    python check_code_lines.py [--include dirs] [--exclude dirs] [--max lines]

    # 检查指定文件（pre-commit 模式）
    python check_code_lines.py [options] file1.py file2.py ...

示例：
    # 扫描整个 lifetrace 目录
    python check_code_lines.py --include lifetrace --exclude lifetrace/__pycache__,lifetrace/dist --max 500

    # 只检查指定文件（pre-commit 会传入暂存的文件）
    python check_code_lines.py lifetrace/routers/chat.py lifetrace/services/todo.py
"""

import argparse
import sys
from pathlib import Path

# 默认配置
DEFAULT_INCLUDE = ["lifetrace"]
DEFAULT_EXCLUDE = [
    "lifetrace/__pycache__",
    "lifetrace/dist",
    "lifetrace/migrations/versions",
]
DEFAULT_MAX_LINES = 500


def parse_args() -> argparse.Namespace:
    """解析命令行参数"""
    parser = argparse.ArgumentParser(
        description="检查 Python 文件的有效代码行数（不含空行和注释行）"
    )
    parser.add_argument(
        "files",
        nargs="*",
        help="要检查的文件列表（如不提供则扫描整个目录）",
    )
    parser.add_argument(
        "--include",
        type=str,
        default=",".join(DEFAULT_INCLUDE),
        help=f"逗号分隔的目录前缀列表，只检查这些目录下的文件（默认：{','.join(DEFAULT_INCLUDE)}）",
    )
    parser.add_argument(
        "--exclude",
        type=str,
        default=",".join(DEFAULT_EXCLUDE),
        help=f"逗号分隔的排除目录前缀列表（默认：{','.join(DEFAULT_EXCLUDE)}）",
    )
    parser.add_argument(
        "--max",
        type=int,
        default=DEFAULT_MAX_LINES,
        help=f"有效代码行数上限（默认：{DEFAULT_MAX_LINES}）",
    )
    return parser.parse_args()


def count_code_lines(file_path: Path) -> int:
    """
    统计文件的有效代码行数（不含空行和注释行）

    规则：
    - 空行（strip 后为空字符串）：不计数
    - 以 # 开头的行（注释行）：不计数
    - 其他行：计数
    """
    code_lines = 0
    try:
        with open(file_path, encoding="utf-8") as f:
            for line in f:
                stripped = line.strip()
                # 跳过空行
                if not stripped:
                    continue
                # 跳过注释行
                if stripped.startswith("#"):
                    continue
                # 有效代码行
                code_lines += 1
    except (OSError, UnicodeDecodeError) as e:
        print(f"警告：无法读取文件 {file_path}: {e}", file=sys.stderr)
        return 0
    return code_lines


def should_check_file(
    file_path: Path, root_dir: Path, include_dirs: list[str], exclude_dirs: list[str]
) -> bool:
    """
    判断文件是否应该被检查

    Args:
        file_path: 文件路径
        root_dir: 项目根目录
        include_dirs: 包含的目录前缀列表
        exclude_dirs: 排除的目录前缀列表

    Returns:
        True 如果文件应该被检查，否则 False
    """
    # 获取相对于项目根目录的路径
    try:
        rel_path = file_path.relative_to(root_dir)
    except ValueError:
        return False

    rel_path_str = str(rel_path)

    # 检查是否在包含目录中
    in_include = any(rel_path_str.startswith(inc) for inc in include_dirs)
    if not in_include:
        return False

    # 检查是否在排除目录中
    in_exclude = any(rel_path_str.startswith(exc) for exc in exclude_dirs)
    if in_exclude:
        return False

    return True


def get_files_to_check(
    args: argparse.Namespace, root_dir: Path, include_dirs: list[str], exclude_dirs: list[str]
) -> list[Path]:
    """
    获取要检查的文件列表

    Args:
        args: 命令行参数
        root_dir: 项目根目录
        include_dirs: 包含的目录前缀列表
        exclude_dirs: 排除的目录前缀列表

    Returns:
        要检查的文件路径列表
    """
    files_to_check: list[Path] = []

    if args.files:
        # 模式 1: 检查指定的文件（pre-commit 模式）
        for file_str in args.files:
            file_path = Path(file_str).resolve()
            # 只检查 .py 文件
            if not file_path.suffix == ".py":
                continue
            # 检查文件是否存在
            if not file_path.exists():
                continue
            # 检查是否在 include/exclude 范围内
            if should_check_file(file_path, root_dir, include_dirs, exclude_dirs):
                files_to_check.append(file_path)
    else:
        # 模式 2: 扫描整个目录（单独运行模式）
        for py_file in root_dir.rglob("*.py"):
            if should_check_file(py_file, root_dir, include_dirs, exclude_dirs):
                files_to_check.append(py_file)

    return files_to_check


def main() -> int:
    """主函数"""
    args = parse_args()

    # 解析参数
    include_dirs = [d.strip() for d in args.include.split(",") if d.strip()]
    exclude_dirs = [d.strip() for d in args.exclude.split(",") if d.strip()]
    max_lines = args.max

    # 获取项目根目录（脚本位于 lifetrace/scripts/ 下）
    script_dir = Path(__file__).resolve().parent
    root_dir = script_dir.parent.parent

    # 获取要检查的文件
    files_to_check = get_files_to_check(args, root_dir, include_dirs, exclude_dirs)

    if not files_to_check:
        if args.files:
            # pre-commit 模式下没有匹配的文件，直接通过
            return 0
        else:
            print("未找到需要检查的 Python 文件")
            return 0

    # 收集超限文件
    violations: list[tuple[str, int]] = []

    for py_file in files_to_check:
        code_lines = count_code_lines(py_file)
        if code_lines > max_lines:
            rel_path = py_file.relative_to(root_dir)
            violations.append((str(rel_path), code_lines))

    # 输出结果
    if violations:
        print(f"❌ 以下文件代码行数超过 {max_lines} 行：")
        for path, lines in sorted(violations):
            print(f"  {path} -> {lines} 行")
        return 1
    else:
        mode_desc = f"检查了 {len(files_to_check)} 个文件，" if args.files else ""
        print(f"✓ {mode_desc}所有 Python 文件代码行数均不超过 {max_lines} 行")
        return 0


if __name__ == "__main__":
    sys.exit(main())
