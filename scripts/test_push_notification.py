"""往 Center 推送一条测试通知，触发边缘节点弹窗。"""

import httpx

CENTER_URL = "https://tybbackend.cpolar.cn"

resp = httpx.post(
    f"{CENTER_URL}/api/sensor/notifications",
    json={
        "node_id": "",
        "title": "测试通知",
        "subtitle": "这是一条来自 Center 的推送测试",
        "links": [
            {"name": "tybfront", "url": "https://tybfront.cpolar.cn/", "platform": "前端"},
        ],
    },
)
print(resp.status_code, resp.json())
