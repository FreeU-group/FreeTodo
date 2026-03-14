# FreeTodo CLI

Agent-first CLI for Lifetrace/FreeTodo backend operations. Use it to read and modify backend
resources through the HTTP API.

## Quick Start

1. Install server dependencies:

```bash
uv sync --directory server
```

2. Start the backend:

```bash
uv run --directory server python server.py
```

3. Run the CLI:

```bash
uv run --directory server freetodo --help
uv run --directory server freetodo todo list --json
```

## Common Commands

```bash
# Read data (JSON-first)
uv run --directory server freetodo todo list --json
uv run --directory server freetodo memory today --json
uv run --directory server freetodo logs files --json

# Create or update with file input
uv run --directory server freetodo todo create --input todo.json --json
uv run --directory server freetodo todo update --id 42 --patch patch.json --json

# Validate configuration + backend health
uv run --directory server freetodo doctor --json
```

## Help Language

Default help is English. To render Chinese or bilingual help for a topic:

```bash
uv run --directory server freetodo help root --lang zh
uv run --directory server freetodo help todo --lang bilingual
```

## Environment Variables

- `FREETODO_BASE_URL` — Backend base URL. Default: `http://127.0.0.1:8001`
- `FREETODO_API_TOKEN` — Bearer token for authenticated deployments
- `FREETODO_TIMEOUT_SEC` — HTTP timeout in seconds. Default: `30`

## Agent-First Notes

- Prefer `--json` for stable automation output.
- Most write commands accept `--input` or `--patch` for file or stdin input.
- Mutating commands provide `--dry-run` when available.
