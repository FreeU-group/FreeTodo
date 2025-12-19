# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec file for LifeTrace backend
Creates a one-folder bundle (recommended for large dependencies like PyTorch)
"""

import os
from pathlib import Path

# Get the lifetrace directory (where this spec file is located)
# SPECPATH is set by PyInstaller to the absolute path of the spec file
# We need to ensure we get the correct directory regardless of where PyInstaller is run from
import os

# Try to get the directory from SPECPATH (set by PyInstaller)
try:
    # SPECPATH is automatically set by PyInstaller to the spec file's absolute path
    spec_path = Path(SPECPATH)
    lifetrace_dir = spec_path.resolve().parent
except (NameError, AttributeError):
    # Fallback: use current working directory (should be lifetrace dir when script runs)
    lifetrace_dir = Path(os.getcwd()).resolve()

# Verify the directory contains the expected structure
config_file = lifetrace_dir / "config" / "default_config.yaml"
if not config_file.exists():
    # If config not found, try going up one level to find lifetrace directory
    # This handles the case where we're in a subdirectory
    potential_lifetrace = lifetrace_dir.parent / "lifetrace"
    if (potential_lifetrace / "config" / "default_config.yaml").exists():
        lifetrace_dir = potential_lifetrace
    else:
        # Last resort: try to find it relative to current working directory
        cwd = Path(os.getcwd())
        if (cwd / "config" / "default_config.yaml").exists():
            lifetrace_dir = cwd
        elif (cwd / "lifetrace" / "config" / "default_config.yaml").exists():
            lifetrace_dir = cwd / "lifetrace"

# Final verification - raise error if still not found
if not (lifetrace_dir / "config" / "default_config.yaml").exists():
    raise FileNotFoundError(
        f"Cannot find config file. Tried: {lifetrace_dir / 'config' / 'default_config.yaml'}\n"
        f"SPECPATH: {SPECPATH if 'SPECPATH' in globals() else 'not set'}\n"
        f"CWD: {os.getcwd()}\n"
        f"Please ensure you run PyInstaller from the lifetrace directory or specify the correct path."
    )

# Data files to include
# 注意：config 和 models 放在 app 根目录（与 _internal 同级别），而不是 _internal 内
# 这样在打包环境中，路径为 backend/config/ 和 backend/models/
datas = [
    # Configuration files - 放在 app 根目录下的 config/
    (str(lifetrace_dir / "config" / "default_config.yaml"), "config"),
    (str(lifetrace_dir / "config" / "prompt.yaml"), "config"),
    (str(lifetrace_dir / "config" / "rapidocr_config.yaml"), "config"),
    # ONNX model files - 放在 app 根目录下的 models/
    (str(lifetrace_dir / "models" / "ch_PP-OCRv4_det_infer.onnx"), "models"),
    (str(lifetrace_dir / "models" / "ch_PP-OCRv4_rec_infer.onnx"), "models"),
    (str(lifetrace_dir / "models" / "ch_ppocr_mobile_v2.0_cls_infer.onnx"), "models"),
]

# Hidden imports (modules that PyInstaller might miss)
hiddenimports = [
    "lifetrace",
    "lifetrace.server",
    "lifetrace.util",
    "lifetrace.util.config",
    "lifetrace.util.logging_config",
    "fastapi",
    "uvicorn",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan",
    "uvicorn.lifespan.on",
    "pydantic",
    "pydantic.json",
    "sqlalchemy",
    "sqlalchemy.engine",
    "sqlalchemy.pool",
    "sqlalchemy.dialects.sqlite",
    "mss",
    "PIL",
    "PIL.Image",
    "cv2",
    "numpy",
    "rapidocr_onnxruntime",
    "yaml",
    "apscheduler",
    "apscheduler.executors",
    "apscheduler.executors.pool",
    "apscheduler.jobstores",
    "apscheduler.jobstores.memory",
    "apscheduler.triggers",
    "apscheduler.triggers.cron",
    "apscheduler.triggers.interval",
    "jinja2",
    "psutil",
    "dateutil",
    "rich",
    "torch",
    "torchvision",
    "torchaudio",
    "transformers",
    "scipy",
    "hdbscan",
    "sentence_transformers",
    "chromadb",
    "openai",
    "dotenv",
    "loguru",
    "loguru._defaults",
    "loguru._handler",
    "loguru._logger",
    "loguru._recattrs",
    "loguru._file_sink",
    "loguru._colorizer",
    "loguru._contextvars",
    "loguru._get_frame",
    "loguru._simple_sink",
    "loguru._string_parsers",
    "loguru._writer",
    "open_clip",
    # LifeTrace modules
    "lifetrace.server",
    "lifetrace.routers",
    "lifetrace.storage",
    "lifetrace.llm",
    "lifetrace.jobs",
    "lifetrace.util",
    "lifetrace.schemas",
    "lifetrace.services",
]

# Collect all lifetrace source files to ensure they're included
# PyInstaller needs the parent directory in pathex to find the lifetrace module
lifetrace_parent_dir = str(lifetrace_dir.parent)

a = Analysis(
    ["scripts/start_backend.py"],
    pathex=[lifetrace_parent_dir, str(lifetrace_dir)],  # Add both parent and lifetrace directory to Python path
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        "matplotlib",
        "tkinter",
        "pytest",
        # 注意：不要排除 unittest，因为 imagehash 等库可能依赖它
        # "unittest",
        "test",
        "tests",
    ],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=None)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="lifetrace",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,  # Keep console for debugging
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="lifetrace",
)
