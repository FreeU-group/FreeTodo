"""任务上下文映射服务

此服务通过 APScheduler 调度器运行，定期获取未关联的上下文（事件），
并使用 LLM 智能分析将其关联到最合适的任务上。
"""

import json
from typing import Any

from lifetrace.llm.llm_client import LLMClient
from lifetrace.storage import (
    context_mgr,
    event_mgr,
    ocr_mgr,
    project_mgr,
    task_mgr,
)
from lifetrace.util.config import config
from lifetrace.util.logging_config import get_logger

logger = get_logger()

# 全局服务实例（用于调度器任务）
_global_mapper_instance = None


class TaskContextMapper:
    """任务上下文映射服务"""

    def __init__(
        self,
        llm_client: LLMClient,
        project_confidence_threshold: float,
        task_confidence_threshold: float,
        batch_size: int,
        enabled: bool,
    ):
        """
        初始化任务上下文映射服务

        Args:
            llm_client: LLM客户端
            project_confidence_threshold: 项目置信度阈值，只有超过此阈值的项目关联才会被应用
            task_confidence_threshold: 任务置信度阈值，只有超过此阈值的任务关联才会被应用
            batch_size: 每次处理的上下文数量
            enabled: 是否启用服务
        """
        self.llm_client = llm_client
        self.project_confidence_threshold = project_confidence_threshold
        self.task_confidence_threshold = task_confidence_threshold
        self.batch_size = batch_size
        self.enabled = enabled

        # 统计信息
        self.stats = {
            "total_processed": 0,
            "total_associated": 0,
            "total_skipped": 0,
            "last_run_time": None,
            "last_error": None,
        }

        logger.info(
            f"任务上下文映射服务初始化完成 - "
            f"项目置信度阈值: {project_confidence_threshold}, "
            f"任务置信度阈值: {task_confidence_threshold}, "
            f"批次大小: {batch_size}, "
            f"启用状态: {enabled}"
        )

    def get_stats(self) -> dict[str, Any]:
        """获取服务统计信息"""
        return self.stats.copy()

    def _process_batch(self):
        """处理一批未关联的上下文"""
        # a. 获取一批未关联的上下文
        unassociated_contexts = self._get_unassociated_contexts(limit=self.batch_size)

        if not unassociated_contexts:
            logger.debug("没有未关联的上下文需要处理")
            return

        logger.info(f"开始处理 {len(unassociated_contexts)} 个未关联的上下文")

        for context in unassociated_contexts:
            context_id = context.get("id")
            try:
                self._process_single_context(context)
                self.stats["total_processed"] += 1
            except Exception as e:
                logger.error(f"处理上下文 {context_id} 时发生严重错误: {e}")
                logger.exception(e)
                # 注意：_process_single_context 内部的 finally 块通常会执行标记
                # 但为了绝对确保标记操作，这里再次执行（幂等操作，多次调用安全）
                try:
                    context_mgr.mark_context_mapping_attempted(context_id)
                except Exception as mark_error:
                    logger.error(f"❌ 紧急：无法标记上下文 {context_id} 为已尝试: {mark_error}")

    def _get_unassociated_contexts(self, limit: int = 10) -> list[dict[str, Any]]:
        """
        获取一批未尝试自动关联的上下文

        ⚠️ 关键逻辑：只返回 auto_association_attempted = False 的 events
        一旦某个 event 被标记为已尝试（无论成功或失败），它将永远不会再被返回

        Args:
            limit: 返回数量限制

        Returns:
            未尝试自动关联的上下文列表（永远不会包含已标记的 events）
        """
        try:
            # 使用 mapping_attempted=False 获取未尝试过自动关联的上下文
            # 注意：不是 associated=False（那是检查是否已关联到任务）
            # mapping_attempted=False 确保每个 event 只被 task_context_mapper job 处理一次
            contexts = context_mgr.list_contexts(mapping_attempted=False, limit=limit, offset=0)
            logger.debug(f"获取到 {len(contexts)} 个未尝试自动关联的上下文")
            return contexts
        except Exception as e:
            logger.error(f"获取未尝试自动关联的上下文失败: {e}")
            logger.exception(e)
            return []

    def _handle_project_only_association(
        self, context_id: int, project_id: int, project_confidence: float, reason: str
    ):
        """处理仅有项目关联（无任务关联）的情况"""
        logger.info(f"{reason}: 上下文 {context_id}")
        self.stats["total_skipped"] += 1
        context_mgr.create_or_update_event_association(
            event_id=context_id,
            project_id=project_id,
            project_confidence=project_confidence,
            association_method="auto",
        )

    def _save_association_result(
        self,
        context_id: int,
        project_id: int,
        project_confidence: float,
        task_id: int | None,
        task_confidence: float,
        reasoning: str,
    ) -> bool:
        """保存关联结果并记录日志"""
        success = context_mgr.create_or_update_event_association(
            event_id=context_id,
            project_id=project_id,
            task_id=task_id if task_confidence >= self.task_confidence_threshold else None,
            project_confidence=project_confidence,
            task_confidence=task_confidence,
            reasoning=reasoning,
            association_method="auto",
        )

        if success:
            if task_confidence >= self.task_confidence_threshold:
                self.stats["total_associated"] += 1
                logger.info(
                    f"✅ 成功关联上下文 {context_id} 到项目 {project_id} 任务 {task_id} "
                    f"(项目置信度: {project_confidence:.2f}, 任务置信度: {task_confidence:.2f})"
                )
            else:
                logger.info(
                    f"⏭️  上下文 {context_id} 任务置信度 {task_confidence:.2f} "
                    f"低于阈值 {self.task_confidence_threshold}，仅保存项目关联 {project_id}"
                )
                self.stats["total_skipped"] += 1
        else:
            logger.error(f"❌ 保存上下文 {context_id} 的关联失败")
            self.stats["total_skipped"] += 1

        return success

    def _process_single_context(self, context: dict[str, Any]):
        """处理单个上下文，尝试将其关联到最合适的任务"""
        context_id = context["id"]
        logger.info(f"开始处理上下文 {context_id}")

        try:
            # 确定项目归属
            project_result = self._determine_project_for_context(context)
            if not project_result:
                logger.info(f"上下文 {context_id} 无法确定归属项目，跳过自动关联")
                self.stats["total_skipped"] += 1
                return

            project_id, project_confidence = project_result
            logger.info(
                f"上下文 {context_id} 判断归属项目 {project_id} (置信度: {project_confidence:.2f})"
            )

            # 检查项目置信度阈值
            if project_confidence < self.project_confidence_threshold:
                logger.info(
                    f"上下文 {context_id} 项目置信度 {project_confidence:.2f} "
                    f"低于阈值 {self.project_confidence_threshold}，跳过关联"
                )
                self.stats["total_skipped"] += 1
                return

            # 获取进行中的任务
            in_progress_tasks = self._get_in_progress_tasks(project_id)
            if not in_progress_tasks:
                self._handle_project_only_association(
                    context_id,
                    project_id,
                    project_confidence,
                    f"项目 {project_id} 没有进行中的任务",
                )
                return

            logger.info(
                f"上下文 {context_id} 归属项目 {project_id}，"
                f"找到 {len(in_progress_tasks)} 个进行中的任务"
            )

            # 调用 LLM 进行任务关联
            prompt = self._build_association_prompt(context, project_id, in_progress_tasks)
            result = self._call_llm_for_association(prompt)

            if not result:
                self._handle_project_only_association(
                    context_id, project_id, project_confidence, "LLM任务关联失败"
                )
                return

            task_id = result.get("task_id")
            task_confidence = result.get("confidence_score", 0.0)
            reasoning = result.get("reasoning", "")

            # 保存关联结果
            self._save_association_result(
                context_id, project_id, project_confidence, task_id, task_confidence, reasoning
            )

            # 记录决策过程
            self._log_decision(
                context_id=context_id,
                project_id=project_id,
                task_id=task_id,
                confidence_score=task_confidence,
                reasoning=reasoning,
                associated=task_confidence >= self.task_confidence_threshold
                if task_confidence
                else False,
            )

        finally:
            # 无论处理结果如何都标记为已尝试
            try:
                context_mgr.mark_context_mapping_attempted(context_id)
                logger.info(f"✓ 已标记上下文 {context_id} 为已尝试自动关联（永久标记）")
            except Exception as e:
                logger.error(f"❌ 严重错误：无法标记上下文 {context_id} 为已尝试: {e}")
                raise

    def _determine_project_for_context(self, context: dict[str, Any]) -> tuple[int, float] | None:
        """
        确定上下文归属的项目

        策略：
        1. 获取该上下文时间窗口内的截图
        2. 提取OCR文本内容
        3. 使用LLM判断与哪个项目最相关

        Args:
            context: 上下文数据

        Returns:
            (项目ID, 置信度) 元组，如果无法确定则返回None
        """
        context_id = context["id"]

        try:
            # 获取该事件的所有截图
            screenshots = self._get_screenshots_for_context(context_id)

            if not screenshots:
                logger.debug(f"上下文 {context_id} 没有关联的截图")
                # 如果没有截图，我们尝试使用应用名和窗口标题来判断
                # 这里可以简化：返回第一个活跃项目（低置信度）
                projects = project_mgr.list_projects(limit=1, offset=0)
                if projects:
                    return (projects[0]["id"], 0.5)  # 默认置信度0.5
                return None

            # 提取OCR文本
            ocr_texts = []
            for screenshot in screenshots[:5]:  # 最多取5个截图
                ocr_results = ocr_mgr.get_ocr_results_by_screenshot(screenshot["id"])
                for ocr_result in ocr_results:
                    if ocr_result and ocr_result.get("text_content"):
                        ocr_texts.append(ocr_result["text_content"])

            # 获取所有项目
            all_projects = project_mgr.list_projects(limit=100, offset=0)

            if not all_projects:
                logger.warning("系统中没有任何项目")
                return None

            # 使用LLM判断最相关的项目
            result = self._determine_project_by_llm(
                context=context, ocr_texts=ocr_texts, projects=all_projects
            )

            return result  # 返回 (project_id, confidence)

        except Exception as e:
            logger.error(f"确定上下文 {context_id} 归属项目时出错: {e}")
            logger.exception(e)
            return None

    def _get_screenshots_for_context(self, context_id: int) -> list[dict[str, Any]]:
        """
        获取上下文关联的截图

        Args:
            context_id: 上下文ID（即事件ID）

        Returns:
            截图列表
        """
        try:
            # 使用数据库管理器的方法获取事件的截图
            screenshots = event_mgr.get_event_screenshots(context_id)
            return screenshots
        except Exception as e:
            logger.error(f"获取上下文 {context_id} 的截图失败: {e}")
            logger.exception(e)
            return []

    def _determine_project_by_llm(
        self,
        context: dict[str, Any],
        ocr_texts: list[str],
        projects: list[dict[str, Any]],
    ) -> tuple[int, float] | None:
        """
        使用LLM判断上下文最相关的项目

        Args:
            context: 上下文数据
            ocr_texts: OCR文本列表
            projects: 项目列表

        Returns:
            (项目ID, 置信度) 元组，如果无法判断返回None
        """
        if not self.llm_client.is_available():
            logger.warning("LLM客户端不可用，使用默认项目")
            return (projects[0]["id"], 0.5) if projects else None

        # 构建项目列表字符串
        projects_info = []
        for project in projects:
            projects_info.append(
                f"- 项目ID: {project['id']}, 名称: {project['name']}, "
                f"目标: {project.get('goal', '无')}"
            )

        projects_str = "\n".join(projects_info)

        # 构建OCR文本
        ocr_content = "\n---\n".join(ocr_texts[:3]) if ocr_texts else "无文本内容"

        # 构建提示
        system_prompt = """你是一个智能助手，专门用于分析上下文内容并判断其归属的项目。
请根据提供的上下文信息（应用名称、窗口标题、OCR文本内容）和项目列表，
判断该上下文最可能归属于哪个项目。

请以JSON格式返回结果：
{
    "project_id": <项目ID>,
    "confidence": <0到1之间的置信度>
}

只返回JSON，不要返回其他任何信息。"""

        user_prompt = f"""上下文信息：
- 应用名称: {context.get("app_name", "未知")}
- 窗口标题: {context.get("window_title", "未知")}
- 开始时间: {context.get("start_time", "未知")}
- OCR文本内容:
{ocr_content}

项目列表：
{projects_str}

请判断该上下文最可能归属于哪个项目。"""

        try:
            response = self.llm_client.client.chat.completions.create(
                model=self.llm_client.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.1,
                max_tokens=200,
            )

            # 记录token使用量
            if hasattr(response, "usage") and response.usage:
                from lifetrace.util.token_usage_logger import log_token_usage

                log_token_usage(
                    model=self.llm_client.model,
                    input_tokens=response.usage.prompt_tokens,
                    output_tokens=response.usage.completion_tokens,
                    endpoint="task_context_mapper",
                    response_type="project_determination",
                    feature_type="job_task_context_mapper",
                    additional_info={"context_id": context["id"]},
                )

            result_text = response.choices[0].message.content.strip()

            # 清理可能的markdown代码块标记
            clean_text = result_text.strip()
            if clean_text.startswith("```json"):
                clean_text = clean_text[7:]
            if clean_text.endswith("```"):
                clean_text = clean_text[:-3]
            clean_text = clean_text.strip()

            result = json.loads(clean_text)
            project_id = result.get("project_id")
            confidence = result.get("confidence", 0.0)

            logger.info(
                f"LLM判断上下文 {context['id']} 归属项目 {project_id} (置信度: {confidence:.2f})"
            )

            return (project_id, confidence)

        except Exception as e:
            logger.error(f"使用LLM判断项目归属失败: {e}")
            logger.exception(e)
            # 返回第一个项目作为默认值
            return (projects[0]["id"], 0.5) if projects else None

    def _get_in_progress_tasks(self, project_id: int) -> list[dict[str, Any]]:
        """
        获取项目下所有进行中的任务

        Args:
            project_id: 项目ID

        Returns:
            进行中的任务列表
        """
        try:
            # 获取项目的所有任务
            all_tasks = task_mgr.list_tasks(project_id=project_id, limit=1000, offset=0)

            # 筛选出进行中的任务
            in_progress_tasks = [task for task in all_tasks if task["status"] == "in_progress"]

            logger.debug(f"项目 {project_id} 有 {len(in_progress_tasks)} 个进行中的任务")

            return in_progress_tasks

        except Exception as e:
            logger.error(f"获取项目 {project_id} 的进行中任务失败: {e}")
            logger.exception(e)
            return []

    def _build_association_prompt(
        self,
        context: dict[str, Any],
        project_id: int,
        tasks: list[dict[str, Any]],
    ) -> dict[str, str]:
        """
        构建用于LLM判断的提示

        Args:
            context: 上下文数据
            project_id: 项目ID
            tasks: 任务列表

        Returns:
            包含system和user消息的字典
        """
        # 获取项目信息
        project = project_mgr.get_project(project_id)
        project_name = project.get("name", "未知项目") if project else "未知项目"
        project_goal = project.get("goal", "无") if project else "无"

        # 构建任务列表字符串
        tasks_info = []
        for task in tasks:
            tasks_info.append(
                f"- 任务ID: {task['id']}, 名称: {task['name']}, "
                f"描述: {task.get('description', '无')}"
            )

        tasks_str = "\n".join(tasks_info) if tasks_info else "无进行中的任务"

        # 获取上下文的详细内容（截图OCR文本）
        screenshots = self._get_screenshots_for_context(context["id"])
        ocr_texts = []
        for screenshot in screenshots[:5]:  # 最多取5个截图
            ocr_results = ocr_mgr.get_ocr_results_by_screenshot(screenshot["id"])
            for ocr_result in ocr_results:
                if ocr_result and ocr_result.get("text_content"):
                    ocr_texts.append(ocr_result["text_content"])

        ocr_content = "\n---\n".join(ocr_texts) if ocr_texts else "无文本内容"

        system_prompt = """你是一个智能助手，专门用于分析用户的工作上下文并将其关联到最合适的任务。

你会收到：
1. 项目信息（名称、目标）
2. 当前上下文信息（应用名称、窗口标题、OCR文本内容）
3. 该项目下所有进行中的任务列表

请分析上下文内容，判断它最可能关联到哪个任务，并给出置信度评分。

请以JSON格式返回结果：
{
    "task_id": <最匹配的任务ID，如果都不匹配则返回null>,
    "confidence_score": <0到1之间的置信度分数>,
    "reasoning": "<简短说明为什么选择这个任务>"
}

评分标准：
- 0.9-1.0: 非常确定，上下文内容与任务高度相关
- 0.7-0.9: 比较确定，有明显的关联性
- 0.5-0.7: 可能相关，但不太确定
- 0.0-0.5: 不太相关或无法判断

只返回JSON，不要返回其他任何信息。"""

        user_prompt = f"""项目信息：
- 项目名称: {project_name}
- 项目目标: {project_goal}

当前上下文：
- 应用名称: {context.get("app_name", "未知")}
- 窗口标题: {context.get("window_title", "未知")}
- 开始时间: {context.get("start_time", "未知")}
- 结束时间: {context.get("end_time", "未知")}
- OCR文本内容:
{ocr_content}

进行中的任务列表：
{tasks_str}

请判断该上下文最可能关联到哪个任务。"""

        return {"system": system_prompt, "user": user_prompt}

    def _call_llm_for_association(self, prompt: dict[str, str]) -> dict[str, Any] | None:
        """
        调用LLM进行关联判断

        Args:
            prompt: 提示信息

        Returns:
            包含task_id、confidence_score和reasoning的字典
        """
        if not self.llm_client.is_available():
            logger.warning("LLM客户端不可用，无法进行自动关联")
            return None

        try:
            response = self.llm_client.client.chat.completions.create(
                model=self.llm_client.model,
                messages=[
                    {"role": "system", "content": prompt["system"]},
                    {"role": "user", "content": prompt["user"]},
                ],
                temperature=0.1,
                max_tokens=500,
            )

            # 记录token使用量
            if hasattr(response, "usage") and response.usage:
                from lifetrace.util.token_usage_logger import log_token_usage

                log_token_usage(
                    model=self.llm_client.model,
                    input_tokens=response.usage.prompt_tokens,
                    output_tokens=response.usage.completion_tokens,
                    endpoint="task_context_mapper",
                    response_type="task_association",
                    feature_type="job_task_context_mapper",
                )

            result_text = response.choices[0].message.content.strip()

            # 清理可能的markdown代码块标记
            clean_text = result_text.strip()
            if clean_text.startswith("```json"):
                clean_text = clean_text[7:]
            if clean_text.endswith("```"):
                clean_text = clean_text[:-3]
            clean_text = clean_text.strip()

            result = json.loads(clean_text)

            # 验证结果格式
            if "task_id" not in result or "confidence_score" not in result:
                logger.error(f"LLM返回的JSON格式不正确: {result}")
                return None

            logger.debug(f"LLM关联结果: {result}")

            return result

        except json.JSONDecodeError as e:
            logger.error(f"解析LLM返回的JSON失败: {e}, 原始文本: {result_text}")
            return None
        except Exception as e:
            logger.error(f"调用LLM进行关联判断失败: {e}")
            logger.exception(e)
            return None

    def _log_decision(
        self,
        context_id: int,
        project_id: int,
        task_id: int | None,
        confidence_score: float,
        reasoning: str,
        associated: bool,
    ):
        """
        记录自动关联的决策过程

        Args:
            context_id: 上下文ID
            project_id: 项目ID
            task_id: 任务ID
            confidence_score: 置信度分数
            reasoning: 关联原因
            associated: 是否实际执行了关联
        """
        # 记录到日志文件
        logger.info(
            f"自动关联决策: context_id={context_id}, "
            f"project_id={project_id}, "
            f"task_id={task_id}, "
            f"confidence={confidence_score:.2f}, "
            f"associated={associated}, "
            f"reasoning={reasoning}"
        )

        # 可以选择将决策日志保存到数据库或单独的文件中
        # 这里我们只记录到应用日志


def get_mapper_instance() -> TaskContextMapper:
    """获取全局任务上下文映射服务实例

    Returns:
        TaskContextMapper 实例
    """
    global _global_mapper_instance
    if _global_mapper_instance is None:
        _global_mapper_instance = TaskContextMapper(
            llm_client=LLMClient(),
            project_confidence_threshold=config.get(
                "jobs.task_context_mapper.params.project_confidence_threshold"
            ),
            task_confidence_threshold=config.get(
                "jobs.task_context_mapper.params.task_confidence_threshold"
            ),
            batch_size=config.get("jobs.task_context_mapper.params.batch_size"),
            enabled=config.get("jobs.task_context_mapper.enabled"),
        )
    return _global_mapper_instance


def execute_mapper_task():
    """执行任务上下文映射任务（供调度器调用的可序列化函数）

    这是一个模块级别的函数，可以被 APScheduler 序列化到数据库中
    """
    try:
        logger.info("🔄 开始执行任务上下文映射任务")
        mapper = get_mapper_instance()

        # 执行一批处理
        mapper._process_batch()

        # 返回处理统计
        processed = mapper.stats.get("total_processed", 0)
        logger.info(f"✅ 任务上下文映射任务完成，已处理: {processed}")
        return processed
    except Exception as e:
        logger.error(f"执行任务上下文映射任务失败: {e}", exc_info=True)
        return 0
