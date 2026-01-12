#!/usr/bin/env python3
"""
Backend startup wrapper script for LifeTrace
Handles data directory setup and config initialization before starting the FastAPI server
"""

import argparse
import os
import shutil
import sys
from pathlib import Path

# Handle PyInstaller bundled application
if getattr(sys, "frozen", False):
    # PyInstaller bundled - use _MEIPASS for resource path
    # In one-folder bundle, _MEIPASS points to _internal directory
    if hasattr(sys, "_MEIPASS"):
        # Add _internal to path where lifetrace modules are located
        sys.path.insert(0, sys._MEIPASS)
    else:
        # Fallback: try to find _internal directory relative to executable
        bundle_dir = Path(sys.executable).parent
        internal_dir = bundle_dir / "_internal"
        if internal_dir.exists():
            sys.path.insert(0, str(internal_dir))
        else:
            # Last resort: use bundle directory
            sys.path.insert(0, str(bundle_dir))
else:
    # Development mode - add parent directory to path
    sys.path.insert(0, str(Path(__file__).parent.parent.parent))

# Import loguru first to ensure PyInstaller detects it
try:
    import loguru  # noqa: F401
except ImportError:
    pass  # Will fail later if not available

from lifetrace.util.logging_config import get_logger

logger = get_logger()


def setup_data_directory(data_dir: str) -> None:
    """Set up the data directory structure and initialize config files if needed"""
    data_path = Path(data_dir)

    # Create directory structure
    config_dir = data_path / "config"
    data_subdir = data_path / "data"
    logs_dir = data_path / "logs"

    for directory in [config_dir, data_subdir, logs_dir]:
        directory.mkdir(parents=True, exist_ok=True)
        logger.info(f"Ensured directory exists: {directory}")

    # Copy config files if they don't exist
    # Get the source config directory (from PyInstaller bundle or development)
    if getattr(sys, "frozen", False):
        # PyInstaller bundled - in one-folder bundle, files are in _internal/
        # The executable is at bundle_dir/lifetrace, config is at bundle_dir/_internal/config
        bundle_dir = Path(sys.executable).parent
        # Try _internal/config first (one-folder bundle), then config (if files are at root)
        potential_config_dirs = [
            bundle_dir / "_internal" / "config",
            bundle_dir / "config",
        ]
        source_config_dir = None
        for config_dir in potential_config_dirs:
            if config_dir.exists() and (config_dir / "default_config.yaml").exists():
                source_config_dir = config_dir
                logger.info(f"Found config directory: {source_config_dir}")
                break
        if source_config_dir is None:
            logger.warning(
                f"Could not find config directory in bundle. Tried: {potential_config_dirs}"
            )
            # Fallback to bundle_dir/config
            source_config_dir = bundle_dir / "config"
    else:
        # Development mode
        from lifetrace.util.path_utils import get_config_dir

        source_config_dir = get_config_dir()

    # Copy default config files if they don't exist in data directory
    config_files = ["default_config.yaml", "prompt.yaml", "rapidocr_config.yaml"]
    for config_file in config_files:
        source_file = source_config_dir / config_file
        dest_file = config_dir / config_file

        if source_file.exists() and not dest_file.exists():
            shutil.copy2(source_file, dest_file)
            logger.info(f"Copied config file: {config_file}")
        elif not source_file.exists():
            logger.warning(f"Source config file not found: {source_file}")

    # Initialize config.yaml from default_config.yaml if it doesn't exist
    default_config = config_dir / "default_config.yaml"
    config_yaml = config_dir / "config.yaml"

    if default_config.exists() and not config_yaml.exists():
        shutil.copy2(default_config, config_yaml)
        logger.info("Initialized config.yaml from default_config.yaml")


def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(description="LifeTrace Backend Server")
    parser.add_argument(
        "--data-dir",
        type=str,
        help="Data directory path (default: current directory)",
        default=None,
    )
    parser.add_argument(
        "--port",
        type=int,
        help="Server port (default: 8001)",
        default=8001,
    )
    parser.add_argument(
        "--host",
        type=str,
        help="Server host (default: 127.0.0.1)",
        default="127.0.0.1",
    )
    parser.add_argument(
        "--mode",
        type=str,
        choices=["dev", "build"],
        default="dev",
        help="Server mode: dev (development) or build (packaged app)",
    )

    args = parser.parse_args()

    # Set data directory environment variable if provided
    if args.data_dir:
        os.environ["LIFETRACE_DATA_DIR"] = args.data_dir
        setup_data_directory(args.data_dir)
        logger.info(f"Using data directory: {args.data_dir}")
    else:
        # Use current directory as fallback
        current_dir = os.getcwd()
        logger.info(f"No data directory specified, using current directory: {current_dir}")

    # Import and start the server
    # The config module will read LIFETRACE_DATA_DIR environment variable
    # Note: In PyInstaller bundle, lifetrace modules should be in sys._MEIPASS
    try:
        import uvicorn

        from lifetrace.routers.health import set_server_mode
        from lifetrace.server import app
        from lifetrace.util.settings import settings

        # Set server mode for health check endpoint
        set_server_mode(args.mode)
        logger.info(f"Server mode: {args.mode}")
    except ImportError as e:
        # If import fails, log the error with path information
        import traceback

        error_info = f"""
Import Error: {e}
sys.path: {sys.path}
sys._MEIPASS: {getattr(sys, "_MEIPASS", "Not set")}
sys.executable: {sys.executable}
sys.frozen: {getattr(sys, "frozen", False)}
"""
        print(error_info, file=sys.stderr)
        print(traceback.format_exc(), file=sys.stderr)
        if logger:
            logger.error(f"Failed to import lifetrace modules: {error_info}")
        raise

    # Override server config if provided via command line
    if args.port:
        settings.set("server.port", args.port)
    if args.host:
        settings.set("server.host", args.host)

    server_host = settings.server.host
    server_port = settings.server.port
    server_debug = settings.server.debug

    logger.info("Starting LifeTrace backend server")
    logger.info(f"Server URL: http://{server_host}:{server_port}")
    logger.info(f"Debug mode: {'enabled' if server_debug else 'disabled'}")
    logger.info(f"Data directory: {os.environ.get('LIFETRACE_DATA_DIR', 'default')}")

    # Start the server
    uvicorn.run(
        app,
        host=server_host,
        port=server_port,
        reload=server_debug,
        access_log=server_debug,
        log_level="debug" if server_debug else "info",
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        # Ensure errors are logged and visible
        import traceback

        error_msg = f"Fatal error in backend startup: {e}\n{traceback.format_exc()}"
        print(error_msg, file=sys.stderr)
        if logger:
            logger.error(error_msg)
        sys.exit(1)
