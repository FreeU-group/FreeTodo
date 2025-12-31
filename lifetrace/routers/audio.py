"""音频相关路由"""

import hashlib
import os
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, Query
from fastapi.responses import JSONResponse

from lifetrace.storage import Attachment, AudioRecording, get_session
from lifetrace.util.logging_config import get_logger
from lifetrace.util.path_utils import get_user_data_dir

logger = get_logger()

router = APIRouter(prefix="/api/audio", tags=["audio"])

# 音频文件存储目录
AUDIO_STORAGE_DIR = Path(get_user_data_dir()) / "audio"
AUDIO_STORAGE_DIR.mkdir(parents=True, exist_ok=True)


@router.post("/upload")
async def upload_audio(
    file: UploadFile = File(...),
    startTime: str = Form(...),
    endTime: str = Form(...),
    segmentId: str = Form(...),
):
    """上传音频文件并保存到数据库"""
    try:
        # 解析时间（前端发送的是 UTC 时间）
        start_dt = datetime.fromisoformat(startTime.replace("Z", "+00:00"))
        end_dt = datetime.fromisoformat(endTime.replace("Z", "+00:00"))
        
        # 确保时间有 UTC 时区信息
        if start_dt.tzinfo is None:
            start_dt = start_dt.replace(tzinfo=timezone.utc)
        else:
            # 转换为 UTC 时间
            start_dt = start_dt.astimezone(timezone.utc)
        
        if end_dt.tzinfo is None:
            end_dt = end_dt.replace(tzinfo=timezone.utc)
        else:
            # 转换为 UTC 时间
            end_dt = end_dt.astimezone(timezone.utc)
        
        # 存储到数据库时，如果数据库字段是 naive datetime，需要转换为 naive UTC
        # SQLAlchemy 会自动处理，但为了确保正确，我们使用 UTC 时间
        start_dt_naive = start_dt.replace(tzinfo=None) if start_dt.tzinfo else start_dt
        end_dt_naive = end_dt.replace(tzinfo=None) if end_dt.tzinfo else end_dt

        # 生成文件名
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        file_ext = Path(file.filename).suffix or ".webm"
        filename = f"{segmentId}_{timestamp}{file_ext}"
        file_path = AUDIO_STORAGE_DIR / filename

        # 保存文件
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)

        file_size = os.path.getsize(file_path)
        
        # 计算文件哈希
        file_hash = hashlib.sha256(content).hexdigest()

        # 保存到数据库
        attachment_id = None
        audio_recording_id = None
        
        with get_session() as session:
            # 1. 创建 Attachment 记录
            attachment = Attachment(
                file_path=str(file_path),
                file_name=filename,
                file_size=file_size,
                mime_type=file.content_type or "audio/webm",
                file_hash=file_hash,
            )
            session.add(attachment)
            session.flush()  # 获取 attachment.id
            attachment_id = attachment.id  # 在会话内保存 ID

            # 2. 创建 AudioRecording 记录
            duration_seconds = int((end_dt - start_dt).total_seconds())
            audio_recording = AudioRecording(
                attachment_id=attachment.id,
                start_time=start_dt_naive,  # 存储为 naive UTC 时间
                end_time=end_dt_naive,      # 存储为 naive UTC 时间
                duration_seconds=duration_seconds,
                segment_id=segmentId,
            )
            session.add(audio_recording)
            session.flush()  # 获取 audio_recording.id
            audio_recording_id = audio_recording.id  # 在会话内保存 ID
            # commit 会在上下文管理器退出时自动执行

        logger.info(
            f"✅ 音频文件已保存到本地文件夹和数据库: "
            f"文件路径={file_path}, "
            f"filename={filename}, "
            f"attachment_id={attachment_id}, "
            f"audio_recording_id={audio_recording_id}, "
            f"大小={file_size} bytes, "
            f"时间段={start_dt} - {end_dt}"
        )
        print(f"✅ [音频保存] 文件已保存到: {file_path} (大小: {file_size} bytes)")

        # 返回文件ID（使用segmentId作为标识）
        return JSONResponse(
            content={
                "id": segmentId,
                "filename": filename,
                "file_path": str(file_path),
                "file_size": file_size,
                "start_time": start_dt.isoformat(),
                "end_time": end_dt.isoformat(),
                "attachment_id": attachment_id,
                "audio_recording_id": audio_recording_id,
            }
        )

    except Exception as e:
        logger.error(f"❌ 音频文件上传失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"上传失败: {str(e)}") from e


@router.get("")
async def query_audio_recordings(
    startTime: str = Query(None, description="开始时间（ISO 格式）"),
    endTime: str = Query(None, description="结束时间（ISO 格式）"),
):
    """查询音频录音记录"""
    try:
        from datetime import datetime
        from lifetrace.storage import AudioRecording, Attachment
        
        with get_session() as session:
            query = session.query(AudioRecording)
            
            if startTime and endTime:
                start_dt = datetime.fromisoformat(startTime.replace("Z", "+00:00"))
                end_dt = datetime.fromisoformat(endTime.replace("Z", "+00:00"))
                query = query.filter(
                    AudioRecording.start_time >= start_dt,
                    AudioRecording.start_time <= end_dt,
                )
            
            recordings = query.order_by(AudioRecording.start_time).all()
            
            results = []
            for rec in recordings:
                attachment = None
                if rec.attachment_id:
                    attachment = session.query(Attachment).filter(Attachment.id == rec.attachment_id).first()
                
                file_url = None
                if attachment and attachment.file_path:
                    filename = os.path.basename(attachment.file_path)
                    file_url = f"/api/audio/file/{filename}"
                
                # 确保返回的时间包含时区信息
                # 如果数据库存储的是 naive datetime，假设它是 UTC 时间
                start_time = rec.start_time
                if start_time.tzinfo is None:
                    # 如果是 naive datetime，假设它是 UTC 时间
                    start_time = start_time.replace(tzinfo=timezone.utc)
                
                end_time = rec.end_time
                if end_time and end_time.tzinfo is None:
                    # 如果是 naive datetime，假设它是 UTC 时间
                    end_time = end_time.replace(tzinfo=timezone.utc)
                
                results.append({
                    "id": rec.segment_id or str(rec.id),
                    "segment_id": rec.segment_id,
                    "start_time": start_time.isoformat(),
                    "end_time": end_time.isoformat() if end_time else None,
                    "duration_seconds": rec.duration_seconds,
                    "file_url": file_url,
                    "filename": os.path.basename(attachment.file_path) if attachment else None,
                    "file_size": attachment.file_size if attachment else None,
                })
            
            logger.info(f"✅ 查询到 {len(results)} 条音频录音记录")
            return JSONResponse(content={"recordings": results})
            
    except Exception as e:
        logger.error(f"查询音频录音记录失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"查询失败: {str(e)}") from e


@router.get("/{audio_id}")
async def get_audio(audio_id: str):
    """获取音频文件信息或URL"""
    try:
        # 查找音频文件
        audio_files = list(AUDIO_STORAGE_DIR.glob(f"{audio_id}_*"))
        if not audio_files:
            raise HTTPException(status_code=404, detail="音频文件不存在")

        # 返回最新的文件
        latest_file = max(audio_files, key=os.path.getctime)

        # 返回文件URL（相对路径）
        file_url = f"/api/audio/file/{latest_file.name}"

        return JSONResponse(
            content={
                "id": audio_id,
                "url": file_url,
                "filename": latest_file.name,
                "file_size": os.path.getsize(latest_file),
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取音频文件失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"获取失败: {str(e)}") from e


@router.get("/file/{filename}")
async def get_audio_file(filename: str):
    """获取音频文件内容"""
    try:
        file_path = AUDIO_STORAGE_DIR / filename
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="音频文件不存在")

        from fastapi.responses import FileResponse
        from fastapi import Response

        # 确定正确的媒体类型（不包含 codecs，让浏览器自动检测）
        file_ext = file_path.suffix.lower()
        media_type_map = {
            ".webm": "audio/webm",  # 不指定 codecs，让浏览器自动检测
            ".mp3": "audio/mpeg",
            ".wav": "audio/wav",
            ".ogg": "audio/ogg",
            ".m4a": "audio/mp4",
        }
        media_type = media_type_map.get(file_ext, "audio/webm")

        logger.info(f"返回音频文件: {filename}, 媒体类型: {media_type}, 文件大小: {file_path.stat().st_size} bytes")

        # 添加 CORS 头，确保浏览器可以访问
        headers = {
            "Accept-Ranges": "bytes",
            "Content-Length": str(file_path.stat().st_size),
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Expose-Headers": "Content-Length, Content-Type, Accept-Ranges",
        }
        
        return FileResponse(
            path=str(file_path),
            media_type=media_type,
            filename=filename,
            headers=headers,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取音频文件内容失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"获取失败: {str(e)}") from e


@router.delete("/{audio_id}")
async def delete_audio(audio_id: str):
    """删除音频文件和相关记录"""
    try:
        with get_session() as session:
            # 查找音频记录
            audio_recording = session.query(AudioRecording).filter(
                AudioRecording.segment_id == audio_id
            ).first()
            
            if not audio_recording:
                raise HTTPException(status_code=404, detail="音频记录不存在")
            
            # 查找关联的附件
            attachment = None
            if audio_recording.attachment_id:
                attachment = session.query(Attachment).filter(
                    Attachment.id == audio_recording.attachment_id
                ).first()
            
            # 删除文件
            if attachment and attachment.file_path:
                file_path = Path(attachment.file_path)
                if file_path.exists():
                    try:
                        file_path.unlink()
                        logger.info(f"✅ 已删除音频文件: {file_path}")
                    except Exception as e:
                        logger.warning(f"删除音频文件失败: {file_path}, 错误: {e}")
            
            # 删除数据库记录
            # 先删除关联的转录片段
            from lifetrace.storage import TranscriptSegment
            session.query(TranscriptSegment).filter(
                TranscriptSegment.audio_recording_id == audio_recording.id
            ).delete()
            
            # 删除音频记录
            session.delete(audio_recording)
            
            # 删除附件记录
            if attachment:
                session.delete(attachment)
            
            session.commit()
            
            logger.info(f"✅ 已删除音频记录: segment_id={audio_id}")
            return JSONResponse(content={"message": "音频已删除", "audio_id": audio_id})
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"删除音频失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"删除失败: {str(e)}") from e

