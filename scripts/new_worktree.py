#!/usr/bin/env python3
import argparse
import getpass
import os
import re
import shutil
import subprocess  # nosec B404
import sys
from pathlib import Path


def _get_git_path() -> str:
    git_path = shutil.which("git")
    if not git_path:
        raise FileNotFoundError("git executable not found in PATH")
    return git_path


def run_git(
    root: Path, args: list[str], check: bool = True
) -> subprocess.CompletedProcess[str]:
    git_path = _get_git_path()
    return subprocess.run(  # nosec B603
        [git_path, "-C", str(root), *args],
        text=True,
        capture_output=True,
        check=check,
    )


def run_link_deps(root: Path, worktree_path: Path, force: bool) -> int:
    script_dir = root / "scripts"
    if os.name == "nt":
        script = script_dir / "link_worktree_deps.ps1"
        if not script.exists():
            print(f"Missing script: {script}", file=sys.stderr)
            return 1
        cmd = [
            "powershell",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(script),
            "-Main",
            str(root),
            "-Worktree",
            str(worktree_path),
        ]
        if force:
            cmd.append("-Force")
    else:
        script = script_dir / "link_worktree_deps.sh"
        if not script.exists():
            print(f"Missing script: {script}", file=sys.stderr)
            return 1
        cmd = [
            "bash",
            str(script),
            "--main",
            str(root),
            "--worktree",
            str(worktree_path),
        ]
        if force:
            cmd.append("--force")

    result = subprocess.run(cmd, check=False)  # nosec B603
    return result.returncode


def configure_hooks(worktree_path: Path) -> None:
    hooks_dir = worktree_path / ".githooks"
    if not hooks_dir.is_dir():
        print(f"Missing hooks directory: {hooks_dir}", file=sys.stderr)
        return
    result = run_git(
        worktree_path, ["config", "core.hooksPath", ".githooks"], check=False
    )
    if result.returncode != 0:
        print(
            "Warning: failed to configure core.hooksPath for worktree.", file=sys.stderr
        )


def get_repo_root() -> Path:
    git_path = _get_git_path()
    result = subprocess.run(  # nosec B603
        [git_path, "rev-parse", "--show-toplevel"],
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        print(
            result.stderr.strip() or "Failed to locate git repo root.", file=sys.stderr
        )
        sys.exit(result.returncode or 1)
    return Path(result.stdout.strip())


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower()).strip("-")
    return slug or "task"


def branch_exists(root: Path, branch: str) -> bool:
    result = run_git(
        root, ["show-ref", "--verify", f"refs/heads/{branch}"], check=False
    )
    return result.returncode == 0


def get_git_user(root: Path) -> str:
    for key in ("user.name", "user.email"):
        result = run_git(root, ["config", "--get", key], check=False)
        value = result.stdout.strip()
        if not value:
            continue
        if key == "user.email":
            value = value.split("@", 1)[0]
        return value
    return getpass.getuser()


def summarize_task(task: str, max_words: int = 3) -> str:
    slug = slugify(task)
    words = [w for w in slug.split("-") if w]
    if not words:
        return "task"
    return "-".join(words[:max_words])


def normalize_type(value: str) -> str:
    value = value.strip()
    if not value:
        return "chore"
    return value.lower()


def unique_branch_and_path(
    root: Path, base_branch: str, base_path: Path
) -> tuple[str, Path]:
    suffix = 1
    while True:
        if suffix == 1:
            branch = base_branch
            path = base_path
        else:
            branch = f"{base_branch}-{suffix}"
            path = Path(f"{base_path}-{suffix}")

        if not branch_exists(root, branch) and not path.exists():
            return branch, path

        suffix += 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a git worktree for a task.")
    parser.add_argument(
        "task", help="Task name (used to build a worktree path and branch)."
    )
    parser.add_argument(
        "--type",
        default="chore",
        help="Branch type, e.g. Feat/Chore/Fix/Hotfix/Refactor.",
    )
    parser.add_argument(
        "--user",
        help="Git username. Defaults to git config user.name (or user.email).",
    )
    parser.add_argument(
        "--link-deps",
        dest="link_deps",
        action="store_true",
        default=False,
        help="Link worktree deps (.venv, node_modules) from the main worktree (disabled by default).",
    )
    parser.add_argument(
        "--no-link-deps",
        dest="link_deps",
        action="store_false",
        help="Skip linking worktree deps from the main worktree (default).",
    )
    parser.add_argument(
        "--force-link",
        action="store_true",
        help="Force replace existing linked deps.",
    )
    args = parser.parse_args()

    root = get_repo_root()
    repo_name = root.name
    task_summary = summarize_task(args.task)
    branch_type = normalize_type(args.type)
    git_user = args.user or get_git_user(root)
    user_slug = slugify(git_user)
    base_branch = f"{branch_type}/{user_slug}/{task_summary}"

    base_dir = root.parent / "_worktrees" / repo_name
    base_path = base_dir / task_summary

    branch, worktree_path = unique_branch_and_path(root, base_branch, base_path)

    base_dir.mkdir(parents=True, exist_ok=True)

    cmd = ["worktree", "add", "-b", branch, str(worktree_path)]

    result = run_git(root, cmd, check=False)
    if result.stdout.strip():
        print(result.stdout.strip())
    if result.stderr.strip():
        print(result.stderr.strip(), file=sys.stderr)

    if result.returncode != 0:
        return result.returncode

    configure_hooks(worktree_path)

    if args.link_deps:
        link_code = run_link_deps(root, worktree_path, force=args.force_link)
        if link_code != 0:
            return link_code
    else:
        print("Worktree deps not linked. Create local environments in the worktree:")
        print("  uv sync --group dev")
        print("  pnpm install")

    print(f"Worktree ready: {worktree_path}")
    print(f"Branch: {branch}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
