"""CLI entrypoint."""

from __future__ import annotations

from cli.app import app


def main() -> None:
    """Run the CLI."""
    app()


if __name__ == "__main__":
    main()
