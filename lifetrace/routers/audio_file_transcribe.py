"""音频/视频文件上传和转录路由"""

import os
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from lifetrace.llm.llm_client import LLMClient
from lifetrace.core.dependencies import get_todo_service
from lifetrace.schemas.todo import TodoCreate
from lifetrace.routers.schedules import BatchSaveRequest, ScheduleItemInDB, save_schedules
from lifetrace.util.logging_config import get_logger
from lifetrace.util.path_utils import get_user_data_dir

logger = get_logger()


def convert_traditional_to_simplified(text: str) -> str:
    """将繁体中文转换为简体中文"""
    try:
        import opencc
        converter = opencc.OpenCC('t2s')  # 繁体转简体
        return converter.convert(text)
    except ImportError:
        # 如果没有安装 opencc，返回原文本
        logger.warning("opencc-python-reimplemented 未安装，无法转换繁体中文")
        return text

router = APIRouter(prefix="/api/audio", tags=["audio-file-transcribe"])

# 全局模型实例（单例模式，避免重复初始化）
_whisper_model = None

# 临时文件存储目录
TEMP_STORAGE_DIR = Path(get_user_data_dir()) / "temp_audio"
TEMP_STORAGE_DIR.mkdir(parents=True, exist_ok=True)

# 支持的音频/视频格式
SUPPORTED_AUDIO_FORMATS = {".mp3", ".wav", ".m4a", ".flac", ".ogg", ".webm", ".aac"}
SUPPORTED_VIDEO_FORMATS = {".mp4", ".avi", ".mov", ".mkv", ".webm", ".flv"}


class TranscriptionResponse(BaseModel):
    """转录响应"""
    transcript: str
    optimized_text: Optional[str] = None
    todos: list = []
    schedules: list = []
    processing_time: float  # 处理时间（秒）


def get_whisper_model():
    """获取 Faster-Whisper 模型（延迟加载）"""
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        error_msg = (
            "Faster-Whisper 未安装。文件转录需要 Faster-Whisper。\n"
            "安装方法：\n"
            "uv pip install faster-whisper\n"
        )
        logger.error(error_msg)
        raise ImportError(error_msg)
    
    # 使用全局变量缓存模型（单例模式）
    global _whisper_model
    
    # 如果模型已初始化，直接返回（避免重复初始化）
    if _whisper_model is not None:
        return _whisper_model
    
    if _whisper_model is None:
        try:
            from lifetrace.util.settings import settings
            
            model_size = settings.get('speech_recognition.whisper_model_size', 'base')
            device = settings.get('speech_recognition.whisper_device', 'cpu')
            compute_type = 'int8' if device == 'cpu' else 'float16'
            
            logger.info(f"初始化 Faster-Whisper 模型: size={model_size}, device={device}, compute_type={compute_type}")
            
            _whisper_model = WhisperModel(
                model_size,
                device=device,
                compute_type=compute_type,
            )
            logger.info("Faster-Whisper 模型初始化成功")
        except Exception as e:
            logger.error(f"Faster-Whisper 模型初始化失败: {e}", exc_info=True)
            raise
    
    return _whisper_model


def optimize_text_with_llm(text: str) -> Optional[str]:
    """使用LLM优化转录文本"""
    try:
        llm_client = LLMClient()
        if not llm_client.is_available():
            logger.warning("LLM客户端不可用，跳过文本优化")
            return None
        
        from lifetrace.util.prompt_loader import get_prompt
        
        system_prompt = get_prompt("text_optimization", "system_assistant", default="你是一个文本优化助手，负责优化和整理转录文本，使其更加清晰、易读。")
        user_prompt = get_prompt("text_optimization", "user_prompt", text_content=text, default=f"请优化以下转录文本，使其更加清晰、易读：\n\n{text}")
        
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
        
        optimized_text = response.choices[0].message.content.strip()
        if optimized_text:
            logger.info(f"文本优化成功，长度: {len(optimized_text)}")
            return optimized_text
        else:
            logger.warning("LLM返回空响应")
            return None
            
    except Exception as e:
        logger.error(f"文本优化失败: {e}", exc_info=True)
        return None


@router.post("/transcribe-file")
async def transcribe_file(
    file: UploadFile = File(...),
    optimize: bool = Form(True, description="是否优化文本"),
    extract_todos: bool = Form(True, description="是否提取待办"),
    extract_schedules: bool = Form(True, description="是否提取日程"),
):
    """
    上传音频/视频文件并转录
    
    支持格式：
    - 音频：MP3, WAV, M4A, FLAC, OGG, WebM, AAC
    - 视频：MP4, AVI, MOV, MKV, WebM, FLV（提取音频轨道）
    """
    import time
    start_time = time.time()
    
    temp_file_path = None
    try:
        # 检查文件格式
        file_ext = Path(file.filename).suffix.lower()
        if file_ext not in SUPPORTED_AUDIO_FORMATS and file_ext not in SUPPORTED_VIDEO_FORMATS:
            raise HTTPException(
                status_code=400,
                detail=f"不支持的文件格式: {file_ext}。支持的格式: {', '.join(SUPPORTED_AUDIO_FORMATS | SUPPORTED_VIDEO_FORMATS)}"
            )
        
        # 保存临时文件
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        temp_file_path = TEMP_STORAGE_DIR / f"{timestamp}_{file.filename}"
        
        logger.info(f"开始上传文件: {file.filename}, 大小: {file.size if hasattr(file, 'size') else 'unknown'}")
        
        with open(temp_file_path, "wb") as f:
            content = await file.read()
            f.write(content)
        
        file_size = os.path.getsize(temp_file_path)
        logger.info(f"文件上传成功: {temp_file_path}, 大小: {file_size} bytes")
        
        # 如果是视频文件，提取音频轨道
        if file_ext in SUPPORTED_VIDEO_FORMATS:
            logger.info(f"检测到视频文件，提取音频轨道...")
            audio_file_path = TEMP_STORAGE_DIR / f"{timestamp}_audio.wav"
            
            try:
                import subprocess
                # 使用 ffmpeg 提取音频（如果可用）
                result = subprocess.run(
                    [
                        "ffmpeg",
                        "-i", str(temp_file_path),
                        "-vn",  # 不包含视频
                        "-acodec", "pcm_s16le",  # 16-bit PCM
                        "-ar", "16000",  # 16kHz 采样率
                        "-ac", "1",  # 单声道
                        "-y",  # 覆盖输出文件
                        str(audio_file_path),
                    ],
                    capture_output=True,
                    encoding='utf-8',
                    errors='ignore',  # 忽略编码错误
                )
                
                if result.returncode != 0:
                    logger.error(f"ffmpeg 提取音频失败: {result.stderr}")
                    raise HTTPException(status_code=500, detail="无法提取视频音频轨道，请确保已安装 ffmpeg")
                
                logger.info(f"音频提取成功: {audio_file_path}")
                temp_file_path = audio_file_path
                
            except FileNotFoundError:
                raise HTTPException(
                    status_code=500,
                    detail="ffmpeg 未安装，无法处理视频文件。请安装 ffmpeg：https://ffmpeg.org/download.html"
                )
            except Exception as e:
                logger.error(f"提取视频音频失败: {e}", exc_info=True)
                raise HTTPException(status_code=500, detail=f"提取视频音频失败: {str(e)}")
        
        # 使用 Faster-Whisper 转录
        logger.info("开始转录...")
        try:
            model = get_whisper_model()
            
            # 转录音频文件
            segments, info = model.transcribe(
                str(temp_file_path),
                beam_size=5,
                language="zh",  # 中文
                task="transcribe",
            )
            
            # 合并所有片段
            transcript_parts = []
            for segment in segments:
                transcript_parts.append(segment.text.strip())
            
            transcript = " ".join(transcript_parts)
            
            # 将繁体中文转换为简体中文
            transcript = convert_traditional_to_simplified(transcript)
            
            logger.info(f"转录完成，文本长度: {len(transcript)}, 语言: {info.language}, 概率: {info.language_probability:.2f}")
            
        except Exception as e:
            logger.error(f"转录失败: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"转录失败: {str(e)}")
        
        if not transcript or not transcript.strip():
            raise HTTPException(status_code=400, detail="转录结果为空，可能是音频文件无效或没有语音内容")
        
        # 优化文本（可选）
        optimized_text = None
        if optimize:
            logger.info("开始优化文本...")
            optimized_text = optimize_text_with_llm(transcript)
        
        # 提取待办和日程（可选）
        todos = []
        schedules = []
        
        text_for_extraction = optimized_text if optimized_text else transcript
        
        if extract_todos:
            todos = []
            try:
                logger.info("开始提取待办事项...")
                # 直接导入并调用内部函数
                try:
                    from lifetrace.routers.audio_todo_extraction import _parse_todo_markers
                    
                    reference_time = datetime.now()
                    todo_items = _parse_todo_markers(text_for_extraction, reference_time)
                    
                    # 自动创建Todo
                    todo_service = get_todo_service()
                    created_todo_ids = []
                    for todo_item in todo_items:
                        try:
                            todo_create = TodoCreate(
                                name=todo_item.title,
                                description=todo_item.description,
                                deadline=todo_item.deadline,
                                priority=todo_item.priority,
                                status="active",
                            )
                            created_todo = todo_service.create_todo(todo_create)
                            created_todo_ids.append(created_todo.id)
                            logger.info(f"✅ 从文件转录自动创建Todo: {todo_item.title} (ID: {created_todo.id})")
                        except Exception as e:
                            logger.error(f"创建Todo失败: {todo_item.title}, 错误: {e}", exc_info=True)
                    
                    # 将待办项转换为字典，确保 datetime 对象被序列化
                    todos = []
                    for todo in todo_items:
                        todo_dict = {
                            "title": todo.title,
                            "description": todo.description,
                            "deadline": todo.deadline.isoformat() if todo.deadline else None,
                            "priority": todo.priority,
                            "source_text": todo.source_text,
                        }
                        todos.append(todo_dict)
                    logger.info(f"提取到 {len(todos)} 个待办事项，已创建 {len(created_todo_ids)} 个Todo")
                except ImportError as e:
                    logger.error(f"无法导入待办提取函数: {e}", exc_info=True)
                except AttributeError as e:
                    logger.error(f"待办提取函数调用失败: {e}", exc_info=True)
            except Exception as e:
                logger.error(f"提取待办失败: {e}", exc_info=True, stack_info=True)
        
        if extract_schedules:
            schedules = []
            try:
                logger.info("开始提取日程信息...")
                # 直接导入并调用内部函数
                try:
                    # 使用LLM智能提取日程（而不是正则表达式）
                    from lifetrace.routers.audio_schedule_extraction import _extract_schedules_with_llm
                    
                    reference_time = datetime.now()
                    schedule_items = await _extract_schedules_with_llm(text_for_extraction, reference_time)
                    
                    # 自动保存到Schedule
                    saved_count = 0
                    if schedule_items:
                        schedule_items_db = []
                        for schedule_item in schedule_items:
                            schedule_db = ScheduleItemInDB(
                                id=f"schedule_{int(datetime.now().timestamp() * 1000)}_{saved_count}",
                                sourceSegmentId="",
                                scheduleTime=schedule_item.schedule_time.isoformat(),
                                description=schedule_item.description,
                                status="pending",
                                extractedAt=datetime.now().isoformat(),
                            )
                            schedule_items_db.append(schedule_db)
                        
                        save_request = BatchSaveRequest(schedules=schedule_items_db)
                        save_response = await save_schedules(save_request)
                        saved_count = save_response.saved
                        logger.info(f"✅ 从文件转录自动保存 {saved_count} 个日程")
                    
                    # 将日程项转换为字典，确保 datetime 对象被序列化
                    schedules = []
                    for schedule in schedule_items:
                        schedule_dict = {
                            "schedule_time": schedule.schedule_time.isoformat(),
                            "description": schedule.description,
                            "source_text": schedule.source_text or schedule.description,
                            "text_start_index": schedule.text_start_index,
                            "text_end_index": schedule.text_end_index,
                        }
                        schedules.append(schedule_dict)
                    logger.info(f"提取到 {len(schedules)} 个日程，已保存 {saved_count} 个")
                except ImportError as e:
                    logger.error(f"无法导入日程提取函数: {e}", exc_info=True)
                except AttributeError as e:
                    logger.error(f"日程提取函数调用失败: {e}", exc_info=True)
            except Exception as e:
                logger.error(f"提取日程失败: {e}", exc_info=True, stack_info=True)
        
        processing_time = time.time() - start_time
        
        logger.info(f"文件转录处理完成，耗时: {processing_time:.2f}秒")
        
        return JSONResponse(
            content={
                "transcript": transcript,
                "optimized_text": optimized_text,
                "todos": todos,
                "schedules": schedules,
                "processing_time": round(processing_time, 2),
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"文件转录失败: {e}", exc_info=True, stack_info=True)
        import traceback
        error_detail = f"处理失败: {str(e)}\n{traceback.format_exc()}"
        raise HTTPException(status_code=500, detail=error_detail)
    finally:
        # 清理临时文件
        if temp_file_path and temp_file_path.exists():
            try:
                os.remove(temp_file_path)
                logger.debug(f"已删除临时文件: {temp_file_path}")
            except Exception as e:
                logger.warning(f"删除临时文件失败: {temp_file_path}, 错误: {e}")

