"""实时语音识别 WebSocket 路由 - 完全使用 WhisperLiveKit

完全替换现有的音频处理流程，使用 WhisperLiveKit 进行超低延迟实时识别
"""

import asyncio
import json
from typing import Optional
from collections import deque
import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import websockets
import numpy as np

from lifetrace.util.logging_config import get_logger
from lifetrace.util.settings import settings
from lifetrace.services.whisperlivekit_service import get_whisperlivekit_service

logger = get_logger()

router = APIRouter(prefix="/api/voice", tags=["voice-stream-whisperlivekit"])


def convert_traditional_to_simplified(text: str) -> str:
    """将繁体中文转换为简体中文"""
    try:
        import opencc
        converter = opencc.OpenCC('t2s')
        return converter.convert(text)
    except ImportError:
        # 简单映射（常用字）
        traditional_to_simplified = {
            '學': '学', '會': '会', '從': '从', '感': '感', '全': '全', '在': '在',
            '心': '心', '頭': '头', '的': '的', '悲': '悲', '鳴': '鸣', '人': '人',
            '需': '需', '要': '要', '愛': '爱', '和': '和', '關': '关', '心': '心',
            '結': '结', '果': '果', '城': '城', '市': '市', '哪': '哪', '有': '有',
            '阻': '阻', '礙': '碍', '圍': '围', '都': '都', '看': '看', '自': '自',
            '己': '己', '想': '想', '像': '像', '走': '走', '過': '过', '當': '当',
            '你': '你', '做': '做', '了': '了', '些': '些', '什': '什', '麼': '么',
            '事': '事', '情': '情', '也': '也', '許': '许', '是': '是', '傷': '伤',
            '給': '给', '我': '我', '一': '一', '個': '个', '失': '失', '誤': '误',
            '真': '真', '實': '实', '像': '像', '口': '口', '徑': '径', '要': '要',
            '花': '花', '點': '点', '時': '时', '間': '间', '那': '那', '些': '些',
            '不': '不', '在': '在', '意': '意', '原': '原', '曲': '曲', '而': '而',
            '能': '能', '重': '重', '唱': '唱', '們': '们', '終': '终', '究': '究',
            '回': '回', '不': '不', '去': '去', '別': '别', '再': '再', '憶': '忆',
            '當': '当', '年': '年',
        }
        result = []
        for char in text:
            result.append(traditional_to_simplified.get(char, char))
        return ''.join(result)


class WhisperLiveKitClient:
    """WhisperLiveKit WebSocket 客户端
    
    负责连接到 WhisperLiveKit 服务器并处理音频流
    """
    
    def __init__(self, server_url: str):
        self.server_url = server_url
        self.ws: Optional[websockets.WebSocketClientProtocol] = None
        self.is_connected = False
        self.pcm_buffer = deque(maxlen=160000)  # 最多 10 秒 @ 16kHz
        self.total_samples = 0
        self.start_time = time.time()
        
    async def connect(self):
        """连接到 WhisperLiveKit 服务器"""
        try:
            logger.info(f"连接到 WhisperLiveKit 服务器: {self.server_url}")
            self.ws = await websockets.connect(self.server_url)
            self.is_connected = True
            logger.info("✅ 已连接到 WhisperLiveKit 服务器")
        except Exception as e:
            logger.error(f"连接 WhisperLiveKit 服务器失败: {e}")
            raise
    
    async def send_audio(self, pcm_data: bytes):
        """发送音频数据到 WhisperLiveKit 服务器"""
        if not self.is_connected or not self.ws:
            return
        
        try:
            # WhisperLiveKit 期望的格式：PCM Int16, 16kHz, 单声道
            # 直接发送二进制数据
            await self.ws.send(pcm_data)
        except Exception as e:
            logger.error(f"发送音频数据失败: {e}")
            self.is_connected = False
    
    async def receive_result(self) -> Optional[dict]:
        """接收识别结果
        
        WhisperLiveKit 返回格式参考：
        - {"text": "...", "is_final": true/false, "timestamp": ...}
        - 或 {"transcript": "...", "final": true/false, "time": ...}
        - 支持部分结果（is_final=false）和最终结果（is_final=true）
        """
        if not self.is_connected or not self.ws:
            return None
        
        try:
            # 设置超时，避免阻塞（WhisperLiveKit 可能不会立即返回结果）
            message = await asyncio.wait_for(self.ws.recv(), timeout=0.1)
            
            # 解析 JSON 消息
            try:
                if isinstance(message, bytes):
                    message = message.decode('utf-8')
                
                data = json.loads(message)
                
                # WhisperLiveKit 返回格式适配
                # 支持多种可能的字段名
                text = data.get('text', '') or data.get('transcript', '') or data.get('result', '')
                is_final = data.get('is_final', False) or data.get('final', False) or data.get('isFinal', False)
                
                # 时间戳处理
                timestamp = data.get('timestamp') or data.get('time') or data.get('endTime')
                if timestamp is None:
                    timestamp = time.time() - self.start_time
                elif not isinstance(timestamp, (int, float)):
                    timestamp = time.time() - self.start_time
                
                # 开始时间（如果有）
                start_time = data.get('startTime') or data.get('start_time')
                if start_time is None:
                    # 估算：假设识别的是最近 0.5-1 秒的音频
                    start_time = max(0.0, timestamp - 0.5)
                
                if text and text.strip():
                    text = convert_traditional_to_simplified(text.strip())
                    
                    # 计算相对时间戳
                    relative_time = timestamp if isinstance(timestamp, (int, float)) else (time.time() - self.start_time)
                    relative_start = start_time if isinstance(start_time, (int, float)) else max(0.0, relative_time - 0.5)
                    
                    return {
                        'text': text,
                        'isFinal': bool(is_final),
                        'startTime': relative_start,
                        'endTime': relative_time,
                    }
            except json.JSONDecodeError:
                # 如果不是 JSON，可能是纯文本
                if isinstance(message, str) and message.strip():
                    current_time = time.time() - self.start_time
                    return {
                        'text': convert_traditional_to_simplified(message.strip()),
                        'isFinal': True,
                        'startTime': max(0.0, current_time - 0.5),
                        'endTime': current_time,
                    }
        except asyncio.TimeoutError:
            # 超时是正常的，没有新结果（WhisperLiveKit 可能还在处理）
            return None
        except Exception as e:
            logger.error(f"接收识别结果失败: {e}", exc_info=True)
            self.is_connected = False
            return None
        
        return None
    
    async def close(self):
        """关闭连接"""
        if self.ws:
            try:
                await self.ws.close()
            except Exception:
                pass
        self.is_connected = False


@router.websocket("/stream-whisperlivekit")
async def stream_transcription_whisperlivekit(websocket: WebSocket):
    """
    实时语音识别 WebSocket 端点（完全使用 WhisperLiveKit）
    
    接收音频流（PCM Int16 格式），转发到 WhisperLiveKit 服务器进行超低延迟实时识别
    返回识别结果（JSON 格式）
    
    特性：
    - 超低延迟（< 300ms）
    - 支持发言者区分（未来）
    - 使用先进算法（SimulStreaming、WhisperStreaming）
    """
    await websocket.accept()
    logger.info("WebSocket 连接已建立（WhisperLiveKit 完全版）")
    
    # 获取 WhisperLiveKit 服务
    service = get_whisperlivekit_service()
    
    # 确保服务器已启动
    if not service.is_running:
        logger.info("启动 WhisperLiveKit 服务器...")
        server_started = await service.start_server()
        if not server_started:
            await websocket.send_json({
                "error": "无法启动 WhisperLiveKit 服务器，请检查安装和配置",
            })
            await websocket.close()
            return
    
    # 创建 WhisperLiveKit 客户端
    client = WhisperLiveKitClient(service.get_server_url())
    
    try:
        # 连接到 WhisperLiveKit 服务器
        await client.connect()
        
        # 创建接收任务的引用
        receive_task: Optional[asyncio.Task] = None
        
        async def receive_from_whisperlivekit():
            """从 WhisperLiveKit 接收结果并转发给客户端"""
            while client.is_connected:
                try:
                    result = await client.receive_result()
                    if result:
                        await websocket.send_json({
                            "text": result.get('text', ''),
                            "isFinal": result.get('isFinal', True),
                            "startTime": result.get('startTime', 0),
                            "endTime": result.get('endTime', 0),
                        })
                except Exception as e:
                    logger.error(f"接收 WhisperLiveKit 结果失败: {e}")
                    break
        
        # 启动接收任务
        receive_task = asyncio.create_task(receive_from_whisperlivekit())
        
        # 主循环：接收客户端音频数据并转发到 WhisperLiveKit
        while True:
            try:
                # 接收音频数据
                message = await websocket.receive()
                
                if "bytes" in message:
                    # 二进制音频数据（PCM Int16）
                    audio_data = message["bytes"]
                    
                    # 直接转发到 WhisperLiveKit 服务器
                    await client.send_audio(audio_data)
                
                elif "text" in message:
                    # 文本消息（控制消息）
                    text_msg = message["text"]
                    if text_msg == "EOS":  # End of Stream
                        # 发送结束信号到 WhisperLiveKit
                        if client.ws:
                            try:
                                await client.ws.send(json.dumps({"action": "stop"}))
                            except Exception:
                                pass
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
        
        # 取消接收任务
        if receive_task:
            receive_task.cancel()
            try:
                await receive_task
            except asyncio.CancelledError:
                pass
        
    except asyncio.CancelledError:
        logger.info("WebSocket 任务被取消")
    except Exception as e:
        logger.error(f"WebSocket 连接错误: {e}", exc_info=True)
    finally:
        # 关闭 WhisperLiveKit 客户端连接
        await client.close()
        
        try:
            if websocket.client_state.name != 'DISCONNECTED':
                await websocket.close()
        except Exception:
            pass
        logger.info("WebSocket 连接已关闭")


@router.websocket("/stream")
async def stream_transcription(websocket: WebSocket):
    """
    实时语音识别 WebSocket 端点（主端点，自动使用 WhisperLiveKit）
    
    这是主端点，会自动使用 WhisperLiveKit（如果可用）
    """
    # 直接重定向到 WhisperLiveKit 端点
    await stream_transcription_whisperlivekit(websocket)
