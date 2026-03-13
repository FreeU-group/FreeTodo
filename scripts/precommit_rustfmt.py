#!/usr/bin/env python3
from __future__ import annotations

import shutil
import subprocess  # nosec B404
import sys
from pathlib import Path


def run() -> int:
    repo_root = Path(__file__).resolve().parents[1]
    tauri_dir = repo_root / "frontend" / "src-tauri"
    if not tauri_dir.exists():
        print(f"Rust hook skipped: missing {tauri_dir}", file=sys.stderr)
        return 0

    cargo_path = shutil.which("cargo")
    if not cargo_path:
        print("cargo not found in PATH. Install Rust and retry.", file=sys.stderr)
        return 127

    try:
        subprocess.run(  # nosec B603
            [cargo_path, "fmt", "--all", "--", "--check"],
            cwd=tauri_dir,
            check=True,
        )
    except subprocess.CalledProcessError as exc:
        return exc.returncode

    return 0


if __name__ == "__main__":
    raise SystemExit(run())
