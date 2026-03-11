# OpenClaw x FreeTodo Smoke Check (MVP)

Assumes:
- FreeTodo backend running: `python -m lifetrace.server`
- OpenClaw plugin installed + enabled
- `~/.openclaw/openclaw.json` updated (see `docs/openclaw.example.json`)
- OpenClaw Gateway restarted

## 1) Direct API sanity (optional, local backend)
```bash
curl -s http://127.0.0.1:8001/api/todos | head -c 200
```

## 2) Tool smoke via OpenClaw (WebChat or CLI)
Use these prompts in OpenClaw chat UI (or CLI chat) and verify JSON output.

### List (status default active)
```
List my todos.
```

### Create
```
Create a todo named "Smoke test from OpenClaw".
```

### Get (use returned id)
```
Get todo id <ID>.
```

### Update (partial)
```
Update todo id <ID> with description "updated by OpenClaw".
```

Expected:
- Each tool returns JSON from FreeTodo (pass-through)
- `todo_create` returns new `id`
- `todo_update` reflects updated fields

## 3) Optional cleanup
```
Mark todo id <ID> as completed.
```
(Uses update tool; status=completed)
