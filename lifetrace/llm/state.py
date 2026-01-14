"""Agent 状态与决策模型"""

from typing import Any

from pydantic import BaseModel, Field


class PlanStep(BaseModel):
    """计划步骤模型"""

    id: int
    instruction: str = Field(..., description="该步骤的目标说明")
    suggested_tool: str = Field(..., description="规划器认为相关的工具")
    status: str = "pending"  # pending, completed, failed
    result_summary: str | None = None


class QuestionData(BaseModel):
    """结构化问题数据模型"""

    question_text: str
    question_id: str = Field(..., description="问题的唯一ID")
    step_id: int = Field(..., description="哪个步骤在提问")
    suggested_answers: list[str] = Field(
        default_factory=list,
        description="预定义的答案选项",
    )
    allow_custom: bool = Field(default=True, description="允许用户输入自定义答案")
    context: str | None = Field(default=None, description="问题的额外上下文说明")


class AgentState(BaseModel):
    """Agent 执行状态模型（长任务用）"""

    user_query: str
    plan: list[PlanStep] = []
    current_step_index: int = 0
    scratchpad: list[dict[str, Any]] = []  # 存储执行历史: {step_id, tool, content}

    # 向后兼容支持
    messages: list[dict] = []

    # 问题预算跟踪
    question_budget: int = Field(default=1, description="每个计划最多的问题数")
    questions_asked: int = Field(default=0, description="已问的问题数")
    pending_question: dict[str, Any] | None = Field(
        default=None,
        description="暂停时存储的问题数据",
    )


class ShortTaskDecision(BaseModel):
    """短任务决策结果（来自单次 LLM 调用的结构化输出）"""

    decision_type: str = Field(
        ...,
        description='"tool" 或 "answer_only"',
    )
    tool_name: str | None = Field(
        default=None,
        description='当 decision_type="tool" 时需要的工具名称',
    )
    tool_args: dict[str, Any] = Field(
        default_factory=dict,
        description="传递给工具的参数（当 decision_type=tool 时必须完整）",
    )
    llm_direct_response: str | None = Field(
        default=None,
        description='当 decision_type="answer_only" 时由 LLM 直接生成的回答文本',
    )


ALLOWED_SHORT_TASK_TOOLS: set[str] = {
    "create_todo",
    "update_todo",
    "delete_todo",
    "query_todo",
    "organize_todos",
    "extract_todo",
    "web_search",
}


def _validate_create_todo_args(args: dict[str, Any]) -> None:
    """验证 create_todo 工具参数"""
    if "name" not in args or not isinstance(args["name"], str) or not args["name"].strip():
        raise ValueError("create_todo requires non-empty 'name'")


def _validate_update_todo_args(args: dict[str, Any]) -> None:
    """验证 update_todo 工具参数"""
    if "todo_id" not in args:
        raise ValueError("update_todo requires 'todo_id'")


def _validate_delete_todo_args(args: dict[str, Any]) -> None:
    """验证 delete_todo 工具参数"""
    if "todo_id" not in args:
        raise ValueError("delete_todo requires 'todo_id'")


def _validate_organize_todos_args(args: dict[str, Any]) -> None:
    """验证 organize_todos 工具参数"""
    todo_ids = args.get("todo_ids")
    if not isinstance(todo_ids, list) or not todo_ids:
        raise ValueError("organize_todos requires non-empty 'todo_ids' list")


def _validate_extract_todo_args(args: dict[str, Any]) -> None:
    """验证 extract_todo 工具参数"""
    if "text" not in args or not isinstance(args["text"], str) or not args["text"].strip():
        raise ValueError("extract_todo requires non-empty 'text'")


def _validate_web_search_args(args: dict[str, Any]) -> None:
    """验证 web_search 工具参数"""
    if "query" not in args:
        raise ValueError("web_search requires 'query'")


def _validate_tool_args(name: str, args: dict[str, Any]) -> None:
    """验证工具参数"""
    validators = {
        "create_todo": _validate_create_todo_args,
        "update_todo": _validate_update_todo_args,
        "delete_todo": _validate_delete_todo_args,
        "query_todo": lambda _: None,  # query_todo 不强制更多字段
        "organize_todos": _validate_organize_todos_args,
        "extract_todo": _validate_extract_todo_args,
        "web_search": _validate_web_search_args,
    }
    validator = validators.get(name)
    if validator:
        validator(args)


def _validate_tool_decision(decision: ShortTaskDecision) -> None:
    """验证工具决策"""
    if not decision.tool_name or decision.tool_name not in ALLOWED_SHORT_TASK_TOOLS:
        raise ValueError(f"unsupported or missing tool_name: {decision.tool_name}")
    if not isinstance(decision.tool_args, dict):
        raise ValueError("tool_args must be a dict for tool decisions")

    _validate_tool_args(decision.tool_name, decision.tool_args)


def _validate_answer_only_decision(decision: ShortTaskDecision) -> None:
    """验证仅回答决策"""
    if not decision.llm_direct_response or not isinstance(
        decision.llm_direct_response,
        str,
    ):
        raise ValueError("answer_only requires non-empty llm_direct_response")


def validate_short_task_decision(raw: dict[str, Any]) -> ShortTaskDecision:
    """对短任务决策结果进行硬性 schema 校验。

    约束：
    - decision_type 必须在 {"tool", "answer_only"}
    - decision_type == "tool" 时：
        - tool_name 必须在 ALLOWED_SHORT_TASK_TOOLS 中
        - tool_args 必须包含各工具的必填字段
    - decision_type == "answer_only" 时：
        - llm_direct_response 必须为非空字符串
    """
    decision = ShortTaskDecision.model_validate(raw)

    if decision.decision_type not in {"tool", "answer_only"}:
        raise ValueError(f"invalid decision_type: {decision.decision_type}")

    if decision.decision_type == "tool":
        _validate_tool_decision(decision)
    elif decision.decision_type == "answer_only":
        _validate_answer_only_decision(decision)

    return decision
