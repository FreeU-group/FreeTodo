# Crawler Router Refactor

- `server/routers/crawler.py` is now a thin router entrypoint that keeps the public `router` import stable while delegating feature areas to nearby helper modules.
- Shared path/config helpers live in `server/routers/crawler_common.py`; config, cookies, keyword extraction, runtime control, result shaping, media proxying, and daily summary flows each live in their own `server/routers/crawler_*.py` module.
- Runtime process spawning still starts the local MediaCrawler plugin executables, but now validates the resolved venv Python and script paths before launching and documents the intentional subprocess usage with narrowly scoped `# nosec` comments.
- The crawl loop now uses `secrets.SystemRandom()` for scheduling jitter, and previous silent `except: pass` cleanup paths now log suppressed filesystem/process errors instead of swallowing them.
- Existing router registration stays unchanged for the rest of the app: keep importing `router` from `server/routers/crawler.py`.
