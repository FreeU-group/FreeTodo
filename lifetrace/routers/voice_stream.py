"""实时语音识别 WebSocket 路由 - 使用 FunASR 进行流式识别"""

import asyncio
import io
import numpy as np
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import av

from lifetrace.util.logging_config import get_logger
from lifetrace.util.settings import settings

logger = get_logger()

router = APIRouter(prefix="/api/voice", tags=["voice-stream"])

# 全局 FunASR 模型（延迟加载）
_funasr_model: Any = None


def get_funasr_model():
    """获取 FunASR 模型（延迟加载）"""
    global _funasr_model
    if _funasr_model is None:
        try:
            from funasr import AutoModel
        except ImportError:
            error_msg = (
                "FunASR 未安装。系统音频实时识别需要 FunASR。\n"
                "安装方法：\n"
                "1. 安装 Visual C++ 构建工具：https://visualstudio.microsoft.com/visual-cpp-build-tools/\n"
                "2. 然后运行：pip install funasr\n"
                "或者使用预编译包：pip install funasr --only-binary=:all:"
            )
            logger.error(error_msg)
            raise ImportError(error_msg)
        
        try:
            model_dir = settings.speech_recognition.funasr_model_dir
            device = settings.speech_recognition.funasr_device
            
            logger.info(f"初始化 FunASR 模型: {model_dir}, device: {device}")
            _funasr_model = AutoModel(
                model=model_dir,
                device=device,
                disable_update=True,
            )
            logger.info("FunASR 模型初始化成功")
        except Exception as e:
            logger.error(f"FunASR 模型初始化失败: {e}", exc_info=True)
            raise
    return _funasr_model


@router.websocket("/stream")
async def stream_transcription(websocket: WebSocket):
    """
    实时语音识别 WebSocket 端点
    
    接收音频流（WebM/Opus 格式），使用 FunASR 进行实时识别
    返回识别结果（JSON 格式）
    """
    await websocket.accept()
    logger.info("WebSocket 连接已建立")
    
    try:
        # 获取 FunASR 模型
        try:
            model = get_funasr_model()
        except ImportError as e:
            error_msg = str(e)
            logger.error(f"FunASR 未安装: {error_msg}")
            await websocket.send_json({
                "error": "FunASR 未安装，无法进行实时识别。请安装 FunASR 依赖。",
                "details": error_msg,
            })
            await websocket.close()
            return
        
        # 音频缓冲区
        audio_buffer = bytearray()
        sample_rate = 16000  # FunASR 需要的采样率
        chunk_duration_ms = 500  # 每 500ms 处理一次
        
        # 音频格式转换器（WebM -> WAV bytes）
        async def convert_webm_to_wav(webm_data: bytes) -> bytes:
            """将 WebM 音频转换为 WAV 格式（FunASR 需要）"""
            try:
                # 使用 av 库处理音频
                container = av.open(io.BytesIO(webm_data))
                audio_stream = container.streams.audio[0]
                
                # 创建输出容器（WAV 格式）
                output = io.BytesIO()
                output_container = av.open(output, mode='w', format='wav')
                output_stream = output_container.add_stream('pcm_s16le', rate=sample_rate)
                output_stream.channels = 1  # 单声道
                
                # 读取并转换音频
                for frame in container.decode(audio_stream):
                    # 重采样到 16kHz
                    frame.pts = None
                    for resampled_frame in output_stream.encode(frame):
                        output_container.mux(resampled_frame)
                
                # 完成编码
                for resampled_frame in output_stream.encode():
                    output_container.mux(resampled_frame)
                
                output_container.close()
                return output.getvalue()
            except Exception as e:
                logger.error(f"音频格式转换失败: {e}", exc_info=True)
                return b""
        
        # 处理音频数据
        last_process_time = asyncio.get_event_loop().time()
        
        while True:
            try:
                # 接收音频数据
                message = await websocket.receive()
                
                if "bytes" in message:
                    # 二进制音频数据
                    audio_data = message["bytes"]
                    audio_buffer.extend(audio_data)
                    
                    # 每 500ms 处理一次
                    current_time = asyncio.get_event_loop().time()
                    if current_time - last_process_time >= chunk_duration_ms / 1000.0:
                        if len(audio_buffer) > 0:
                            try:
                                # 转换音频格式
                                wav_data = await convert_webm_to_wav(bytes(audio_buffer))
                                
                                if len(wav_data) > 0:
                                    # 调用 FunASR 识别
                                    result = model.generate(input=wav_data)
                                    
                                    if result and len(result) > 0:
                                        text = result[0].get("text", "").strip()
                                        
                                        if text:
                                            # 发送识别结果
                                            await websocket.send_json({
                                                "text": text,
                                                "isFinal": False,  # 流式结果，标记为临时
                                            })
                                            logger.debug(f"识别结果: {text}")
                                
                                # 清空缓冲区（保留最后一部分，避免截断）
                                keep_size = len(audio_buffer) // 4
                                audio_buffer = audio_buffer[-keep_size:]
                                last_process_time = current_time
                                
                            except Exception as e:
                                logger.error(f"处理音频数据失败: {e}", exc_info=True)
                                # 发送错误信息
                                await websocket.send_json({
                                    "error": f"处理失败: {str(e)}",
                                })
                
                elif "text" in message:
                    # 文本消息（控制消息）
                    text_msg = message["text"]
                    if text_msg == "EOS":  # End of Stream
                        # 处理剩余的音频
                        if len(audio_buffer) > 0:
                            try:
                                wav_data = await convert_webm_to_wav(bytes(audio_buffer))
                                if len(wav_data) > 0:
                                    result = model.generate(input=wav_data)
                                    if result and len(result) > 0:
                                        text = result[0].get("text", "").strip()
                                        if text:
                                            await websocket.send_json({
                                                "text": text,
                                                "isFinal": True,  # 最终结果
                                            })
                            except Exception as e:
                                logger.error(f"最终处理失败: {e}")
                        break
                
            except WebSocketDisconnect:
                logger.info("WebSocket 连接已断开")
                break
            except Exception as e:
                logger.error(f"WebSocket 处理错误: {e}", exc_info=True)
                await websocket.send_json({
                    "error": f"处理错误: {str(e)}",
                })
                break
    
    except Exception as e:
        logger.error(f"WebSocket 连接错误: {e}", exc_info=True)
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
        logger.info("WebSocket 连接已关闭")

