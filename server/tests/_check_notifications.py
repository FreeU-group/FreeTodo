import json
import urllib.request

r = urllib.request.urlopen("http://127.0.0.1:8001/api/notifications", timeout=5)
data = json.loads(r.read())
print(f"Total notifications: {len(data)}")
for n in data[:10]:
    nid = str(n.get("id", "?"))[:35]
    ntype = str(n.get("notification_type", "?"))
    title = str(n.get("title", "?"))[:50]
    content_raw = str(n.get("content", ""))
    # Check if content is parseable JSON with action_id
    has_action_id = False
    action_type_val = ""
    try:
        parsed = json.loads(content_raw)
        has_action_id = "action_id" in parsed
        action_type_val = parsed.get("action_type", "")
    except Exception:
        pass
    print(f"  id={nid}")
    print(f"    type={ntype} title={title}")
    print(f"    has_action_id={has_action_id} action_type={action_type_val}")
    print(f"    content_len={len(content_raw)}")
    print()
