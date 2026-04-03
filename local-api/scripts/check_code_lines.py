#!/usr/bin/env python3
"""
Check effective Python code lines (excluding blank lines and comments).
Files over the limit are reported and the script exits non-zero.

Usage:
    # Scan the whole directory (standalone)
    python check_code_lines.py [--include dirs] [--exclude dirs] [--max lines]

    # Check specific files (pre-commit mode)
    python check_code_lines.py [options] file1.py file2.py ...

Examples:
    # Scan the entire lifetrace directory
    python check_code_lines.py --include lifetrace --exclude lifetrace/__pycache__,lifetrace/dist --max 500

    # Check specific files (pre-commit passes staged files)
    python check_code_lines.py lifetrace/routers/chat.py lifetrace/services/todo.py
"""

import argparse
import sys
from pathlib import Path

# Default configuration
DEFAULT_INCLUDE = ["."]
DEFAULT_EXCLUDE = [
    ".venv",
    "server/.venv",
    "__pycache__",
    "dist",
    "migrations/versions",
    "client/.venv",
    "node_modules",
    "lifetrace",
]
DEFAULT_MAX_LINES = 500


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description="Check effective Python code lines (excluding blank lines and comments)."
    )
    parser.add_argument(
        "files",
        nargs="*",
        help="Files to check (if omitted, scan the entire directory).",
    )
    parser.add_argument(
        "--include",
        type=str,
        default=",".join(DEFAULT_INCLUDE),
        help=(
            f"Comma-separated directory prefixes to include (default: {','.join(DEFAULT_INCLUDE)})"
        ),
    )
    parser.add_argument(
        "--exclude",
        type=str,
        default=",".join(DEFAULT_EXCLUDE),
        help=(
            f"Comma-separated directory prefixes to exclude (default: {','.join(DEFAULT_EXCLUDE)})"
        ),
    )
    parser.add_argument(
        "--max",
        type=int,
        default=DEFAULT_MAX_LINES,
        help=f"Maximum allowed code lines (default: {DEFAULT_MAX_LINES}).",
    )
    return parser.parse_args()


def count_code_lines(file_path: Path) -> int:
    """
    Count effective code lines (excluding blank lines and comment-only lines).

    Rules:
    - Blank lines (strip() == ""): not counted
    - Lines starting with "#": not counted
    - All other lines: counted
    """
    code_lines = 0
    try:
        with open(file_path, encoding="utf-8") as f:
            for line in f:
                stripped = line.strip()
                # Skip blank lines
                if not stripped:
                    continue
                # Skip comment-only lines
                if stripped.startswith("#"):
                    continue
                # Counted line
                code_lines += 1
    except (OSError, UnicodeDecodeError) as e:
        print(f"Warning: failed to read file {file_path}: {e}", file=sys.stderr)
        return 0
    return code_lines


def should_check_file(
    file_path: Path, root_dir: Path, include_dirs: list[str], exclude_dirs: list[str]
) -> bool:
    """
    Determine whether a file should be checked.

    Args:
        file_path: File path
        root_dir: Project root directory
        include_dirs: Directory prefixes to include
        exclude_dirs: Directory prefixes to exclude

    Returns:
        True if the file should be checked; otherwise False
    """
    # Get path relative to the project root
    try:
        rel_path = file_path.relative_to(root_dir)
    except ValueError:
        return False

    # Normalize to forward slashes to avoid Windows separator issues
    rel_path_str = str(rel_path).replace("\\", "/")

    # Check include directories
    in_include = any(rel_path_str.startswith(inc.replace("\\", "/")) for inc in include_dirs)
    if not in_include:
        return False

    # Check exclude directories
    in_exclude = any(rel_path_str.startswith(exc.replace("\\", "/")) for exc in exclude_dirs)
    return not in_exclude


def get_files_to_check(
    args: argparse.Namespace, root_dir: Path, include_dirs: list[str], exclude_dirs: list[str]
) -> list[Path]:
    """
    Get the list of files to check.

    Args:
        args: Parsed command-line arguments
        root_dir: Project root directory
        include_dirs: Directory prefixes to include
        exclude_dirs: Directory prefixes to exclude

    Returns:
        List of file paths to check
    """
    files_to_check: list[Path] = []

    if args.files:
        # Mode 1: Check specified files (pre-commit mode)
        for file_str in args.files:
            file_path = Path(file_str).resolve()
            # Only check .py files
            if file_path.suffix != ".py":
                continue
            # Skip missing files
            if not file_path.exists():
                continue
            # Check include/exclude filters
            if should_check_file(file_path, root_dir, include_dirs, exclude_dirs):
                files_to_check.append(file_path)
    else:
        # Mode 2: Scan entire directory (standalone mode)
        for py_file in root_dir.rglob("*.py"):
            if should_check_file(py_file, root_dir, include_dirs, exclude_dirs):
                files_to_check.append(py_file)

    return files_to_check


def main() -> int:
    """Main entrypoint."""
    args = parse_args()

    # Parse arguments
    include_dirs = [d.strip() for d in args.include.split(",") if d.strip()]
    exclude_dirs = [d.strip() for d in args.exclude.split(",") if d.strip()]
    max_lines = args.max

    # Project root (script lives in lifetrace/scripts/)
    script_dir = Path(__file__).resolve().parent
    root_dir = script_dir.parent.parent

    # Collect files to check
    files_to_check = get_files_to_check(args, root_dir, include_dirs, exclude_dirs)

    if not files_to_check:
        if args.files:
            # No matching files in pre-commit mode
            return 0
        else:
            print("No Python files to check.")
            return 0

    # Collect violations
    violations: list[tuple[str, int]] = []

    for py_file in files_to_check:
        code_lines = count_code_lines(py_file)
        if code_lines > max_lines:
            rel_path = py_file.relative_to(root_dir)
            violations.append((str(rel_path), code_lines))

    # Output results
    if violations:
        print(f"[ERROR] The following files exceed {max_lines} code lines:")
        for path, lines in sorted(violations):
            print(f"  {path} -> {lines} lines")
        return 1
    else:
        mode_desc = f"Checked {len(files_to_check)} files, " if args.files else ""
        print(f"[OK] {mode_desc}all Python files are within {max_lines} code lines")
        return 0


if __name__ == "__main__":
    sys.exit(main())
