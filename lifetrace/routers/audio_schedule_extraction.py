"""从音频转录文本中提取日程信息并自动保存到Schedule"""

import json
from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from lifetrace.llm.llm_client import LLMClient
from lifetrace.util.logging_config import get_logger
from lifetrace.util.prompt_loader import get_prompt

logger = get_logger()

router = APIRouter(prefix="/api/audio", tags=["audio-schedule-extraction"])


class AudioScheduleExtractionRequest(BaseModel):
    """从音频文本提取日程的请求"""
    
    text: str = Field(..., description="转录文本")
    reference_time: datetime = Field(default_factory=datetime.now, description="参考时间（用于解析相对时间）")
    source_segment_id: str | None = Field(None, description="来源片段ID")


class ExtractedScheduleItem(BaseModel):
    """提取的日程项"""
    
    schedule_time: datetime = Field(..., description="日程时间")
    description: str = Field(..., description="日程描述")
    source_text: str = Field(..., description="来源文本片段")
    text_start_index: int | None = Field(None, description="文本开始位置")
    text_end_index: int | None = Field(None, description="文本结束位置")


class AudioScheduleExtractionResponse(BaseModel):
    """提取日程的响应"""
    
    schedules: list[ExtractedScheduleItem] = Field(default_factory=list, description="提取的日程列表")
    saved_count: int = Field(0, description="已保存的日程数量（已废弃，不再自动保存）")


@router.post("/extract-schedules", response_model=AudioScheduleExtractionResponse)
async def extract_schedules_from_audio(
    request: AudioScheduleExtractionRequest,
):
    """
    从音频转录文本中提取日程信息（使用LLM智能提取，不自动保存）
    
    返回提取结果，由前端显示确认面板，用户选择后再保存
    """
    try:
        text = request.text.strip()
        if not text:
            return AudioScheduleExtractionResponse(schedules=[], saved_count=0)
        
        # 使用LLM智能提取
        schedules = await _extract_schedules_with_llm(text, request.reference_time)
        
        return AudioScheduleExtractionResponse(
            schedules=schedules,
            saved_count=0,  # 不再自动保存
        )
        
    except Exception as e:
        logger.error(f"从音频文本提取日程失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"提取日程失败: {str(e)}") from e


async def _extract_schedules_with_llm(text: str, reference_time: datetime) -> list[ExtractedScheduleItem]:
    """使用LLM智能提取日程信息"""
    llm_client = LLMClient()
    
    if not llm_client.is_available():
        logger.warning("LLM客户端不可用，使用规则解析")
        return _parse_schedule_markers(text, reference_time)
    
    try:
        # 加载提示词
        system_prompt = get_prompt("audio_schedule_extraction", "system_assistant")
        user_prompt = get_prompt(
            "audio_schedule_extraction",
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
            schedules_data = result.get("schedules", [])
            
            # 转换为ExtractedScheduleItem
            schedules = []
            for item in schedules_data:
                try:
                    schedule_time = datetime.fromisoformat(item["schedule_time"].replace("Z", "+00:00"))
                    schedules.append(ExtractedScheduleItem(
                        schedule_time=schedule_time,
                        description=item.get("description", ""),
                        source_text=item.get("source_text", ""),
                        text_start_index=item.get("text_start_index"),
                        text_end_index=item.get("text_end_index"),
                    ))
                except Exception as e:
                    logger.warning(f"解析日程项失败: {item}, 错误: {e}")
                    continue
            
            logger.info(f"✅ LLM提取到 {len(schedules)} 个日程")
            return schedules
            
        except json.JSONDecodeError as e:
            logger.warning(f"LLM返回的不是有效JSON: {response_text}, 错误: {e}")
            return _parse_schedule_markers(text, reference_time)
            
    except Exception as e:
        logger.error(f"LLM提取日程失败: {e}", exc_info=True)
        return _parse_schedule_markers(text, reference_time)


def _parse_schedule_markers(text: str, reference_time: datetime) -> list[ExtractedScheduleItem]:
    """解析文本中的 [SCHEDULE: ...] 标记和时间信息"""
    import re
    
    schedules = []
    
    # 方法1: 匹配 [SCHEDULE: ...] 格式
    schedule_regex = r'\[SCHEDULE:\s*([^\]]+)\]'
    for match in re.finditer(schedule_regex, text):
        schedule_text = match.group(1).strip()
        schedule_time = _parse_schedule_time(schedule_text, reference_time)
        
        if schedule_time:
            schedules.append(ExtractedScheduleItem(
                schedule_time=schedule_time,
                description=schedule_text,
                source_text=text[max(0, match.start() - 50):min(len(text), match.end() + 50)],
            ))
    
    # 方法2: 如果没有找到标记，尝试从文本中直接提取时间信息
    if not schedules:
        time_patterns = [
            r'(今天|明天|后天)\s*(\d{1,2}):?(\d{2})?点?',
            r'(早上|上午|中午|下午|晚上)\s*(\d{1,2}):?(\d{2})?点?',
            r'(\d{1,2}):(\d{2})',
            r'(\d{1,2})点',
        ]
        
        for pattern in time_patterns:
            for match in re.finditer(pattern, text):
                match_text = match.group(0)
                schedule_time = _parse_schedule_time(match_text, reference_time)
                
                if schedule_time:
                    # 提取上下文作为描述
                    start_idx = max(0, match.start() - 20)
                    end_idx = min(len(text), match.end() + 20)
                    context = text[start_idx:end_idx].strip()
                    
                    # 避免重复（检查schedule_time不为None）
                    if schedule_time and not any(
                        s.schedule_time and abs((s.schedule_time - schedule_time).total_seconds()) < 60 
                        for s in schedules
                    ):
                        schedules.append(ExtractedScheduleItem(
                            schedule_time=schedule_time,
                            description=context,
                            source_text=context,
                        ))
    
    return schedules


def _parse_schedule_time(text: str, base_time: datetime) -> datetime | None:
    """解析日程时间"""
    import re
    
    now = datetime.now()
    today = datetime(now.year, now.month, now.day)
    
    # 解析相对时间
    time_patterns = [
        # 今天
        (r'今天\s*(\d{1,2}):(\d{2})', 0),
        (r'今天\s*(\d{1,2})点', 0),
        # 明天
        (r'明天\s*(\d{1,2}):(\d{2})', 1),
        (r'明天\s*(\d{1,2})点', 1),
        # 后天
        (r'后天\s*(\d{1,2}):(\d{2})', 2),
        (r'后天\s*(\d{1,2})点', 2),
        # 早上/上午/中午/下午/晚上
        (r'早上\s*(\d{1,2}):?(\d{2})?点?', 0, 0),
        (r'上午\s*(\d{1,2}):?(\d{2})?点?', 0, 0),
        (r'中午\s*(\d{1,2}):?(\d{2})?点?', 0, 12),
        (r'下午\s*(\d{1,2}):?(\d{2})?点?', 0, 12),
        (r'晚上\s*(\d{1,2}):?(\d{2})?点?', 0, 12),
        # 纯时间格式
        (r'^(\d{1,2}):(\d{2})$', 0, None, True),
        (r'^(\d{1,2})点$', 0, None, True),
    ]
    
    for pattern_config in time_patterns:
        pattern = pattern_config[0]
        offset = pattern_config[1] if len(pattern_config) > 1 else 0
        hour_offset = pattern_config[2] if len(pattern_config) > 2 else 0
        is_time_only = pattern_config[3] if len(pattern_config) > 3 else False
        
        match = re.match(pattern, text)
        if match:
            try:
                hour = int(match.group(1))
                minute = int(match.group(2)) if len(match.groups()) > 1 and match.group(2) and match.group(2).strip() else 0
            except (ValueError, IndexError) as e:
                logger.warning(f"解析时间失败: {text}, 错误: {e}")
                continue
            
            # 处理"下午"、"晚上"等时间
            if hour_offset > 0 and hour < 12:
                hour += hour_offset
            
            target_date = datetime(today.year, today.month, today.day + offset, hour, minute, 0)
            
            # 如果是纯时间格式且时间已过，则认为是明天
            if is_time_only and target_date < now:
                target_date = datetime(today.year, today.month, today.day + 1, hour, minute, 0)
            
            return target_date
    
    return None



