"""音频相关路由"""

import os
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

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
    """上传音频文件"""
    try:
        # 解析时间
        start_dt = datetime.fromisoformat(startTime.replace("Z", "+00:00"))
        end_dt = datetime.fromisoformat(endTime.replace("Z", "+00:00"))

        # 生成文件名
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        file_ext = Path(file.filename).suffix or ".webm"
        filename = f"{segmentId}_{timestamp}{file_ext}"
        file_path = AUDIO_STORAGE_DIR / filename

        # 保存文件
        with open(file_path, "wb") as f:
            content = await file.read()
            f.write(content)

        file_size = os.path.getsize(file_path)

        logger.info(
            f"音频文件上传成功: {filename}, 大小: {file_size} bytes, "
            f"时间段: {start_dt} - {end_dt}"
        )

        # 返回文件ID（使用segmentId作为标识）
        return JSONResponse(
            content={
                "id": segmentId,
                "filename": filename,
                "file_path": str(file_path),
                "file_size": file_size,
                "start_time": start_dt.isoformat(),
                "end_time": end_dt.isoformat(),
            }
        )

    except Exception as e:
        logger.error(f"音频文件上传失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"上传失败: {str(e)}") from e


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

        return FileResponse(
            path=str(file_path),
            media_type="audio/webm",
            filename=filename,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取音频文件内容失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"获取失败: {str(e)}") from e

