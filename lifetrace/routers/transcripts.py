"""转录文本管理路由"""

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from lifetrace.storage import AudioRecording, TranscriptSegment, get_session
from lifetrace.util.logging_config import get_logger

logger = get_logger()

router = APIRouter(prefix="/api/transcripts", tags=["transcripts"])


class TranscriptItem(BaseModel):
    """转录项"""
    id: str
    timestamp: str  # ISO 格式时间字符串
    rawText: str
    optimizedText: Optional[str] = None
    audioStart: int  # 相对录音开始时间（ms）
    audioEnd: int
    audioFileId: Optional[str] = None


class BatchSaveRequest(BaseModel):
    """批量保存请求"""
    transcripts: List[TranscriptItem]


class BatchSaveResponse(BaseModel):
    """批量保存响应"""
    saved: int
    message: str


@router.post("/batch", response_model=BatchSaveResponse)
async def batch_save_transcripts(request: BatchSaveRequest):
    """
    批量保存转录文本
    
    注意：当前版本仅记录日志，不持久化到数据库
    后续可以集成到数据库或文件系统
    """
    try:
        if not request.transcripts:
            logger.warning("收到空的转录文本列表")
            return BatchSaveResponse(
                saved=0,
                message="没有转录文本需要保存"
            )
        
        saved_count = 0
        
        for transcript in request.transcripts:
            try:
                # 验证必需字段
                if not transcript.id:
                    logger.warning(f"转录文本缺少 id，跳过")
                    continue
                if not transcript.rawText or not transcript.rawText.strip():
                    logger.warning(f"转录文本 id={transcript.id} 的 rawText 为空，跳过")
                    continue
                if not isinstance(transcript.audioStart, int) or not isinstance(transcript.audioEnd, int):
                    logger.warning(f"转录文本 id={transcript.id} 的 audioStart/audioEnd 不是整数，跳过")
                    continue
                if transcript.audioStart < 0 or transcript.audioEnd <= transcript.audioStart:
                    logger.warning(f"转录文本 id={transcript.id} 的音频时间范围无效: {transcript.audioStart}-{transcript.audioEnd}，跳过")
                    continue
                
                # 解析时间戳
                try:
                    timestamp = datetime.fromisoformat(transcript.timestamp.replace('Z', '+00:00'))
                except Exception as e:
                    logger.warning(f"转录文本 id={transcript.id} 的时间戳格式无效: {transcript.timestamp}, error={e}")
                    continue
                
                # 保存到数据库
                with get_session() as session:
                    # 查找关联的 AudioRecording（通过 segment_id 或 audioFileId）
                    audio_recording_id = None
                    if transcript.audioFileId:
                        # 通过 audioFileId 查找 AudioRecording
                        audio_recording = session.query(AudioRecording).filter(
                            AudioRecording.segment_id == transcript.audioFileId
                        ).first()
                        if audio_recording:
                            audio_recording_id = audio_recording.id
                    
                    # 检查是否已存在（通过 segment_id）
                    existing = session.query(TranscriptSegment).filter(
                        TranscriptSegment.segment_id == transcript.id
                    ).first()
                    
                    if existing:
                        # 更新现有记录
                        existing.timestamp = timestamp
                        existing.raw_text = transcript.rawText
                        existing.optimized_text = transcript.optimizedText
                        existing.audio_start = transcript.audioStart
                        existing.audio_end = transcript.audioEnd
                        existing.audio_file_id = transcript.audioFileId
                        existing.audio_recording_id = audio_recording_id
                        existing.updated_at = datetime.now()
                        logger.debug(f"更新转录文本: id={transcript.id}")
                    else:
                        # 创建新记录
                        transcript_segment = TranscriptSegment(
                            segment_id=transcript.id,
                            timestamp=timestamp,
                            raw_text=transcript.rawText,
                            optimized_text=transcript.optimizedText,
                            audio_start=transcript.audioStart,
                            audio_end=transcript.audioEnd,
                            audio_file_id=transcript.audioFileId,
                            audio_recording_id=audio_recording_id,
                        )
                        session.add(transcript_segment)
                        logger.debug(f"创建新转录文本: id={transcript.id}")
                    
                    session.commit()
                    
                    # 如果有关联的 AudioRecording，更新其 transcript_text 和 optimized_text
                    if audio_recording_id:
                        audio_recording = session.query(AudioRecording).filter(
                            AudioRecording.id == audio_recording_id
                        ).first()
                        if audio_recording:
                            # 合并所有片段的文本
                            all_segments = session.query(TranscriptSegment).filter(
                                TranscriptSegment.audio_recording_id == audio_recording_id
                            ).order_by(TranscriptSegment.audio_start).all()
                            
                            if all_segments:
                                raw_texts = [seg.raw_text for seg in all_segments if seg.raw_text]
                                optimized_texts = [seg.optimized_text for seg in all_segments if seg.optimized_text]
                                
                                audio_recording.transcript_text = "\n".join(raw_texts)
                                if optimized_texts:
                                    audio_recording.optimized_text = "\n".join(optimized_texts)
                                audio_recording.updated_at = datetime.now()
                                session.commit()
                                logger.debug(f"更新 AudioRecording {audio_recording_id} 的转录文本")
                
                logger.info(
                    f"✅ 保存转录文本到数据库: id={transcript.id}, "
                    f"timestamp={timestamp}, "
                    f"rawText长度={len(transcript.rawText)}, "
                    f"optimizedText长度={len(transcript.optimizedText) if transcript.optimizedText else 0}, "
                    f"audioStart={transcript.audioStart}ms, audioEnd={transcript.audioEnd}ms"
                )
                
                saved_count += 1
            except Exception as e:
                logger.error(f"保存转录文本失败: id={transcript.id if hasattr(transcript, 'id') else 'unknown'}, error={e}", exc_info=True)
        
        return BatchSaveResponse(
            saved=saved_count,
            message=f"成功保存 {saved_count}/{len(request.transcripts)} 条转录文本"
        )
    except Exception as e:
        logger.error(f"批量保存转录文本失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"保存失败: {str(e)}")


@router.get("")
async def query_transcripts(
    startTime: str = Query(None, description="开始时间（ISO 格式）"),
    endTime: str = Query(None, description="结束时间（ISO 格式）"),
    audioFileId: str = Query(None, description="音频文件ID（segment_id）"),
):
    """
    查询历史转录文本
    
    支持两种查询方式：
    1. 根据时间范围查询（startTime, endTime）
    2. 根据音频ID查询（audioFileId，优先级更高）
    """
    try:
        logger.debug(f"查询转录文本: startTime={startTime}, endTime={endTime}, audioFileId={audioFileId}")
        
        # 从数据库查询
        with get_session() as session:
            query = session.query(TranscriptSegment)
            
            # 优先根据音频ID查询
            if audioFileId:
                # 通过 audio_file_id 或 segment_id 匹配（注意：segment_id 存储的是 transcript.id，不是 audio.id）
                # 所以主要匹配 audio_file_id
                segments = query.filter(
                    (TranscriptSegment.audio_file_id == audioFileId)
                ).order_by(TranscriptSegment.timestamp).all()
                logger.info(f"根据音频ID查询转录文本: audioFileId={audioFileId}, 查询到 {len(segments)} 条")
            elif startTime and endTime:
                # 根据时间范围查询
                start = datetime.fromisoformat(startTime.replace('Z', '+00:00'))
                end = datetime.fromisoformat(endTime.replace('Z', '+00:00'))
                segments = query.filter(
                TranscriptSegment.timestamp >= start,
                TranscriptSegment.timestamp <= end,
            ).order_by(TranscriptSegment.timestamp).all()
                logger.info(f"根据时间范围查询转录文本: startTime={start}, endTime={end}")
            else:
                logger.warning("查询转录文本：未提供查询参数（audioFileId 或 startTime/endTime）")
                segments = []
            
            transcripts = []
            for seg in segments:
                transcripts.append({
                    "id": seg.segment_id,
                    "timestamp": seg.timestamp.isoformat(),
                    "rawText": seg.raw_text,
                    "optimizedText": seg.optimized_text,
                    "audioStart": seg.audio_start,
                    "audioEnd": seg.audio_end,
                    "audioFileId": seg.audio_file_id,
                    "segmentId": seg.segment_id,  # 添加segmentId字段
                })
            
            logger.info(f"✅ 查询到 {len(transcripts)} 条转录文本")
            return {"transcripts": transcripts}
    except Exception as e:
        logger.error(f"查询转录文本失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"查询失败: {str(e)}")

