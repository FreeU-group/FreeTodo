"""阿里云Fun-ASR实时语音识别客户端

参考LLM客户端的实现方式，提供单例模式的ASR客户端。
"""

import asyncio
import json
import uuid
from collections.abc import Callable
from typing import Any

import websockets
from websockets import protocol
from websockets.exceptions import ConnectionClosed

from lifetrace.util.logging_config import get_logger
from lifetrace.util.settings import settings

logger = get_logger()


class ASRClient:
    """阿里云Fun-ASR实时语音识别客户端（单例模式）"""

    _instance = None
    _initialized = False

    def __new__(cls):
        """实现单例模式"""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        """初始化ASR客户端"""
        if not ASRClient._initialized:
            self._initialize_client()
            ASRClient._initialized = True

    def _initialize_client(self):
        """内部方法：初始化或重新初始化客户端"""
        try:
            self.api_key = settings.audio.asr.api_key
            self.base_url = settings.audio.asr.base_url
            self.model = settings.audio.asr.model
            self.sample_rate = settings.audio.asr.sample_rate
            self.format = settings.audio.asr.format
            self.semantic_punctuation_enabled = settings.audio.asr.semantic_punctuation_enabled
            self.max_sentence_silence = settings.audio.asr.max_sentence_silence
            self.heartbeat = settings.audio.asr.heartbeat

            invalid_values = [
                "xxx",
                "YOUR_API_KEY_HERE",
                "YOUR_ASR_KEY_HERE",
                "YOUR_LLM_KEY_HERE",  # 与 default_config 中 audio.asr.api_key 占位符一致，未配置时回退到 LLM Key
            ]
            if not self.api_key or self.api_key in invalid_values:
                # 尝试使用 LLM API Key 作为备选（DashScope 同账号下 ASR 与 LLM 可用同一 Key）
                llm_key = settings.llm.api_key
                if llm_key and llm_key not in invalid_values and llm_key.startswith("sk-"):
                    logger.info("ASR API Key 未配置，自动使用 LLM API Key")
                    self.api_key = llm_key
                else:
                    logger.warning("ASR API Key 未配置或为默认占位符，ASR 功能可能不可用")
        except Exception as e:
            logger.error(f"无法从配置文件读取ASR配置: {e}")
            self.api_key = "YOUR_ASR_KEY_HERE"
            self.base_url = "wss://dashscope.aliyuncs.com/api-ws/v1/inference/"
            self.model = "fun-asr-realtime"
            self.sample_rate = 16000
            self.format = "pcm"
            self.semantic_punctuation_enabled = False
            self.max_sentence_silence = 1300
            self.heartbeat = False
            logger.warning("使用硬编码默认值初始化ASR客户端")

    def reinitialize(self):
        """重新初始化ASR客户端（用于配置热重载）"""
        self._initialize_client()
        logger.info("ASR客户端已重新初始化")

    def _build_run_task_message(self, task_id: str) -> dict[str, Any]:
        """构建run-task消息"""
        return {
            "header": {
                "action": "run-task",
                "task_id": task_id,
                "streaming": "duplex",
            },
            "payload": {
                "task_group": "audio",
                "task": "asr",
                "function": "recognition",
                "model": self.model,
                "parameters": {
                    "format": self.format,
                    "sample_rate": self.sample_rate,
                    "semantic_punctuation_enabled": self.semantic_punctuation_enabled,
                    "max_sentence_silence": self.max_sentence_silence,
                    "heartbeat": self.heartbeat,
                },
                "input": {},
            },
        }

    def _build_finish_task_message(self, task_id: str) -> dict[str, Any]:
        """构建finish-task消息"""
        return {
            "header": {
                "action": "finish-task",
                "task_id": task_id,
                "streaming": "duplex",
            },
            "payload": {"input": {}},
        }

    def _handle_asr_event(
        self,
        event: str,
        data: dict[str, Any],
        on_result: Callable[[str, bool], None],
        on_error: Callable[[Exception], None] | None,
        task_started_ref: list[bool],
    ) -> bool:
        """处理ASR事件，返回是否应该继续"""
        logger.debug(f"ASR event received: {event}, data keys: {list(data.keys())}")
        if event == "task-started":
            task_started_ref[0] = True
            logger.info("ASR任务已启动")
            return True
        if event == "result-generated":
            payload = data.get("payload", {})
            output = payload.get("output", {})
            sentence = output.get("sentence", {})
            text = sentence.get("text", "")
            is_final = sentence.get("sentence_end", False)
            if text:
                logger.info(f"ASR partial result: {text} (final={is_final})")
            if text and on_result:
                on_result(text, is_final)
            return True
        if event == "task-finished":
            logger.info("ASR任务已完成")
            return False
        if event == "task-failed":
            error_code = data.get("header", {}).get("error_code", "")
            error_message = data.get("header", {}).get("error_message", "")
            error = Exception(f"ASR任务失败: {error_code} - {error_message}")
            if on_error:
                on_error(error)
            logger.error(f"ASR任务失败: {error_message}")
            return False
        return True

    async def _receive_messages(
        self,
        ws: Any,
        on_result: Callable[[str, bool], None],
        on_error: Callable[[Exception], None] | None,
        task_started_ref: list[bool],
    ) -> None:
        """接收并处理ASR消息"""
        async for message in ws:
            try:
                data = json.loads(message)
                event = data.get("header", {}).get("event")
                should_continue = self._handle_asr_event(
                    event, data, on_result, on_error, task_started_ref
                )
                if not should_continue:
                    break
            except json.JSONDecodeError as e:
                logger.error(f"解析ASR响应失败: {e}")
            except Exception as e:
                logger.error(f"处理ASR响应时出错: {e}")
                if on_error:
                    on_error(e)

    async def _send_audio(
        self, ws: Any, audio_stream: Any, task_id: str, task_started_ref: list[bool]
    ) -> None:
        """发送音频数据"""
        # 等待任务启动
        max_wait_time = 5.0  # 最多等待5秒
        wait_interval = 0.1
        waited_time = 0.0
        while not task_started_ref[0] and waited_time < max_wait_time:
            await asyncio.sleep(wait_interval)
            waited_time += wait_interval

        if not task_started_ref[0]:
            logger.warning("ASR task did not start within timeout, continuing anyway")

        try:
            async for chunk in audio_stream:
                # websockets库使用state属性检查连接状态
                if ws.state == protocol.State.OPEN and chunk:
                    await ws.send(chunk)
                elif ws.state in (protocol.State.CLOSED, protocol.State.CLOSING):
                    logger.info("WebSocket closed, stopping audio stream")
                    break
        except Exception as e:
            logger.error(f"Error sending audio stream: {e}")

        # 发送finish-task指令
        finish_task_message = self._build_finish_task_message(task_id)
        if ws.state == protocol.State.OPEN:
            try:
                await ws.send(json.dumps(finish_task_message))
                logger.info("Sent finish-task message")
            except Exception as e:
                logger.error(f"Failed to send finish-task message: {e}")

    async def transcribe_stream(
        self,
        audio_stream: Any,
        on_result: Callable[[str, bool], None],
        on_error: Callable[[Exception], None] | None = None,
    ) -> None:
        """实时语音识别流式转录

        Args:
            audio_stream: 音频数据流（二进制）
            on_result: 识别结果回调函数，接收 (text: str, is_final: bool) 参数
            on_error: 错误回调函数，接收 (error: Exception) 参数
        """
        task_id = uuid.uuid4().hex[:32]  # 生成32位随机ID
        # websockets库的additional_headers需要使用列表格式，每个元素是(name, value)元组
        headers = [
            ("Authorization", f"Bearer {self.api_key}"),
        ]

        try:
            # 检查API Key是否配置
            invalid_values = ["xxx", "YOUR_API_KEY_HERE", "YOUR_ASR_KEY_HERE"]
            if not self.api_key or self.api_key in invalid_values:
                error_msg = "ASR API Key未配置，请先配置API Key"
                logger.error(error_msg)
                if on_error:
                    on_error(Exception(error_msg))
                return

            # websockets库使用additional_headers参数（接受列表格式）
            async with websockets.connect(self.base_url, additional_headers=headers) as ws:
                logger.info("Connected to ASR WebSocket")
                # 发送run-task指令
                run_task_message = self._build_run_task_message(task_id)
                await ws.send(json.dumps(run_task_message))
                logger.info("Sent run-task message")

                task_started_ref: list[bool] = [False]

                # 并发执行接收和发送
                await asyncio.gather(
                    self._receive_messages(ws, on_result, on_error, task_started_ref),
                    self._send_audio(ws, audio_stream, task_id, task_started_ref),
                )

        except ConnectionClosed:
            logger.info("ASR WebSocket连接已关闭")
        except Exception as e:
            # 记录详细的连接信息以便排查 401
            masked_key = f"{self.api_key[:6]}...{self.api_key[-4:]}" if self.api_key else "None"
            logger.error(
                f"ASR连接失败 | URL: {self.base_url} | Key: {masked_key} | Headers: {headers}"
            )
            logger.error(f"ASR转录失败: {e}", exc_info=True)
            if on_error:
                on_error(e)
