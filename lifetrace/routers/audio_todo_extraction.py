"""从音频转录文本中提取待办事项并自动创建Todo"""

import json
from datetime import datetime

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from lifetrace.core.dependencies import get_todo_service
from lifetrace.llm.llm_client import LLMClient
from lifetrace.schemas.todo import TodoCreate
from lifetrace.services.todo_service import TodoService
from lifetrace.util.logging_config import get_logger
from lifetrace.util.prompt_loader import get_prompt
from lifetrace.util.time_parser import calculate_scheduled_time

logger = get_logger()

router = APIRouter(prefix="/api/audio", tags=["audio-todo-extraction"])


class AudioTodoExtractionRequest(BaseModel):
    """从音频文本提取待办的请求"""
    
    text: str = Field(..., description="转录文本")
    reference_time: datetime = Field(default_factory=datetime.now, description="参考时间（用于解析相对时间）")
    source_segment_id: str | None = Field(None, description="来源片段ID")


class ExtractedTodoItem(BaseModel):
    """提取的待办项"""
    
    title: str = Field(..., description="待办标题")
    description: str | None = Field(None, description="待办描述")
    deadline: datetime | None = Field(None, description="截止时间")
    priority: str = Field(default="medium", description="优先级：high/medium/low")
    source_text: str = Field(..., description="来源文本片段")
    text_start_index: int | None = Field(None, description="文本开始位置")
    text_end_index: int | None = Field(None, description="文本结束位置")


class AudioTodoExtractionResponse(BaseModel):
    """提取待办的响应"""
    
    todos: list[ExtractedTodoItem] = Field(default_factory=list, description="提取的待办列表")
    created_todos: list[int] = Field(default_factory=list, description="已创建的Todo ID列表")


@router.post("/extract-todos", response_model=AudioTodoExtractionResponse)
async def extract_todos_from_audio(
    request: AudioTodoExtractionRequest,
    todo_service: TodoService = Depends(get_todo_service),
):
    """
    从音频转录文本中提取待办事项（使用LLM智能提取，不自动创建）
    
    返回提取结果，由前端显示确认面板，用户选择后再创建
    """
    try:
        text = request.text.strip()
        if not text:
            return AudioTodoExtractionResponse(todos=[], created_todos=[])
        
        # 使用LLM智能提取
        todos = await _extract_todos_with_llm(text, request.reference_time)
        
        return AudioTodoExtractionResponse(
            todos=todos,
            created_todos=[],  # 不再自动创建
        )
        
    except Exception as e:
        logger.error(f"从音频文本提取待办失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"提取待办失败: {str(e)}") from e


async def _extract_todos_with_llm(text: str, reference_time: datetime) -> list[ExtractedTodoItem]:
    """使用LLM智能提取待办事项"""
    llm_client = LLMClient()
    
    if not llm_client.is_available():
        logger.warning("LLM客户端不可用，使用规则解析")
        return _parse_todo_markers(text, reference_time)
    
    try:
        # 加载提示词
        system_prompt = get_prompt("audio_todo_extraction", "system_assistant")
        user_prompt = get_prompt(
            "audio_todo_extraction",
            "user_prompt",
            text=text,
            reference_time=reference_time.strftime("%Y-%m-%d %H:%M:%S"),
        )
        
        # 调用LLM
        response = llm_client.client.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            model=llm_client.model,
            temperature=0.3,
            max_tokens=2000,
        )
        
        response_text = response.choices[0].message.content.strip()
        
        # 解析JSON响应
        try:
            # 清理可能的markdown代码块标记
            if response_text.startswith("```json"):
                response_text = response_text[7:]
            if response_text.startswith("```"):
                response_text = response_text[3:]
            if response_text.endswith("```"):
                response_text = response_text[:-3]
            response_text = response_text.strip()
            
            result = json.loads(response_text)
            todos_data = result.get("todos", [])
            
            # 转换为ExtractedTodoItem
            todos = []
            for item in todos_data:
                try:
                    deadline = None
                    if item.get("deadline"):
                        deadline = datetime.fromisoformat(item["deadline"].replace("Z", "+00:00"))
                    
                    todos.append(ExtractedTodoItem(
                        title=item.get("title", ""),
                        description=item.get("description"),
                        deadline=deadline,
                        priority=item.get("priority", "medium"),
                        source_text=item.get("source_text", ""),
                        text_start_index=item.get("text_start_index"),
                        text_end_index=item.get("text_end_index"),
                    ))
                except Exception as e:
                    logger.warning(f"解析待办项失败: {item}, 错误: {e}")
                    continue
            
            logger.info(f"✅ LLM提取到 {len(todos)} 个待办")
            return todos
            
        except json.JSONDecodeError as e:
            logger.warning(f"LLM返回的不是有效JSON: {response_text}, 错误: {e}")
            return _parse_todo_markers(text, reference_time)
            
    except Exception as e:
        logger.error(f"LLM提取待办失败: {e}", exc_info=True)
        return _parse_todo_markers(text, reference_time)


def _parse_todo_markers(text: str, reference_time: datetime) -> list[ExtractedTodoItem]:
    """解析文本中的 [TODO: ...] 标记"""
    import re
    
    todos = []
    # 匹配 [TODO: 任务名称 | deadline: 时间 | priority: 优先级] 格式
    todo_regex = r'\[TODO:\s*([^|]+)(?:\s*\|\s*deadline:\s*([^|]+))?(?:\s*\|\s*priority:\s*(\w+))?\]'
    
    for match in re.finditer(todo_regex, text):
        title = match.group(1).strip()
        deadline_text = match.group(2) if match.group(2) else None
        priority_text = (match.group(3) or "medium").strip().lower()
        
        # 解析截止时间
        deadline = None
        if deadline_text:
            deadline = _parse_deadline(deadline_text.strip(), reference_time)
        
        # 解析优先级
        priority = "medium"
        if priority_text in ["high", "low"]:
            priority = priority_text
        
        # 提取上下文作为描述
        start_idx = max(0, match.start() - 50)
        end_idx = min(len(text), match.end() + 50)
        source_text = text[start_idx:end_idx].strip()
        
        todos.append(ExtractedTodoItem(
            title=title,
            description=source_text,
            deadline=deadline,
            priority=priority,
            source_text=source_text,
        ))
    
    return todos


def _parse_deadline(deadline_text: str, reference_time: datetime) -> datetime | None:
    """解析截止时间文本"""
    import re
    
    try:
        from lifetrace.schemas.todo_extraction import TodoTimeInfo
        
        # 构建时间信息
        time_info_dict = {
            "time_type": "relative",
            "raw_text": deadline_text,
        }
        
        # 解析相对时间
        lower_text = deadline_text.lower()
        if "今天" in lower_text:
            time_info_dict["relative_days"] = 0
        elif "明天" in lower_text:
            time_info_dict["relative_days"] = 1
        elif "后天" in lower_text:
            time_info_dict["relative_days"] = 2
        else:
            # 尝试提取时间点
            time_match = re.search(r'(\d{1,2}):?(\d{2})?', deadline_text)
            if time_match:
                hour = int(time_match.group(1))
                minute = int(time_match.group(2)) if time_match.group(2) else 0
                time_info_dict["relative_time"] = f"{hour:02d}:{minute:02d}"
                time_info_dict["relative_days"] = 0
        
        time_info = TodoTimeInfo(**time_info_dict)
        scheduled_time = calculate_scheduled_time(time_info.model_dump(), reference_time)
        return scheduled_time
        
    except Exception as e:
        logger.warning(f"解析截止时间失败: {deadline_text}, 错误: {e}")
        return None

