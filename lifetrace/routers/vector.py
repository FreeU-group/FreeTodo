"""向量数据库相关路由"""

from fastapi import APIRouter, HTTPException, Query

from lifetrace.core.dependencies import get_vector_service
from lifetrace.schemas.event import EventResponse
from lifetrace.schemas.vector import (
    SemanticSearchRequest,
    SemanticSearchResult,
    VectorStatsResponse,
)
from lifetrace.storage import event_mgr
from lifetrace.util.logging_config import get_logger

logger = get_logger()

router = APIRouter(prefix="/api", tags=["vector"])


@router.post("/semantic-search", response_model=list[SemanticSearchResult])
async def semantic_search(request: SemanticSearchRequest):
    """语义搜索 OCR 结果"""
    try:
        vector_service = get_vector_service()
        if not vector_service.is_enabled():
            raise HTTPException(status_code=503, detail="向量数据库服务不可用")

        results = vector_service.semantic_search(
            query=request.query,
            top_k=request.top_k,
            use_rerank=request.use_rerank,
            retrieve_k=request.retrieve_k,
            filters=request.filters,
        )

        # 转换为响应格式
        search_results = []
        for result in results:
            search_result = SemanticSearchResult(
                text=result.get("text", ""),
                score=result.get("score", 0.0),
                metadata=result.get("metadata", {}),
                ocr_result=result.get("ocr_result"),
                screenshot=result.get("screenshot"),
            )
            search_results.append(search_result)

        return search_results

    except Exception as e:
        logger.error(f"语义搜索失败: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/event-semantic-search", response_model=list[EventResponse])
async def event_semantic_search(request: SemanticSearchRequest):
    """事件级语义搜索（基于事件聚合文本）"""
    try:
        vector_service = get_vector_service()
        if not vector_service.is_enabled():
            raise HTTPException(status_code=503, detail="向量数据库服务不可用")
        raw_results = vector_service.semantic_search_events(
            query=request.query, top_k=request.top_k
        )

        # semantic_search_events 现在直接返回格式化的事件数据
        events_resp: list[EventResponse] = []
        for event_data in raw_results:
            # 检查是否已经是完整的事件数据格式
            if "id" in event_data and "app_name" in event_data:
                # 直接使用返回的事件数据
                events_resp.append(EventResponse(**event_data))
            else:
                # 向后兼容：如果是旧格式，使用原来的逻辑
                metadata = event_data.get("metadata", {})
                event_id = metadata.get("event_id")
                if not event_id:
                    continue
                matched = event_mgr.get_event_summary(int(event_id))
                if matched:
                    events_resp.append(EventResponse(**matched))

        return events_resp
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"事件语义搜索失败: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/vector-stats", response_model=VectorStatsResponse)
async def get_vector_stats():
    """获取向量数据库统计信息"""
    try:
        stats = get_vector_service().get_stats()
        return VectorStatsResponse(**stats)

    except Exception as e:
        logger.error(f"获取向量数据库统计信息失败: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/vector-sync")
async def sync_vector_database(
    limit: int | None = Query(None, description="同步的最大记录数"),
    force_reset: bool = Query(False, description="是否强制重置向量数据库"),
):
    """同步 SQLite 数据库到向量数据库"""
    try:
        vector_service = get_vector_service()
        if not vector_service.is_enabled():
            raise HTTPException(status_code=503, detail="向量数据库服务不可用")

        synced_count = vector_service.sync_from_database(limit=limit, force_reset=force_reset)

        return {"message": "同步完成", "synced_count": synced_count}

    except Exception as e:
        logger.error(f"向量数据库同步失败: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/vector-reset")
async def reset_vector_database():
    """重置向量数据库"""
    try:
        vector_service = get_vector_service()
        if not vector_service.is_enabled():
            raise HTTPException(status_code=503, detail="向量数据库服务不可用")

        success = vector_service.reset()

        if success:
            return {"message": "向量数据库重置成功"}
        else:
            raise HTTPException(status_code=500, detail="向量数据库重置失败")

    except Exception as e:
        logger.error(f"向量数据库重置失败: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e
