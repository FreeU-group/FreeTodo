#!/usr/bin/env python3
"""将 MediaCrawlerPro-Python 和 MediaCrawlerPro-SignSrv 打包为可下载的插件 zip。

用法::

    # 在项目根目录执行
    python scripts/build_media_crawler_plugin.py

    # 自定义版本号
    python scripts/build_media_crawler_plugin.py --version 1.1.0

    # 指定输出目录
    python scripts/build_media_crawler_plugin.py --output dist/

打包流程：
    1. 复制 MediaCrawlerPro-Python 和 MediaCrawlerPro-SignSrv 到临时目录
    2. 清理 __pycache__、.venv、data/、logs/ 等运行时文件
    3. 清理 .github/、static/img*.png 等不必要的文档/图片文件
    4. 生成 manifest.json（版本号、SHA-256 哈希、文件大小等）
    5. 打包为 media-crawler-v{version}.zip

生成的 zip 内部结构::

    media-crawler-v1.0.0.zip
    ├── manifest.json
    ├── MediaCrawlerPro-Python/
    │   ├── main.py
    │   ├── config/
    │   ├── media_platform/
    │   ├── requirements.txt
    │   └── ...
    └── MediaCrawlerPro-SignSrv/
        ├── app.py
        ├── apis/
        ├── requirements.txt
        └── ...
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import shutil
import sys
import zipfile
from datetime import UTC, datetime
from pathlib import Path

# 确保 Windows 下 stdout 使用 UTF-8 编码
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")

# ---------------------------------------------------------------------------
# 配置
# ---------------------------------------------------------------------------

DEFAULT_VERSION = "1.0.0"

# 需要打包的源目录名
SOURCE_DIRS = [
    "MediaCrawlerPro-Python",
    "MediaCrawlerPro-SignSrv",
]

# 需要从打包中排除的目录（glob 模式，相对于每个源目录）
EXCLUDE_DIRS: list[str] = [
    ".venv",
    ".git",
    ".github",
    "__pycache__",
    "node_modules",
    "data",
    "logs",
    "browser_data",
    ".mypy_cache",
    ".ruff_cache",
    ".pytest_cache",
    "test",  # 测试目录，插件运行时不需要
    "static",  # 静态资源/文档截图
]

# 需要排除的文件名（精确匹配或 glob 模式）
EXCLUDE_FILES: list[str] = [
    # 项目管理 / CI 文件
    "CLAUDE.md",
    "project_tree.md",
    ".pre-commit-config.yaml",
    "docker-compose.yaml",
    "Dockerfile",
    "mypy.ini",
    "uv.lock",
    ".python-version",
    # 图片
    "img.png",
    "image.png",
]

# 文件扩展名黑名单
EXCLUDE_EXTENSIONS: set[str] = {
    ".pyc",
    ".pyo",
    ".egg-info",
    ".log",
    ".mp4",
    ".avi",
    ".mkv",
    ".mov",
    ".db",
    ".sqlite",
    ".sqlite3",
}


def find_project_root() -> Path:
    """向上查找项目根目录（包含 lifetrace/ 和 MediaCrawlerPro-Python/ 的目录）。"""
    # 尝试从脚本位置推导
    script_dir = Path(__file__).resolve().parent
    candidates = [
        script_dir.parent,  # scripts/ 的上级
        Path.cwd(),  # 当前工作目录
    ]
    for root in candidates:
        if (root / "lifetrace").is_dir() and (root / "MediaCrawlerPro-Python").is_dir():
            return root
    print("错误: 无法找到项目根目录（需要包含 lifetrace/ 和 MediaCrawlerPro-Python/）")
    sys.exit(1)


def should_exclude_path(rel_path: Path) -> bool:
    """判断一个相对路径是否应该被排除。"""
    parts = rel_path.parts

    # 检查任何一层目录是否在排除列表中
    for part in parts:
        if part in EXCLUDE_DIRS:
            return True
        # 以 . 开头的隐藏目录（除了 .gitignore 等文件之外的目录）
        if part.startswith(".") and part not in (".gitignore",):
            # 如果是目录名（不是最后一段或最后一段是目录），排除
            if part != parts[-1]:
                return True

    # 检查文件名
    filename = parts[-1]

    # 检查扩展名
    if Path(filename).suffix.lower() in EXCLUDE_EXTENSIONS:
        return True

    # 检查文件名精确匹配
    if filename in EXCLUDE_FILES:
        return True

    # 检查 static/img*.png 模式
    if filename.startswith("img") and filename.endswith(".png"):
        return True

    return False


def copy_with_filter(src_dir: Path, dst_dir: Path) -> tuple[int, int]:
    """带过滤的目录复制。返回 (copied_count, skipped_count)。"""
    copied = 0
    skipped = 0

    for src_path in src_dir.rglob("*"):
        if not src_path.is_file():
            continue

        rel_path = src_path.relative_to(src_dir)

        if should_exclude_path(rel_path):
            skipped += 1
            continue

        dst_path = dst_dir / rel_path
        dst_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src_path, dst_path)
        copied += 1

    return copied, skipped


def compute_sha256(file_path: Path) -> str:
    """计算文件的 SHA-256 哈希值。"""
    sha256 = hashlib.sha256()
    with open(file_path, "rb") as f:
        while True:
            chunk = f.read(8192)
            if not chunk:
                break
            sha256.update(chunk)
    return sha256.hexdigest()


def create_manifest(version: str, zip_path: Path) -> dict:
    """创建 manifest.json 内容。"""
    file_size = zip_path.stat().st_size
    sha256 = compute_sha256(zip_path)

    return {
        "plugin_id": "media-crawler",
        "version": version,
        "name": "MediaCrawler",
        "description": "社交媒体内容爬取引擎，支持小红书、抖音、哔哩哔哩等 7 大平台",
        "build_time": datetime.now(UTC).isoformat(),
        "sha256": sha256,
        "file_size": file_size,
        "file_size_mb": round(file_size / (1024 * 1024), 2),
        "components": [
            {
                "name": "MediaCrawlerPro-Python",
                "description": "爬虫引擎",
                "entry_point": "main.py",
            },
            {
                "name": "MediaCrawlerPro-SignSrv",
                "description": "签名服务",
                "entry_point": "app.py",
            },
        ],
        "requires_python": ">=3.10",
    }


def build_plugin(version: str, output_dir: Path, project_root: Path) -> Path:
    """执行完整的打包流程，返回生成的 zip 文件路径。"""

    zip_filename = f"media-crawler-v{version}.zip"
    zip_path = output_dir / zip_filename
    manifest_path = output_dir / "manifest.json"

    print(f"{'=' * 60}")
    print("  MediaCrawler 插件打包工具")
    print(f"  版本: {version}")
    print(f"  项目根: {project_root}")
    print(f"  输出: {zip_path}")
    print(f"{'=' * 60}")

    # 1. 检查源目录存在
    for dir_name in SOURCE_DIRS:
        src = project_root / dir_name
        if not src.is_dir():
            print(f"\n错误: 源目录不存在: {src}")
            sys.exit(1)
        print(f"  [✓] 找到源目录: {dir_name}/")

    # 2. 创建临时工作目录（使用项目内 dist/.tmp 避免权限问题）
    tmp_dir = output_dir / ".tmp_staging"
    if tmp_dir.exists():
        shutil.rmtree(tmp_dir, ignore_errors=True)
    staging_dir = tmp_dir / "staging"
    staging_dir.mkdir(parents=True, exist_ok=True)

    try:
        # 3. 复制并过滤每个源目录
        print("\n--- 复制与过滤 ---")
        for dir_name in SOURCE_DIRS:
            src = project_root / dir_name
            dst = staging_dir / dir_name
            print(f"  处理 {dir_name}/ ...", end=" ", flush=True)
            copied, skipped = copy_with_filter(src, dst)
            print(f"复制 {copied} 个文件，跳过 {skipped} 个")

        # 4. 先打包（不含 manifest），以便计算 hash
        #    这里我们把 manifest 直接写进 zip，所以用两步：
        #    Step A: 打包 staging_dir 内容为临时 zip 计算 hash
        #    Step B: 把 manifest 也写入 zip
        output_dir.mkdir(parents=True, exist_ok=True)

        print("\n--- 创建 zip 包 ---")
        print("  压缩中...", end=" ", flush=True)

        # 先创建一个不含 manifest 的 zip，用来计算哈希 ->
        # 实际上更好的方式是：先打包完整 zip（含 manifest 占位），然后算 hash。
        # 但标准做法是 manifest 的 sha256 指的是 zip 自身的 hash，
        # 所以先打包完整 zip（manifest 里 sha256 留空），然后算 hash 回写 manifest。
        # 简化方案：manifest 存为单独文件，zip 里也内嵌一份。

        # 创建 zip
        with zipfile.ZipFile(
            zip_path, "w", zipfile.ZIP_DEFLATED, compresslevel=6
        ) as zf:
            for file_path in sorted(staging_dir.rglob("*")):
                if file_path.is_file():
                    arcname = file_path.relative_to(staging_dir)
                    zf.write(file_path, arcname)

        zip_size_mb = zip_path.stat().st_size / (1024 * 1024)
        print(f"完成 ({zip_size_mb:.1f} MB)")

        # 5. 生成 manifest
        print("  生成 manifest.json ...", end=" ", flush=True)
        manifest = create_manifest(version, zip_path)
        manifest_json = json.dumps(manifest, indent=2, ensure_ascii=False)
        manifest_path.write_text(manifest_json, encoding="utf-8")
        print("完成")

        # 6. 将 manifest 追加写入 zip 包
        with zipfile.ZipFile(zip_path, "a") as zf:
            zf.writestr("manifest.json", manifest_json)

        # 重新计算包含 manifest 的 zip 的最终大小
        final_size = zip_path.stat().st_size
        final_size_mb = round(final_size / (1024 * 1024), 2)

    finally:
        # 清理临时目录
        if tmp_dir.exists():
            shutil.rmtree(tmp_dir, ignore_errors=True)

    # 7. 打印摘要
    print(f"\n{'=' * 60}")
    print("  打包完成！")
    print(f"  文件: {zip_path}")
    print(f"  大小: {final_size_mb} MB")
    print(f"  SHA-256: {manifest['sha256']}")
    print(f"  Manifest: {manifest_path}")
    print(f"{'=' * 60}")
    print()
    print("  下一步：")
    print(f"  1. 在 GitHub 仓库创建 Release（tag: plugin/media-crawler/v{version}）")
    print(f"  2. 上传 {zip_filename} 到 Release Assets")
    print("  3. 上传 manifest.json 到 Release Assets（可选）")
    print()

    return zip_path


def main():
    parser = argparse.ArgumentParser(
        description="将 MediaCrawlerPro 打包为可下载的插件 zip",
    )
    parser.add_argument(
        "--version",
        "-v",
        default=DEFAULT_VERSION,
        help=f"插件版本号（默认: {DEFAULT_VERSION}）",
    )
    parser.add_argument(
        "--output",
        "-o",
        default=None,
        help="输出目录（默认: 项目根/dist/）",
    )
    args = parser.parse_args()

    project_root = find_project_root()

    output_dir = Path(args.output) if args.output else project_root / "dist"
    output_dir = output_dir.resolve()

    build_plugin(
        version=args.version,
        output_dir=output_dir,
        project_root=project_root,
    )


if __name__ == "__main__":
    main()
