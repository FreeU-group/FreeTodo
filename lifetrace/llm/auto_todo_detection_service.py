"""自动待办检测服务
当白名单应用的截图产生时，自动检测其中的待办事项并创建draft状态的todo
"""

import json
import re
from datetime import datetime
from typing import Any

from lifetrace.llm.llm_client import LLMClient
from lifetrace.storage import screenshot_mgr, todo_mgr
from lifetrace.util.logging_config import get_logger
from lifetrace.util.prompt_loader import get_prompt
from lifetrace.util.settings import settings
from lifetrace.util.time_parser import calculate_scheduled_time

logger = get_logger()

# 默认白名单应用列表（当配置不存在时使用）
DEFAULT_WHITELIST_APPS = ["微信", "WeChat", "飞书", "Feishu", "Lark", "钉钉", "DingTalk"]


def get_whitelist_apps() -> list[str]:
    """获取白名单应用列表

    优先从配置文件读取，如果配置不存在则使用默认列表

    Returns:
        白名单应用列表
    """
    try:
        apps = settings.get("jobs.auto_todo_detection.params.whitelist.apps")
        if apps and isinstance(apps, list):
            return apps
    except (KeyError, AttributeError):
        logger.debug("自动待办检测白名单配置不存在，使用默认列表")
    return DEFAULT_WHITELIST_APPS


# 为了向后兼容，保留原有的常量引用（从配置动态读取）
TODO_EXTRACTION_WHITELIST_APPS = get_whitelist_apps()


class AutoTodoDetectionService:
    """自动待办检测服务"""

    def __init__(self):
        """初始化服务"""
        self.llm_client = LLMClient()

    def is_whitelist_app(self, app_name: str) -> bool:
        """判断是否为白名单应用

        Args:
            app_name: 应用名称

        Returns:
            是否为白名单应用
        """
        if not app_name:
            return False
        # 每次调用时动态获取白名单，支持配置热更新
        whitelist_apps = get_whitelist_apps()
        app_name_lower = app_name.lower()
        return any(whitelist_app.lower() in app_name_lower for whitelist_app in whitelist_apps)

    def detect_and_create_todos_from_screenshot(self, screenshot_id: int) -> dict[str, Any]:
        """
        检测截图中的待办事项并自动创建draft状态的todo

        Args:
            screenshot_id: 截图ID

        Returns:
            包含创建结果的字典：
            - created_count: 创建的todo数量
            - todos: 创建的todo列表
        """
        try:
            # 获取截图信息
            screenshot = screenshot_mgr.get_screenshot_by_id(screenshot_id)
            if not screenshot:
                logger.warning(f"截图 {screenshot_id} 不存在")
                return {"created_count": 0, "todos": []}

            app_name = screenshot.get("app_name")
            window_title = screenshot.get("window_title", "")

            # 检查是否为白名单应用
            if not self.is_whitelist_app(app_name):
                logger.debug(f"截图 {screenshot_id} 的应用 {app_name} 不在白名单中，跳过检测")
                return {"created_count": 0, "todos": []}

            # 获取所有active和draft状态的待办
            existing_todos = todo_mgr.list_todos(limit=1000, status="active")
            existing_todos += todo_mgr.list_todos(limit=1000, status="draft")

            logger.info(
                f"开始检测截图 {screenshot_id} 的待办事项，已有待办数量: {len(existing_todos)}"
            )

            # 调用视觉模型分析
            detection_result = self._call_vision_model(
                screenshot_id=screenshot_id,
                existing_todos=existing_todos,
                app_name=app_name or "",
                window_title=window_title,
            )

            if not detection_result or not detection_result.get("new_todos"):
                logger.info(f"截图 {screenshot_id} 未检测到新待办")
                return {"created_count": 0, "todos": []}

            # 创建draft状态的todo
            result = self._create_draft_todos(
                todos=detection_result["new_todos"],
                screenshot_id=screenshot_id,
                app_name=app_name or "",
                window_title=window_title,
            )

            logger.info(
                f"截图 {screenshot_id} 检测完成，创建 {result['created_count']} 个draft待办"
            )
            return result

        except Exception as e:
            logger.error(f"检测截图 {screenshot_id} 待办失败: {e}", exc_info=True)
            return {"created_count": 0, "todos": []}

    def _call_vision_model(
        self,
        screenshot_id: int,
        existing_todos: list[dict[str, Any]],
        app_name: str,
        window_title: str,
    ) -> dict[str, Any]:
        """
        调用视觉模型分析截图，检测待办事项

        Args:
            screenshot_id: 截图ID
            existing_todos: 已有待办列表（用于去重）
            app_name: 应用名称
            window_title: 窗口标题

        Returns:
            检测结果字典，包含new_todos列表
        """
        if not self.llm_client.is_available():
            logger.warning("LLM客户端不可用，无法检测待办")
            return {"new_todos": []}

        try:
            # 格式化已有待办列表为JSON
            existing_todos_json = json.dumps(
                [
                    {
                        "id": todo.get("id"),
                        "name": todo.get("name"),
                        "description": todo.get("description"),
                    }
                    for todo in existing_todos[:50]  # 限制数量，避免prompt过长
                ],
                ensure_ascii=False,
                indent=2,
            )

            # 从配置文件加载提示词
            system_prompt = get_prompt("auto_todo_detection", "system_assistant")
            user_prompt = get_prompt(
                "auto_todo_detection",
                "user_prompt",
                existing_todos_json=existing_todos_json,
            )

            # 构建完整的提示词
            full_prompt = f"{system_prompt}\n\n{user_prompt}"

            # 调用视觉模型
            result = self.llm_client.vision_chat(
                screenshot_ids=[screenshot_id],
                prompt=full_prompt,
                temperature=0.3,  # 使用较低温度以提高准确性
                max_tokens=2000,
            )

            response_text = result.get("response", "")
            if not response_text:
                logger.warning("视觉模型返回空响应")
                return {"new_todos": []}

            # 解析LLM响应
            detection_result = self._parse_llm_response(response_text)
            return detection_result

        except Exception as e:
            logger.error(f"调用视觉模型检测待办失败: {e}", exc_info=True)
            return {"new_todos": []}

    def _parse_llm_response(self, response_text: str) -> dict[str, Any]:
        """
        解析LLM响应为检测结果

        Args:
            response_text: LLM返回的文本

        Returns:
            包含new_todos列表的字典
        """
        try:
            # 尝试提取JSON
            json_match = re.search(r"\{.*\}", response_text, re.DOTALL)
            if json_match:
                json_str = json_match.group(0)
                result = json.loads(json_str)
                if "new_todos" in result:
                    return result

            # 如果没有找到JSON，尝试直接解析整个响应
            result = json.loads(response_text)
            if "new_todos" in result:
                return result

            logger.warning("LLM响应格式不正确，未找到new_todos字段")
            return {"new_todos": []}

        except json.JSONDecodeError as e:
            logger.error(f"解析LLM响应JSON失败: {e}, 响应内容: {response_text[:200]}")
            return {"new_todos": []}
        except Exception as e:
            logger.error(f"解析LLM响应失败: {e}", exc_info=True)
            return {"new_todos": []}

    def _build_user_notes(
        self,
        screenshot_id: int,
        app_name: str,
        window_title: str,
        source_text: str,
        time_info: dict[str, Any],
        confidence: float | None,
    ) -> str:
        """构建user_notes，记录来源信息"""
        user_notes_parts = [
            f"来源截图ID: {screenshot_id}",
            f"应用: {app_name}",
        ]
        if window_title:
            user_notes_parts.append(f"窗口: {window_title}")
        if source_text:
            user_notes_parts.append(f"来源文本: {source_text}")
        if time_info.get("raw_text"):
            user_notes_parts.append(f"时间: {time_info.get('raw_text')}")
        if confidence is not None:
            user_notes_parts.append(f"置信度: {confidence:.2%}")

        return "\n".join(user_notes_parts)

    def _calculate_todo_scheduled_time(self, time_info: dict[str, Any]) -> datetime | None:
        """计算todo的scheduled_time"""
        if not time_info:
            return None

        try:
            reference_time = datetime.now()
            return calculate_scheduled_time(time_info, reference_time)
        except Exception as e:
            logger.warning(f"计算scheduled_time失败: {e}")
            return None

    def _create_single_draft_todo(
        self,
        todo_data: dict[str, Any],
        screenshot_id: int,
        app_name: str,
        window_title: str,
    ) -> dict[str, Any] | None:
        """创建单个draft状态的todo"""
        title = todo_data.get("title", "").strip()
        if not title:
            logger.warning("跳过标题为空的待办")
            return None

        description = todo_data.get("description")
        if description:
            description = description.strip()

        source_text = todo_data.get("source_text", "")
        time_info = todo_data.get("time_info", {})
        confidence = todo_data.get("confidence")

        scheduled_time = self._calculate_todo_scheduled_time(time_info)
        user_notes = self._build_user_notes(
            screenshot_id, app_name, window_title, source_text, time_info, confidence
        )

        todo_id = todo_mgr.create_todo(
            name=title,
            description=description,
            user_notes=user_notes,
            deadline=scheduled_time,
            status="draft",  # 关键：创建为draft状态
            priority="none",
            tags=["自动提取"],
        )

        if todo_id:
            logger.info(f"创建draft待办: {todo_id} - {title}")
            return {
                "id": todo_id,
                "name": title,
                "scheduled_time": scheduled_time.isoformat() if scheduled_time else None,
            }

        logger.warning(f"创建待办失败: {title}")
        return None

    def _create_draft_todos(
        self,
        todos: list[dict[str, Any]],
        screenshot_id: int,
        app_name: str,
        window_title: str,
    ) -> dict[str, Any]:
        """
        创建draft状态的todo

        Args:
            todos: 检测到的待办列表
            screenshot_id: 截图ID
            app_name: 应用名称
            window_title: 窗口标题

        Returns:
            创建结果统计
        """
        created_todos = []
        created_count = 0

        for todo_data in todos:
            try:
                result = self._create_single_draft_todo(
                    todo_data, screenshot_id, app_name, window_title
                )
                if result:
                    created_count += 1
                    created_todos.append(result)
            except Exception as e:
                logger.error(f"处理待办数据失败: {e}, 数据: {todo_data}", exc_info=True)
                continue

        return {
            "created_count": created_count,
            "created_todos": created_todos,
        }
