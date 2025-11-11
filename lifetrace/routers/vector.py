"""向量数据库相关路由"""

import logging

from fastapi import APIRouter, HTTPException, Query

from lifetrace.routers import dependencies as deps
from lifetrace.schemas.event import EventResponse
from lifetrace.schemas.vector import (
    MultimodalSearchRequest,
    MultimodalSearchResult,
    MultimodalStatsResponse,
    SemanticSearchRequest,
    SemanticSearchResult,
    VectorStatsResponse,
)

router = APIRouter(prefix="/api", tags=["vector"])


@router.post("/semantic-search", response_model=list[SemanticSearchResult])
async def semantic_search(request: SemanticSearchRequest):
    """语义搜索 OCR 结果"""
    try:
        if not deps.vector_service.is_enabled():
            raise HTTPException(status_code=503, detail="向量数据库服务不可用")

        results = deps.vector_service.semantic_search(
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
        logging.error(f"语义搜索失败: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/event-semantic-search", response_model=list[EventResponse])
async def event_semantic_search(request: SemanticSearchRequest):
    """事件级语义搜索（基于事件聚合文本）"""
    try:
        if not deps.vector_service.is_enabled():
            raise HTTPException(status_code=503, detail="向量数据库服务不可用")
        raw_results = deps.vector_service.semantic_search_events(
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
                matched = deps.db_manager.get_event_summary(int(event_id))
                if matched:
                    events_resp.append(EventResponse(**matched))

        return events_resp
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"事件语义搜索失败: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/multimodal-search", response_model=list[MultimodalSearchResult])
async def multimodal_search(request: MultimodalSearchRequest):
    """多模态搜索 (图像+文本)"""
    try:
        if not deps.multimodal_vector_service.is_enabled():
            raise HTTPException(status_code=503, detail="多模态向量数据库服务不可用")

        results = deps.multimodal_vector_service.multimodal_search(
            query=request.query,
            top_k=request.top_k,
            text_weight=request.text_weight,
            image_weight=request.image_weight,
            filters=request.filters,
        )

        # 转换为响应格式
        search_results = []
        for result in results:
            search_result = MultimodalSearchResult(
                text=result.get("text", ""),
                combined_score=result.get("combined_score", 0.0),
                text_score=result.get("text_score", 0.0),
                image_score=result.get("image_score", 0.0),
                text_weight=result.get("text_weight", 0.6),
                image_weight=result.get("image_weight", 0.4),
                metadata=result.get("metadata", {}),
                ocr_result=result.get("ocr_result"),
                screenshot=result.get("screenshot"),
            )
            search_results.append(search_result)

        return search_results

    except Exception as e:
        logging.error(f"多模态搜索失败: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/vector-stats", response_model=VectorStatsResponse)
async def get_vector_stats():
    """获取向量数据库统计信息"""
    try:
        stats = deps.vector_service.get_stats()
        return VectorStatsResponse(**stats)

    except Exception as e:
        logging.error(f"获取向量数据库统计信息失败: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/multimodal-stats", response_model=MultimodalStatsResponse)
async def get_multimodal_stats():
    """获取多模态向量数据库统计信息"""
    try:
        stats = deps.multimodal_vector_service.get_stats()
        return MultimodalStatsResponse(**stats)

    except Exception as e:
        logging.error(f"获取多模态统计信息失败: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/multimodal-sync")
async def sync_multimodal_database(
    limit: int | None = Query(None, description="同步的最大记录数"),
    force_reset: bool = Query(False, description="是否强制重置多模态向量数据库"),
):
    """同步 SQLite 数据库到多模态向量数据库"""
    try:
        if not deps.multimodal_vector_service.is_enabled():
            raise HTTPException(status_code=503, detail="多模态向量数据库服务不可用")

        synced_count = deps.multimodal_vector_service.sync_from_database(
            limit=limit, force_reset=force_reset
        )

        return {"message": "多模态同步完成", "synced_count": synced_count}

    except Exception as e:
        logging.error(f"多模态同步失败: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/vector-sync")
async def sync_vector_database(
    limit: int | None = Query(None, description="同步的最大记录数"),
    force_reset: bool = Query(False, description="是否强制重置向量数据库"),
):
    """同步 SQLite 数据库到向量数据库"""
    try:
        if not deps.vector_service.is_enabled():
            raise HTTPException(status_code=503, detail="向量数据库服务不可用")

        synced_count = deps.vector_service.sync_from_database(limit=limit, force_reset=force_reset)

        return {"message": "同步完成", "synced_count": synced_count}

    except Exception as e:
        logging.error(f"向量数据库同步失败: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/vector-reset")
async def reset_vector_database():
    """重置向量数据库"""
    try:
        if not deps.vector_service.is_enabled():
            raise HTTPException(status_code=503, detail="向量数据库服务不可用")

        success = deps.vector_service.reset()

        if success:
            return {"message": "向量数据库重置成功"}
        else:
            raise HTTPException(status_code=500, detail="向量数据库重置失败")

    except Exception as e:
        logging.error(f"向量数据库重置失败: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e
