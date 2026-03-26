# Crawler Router Refactor

- `server/routers/crawler/__init__.py` is now the thin router entrypoint that keeps the public `routers.crawler` import stable while delegating feature areas to a dedicated package.
- Shared path/config helpers live in `server/routers/crawler/common.py`; config, cookies, keyword extraction, runtime control, result shaping, media proxying, and daily summary flows each live in their own `server/routers/crawler/*.py` module.
- Runtime process spawning still starts the local MediaCrawler plugin executables, but now validates the resolved venv Python and script paths before launching and documents the intentional subprocess usage with narrowly scoped `# nosec` comments.
- The crawl loop now uses `secrets.SystemRandom()` for scheduling jitter, and previous silent `except: pass` cleanup paths now log suppressed filesystem/process errors instead of swallowing them.
- Existing router registration stays unchanged for the rest of the app: keep importing `router` from `routers.crawler`.
