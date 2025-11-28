"""任务进展摘要服务

此服务通过 APScheduler 调度器运行，定期检查哪些任务有足够多的新关联上下文，
并使用 LLM 自动生成进展摘要，追加到任务描述中。
"""

from datetime import datetime
from typing import Any

from lifetrace.llm.llm_client import LLMClient
from lifetrace.storage import (
    context_mgr,
    event_mgr,
    get_session,
    ocr_mgr,
    project_mgr,
    task_mgr,
)
from lifetrace.util.config import config
from lifetrace.util.logging_config import get_logger

logger = get_logger()

# 全局服务实例（用于调度器任务）
_global_summary_instance = None


class TaskSummaryService:
    """任务进展摘要服务"""

    def __init__(
        self,
        llm_client: LLMClient = None,
        min_new_contexts: int = 5,
        enabled: bool = True,
    ):
        """
        初始化任务摘要服务

        Args:
            llm_client: LLM客户端，如果为None则自动创建
            min_new_contexts: 触发摘要的最小新上下文数量
            enabled: 是否启用服务
        """
        self.llm_client = llm_client or LLMClient()
        self.min_new_contexts = min_new_contexts
        self.enabled = enabled

        # 统计信息
        self.stats = {
            "total_tasks_processed": 0,
            "total_summaries_generated": 0,
            "total_contexts_summarized": 0,
            "last_run_time": None,
            "last_error": None,
        }

        logger.info(
            f"任务摘要服务初始化完成 - 最小新上下文数: {min_new_contexts}, 启用状态: {enabled}"
        )

    def get_stats(self) -> dict[str, Any]:
        """获取服务统计信息"""
        return self.stats.copy()

    def _process_all_tasks(self):
        """
        处理所有需要生成摘要的任务

        a. 检查哪些任务有足够多的、尚未被摘要的新关联上下文
        """
        try:
            # 获取所有项目
            projects = project_mgr.list_projects(limit=1000, offset=0)

            if not projects:
                logger.debug("系统中没有项目")
                return

            tasks_need_summary = []

            # 遍历所有项目的所有任务
            for project in projects:
                project_id = project["id"]
                tasks = task_mgr.list_tasks(project_id=project_id, limit=1000, offset=0)

                for task in tasks:
                    task_id = task["id"]

                    # 获取该任务关联的所有上下文，只获取未被用于摘要的
                    new_contexts = context_mgr.list_contexts(
                        task_id=task_id, used_in_summary=False, limit=1000, offset=0
                    )

                    if not new_contexts:
                        continue

                    if len(new_contexts) >= self.min_new_contexts:
                        tasks_need_summary.append(
                            {"task": task, "project": project, "new_contexts": new_contexts}
                        )
                        logger.info(
                            f"任务 {task_id} ({task['name']}) 有 "
                            f"{len(new_contexts)} 个新上下文，将生成摘要"
                        )

            if not tasks_need_summary:
                logger.debug("没有任务需要生成摘要")
                return

            logger.info(f"找到 {len(tasks_need_summary)} 个任务需要生成摘要")

            # 为每个任务生成摘要
            for item in tasks_need_summary:
                try:
                    self._generate_summary_for_task(
                        task=item["task"],
                        project=item["project"],
                        new_contexts=item["new_contexts"],
                    )
                    self.stats["total_tasks_processed"] += 1
                except Exception as e:
                    logger.error(f"为任务 {item['task']['id']} 生成摘要时出错: {e}")
                    logger.exception(e)

        except Exception as e:
            logger.error(f"处理所有任务时出错: {e}")
            logger.exception(e)

    def _generate_summary_for_task(
        self, task: dict[str, Any], project: dict[str, Any], new_contexts: list[dict[str, Any]]
    ):
        """
        为任务生成进展摘要

        b. 构建面向 LLM 的摘要 Prompt
           （包含任务名称和所有新的上下文文本）
        c. 调用 LLM API，获取生成的"进展摘要"
        d. 将摘要文本追加到 tasks 表的 description 字段中，
           并做好格式化

        Args:
            task: 任务信息
            project: 项目信息
            new_contexts: 新的上下文列表
        """
        task_id = task["id"]
        task_name = task["name"]
        task_description = task.get("description", "")

        logger.info(
            f"开始为任务 {task_id} ({task_name}) 生成摘要，基于 {len(new_contexts)} 个新上下文"
        )

        # 收集所有新上下文的详细信息
        context_details = []
        for context in new_contexts:
            # 获取上下文的截图和OCR文本
            screenshots = self._get_screenshots_for_context(context["id"])

            ocr_texts = []
            for screenshot in screenshots[:3]:  # 每个上下文最多取3个截图
                ocr_results = ocr_mgr.get_ocr_results_by_screenshot(screenshot["id"])
                for ocr_result in ocr_results:
                    if ocr_result and ocr_result.get("text_content"):
                        ocr_texts.append(ocr_result["text_content"])

            context_info = {
                "id": context["id"],
                "app_name": context.get("app_name", "未知"),
                "window_title": context.get("window_title", ""),
                "start_time": context.get("start_time", ""),
                "end_time": context.get("end_time", ""),
                "ai_title": context.get("ai_title", ""),
                "ai_summary": context.get("ai_summary", ""),
                "ocr_texts": ocr_texts,
            }
            context_details.append(context_info)

        # b. 构建面向 LLM 的摘要 Prompt
        prompt = self._build_summary_prompt(
            task=task, project=project, context_details=context_details
        )

        # c. 调用 LLM API，获取生成的"进展摘要"
        summary = self._call_llm_for_summary(prompt)

        if not summary:
            logger.warning(f"任务 {task_id} 的摘要生成失败")
            return

        # d. 将摘要文本追加到 tasks 表的 description 字段中
        success = self._append_summary_to_task(task_id, summary, task_description)

        if success:
            # 标记这些上下文已被摘要（在数据库中标记）
            event_ids = [ctx["id"] for ctx in new_contexts]
            context_mgr.mark_contexts_used_in_summary(task_id, event_ids)

            self.stats["total_summaries_generated"] += 1
            self.stats["total_contexts_summarized"] += len(new_contexts)

            logger.info(
                f"✅ 成功为任务 {task_id} ({task_name}) 生成并保存摘要，"
                f"摘要了 {len(new_contexts)} 个上下文"
            )
        else:
            logger.error(f"❌ 保存任务 {task_id} 的摘要失败")

    def _get_screenshots_for_context(self, context_id: int) -> list[dict[str, Any]]:
        """
        获取上下文关联的截图

        Args:
            context_id: 上下文ID（即事件ID）

        Returns:
            截图列表
        """
        try:
            screenshots = event_mgr.get_event_screenshots(context_id)
            return screenshots
        except Exception as e:
            logger.error(f"获取上下文 {context_id} 的截图失败: {e}")
            logger.exception(e)
            return []

    def _build_summary_prompt(
        self, task: dict[str, Any], project: dict[str, Any], context_details: list[dict[str, Any]]
    ) -> dict[str, str]:
        """
        构建用于LLM生成摘要的提示

        Args:
            task: 任务信息
            project: 项目信息
            context_details: 上下文详细信息列表

        Returns:
            包含system和user消息的字典
        """
        task_name = task["name"]
        task_description = task.get("description", "无")
        project_name = project["name"]
        project_goal = project.get("goal", "无")

        # 构建上下文信息字符串
        contexts_info = []
        for i, ctx in enumerate(context_details, 1):
            ctx_str = f"【上下文 {i}】\n"
            ctx_str += f"- 应用: {ctx['app_name']}\n"
            if ctx.get("window_title"):
                ctx_str += f"- 窗口标题: {ctx['window_title']}\n"
            ctx_str += f"- 时间: {ctx.get('start_time', '未知')} 至 {ctx.get('end_time', '未知')}\n"

            if ctx.get("ai_title"):
                ctx_str += f"- AI标题: {ctx['ai_title']}\n"
            if ctx.get("ai_summary"):
                ctx_str += f"- AI摘要: {ctx['ai_summary']}\n"

            if ctx.get("ocr_texts"):
                # 合并OCR文本，限制长度
                MAX_OCR_TEXT_LENGTH = 500
                combined_text = "\n".join(ctx["ocr_texts"])
                if len(combined_text) > MAX_OCR_TEXT_LENGTH:
                    combined_text = combined_text[:MAX_OCR_TEXT_LENGTH] + "..."
                ctx_str += f"- 内容文本:\n{combined_text}\n"

            contexts_info.append(ctx_str)

        contexts_str = "\n".join(contexts_info)

        system_prompt = """你是一个智能助手，专门用于分析用户的工作上下文并生成任务进展摘要。

你会收到：
1. 项目信息（名称、目标）
2. 任务信息（名称、当前描述）
3. 一系列新的上下文记录（应用活动、时间、内容等）

请基于这些新的上下文记录，生成一段简洁的进展摘要，描述用户在这个任务上做了什么工作。

要求：
1. 摘要应该简洁明了，不超过200字
2. 重点关注实际工作内容和进展
3. 如果能识别出具体的工作成果或里程碑，请特别说明
4. 使用友好、自然的语言
5. 不要重复任务名称或项目名称
6. 直接输出摘要文本，不要添加任何前缀或标题

只返回摘要文本，不要返回其他任何信息。"""

        user_prompt = f"""项目信息：
- 项目名称: {project_name}
- 项目目标: {project_goal}

任务信息：
- 任务名称: {task_name}
- 当前描述: {task_description}

新的工作上下文（共 {len(context_details)} 条）：
{contexts_str}

请基于以上新的上下文记录，生成一段任务进展摘要。"""

        return {"system": system_prompt, "user": user_prompt}

    def _call_llm_for_summary(self, prompt: dict[str, str]) -> str | None:
        """
        调用LLM生成摘要

        Args:
            prompt: 提示信息

        Returns:
            生成的摘要文本
        """
        if not self.llm_client.is_available():
            logger.warning("LLM客户端不可用，无法生成摘要")
            return None

        try:
            response = self.llm_client.client.chat.completions.create(
                model=self.llm_client.model,
                messages=[
                    {"role": "system", "content": prompt["system"]},
                    {"role": "user", "content": prompt["user"]},
                ],
                temperature=0.3,
                max_tokens=500,
            )

            # 记录token使用量
            if hasattr(response, "usage") and response.usage:
                from lifetrace.util.token_usage_logger import log_token_usage

                log_token_usage(
                    model=self.llm_client.model,
                    input_tokens=response.usage.prompt_tokens,
                    output_tokens=response.usage.completion_tokens,
                    endpoint="task_summary",
                    response_type="summary_generation",
                    feature_type="job_task_summary",
                )

            summary = response.choices[0].message.content.strip()

            logger.debug(f"LLM生成的摘要: {summary}")

            return summary

        except Exception as e:
            logger.error(f"调用LLM生成摘要失败: {e}")
            logger.exception(e)
            return None

    def _append_summary_to_task(self, task_id: int, summary: str, current_description: str) -> bool:
        """
        将摘要追加到任务描述中

        Args:
            task_id: 任务ID
            summary: 摘要文本
            current_description: 当前描述

        Returns:
            是否成功
        """
        try:
            # 格式化摘要，添加时间戳和前缀
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            formatted_summary = f"\n\n---\n**AI 摘要** ({timestamp}):\n{summary}"

            # 将摘要追加到现有描述
            if current_description:
                new_description = current_description + formatted_summary
            else:
                new_description = formatted_summary.strip()

            # 更新任务描述
            success = task_mgr.update_task(task_id=task_id, description=new_description)

            if success:
                logger.info(f"成功将摘要追加到任务 {task_id} 的描述中")
            else:
                logger.error(f"更新任务 {task_id} 的描述失败")

            return success

        except Exception as e:
            logger.error(f"追加摘要到任务 {task_id} 失败: {e}")
            logger.exception(e)
            return False

    def trigger_manual_summary(self, task_id: int) -> dict[str, Any]:
        """
        手动触发任务摘要生成（供API调用）

        Args:
            task_id: 任务ID

        Returns:
            结果信息
        """
        try:
            # 获取任务信息
            task = task_mgr.get_task(task_id)
            if not task:
                return {"success": False, "message": f"任务 {task_id} 不存在"}

            # 获取项目信息
            project = project_mgr.get_project(task["project_id"])
            if not project:
                return {"success": False, "message": f"项目 {task['project_id']} 不存在"}

            # 获取该任务关联的所有上下文，只获取未被用于摘要的
            new_contexts = context_mgr.list_contexts(
                task_id=task_id, used_in_summary=False, limit=1000, offset=0
            )

            if not new_contexts:
                return {"success": False, "message": f"任务 {task_id} 没有新的上下文需要摘要"}

            # 生成摘要
            self._generate_summary_for_task(task=task, project=project, new_contexts=new_contexts)

            return {
                "success": True,
                "message": f"成功为任务 {task_id} 生成摘要",
                "contexts_summarized": len(new_contexts),
            }

        except Exception as e:
            logger.error(f"手动触发任务 {task_id} 摘要失败: {e}")
            logger.exception(e)
            return {"success": False, "message": f"生成摘要失败: {str(e)}"}

    def clear_summary_history(self, task_id: int | None = None):
        """
        清除摘要历史记录（用于重新生成摘要）

        将数据库中的 used_in_summary 标记重置为 False

        Args:
            task_id: 任务ID，如果为None则清除所有任务的历史
        """
        try:
            from sqlalchemy import update

            from lifetrace.storage.models import EventTaskRelation

            with get_session() as session:
                if task_id is None:
                    # 重置所有记录
                    stmt = update(EventTaskRelation).values(used_in_summary=False)
                    result = session.execute(stmt)
                    session.commit()
                    logger.info(f"已清除所有任务的摘要历史记录（重置了 {result.rowcount} 条记录）")
                else:
                    # 只重置指定任务的记录
                    stmt = (
                        update(EventTaskRelation)
                        .where(EventTaskRelation.task_id == task_id)
                        .values(used_in_summary=False)
                    )
                    result = session.execute(stmt)
                    session.commit()
                    logger.info(
                        f"已清除任务 {task_id} 的摘要历史记录（重置了 {result.rowcount} 条记录）"
                    )
        except Exception as e:
            logger.error(f"清除摘要历史记录失败: {e}")
            logger.exception(e)


def get_summary_instance() -> TaskSummaryService:
    """获取全局任务摘要服务实例

    Returns:
        TaskSummaryService 实例
    """
    global _global_summary_instance
    if _global_summary_instance is None:
        min_new_contexts = config.get("jobs.task_summary.params.min_new_contexts")
        enabled = config.get("jobs.task_summary.enabled")

        _global_summary_instance = TaskSummaryService(
            min_new_contexts=min_new_contexts,
            enabled=enabled,
        )
    return _global_summary_instance


def execute_summary_task():
    """执行任务摘要任务（供调度器调用的可序列化函数）

    这是一个模块级别的函数，可以被 APScheduler 序列化到数据库中
    """
    try:
        logger.info("🔄 开始执行任务摘要任务")
        summary_service = get_summary_instance()

        # 执行摘要处理
        summary_service._process_all_tasks()

        # 返回处理统计
        generated = summary_service.stats.get("total_summaries_generated", 0)
        logger.info(f"✅ 任务摘要任务完成，生成摘要数: {generated}")
        return generated
    except Exception as e:
        logger.error(f"执行任务摘要任务失败: {e}", exc_info=True)
        return 0
