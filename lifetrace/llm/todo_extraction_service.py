"""待办提取服务
从特定应用（微信、飞书等）的事件中提取待办事项
"""

import json
import re
from datetime import datetime
from typing import Any

from lifetrace.llm.llm_client import LLMClient
from lifetrace.storage import event_mgr
from lifetrace.util.logging_config import get_logger
from lifetrace.util.prompt_loader import get_prompt
from lifetrace.util.time_parser import calculate_scheduled_time

logger = get_logger()

# 需要特殊处理的应用列表（白名单）
TODO_EXTRACTION_WHITELIST_APPS = ["微信", "WeChat", "飞书", "Feishu", "Lark", "钉钉", "DingTalk"]

# 默认截图采样比例
DEFAULT_SCREENSHOT_SAMPLE_RATIO = 3
MIN_SCREENSHOTS = 1
MAX_SCREENSHOTS = 10


class TodoExtractionService:
    """待办提取服务"""

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
        app_name_lower = app_name.lower()
        return any(
            whitelist_app.lower() in app_name_lower
            for whitelist_app in TODO_EXTRACTION_WHITELIST_APPS
        )

    def sample_screenshots(
        self, screenshots: list[dict[str, Any]], sample_ratio: int = DEFAULT_SCREENSHOT_SAMPLE_RATIO
    ) -> list[dict[str, Any]]:
        """
        对截图进行采样，选择代表性的截图

        Args:
            screenshots: 截图列表（已按时间排序）
            sample_ratio: 采样比例（每N张选1张）

        Returns:
            采样后的截图列表
        """
        if not screenshots:
            return []

        total_count = len(screenshots)

        # 如果截图数量较少，全部使用
        if total_count <= MIN_SCREENSHOTS:
            return screenshots

        # 计算采样后的数量
        sampled_count = max(MIN_SCREENSHOTS, min(MAX_SCREENSHOTS, total_count // sample_ratio))

        # 均匀采样
        if sampled_count >= total_count:
            return screenshots

        step = total_count / sampled_count
        sampled = []
        for i in range(sampled_count):
            index = int(i * step)
            if index < total_count:
                sampled.append(screenshots[index])

        logger.info(f"从 {total_count} 张截图中采样了 {len(sampled)} 张")
        return sampled

    def extract_todos_from_event(
        self, event_id: int, screenshot_sample_ratio: int | None = None
    ) -> dict[str, Any]:
        """
        从事件中提取待办事项

        Args:
            event_id: 事件ID
            screenshot_sample_ratio: 截图采样比例，如果不提供则使用默认值

        Returns:
            包含待办列表和元信息的字典
        """
        try:
            # 获取事件信息
            event_info = event_mgr.get_event_summary(event_id)
            if not event_info:
                return {
                    "event_id": event_id,
                    "todos": [],
                    "error_message": "事件不存在",
                }

            app_name = event_info.get("app_name")
            if not self.is_whitelist_app(app_name):
                return {
                    "event_id": event_id,
                    "app_name": app_name,
                    "todos": [],
                    "error_message": f"应用 {app_name} 不在待办提取白名单中",
                }

            # 获取事件截图
            screenshots = event_mgr.get_event_screenshots(event_id)
            if not screenshots:
                return {
                    "event_id": event_id,
                    "app_name": app_name,
                    "todos": [],
                    "error_message": "事件中没有可用的截图",
                }

            # 采样截图
            sample_ratio = screenshot_sample_ratio or DEFAULT_SCREENSHOT_SAMPLE_RATIO
            sampled_screenshots = self.sample_screenshots(screenshots, sample_ratio)

            # 提取截图ID
            screenshot_ids = [s["id"] for s in sampled_screenshots]

            # 调用多模态模型提取待办
            todos = self._call_vision_model(
                screenshot_ids=screenshot_ids,
                app_name=app_name,
                window_title=event_info.get("window_title", ""),
                event_start_time=event_info.get("start_time"),
                event_end_time=event_info.get("end_time"),
            )

            # 解析时间信息并计算绝对时间
            reference_time = (
                event_info.get("end_time") or event_info.get("start_time") or datetime.now()
            )
            parsed_todos = []
            for todo in todos:
                parsed_todo = self._parse_todo_time(todo, reference_time)
                if parsed_todo:
                    parsed_todo["screenshot_ids"] = screenshot_ids
                    parsed_todos.append(parsed_todo)

            return {
                "event_id": event_id,
                "app_name": app_name,
                "window_title": event_info.get("window_title"),
                "event_start_time": event_info.get("start_time"),
                "event_end_time": event_info.get("end_time"),
                "todos": parsed_todos,
                "screenshot_count": len(sampled_screenshots),
            }

        except Exception as e:
            logger.error(f"从事件 {event_id} 提取待办失败: {e}", exc_info=True)
            return {
                "event_id": event_id,
                "todos": [],
                "error_message": f"提取待办失败: {str(e)}",
            }

    def _call_vision_model(
        self,
        screenshot_ids: list[int],
        app_name: str,
        window_title: str,
        event_start_time: datetime | None,
        event_end_time: datetime | None,
    ) -> list[dict[str, Any]]:
        """
        调用多模态模型分析截图，提取待办事项

        Args:
            screenshot_ids: 截图ID列表
            app_name: 应用名称
            window_title: 窗口标题
            event_start_time: 事件开始时间
            event_end_time: 事件结束时间

        Returns:
            待办事项列表
        """
        if not self.llm_client.is_available():
            logger.warning("LLM客户端不可用，无法提取待办")
            return []

        try:
            # 格式化时间
            start_str = (
                event_start_time.strftime("%Y-%m-%d %H:%M:%S") if event_start_time else "未知"
            )
            end_str = event_end_time.strftime("%Y-%m-%d %H:%M:%S") if event_end_time else "进行中"

            # 从配置文件加载提示词
            system_prompt = get_prompt("todo_extraction", "system_assistant")
            user_prompt = get_prompt(
                "todo_extraction",
                "user_prompt",
                app_name=app_name,
                window_title=window_title,
                start_time=start_str,
                end_time=end_str,
            )

            # 构建完整的提示词（包含system和user）
            full_prompt = f"{system_prompt}\n\n{user_prompt}"

            # 调用视觉模型
            result = self.llm_client.vision_chat(
                screenshot_ids=screenshot_ids,
                prompt=full_prompt,
                temperature=0.3,  # 使用较低温度以提高准确性
                max_tokens=2000,
            )

            response_text = result.get("response", "")
            if not response_text:
                logger.warning("视觉模型返回空响应")
                return []

            # 解析LLM响应
            todos = self._parse_llm_response(response_text)
            return todos

        except Exception as e:
            logger.error(f"调用视觉模型提取待办失败: {e}", exc_info=True)
            return []

    def _parse_llm_response(self, response_text: str) -> list[dict[str, Any]]:
        """
        解析LLM响应为待办事项列表

        Args:
            response_text: LLM返回的文本

        Returns:
            待办事项列表
        """
        try:
            # 尝试提取JSON
            json_match = re.search(r"\{.*\}", response_text, re.DOTALL)
            if json_match:
                json_str = json_match.group(0)
                result = json.loads(json_str)

                if "todos" in result and isinstance(result["todos"], list):
                    todos = []
                    for todo in result["todos"]:
                        if "title" in todo and "time_info" in todo:
                            todos.append(todo)
                    return todos
            else:
                logger.warning("LLM响应中未找到JSON格式")
                return []

        except json.JSONDecodeError as e:
            logger.error(f"解析LLM响应JSON失败: {e}\n原始响应: {response_text[:200]}")
        except Exception as e:
            logger.error(f"解析待办事项失败: {e}")

        return []

    def _parse_todo_time(
        self, todo: dict[str, Any], reference_time: datetime
    ) -> dict[str, Any] | None:
        """
        解析待办的时间信息，计算绝对时间

        Args:
            todo: 待办字典，包含time_info
            reference_time: 参考时间（事件开始或结束时间）

        Returns:
            解析后的待办字典，包含scheduled_time字段
        """
        try:
            time_info = todo.get("time_info")
            if not time_info:
                logger.warning("待办项缺少time_info字段")
                return None

            # 计算绝对时间
            scheduled_time = calculate_scheduled_time(time_info, reference_time)

            # 构建解析后的待办
            parsed_todo = todo.copy()
            parsed_todo["scheduled_time"] = scheduled_time

            return parsed_todo

        except Exception as e:
            logger.error(f"解析待办时间失败: {e}")
            return None


# 全局实例
todo_extraction_service = TodoExtractionService()
