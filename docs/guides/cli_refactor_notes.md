# CLI Refactor Notes

- `cli/freetodo_cli/app.py` now focuses on Typer assembly and delegates localized help text to `cli/freetodo_cli/help_catalog.py`.
- `cli/freetodo_cli/client/` is now a package: shared HTTP helpers live in `client_helpers.py`, chat form assembly lives in `client_chat.py`, and public client classes stay available from `freetodo_cli.client`.
- `cli/freetodo_cli/commands/todo/` is now a package: main CRUD commands live in `__init__.py`, schema and batch utilities live in `todo_batch.py`, and attachment / ICS transfer commands live in `todo_transfer.py`.
- Existing imports remain stable for callers: keep using `from freetodo_cli.client import ...` and `from freetodo_cli.commands.todo import todo_app`.
