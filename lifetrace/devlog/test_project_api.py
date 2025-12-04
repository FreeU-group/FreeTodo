"""简单的项目管理 API 测试脚本

使用方式：
1. 先启动后端服务器（参考 PROJECT_MANAGEMENT_API.md 中的启动命令）
2. 在项目根目录执行：

   uv run python lifetrace/devlog/test_project_api.py

依赖：
    pip install requests
"""

import json
from typing import Any

import requests


BASE_URL = "http://127.0.0.1:8000"


def _print_response(step: str, resp: requests.Response):
    """格式化打印响应内容"""
    print(f"\n=== {step} ===")
    print(f"URL: {resp.request.method} {resp.url}")
    print(f"Status: {resp.status_code}")
    try:
        data: Any = resp.json()
        print("Response JSON:")
        print(json.dumps(data, ensure_ascii=False, indent=2))
    except Exception:
        print("Response Text:")
        print(resp.text)


def run_project_crud_flow():
    """依次测试项目的创建、查询、更新、删除"""
    # 1. 创建项目
    create_payload = {
        "name": "API 测试项目",
        "definition_of_done": "验证项目 CRUD 与 AI 上下文字段是否工作正常",
        "status": "active",
        "description": "用于自动化测试项目管理 API 的示例项目。",
    }

    resp = requests.post(f"{BASE_URL}/api/projects", json=create_payload, timeout=10)
    _print_response("创建项目 (POST /api/projects)", resp)
    resp.raise_for_status()
    project = resp.json()
    project_id = project["id"]

    # 2. 获取单个项目
    resp = requests.get(f"{BASE_URL}/api/projects/{project_id}", timeout=10)
    _print_response(f"获取单个项目 (GET /api/projects/{project_id})", resp)
    resp.raise_for_status()

    # 3. 更新项目
    update_payload = {
        "name": "API 测试项目（已更新）",
        "status": "completed",
        "description": "该项目已完成，用于验证项目管理 API 的端到端行为。",
    }
    resp = requests.put(
        f"{BASE_URL}/api/projects/{project_id}",
        json=update_payload,
        timeout=10,
    )
    _print_response(f"更新项目 (PUT /api/projects/{project_id})", resp)
    resp.raise_for_status()

    # 4. 获取项目列表
    resp = requests.get(f"{BASE_URL}/api/projects?limit=10&offset=0", timeout=10)
    _print_response("获取项目列表 (GET /api/projects)", resp)
    resp.raise_for_status()

    # 5. 删除项目
    resp = requests.delete(f"{BASE_URL}/api/projects/{project_id}", timeout=10)
    _print_response(f"删除项目 (DELETE /api/projects/{project_id})", resp)
    # 204 无内容，这里不强制 resp.json()
    if resp.status_code != 204:
        resp.raise_for_status()

    print("\n项目管理 API 测试流程执行完成。")


if __name__ == "__main__":
    run_project_crud_flow()


