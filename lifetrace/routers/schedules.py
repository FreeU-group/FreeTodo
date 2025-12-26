"""日程管理路由"""

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from lifetrace.util.logging_config import get_logger

logger = get_logger()

router = APIRouter(prefix="/api/schedules", tags=["schedules"])


class ScheduleItemInDB(BaseModel):
    """日程项（数据库模型）"""
    id: str
    sourceSegmentId: str
    scheduleTime: str  # ISO 格式时间字符串
    description: str
    status: str  # 'pending' | 'confirmed' | 'cancelled'
    extractedAt: str  # ISO 格式时间字符串


class BatchSaveRequest(BaseModel):
    """批量保存请求"""
    schedules: List[ScheduleItemInDB]


class BatchSaveResponse(BaseModel):
    """批量保存响应"""
    saved: int
    message: str


# 模拟数据库存储
_schedules_db: List[ScheduleItemInDB] = []


@router.post("", response_model=BatchSaveResponse)
async def save_schedules(request: BatchSaveRequest):
    """
    批量保存日程
    
    注意：当前版本仅记录日志，不持久化到数据库
    后续可以集成到数据库或文件系统
    """
    try:
        saved_count = 0
        
        for schedule in request.schedules:
            try:
                # 解析时间戳
                schedule_time = datetime.fromisoformat(schedule.scheduleTime.replace('Z', '+00:00'))
                extracted_at = datetime.fromisoformat(schedule.extractedAt.replace('Z', '+00:00'))
                
                # 检查是否已存在，如果存在则更新，否则添加
                existing_index = next(
                    (i for i, item in enumerate(_schedules_db) if item.id == schedule.id),
                    None
                )
                
                if existing_index is not None:
                    _schedules_db[existing_index] = schedule
                    logger.debug(f"更新日程: {schedule.id}")
                else:
                    _schedules_db.append(schedule)
                    logger.debug(f"保存新日程: {schedule.id}")
                
                # 记录日志（后续可以改为保存到数据库）
                logger.info(
                    f"保存日程: id={schedule.id}, "
                    f"scheduleTime={schedule_time}, "
                    f"description={schedule.description[:50]}..., "
                    f"status={schedule.status}"
                )
                
                # TODO: 保存到数据库
                # 例如：
                # db.save_schedule(
                #     id=schedule.id,
                #     source_segment_id=schedule.sourceSegmentId,
                #     schedule_time=schedule_time,
                #     description=schedule.description,
                #     status=schedule.status,
                #     extracted_at=extracted_at,
                # )
                
                saved_count += 1
            except Exception as e:
                logger.error(f"保存日程失败: id={schedule.id}, error={e}")
        
        return BatchSaveResponse(
            saved=saved_count,
            message=f"成功保存 {saved_count}/{len(request.schedules)} 条日程"
        )
    except Exception as e:
        logger.error(f"批量保存日程失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"保存失败: {str(e)}")


@router.get("")
async def query_schedules(
    startTime: Optional[str] = Query(None, description="开始时间（ISO 格式）"),
    endTime: Optional[str] = Query(None, description="结束时间（ISO 格式）"),
):
    """
    查询历史日程
    """
    try:
        # 暂时从内存中查询，后续可以改为数据库查询
        filtered_schedules = []
        
        for schedule in _schedules_db:
            try:
                schedule_time = datetime.fromisoformat(schedule.scheduleTime.replace('Z', '+00:00'))
                
                # 如果提供了时间范围，进行过滤
                if startTime and endTime:
                    start = datetime.fromisoformat(startTime.replace('Z', '+00:00'))
                    end = datetime.fromisoformat(endTime.replace('Z', '+00:00'))
                    
                    if start <= schedule_time <= end:
                        filtered_schedules.append(schedule.model_dump())
                elif startTime:
                    start = datetime.fromisoformat(startTime.replace('Z', '+00:00'))
                    if schedule_time >= start:
                        filtered_schedules.append(schedule.model_dump())
                elif endTime:
                    end = datetime.fromisoformat(endTime.replace('Z', '+00:00'))
                    if schedule_time <= end:
                        filtered_schedules.append(schedule.model_dump())
                else:
                    # 没有时间范围，返回所有日程
                    filtered_schedules.append(schedule.model_dump())
            except Exception as e:
                logger.warning(f"解析日程项失败: {schedule}, 错误: {e}")
                continue
        
        # 按时间排序
        filtered_schedules.sort(
            key=lambda s: datetime.fromisoformat(s.get("scheduleTime", "").replace('Z', '+00:00'))
        )
        
        logger.info(f"查询日程: startTime={startTime}, endTime={endTime}, 结果数={len(filtered_schedules)}")
        
        return {"schedules": filtered_schedules}
    except Exception as e:
        logger.error(f"查询日程失败: {e}", exc_info=True)
        # 返回空列表而不是抛出错误，避免前端崩溃
        return {"schedules": []}

