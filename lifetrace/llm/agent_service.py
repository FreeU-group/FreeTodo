"""Agent 服务，管理工具调用工作流"""

import json
import re
from collections.abc import Generator
from typing import Any

# 导入工具模块以触发工具注册
from lifetrace.llm import tools  # noqa: F401
from lifetrace.llm.llm_client import LLMClient
from lifetrace.llm.tools.base import ToolResult
from lifetrace.llm.tools.registry import ToolRegistry
from lifetrace.util.logging_config import get_logger
from lifetrace.util.prompt_loader import get_prompt

logger = get_logger()


class AgentService:
    """Agent 服务，管理工具调用工作流"""

    MAX_TOOL_CALLS = 5  # 最大工具调用次数
    MAX_ITERATIONS = 10  # 最大迭代次数

    def __init__(self):
        """初始化 Agent 服务"""
        self.llm_client = LLMClient()
        # 使用单例模式的工具注册表（工具已在 tools/__init__.py 中注册）
        self.tool_registry = ToolRegistry()

    def stream_agent_response(
        self,
        user_query: str,
        todo_context: str | None = None,
        conversation_history: list[dict] | None = None,
    ) -> Generator[str]:
        """
        流式生成 Agent 回答

        工作流：
        1. 工具选择：LLM 判断是否需要工具
        2. 工具执行：执行选中的工具
        3. 任务评估：LLM 评估任务是否完成
        4. 循环控制：如果未完成，重新进入工具选择
        """
        tool_call_count = 0
        iteration_count = 0
        accumulated_context = []

        # 批量删除状态跟踪
        batch_delete_mode = False
        batch_delete_todo_ids = []
        batch_delete_results = []  # 存储所有delete_todo的确认结果

        # 构建初始消息
        messages = self._build_initial_messages(
            user_query,
            todo_context,
            conversation_history,
        )

        # 检测批量删除场景：用户说"删除这些"且待办上下文中包含多个待办
        if (
            any(word in user_query for word in ["这些", "它们", "这些待办"])
            and "删除" in user_query
        ):
            if todo_context:
                import re
                # 只提取"选中待办"部分的ID，避免提取父待办或子待办的ID
                # 待办上下文中，每个选中待办前面有"选中待办"或"Selected Todo"标签
                # 格式示例：
                # 选中待办
                # ID: 21
                # 名称: ...
                # ---
                # 选中待办
                # ID: 22
                # ...

                # 方法1：提取每个"选中待办"或"Selected Todo"标记后的第一个ID
                selected_todo_ids = []
                # 支持中英文标签
                pattern = r"(?:选中待办|Selected Todo|【当前选中待办】|\[Selected Todo\])[\s\S]*?ID:\s*(\d+)"
                matches = re.findall(pattern, todo_context, re.IGNORECASE)
                if matches:
                    selected_todo_ids = [int(id_str) for id_str in matches]
                    # 去重，保持顺序
                    seen = set()
                    unique_ids = []
                    for id_val in selected_todo_ids:
                        if id_val not in seen:
                            seen.add(id_val)
                            unique_ids.append(id_val)
                    selected_todo_ids = unique_ids

                # 方法2：如果方法1没找到，使用分隔符"---"分割，提取每个部分第一个ID
                if not selected_todo_ids and "---" in todo_context:
                    sections = todo_context.split("---")
                    for section in sections:
                        # 在每个section中查找第一个ID（在"ID:"之后）
                        id_match = re.search(r"ID:\s*(\d+)", section)
                        if id_match:
                            todo_id = int(id_match.group(1))
                            if todo_id not in selected_todo_ids:
                                selected_todo_ids.append(todo_id)

                # 如果还是没有找到，fallback到旧方法（但不推荐）
                if not selected_todo_ids:
                    id_matches = re.findall(r"ID:\s*(\d+)", todo_context)
                    # 只取唯一的ID
                    seen = set()
                    for id_str in id_matches:
                        id_val = int(id_str)
                        if id_val not in seen:
                            seen.add(id_val)
                            selected_todo_ids.append(id_val)

                if len(selected_todo_ids) > 1:
                    batch_delete_mode = True
                    batch_delete_todo_ids = selected_todo_ids
                    logger.info(
                        f"[Agent] 检测到批量删除场景，待删除{len(batch_delete_todo_ids)}个待办: {batch_delete_todo_ids}"
                    )

                    # 直接生成批量删除确认面板，不进入工具选择循环
                    todos_info = []
                    for todo_id in batch_delete_todo_ids:
                        # 从待办上下文中提取名称
                        todo_name = f"待办 {todo_id}"
                        # 使用正则提取该ID对应的名称
                        name_pattern = (
                            rf"【当前选中待办】[\s\S]*?ID:\s*{todo_id}[\s\S]*?名称:\s*([^\n]+)"
                        )
                        name_match = re.search(name_pattern, todo_context)
                        if name_match:
                            todo_name = name_match.group(1).strip()
                        todos_info.append({"id": todo_id, "name": todo_name})

                    # 生成批量确认JSON
                    batch_confirmation_json = json.dumps(
                        {
                            "type": "batch_todo_confirmation",
                            "operation": "batch_delete_todos",
                            "todos": todos_info,
                            "preview": f"准备批量删除 {len(todos_info)} 个待办事项",
                        },
                        ensure_ascii=False,
                    )

                    preview_text = f"准备批量删除以下 {len(todos_info)} 个待办事项：\n" + "\n".join(
                        [f"- ID: {t['id']} | 名称: {t['name']}" for t in todos_info]
                    )

                    confirmation_content = (
                        f"{preview_text}\n\n<!-- TODO_CONFIRMATION: {batch_confirmation_json} -->"
                    )
                    yield confirmation_content
                    return  # 直接返回，不进入工具选择循环

        while iteration_count < self.MAX_ITERATIONS:
            iteration_count += 1
            logger.info(f"[Agent] 迭代 {iteration_count}/{self.MAX_ITERATIONS}")

            # 步骤1: 工具选择
            # 在批量删除模式下，传递已处理和剩余ID信息
            processed_ids_list = []
            remaining_ids_list = []
            if batch_delete_mode:
                processed_ids_set = {r.get("todo_id") for r in batch_delete_results}
                processed_ids_list = list(processed_ids_set)
                remaining_ids_list = [
                    tid for tid in batch_delete_todo_ids if tid not in processed_ids_set
                ]

            tool_decision = self._decide_tool_usage(
                messages,
                tool_call_count,
                batch_delete_mode=batch_delete_mode,
                processed_ids=processed_ids_list,
                remaining_ids=remaining_ids_list,
            )

            if tool_decision["use_tool"]:
                # 步骤2: 执行工具
                if tool_call_count >= self.MAX_TOOL_CALLS:
                    yield "\n[提示] 已达到最大工具调用次数限制，将基于已有信息生成回答。\n\n"
                    break

                tool_name = tool_decision["tool_name"]
                tool_params = tool_decision.get("tool_params", {})

                # 构建工具调用标记，包含参数信息（特别是搜索关键词）
                # 对于clarify_todo，不显示工具调用标记，直接显示结果
                if tool_name == "clarify_todo":
                    # clarify_todo的结果会直接返回，不显示工具调用标记
                    pass
                elif tool_name == "web_search" and "query" in tool_params:
                    # 对于 web_search，显示搜索关键词
                    yield f"\n[使用工具: {tool_name} | 关键词: {tool_params['query']}]\n\n"
                else:
                    # 其他工具，显示工具名称和参数（如果有）
                    params_str = ", ".join([f"{k}: {v}" for k, v in tool_params.items()])
                    if params_str:
                        yield f"\n[使用工具: {tool_name} | {params_str}]\n\n"
                    else:
                        yield f"\n[使用工具: {tool_name}]\n\n"

                tool_result = self._execute_tool(tool_name, tool_params)
                tool_call_count += 1

                # 检查是否是clarify_todo工具，如果是且成功，直接返回结果（需要用户输入）
                if tool_name == "clarify_todo" and tool_result.success:
                    logger.info("[Agent] clarify_todo工具返回，需要用户输入，直接返回结果")
                    # 直接返回工具结果内容，不继续处理
                    yield tool_result.content
                    return

                # 检查是否需要用户确认（create_todo, update_todo, delete_todo）
                if tool_result.metadata and tool_result.metadata.get("requires_confirmation"):
                    # 批量删除场景：收集所有确认结果，最后统一返回批量确认面板
                    if batch_delete_mode and tool_name == "delete_todo":
                        confirmation_data = tool_result.metadata.get("confirmation_data", {})
                        batch_delete_results.append(confirmation_data)
                        logger.info(
                            f"[Agent] 批量删除中，已收集{len(batch_delete_results)}/{len(batch_delete_todo_ids)}个待删除确认"
                        )

                        # 如果还有待办没处理，继续循环
                        if len(batch_delete_results) < len(batch_delete_todo_ids):
                            # 输出当前确认信息，但不返回，继续循环
                            formatted_result = self._format_tool_result(tool_name, tool_result)
                            result_content = formatted_result.replace(
                                f"工具 {tool_name} 执行结果：\n", ""
                            )
                            yield result_content
                            # 继续执行，不return，让循环继续
                        else:
                            # 所有待办都已收集，生成批量删除确认面板
                            logger.info("[Agent] 批量删除收集完成，生成批量确认面板")

                            # 构建批量删除确认数据
                            todos_info = []
                            seen_ids = set()  # 去重，避免重复添加同一个待办

                            # 优先从待办上下文中提取选中待办的信息
                            if todo_context:
                                # 提取所有选中待办的ID和名称
                                selected_pattern = r"(?:【当前选中待办】|\[Selected Todo\])[\s\S]*?ID:\s*(\d+)[\s\S]*?名称:\s*([^\n]+)"
                                selected_matches = re.findall(
                                    selected_pattern, todo_context, re.IGNORECASE
                                )

                                for todo_id_str, todo_name in selected_matches:
                                    todo_id = int(todo_id_str)
                                    if todo_id not in seen_ids and todo_id in batch_delete_todo_ids:
                                        seen_ids.add(todo_id)
                                        todos_info.append(
                                            {"id": todo_id, "name": todo_name.strip()}
                                        )

                            # 对于没有从上下文中找到的待办，从工具结果中提取
                            for result in batch_delete_results:
                                todo_id = result.get("todo_id")
                                if todo_id in seen_ids:
                                    continue  # 已经添加过了

                                # 从工具结果的预览消息中提取名称
                                todo_name = f"待办 {todo_id}"
                                # 尝试从accumulated_context中查找
                                for ctx in accumulated_context:
                                    if f"ID: {todo_id}" in ctx:
                                        # 尝试提取名称
                                        name_match = re.search(
                                            rf"ID:\s*{todo_id}[\s\S]*?名称:\s*([^\n|]+)", ctx
                                        )
                                        if name_match:
                                            todo_name = name_match.group(1).strip()
                                            break
                                seen_ids.add(todo_id)
                                todos_info.append({"id": todo_id, "name": todo_name})

                            # 确保所有待删除的ID都在列表中
                            for todo_id in batch_delete_todo_ids:
                                if todo_id not in seen_ids:
                                    todos_info.append({"id": todo_id, "name": f"待办 {todo_id}"})

                            # 生成批量确认JSON
                            batch_confirmation_json = json.dumps(
                                {
                                    "type": "batch_todo_confirmation",
                                    "operation": "batch_delete_todos",
                                    "todos": todos_info,
                                    "preview": f"准备批量删除 {len(todos_info)} 个待办事项",
                                },
                                ensure_ascii=False,
                            )

                            preview_text = (
                                f"准备批量删除以下 {len(todos_info)} 个待办事项：\n"
                                + "\n".join(
                                    [f"- ID: {t['id']} | 名称: {t['name']}" for t in todos_info]
                                )
                            )

                            confirmation_content = f"{preview_text}\n\n<!-- TODO_CONFIRMATION: {batch_confirmation_json} -->"
                            yield confirmation_content
                            return
                    else:
                        # 非批量场景，立即返回确认
                        logger.info(f"[Agent] {tool_name}工具需要用户确认，直接返回结果")
                        formatted_result = self._format_tool_result(tool_name, tool_result)
                        # 移除工具调用标记（如果有），只显示结果内容
                        result_content = formatted_result.replace(
                            f"工具 {tool_name} 执行结果：\n", ""
                        )
                        yield result_content
                        return

                # 将工具结果添加到上下文
                tool_context = self._format_tool_result(tool_name, tool_result)
                accumulated_context.append(tool_context)

                # 更新消息历史
                messages.append(
                    {
                        "role": "assistant",
                        "content": f"[工具调用: {tool_name}]",
                    }
                )
                messages.append(
                    {
                        "role": "user",
                        "content": f"[工具结果]\n{tool_context}",
                    }
                )

                # 步骤3: 任务评估
                # 批量删除场景：如果还有待办没处理，强制继续
                if batch_delete_mode and tool_name == "delete_todo":
                    # 获取已处理的ID集合
                    processed_ids = {r.get("todo_id") for r in batch_delete_results}
                    remaining_ids = [
                        tid for tid in batch_delete_todo_ids if tid not in processed_ids
                    ]

                    if remaining_ids:
                        logger.info(
                            f"[Agent] 批量删除模式：已处理{len(processed_ids)}/{len(batch_delete_todo_ids)}个待办，"
                            f"剩余待处理ID: {remaining_ids}，强制继续"
                        )
                        # 在消息中添加提示，告诉Agent还有哪些待办需要删除
                        if remaining_ids:
                            remaining_hint = f"\n[提示] 批量删除进行中，还需要删除以下待办的ID: {', '.join(map(str, remaining_ids))}。请继续为每个ID调用 delete_todo 工具。"
                            messages.append(
                                {
                                    "role": "user",
                                    "content": remaining_hint,
                                }
                            )
                        should_continue = True
                    else:
                        # 所有待办都已处理，让评估决定是否继续
                        should_continue = self._evaluate_task_completion(
                            user_query,
                            messages,
                            tool_result,
                        )
                else:
                    should_continue = self._evaluate_task_completion(
                        user_query,
                        messages,
                        tool_result,
                    )

                if not should_continue:
                    logger.info("[Agent] 任务评估：可以生成最终回答")
                    break
            else:
                # 不需要工具，直接生成回答
                logger.info("[Agent] 不需要工具，直接生成回答")
                break

        # 步骤4: 生成最终回答
        yield from self._generate_final_response(
            user_query,
            messages,
            accumulated_context,
        )

    def _build_initial_messages(
        self,
        user_query: str,
        todo_context: str | None,
        conversation_history: list[dict] | None,
    ) -> list[dict]:
        """构建初始消息列表"""
        messages = []

        # 系统提示词
        system_prompt = get_prompt("agent", "system")
        if not system_prompt:
            system_prompt = self._get_default_system_prompt()
        messages.append({"role": "system", "content": system_prompt})

        # 添加待办上下文（如果有）
        if todo_context:
            messages.append(
                {
                    "role": "user",
                    "content": f"用户当前的待办事项上下文：\n{todo_context}\n\n",
                }
            )

        # 添加对话历史（如果有）
        if conversation_history:
            messages.extend(conversation_history)

        # 添加当前用户查询
        messages.append({"role": "user", "content": user_query})

        return messages

    def _decide_tool_usage(
        self,
        messages: list[dict],
        tool_call_count: int,
        batch_delete_mode: bool = False,
        processed_ids: list[int] | None = None,
        remaining_ids: list[int] | None = None,
    ) -> dict[str, Any]:
        """
        决定是否需要使用工具

        Returns:
            {
                "use_tool": bool,
                "tool_name": str | None,
                "tool_params": dict | None
            }
        """
        if tool_call_count >= self.MAX_TOOL_CALLS:
            return {"use_tool": False, "tool_name": None, "tool_params": None}

        # 获取可用工具列表
        available_tools = self.tool_registry.get_available_tools()
        if not available_tools:
            return {"use_tool": False, "tool_name": None, "tool_params": None}

        # 构建工具选择提示词
        tools_schema = self.tool_registry.get_tools_schema()
        tool_selection_prompt = get_prompt(
            "agent",
            "tool_selection",
            tools=json.dumps(tools_schema, ensure_ascii=False, indent=2),
            user_query=messages[-1]["content"] if messages else "",
        )

        if not tool_selection_prompt:
            tool_selection_prompt = self._get_default_tool_selection_prompt(
                tools_schema,
            )

        # 调用 LLM 进行工具选择
        try:
            decision_messages = self._build_tool_decision_messages(
                messages,
                tool_selection_prompt,
                batch_delete_mode=batch_delete_mode,
                processed_ids=processed_ids,
                remaining_ids=remaining_ids,
            )
            decision = self._call_llm_for_tool_selection(decision_messages)

            if decision:
                use_tool = decision.get("use_tool", False)
                tool_name = decision.get("tool_name")
                tool_params = decision.get("tool_params", {})

                if use_tool and tool_name:
                    logger.info(
                        f"[Agent] 选择工具: {tool_name}, 参数: {tool_params}",
                    )
                    return {
                        "use_tool": True,
                        "tool_name": tool_name,
                        "tool_params": tool_params,
                    }

            # 如果在批量删除模式下，LLM 没有返回可用工具决策，则进行规则兜底：
            # 只要还有 remaining_ids，就强制为下一个 remaining_id 调用 delete_todo
            if batch_delete_mode and remaining_ids:
                next_id = remaining_ids[0]
                logger.info(
                    f"[Agent] 批量删除兜底逻辑生效，为剩余ID {next_id} 强制调用 delete_todo"
                )
                return {
                    "use_tool": True,
                    "tool_name": "delete_todo",
                    "tool_params": {"todo_id": next_id},
                }
        except Exception as e:
            logger.error(f"[Agent] 工具选择失败: {e}")

        return {"use_tool": False, "tool_name": None, "tool_params": None}

    def _build_tool_decision_messages(
        self,
        messages: list[dict],
        tool_selection_prompt: str,
        batch_delete_mode: bool = False,
        processed_ids: list[int] | None = None,
        remaining_ids: list[int] | None = None,
    ) -> list[dict]:
        """构建工具选择决策消息，包含完整的上下文但排除工具相关消息"""
        decision_messages = [{"role": "system", "content": tool_selection_prompt}]

        # 添加所有非工具相关的消息（保留待办上下文和对话历史）
        # 特殊处理：对于extract_todo的结果，需要保留todos信息
        extract_todo_summary = None

        for msg in messages:
            # 跳过系统提示词（使用新的工具选择提示词）
            if msg.get("role") == "system":
                continue
            content = msg.get("content", "")

            # 特殊处理：检查是否是extract_todo的结果
            if content.startswith("[工具结果]"):
                # 尝试从工具结果中提取extract_todo的信息
                if "extract_todo" in content or "提取的待办数据结构" in content:
                    # 保留extract_todo的结果摘要，用于后续批量创建
                    # 提取JSON部分（如果存在）
                    try:
                        json_match = re.search(r"```json\n(.*?)\n```", content, re.DOTALL)
                        if json_match:
                            todos_json_str = json_match.group(1)
                            todos_data = json.loads(todos_json_str)
                            if todos_data:
                                todos_list = todos_data.get("todos", [])
                                if todos_list:
                                    # 创建摘要
                                    todo_names = [
                                        t.get("name", "") for t in todos_list[:10]
                                    ]  # 最多显示10个
                                    extract_todo_summary = (
                                        f"之前已通过extract_todo工具提取了{len(todos_list)}个待办事项，"
                                        f"包括：{', '.join(todo_names)}{'...' if len(todos_list) > 10 else ''}。"
                                        f"完整的待办数据结构：\n```json\n{json.dumps(todos_list, ensure_ascii=False, indent=2)}\n```"
                                    )
                                    logger.info(
                                        f"[Agent] 提取到extract_todo结果，包含{len(todos_list)}个待办"
                                    )
                    except Exception:
                        # 如果解析失败，至少保留原始内容的一部分
                        if "提取的待办数据结构" in content:
                            extract_todo_summary = content[:500]  # 保留前500字符
                            logger.warning("[Agent] extract_todo结果解析失败，使用原始内容片段")
                # 对于其他工具结果，跳过
                continue

            # 跳过工具调用消息
            if content.startswith("[工具调用:"):
                continue

            # 保留待办上下文、对话历史和用户查询
            decision_messages.append(msg)

        # 如果有extract_todo的摘要，添加到消息列表末尾
        if extract_todo_summary:
            decision_messages.append(
                {
                    "role": "user",
                    "content": f"[上下文信息] {extract_todo_summary}",
                }
            )
            logger.info("[Agent] 已将extract_todo结果添加到工具决策上下文")

        # 批量删除模式：添加明确的提示，避免重复选择已处理的ID
        if batch_delete_mode and remaining_ids:
            batch_delete_hint = (
                f"\n\n⚠️ **批量删除模式进行中** ⚠️\n"
                f"- 已处理的待办ID: {', '.join(map(str, processed_ids or []))}\n"
                f"- **必须删除的剩余待办ID**: {', '.join(map(str, remaining_ids))}\n"
                f"- **重要**：请仅从剩余ID列表中选择，不要选择已处理的ID。\n"
                f"- 如果使用 delete_todo 工具，todo_id 参数必须从剩余ID列表中选择。\n"
            )
            decision_messages.append(
                {
                    "role": "user",
                    "content": batch_delete_hint,
                }
            )

        return decision_messages

    def _call_llm_for_tool_selection(self, decision_messages: list[dict]) -> dict[str, Any] | None:
        """调用 LLM 进行工具选择并解析响应"""
        response = self.llm_client.client.chat.completions.create(
            model=self.llm_client.model,
            messages=decision_messages,
            temperature=0.1,  # 低温度确保稳定决策
            max_tokens=200,
        )

        decision_text = response.choices[0].message.content.strip()

        # 解析 JSON 响应
        try:
            # 清理可能的 markdown 代码块
            clean_text = decision_text.strip()
            if clean_text.startswith("```json"):
                clean_text = clean_text[7:]
            if clean_text.endswith("```"):
                clean_text = clean_text[:-3]
            clean_text = clean_text.strip()

            return json.loads(clean_text)
        except json.JSONDecodeError:
            logger.warning(
                f"[Agent] 工具选择响应解析失败: {decision_text}",
            )
            return None

    def _execute_tool(self, tool_name: str, tool_params: dict) -> ToolResult:
        """执行工具"""
        tool = self.tool_registry.get_tool(tool_name)
        if not tool:
            return ToolResult(
                success=False,
                content="",
                error=f"工具 {tool_name} 不存在",
            )

        try:
            return tool.execute(**tool_params)
        except Exception as e:
            logger.error(f"[Agent] 工具执行失败: {e}")
            return ToolResult(
                success=False,
                content="",
                error=str(e),
            )

    def _format_tool_result(self, tool_name: str, result: ToolResult) -> str:
        """格式化工具结果"""
        if not result.success:
            return f"工具 {tool_name} 执行失败: {result.error}"

        # 检查是否需要用户确认
        if result.metadata and result.metadata.get("requires_confirmation"):
            # 返回待确认信息的特殊格式（JSON格式，便于前端解析）
            confirmation_data = result.metadata.get("confirmation_data", {})

            # 区分单个todo确认和批量todo确认
            operation = confirmation_data.get("operation", "")
            if operation == "batch_create_todos":
                # 批量创建确认
                todos = confirmation_data.get("todos", [])
                confirmation_json = json.dumps(
                    {
                        "type": "batch_todo_confirmation",
                        "operation": "batch_create_todos",
                        "todos": todos,
                        "preview": result.content,
                    },
                    ensure_ascii=False,
                )
                return f"{result.content}\n\n<!-- TODO_CONFIRMATION: {confirmation_json} -->"
            elif operation == "organize_todos":
                # 整理待办确认
                todos = confirmation_data.get("todos", [])
                parent_title = confirmation_data.get("parent_title", "")
                todo_ids = confirmation_data.get("todo_ids", [])
                confirmation_json = json.dumps(
                    {
                        "type": "organize_todos_confirmation",
                        "operation": "organize_todos",
                        "todos": todos,
                        "parent_title": parent_title,
                        "todo_ids": todo_ids,
                        "preview": result.content,
                    },
                    ensure_ascii=False,
                )
                return f"{result.content}\n\n<!-- TODO_CONFIRMATION: {confirmation_json} -->"
            else:
                # 单个todo确认（create/update/delete）
                confirmation_json = json.dumps(
                    {
                        "type": "todo_confirmation",
                        "operation": operation,
                        "data": confirmation_data,
                        "preview": result.content,
                    },
                    ensure_ascii=False,
                )
                return f"{result.content}\n\n<!-- TODO_CONFIRMATION: {confirmation_json} -->"

        formatted = f"工具 {tool_name} 执行结果：\n{result.content}"

        # 如果是 extract_todo 工具，将结构化 todos 数据一并输出，方便后续批量创建使用
        if tool_name == "extract_todo" and result.metadata:
            todos = result.metadata.get("todos")
            if todos:
                try:
                    todos_json = json.dumps(todos, ensure_ascii=False, indent=2)
                    formatted += (
                        "\n\n提取到的待办数据结构（JSON，供后续批量创建使用）：\n"
                        "```json\n"
                        f"{todos_json}\n"
                        "```"
                    )
                except Exception:
                    # 如果序列化失败，直接忽略结构化部分，避免影响主流程
                    logger.exception("[Agent] 序列化 extract_todo 结果失败，忽略结构化部分")

        # 如果有来源信息，添加到末尾
        if result.metadata and "sources" in result.metadata:
            sources = result.metadata["sources"]
            formatted += "\n\nSources:"
            for idx, source in enumerate(sources, start=1):
                formatted += f"\n{idx}. {source['title']} ({source['url']})"

        return formatted

    def _evaluate_task_completion(
        self,
        user_query: str,
        messages: list[dict],
        tool_result: ToolResult,
    ) -> bool:
        """
        评估任务是否完成

        Returns:
            True: 需要继续使用工具
            False: 可以生成最终回答
        """
        # 如果工具执行失败，继续尝试
        if not tool_result.success:
            return True

        # 特殊处理：检测批量删除场景
        # 如果待办上下文中包含多个待办，用户要求删除"这些"待办，且刚执行了delete_todo，需要检查是否还有其他待办待删除
        if "删除" in user_query or "删除" in user_query.lower():
            # 检查是否有待办上下文，且包含多个待办
            todo_context_found = False
            todo_ids_in_context = []

            for msg in messages:
                content = msg.get("content", "")
                if "用户当前的待办事项上下文" in content:
                    todo_context_found = True
                    # 提取所有ID
                    import re

                    id_matches = re.findall(r"ID:\s*(\d+)", content)
                    todo_ids_in_context = [int(id_str) for id_str in id_matches]
                    break

            # 如果上下文中包含多个待办ID，且用户说"删除这些"
            if (
                todo_context_found
                and len(todo_ids_in_context) > 1
                and any(word in user_query for word in ["这些", "它们", "这些待办"])
            ):
                # 检查已经删除的待办（通过检查消息历史中的工具调用）
                for msg in messages:
                    content = msg.get("content", "")
                    if content.startswith("[工具调用: delete_todo]"):
                        # 从后续的工具结果中提取已删除的ID
                        # 注意：这里我们需要从工具结果中提取，但由于是确认流程，可能还没有实际删除
                        # 更好的方法是检查是否有待删除的待办还没被调用delete_todo
                        pass

                # 检查是否所有待办都已调用delete_todo（通过检查消息历史）
                delete_todo_calls = []
                for i, msg in enumerate(messages):
                    content = msg.get("content", "")
                    if content.startswith("[工具调用: delete_todo]"):
                        # 尝试从下一个消息（工具结果）中提取todo_id
                        if i + 1 < len(messages):
                            next_content = messages[i + 1].get("content", "")
                            id_match = re.search(r"todo_id[:\s]+(\d+)", next_content)
                            if id_match:
                                delete_todo_calls.append(int(id_match.group(1)))

                # 如果还有待办没有被调用delete_todo，继续循环
                if len(delete_todo_calls) < len(todo_ids_in_context):
                    logger.info(
                        f"[Agent] 批量删除中，已删除 {len(delete_todo_calls)}/{len(todo_ids_in_context)} 个待办，继续循环"
                    )
                    return True

        # 特殊处理：批量删除场景检测
        # 检查是否有待办上下文，且用户要求删除"这些"待办
        if "删除" in user_query and any(
            word in user_query for word in ["这些", "它们", "这些待办"]
        ):
            todo_ids_in_context = []
            for msg in messages:
                content = msg.get("content", "")
                if "用户当前的待办事项上下文" in content:
                    import re

                    id_matches = re.findall(r"ID:\s*(\d+)", content)
                    todo_ids_in_context = [int(id_str) for id_str in id_matches]
                    break

            if len(todo_ids_in_context) > 1:
                # 统计已经调用delete_todo的次数
                delete_todo_count = sum(
                    1
                    for msg in messages
                    if msg.get("content", "").startswith("[工具调用: delete_todo]")
                )

                # 如果还有待办没有调用delete_todo，继续循环
                if delete_todo_count < len(todo_ids_in_context):
                    logger.info(
                        f"[Agent] 批量删除检测：上下文中{len(todo_ids_in_context)}个待办，"
                        f"已调用{delete_todo_count}次delete_todo，继续循环"
                    )
                    return True

        # 使用 LLM 评估
        evaluation_prompt = get_prompt(
            "agent",
            "task_evaluation",
            user_query=user_query,
            tool_result=tool_result.content[:500],  # 限制长度
        )

        if not evaluation_prompt:
            evaluation_prompt = self._get_default_evaluation_prompt()

        try:
            # 在评估消息中包含更多上下文，特别是待办上下文信息
            context_info = ""
            for msg in messages:
                content = msg.get("content", "")
                if "用户当前的待办事项上下文" in content:
                    context_info = f"\n\n待办上下文摘要: {content[:200]}"
                    break

            eval_messages = [
                {"role": "system", "content": evaluation_prompt},
                {
                    "role": "user",
                    "content": (
                        f"用户查询: {user_query}\n\n"
                        f"工具结果: {tool_result.content[:500]}{context_info}"
                    ),
                },
            ]

            response = self.llm_client.client.chat.completions.create(
                model=self.llm_client.model,
                messages=eval_messages,
                temperature=0.1,
                max_tokens=100,
            )

            eval_text = response.choices[0].message.content.strip().lower()

            # 简单判断：如果包含"完成"、"足够"等关键词，认为可以生成回答
            completion_keywords = ["完成", "足够", "可以", "complete", "sufficient"]
            if any(keyword in eval_text for keyword in completion_keywords):
                return False
            return True
        except Exception as e:
            logger.error(f"[Agent] 任务评估失败: {e}")
            # 默认继续
            return True

    def _generate_final_response(
        self,
        user_query: str,
        messages: list[dict],
        accumulated_context: list[str],
    ) -> Generator[str]:
        """生成最终回答"""
        # 构建包含所有工具结果的最终消息
        final_messages = messages.copy()

        # 检查是否使用了 web_search 工具（通过检查消息历史）
        used_web_search = any(
            msg.get("content", "").startswith("[工具调用: web_search]") for msg in messages
        )

        if accumulated_context:
            # 如果有工具结果，构建强调工具结果的用户消息
            context_text = "\n\n".join(accumulated_context)
            logger.info(
                f"[Agent] 生成最终回答，工具结果长度: {len(context_text)} 字符",
            )

            # 构建用户消息
            base_instruction = (
                f"用户问题：{user_query}\n\n"
                f"工具执行结果：\n{context_text}\n\n"
                "请严格基于上述工具执行结果回答用户的问题。"
                "如果工具结果中包含相关信息，必须使用这些信息。"
                "不要使用过时的知识或猜测，只基于工具提供的搜索结果。"
                "当工具结果与你的训练数据冲突时，以工具结果为准（工具结果代表最新的实时信息）。"
            )

            # 如果使用了 web_search，添加 Sources 格式要求
            if used_web_search:
                base_instruction += (
                    "\n\n**重要格式要求（必须严格遵守）：**"
                    "\n1. 在回答中引用信息时，必须使用引用标记格式：[[1]]、[[2]] 等，数字对应搜索结果编号"
                    '\n2. 在回答的末尾，必须添加一个 "Sources:" 段落，列出所有引用的来源'
                    "\n3. Sources 段落的格式必须严格按照以下格式（与工具执行结果中的格式一致）："
                    "\n   Sources:"
                    "\n   1. 标题 (URL)"
                    "\n   2. 标题 (URL)"
                    "\n   ..."
                    "\n4. 工具执行结果中已经包含了 Sources 列表，请直接使用这些来源信息，不要修改格式"
                    '\n5. 确保 Sources 段落与回答正文之间有两个空行（即 "\\n\\nSources:"）'
                )

            final_messages.append(
                {
                    "role": "user",
                    "content": base_instruction,
                }
            )
        else:
            # 没有工具结果，直接基于原始查询回答
            # 重要：明确告诉 LLM 不要假装使用工具
            final_messages.append(
                {
                    "role": "user",
                    "content": (
                        f"{user_query}\n\n"
                        "**重要提示：**\n"
                        "本次回答没有使用任何工具。请直接基于你的知识回答，"
                        "不要提及'正在搜索'、'使用工具'、'工具执行'、'web_search'等词汇，"
                        "不要生成工具调用的描述，不要假装使用了工具。"
                        "如果问题需要最新信息但你无法提供，请诚实说明。"
                    ),
                }
            )

        # 流式生成回答
        try:
            yield from self.llm_client.stream_chat(
                messages=final_messages,
                temperature=0.7,
            )
        except Exception as e:
            logger.error(f"[Agent] 生成最终回答失败: {e}")
            yield f"生成回答时出现错误: {str(e)}"

    def _get_default_system_prompt(self) -> str:
        """默认系统提示词"""
        return """你是一个智能助手，可以使用工具来帮助用户完成任务。
你可以使用以下工具：
- web_search: 联网搜索最新信息

当用户需要实时信息、最新资讯时，你应该使用 web_search 工具。
使用工具后，基于工具返回的结果生成准确、有用的回答。"""

    def _get_default_tool_selection_prompt(
        self,
        tools_schema: list[dict],
    ) -> str:
        """默认工具选择提示词"""
        tools_desc = "\n".join(
            [f"- {tool['name']}: {tool['description']}" for tool in tools_schema]
        )
        return f"""分析用户查询，判断是否需要使用工具。

可用工具：
{tools_desc}

请以 JSON 格式返回：
{{
    "use_tool": true/false,
    "tool_name": "工具名称" 或 null,
    "tool_params": {{"参数名": "参数值"}} 或 {{}}
}}

只返回 JSON，不要返回其他信息。"""

    def _get_default_evaluation_prompt(self) -> str:
        """默认任务评估提示词"""
        return """评估工具执行结果是否足够回答用户的问题。

如果工具结果已经包含足够信息来回答用户问题，返回"完成"。
如果需要更多信息，返回"继续"。

只返回"完成"或"继续"。"""
