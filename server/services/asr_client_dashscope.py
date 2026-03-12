"""阿里云Fun-ASR实时语音识别客户端（使用DashScope SDK）

使用dashscope SDK进行实时语音识别，支持麦克风输入和本地音频文件。
"""

from collections.abc import Callable

import dashscope
from dashscope.audio.asr import Recognition, RecognitionCallback, RecognitionResult

from util.logging_config import get_logger
from util.settings import settings

logger = get_logger()


class ASRDashScopeClient:
    """阿里云Fun-ASR实时语音识别客户端（使用DashScope SDK）"""

    _instance = None
    _initialized = False

    def __new__(cls):
        """实现单例模式"""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        """初始化ASR客户端"""
        if not ASRDashScopeClient._initialized:
            self._initialize_client()
            ASRDashScopeClient._initialized = True

    def _initialize_client(self):
        """内部方法：初始化或重新初始化客户端"""
        try:
            # 默认使用 LLM API Key (DashScope)
            self.api_key = settings.llm.api_key

            # 如果单独配置了 ASR Key 且不是默认值，则使用 ASR Key
            asr_config_key = settings.audio.asr.api_key
            invalid_values = ["xxx", "YOUR_API_KEY_HERE", "YOUR_ASR_KEY_HERE", "YOUR_LLM_KEY_HERE"]

            if asr_config_key and asr_config_key not in invalid_values:
                self.api_key = asr_config_key

            self.base_url = settings.audio.asr.base_url
            self.model = settings.audio.asr.model
            self.sample_rate = settings.audio.asr.sample_rate
            self.format = settings.audio.asr.format
            self.semantic_punctuation_enabled = settings.audio.asr.semantic_punctuation_enabled
            self.max_sentence_silence = settings.audio.asr.max_sentence_silence
            self.heartbeat = settings.audio.asr.heartbeat

            # 配置dashscope
            dashscope.api_key = self.api_key
            dashscope.base_websocket_api_url = self.base_url

            invalid_values = ["xxx", "YOUR_API_KEY_HERE", "YOUR_ASR_KEY_HERE"]
            if not self.api_key or self.api_key in invalid_values:
                logger.warning("ASR API Key未配置或为默认占位符，ASR功能可能不可用")
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

    def create_recognition_callback(
        self,
        on_result: Callable[[str, bool], None],
        on_error: Callable[[Exception], None] | None = None,
    ) -> RecognitionCallback:
        """创建识别回调

        Args:
            on_result: 识别结果回调，接收 (text: str, is_final: bool) 参数
            on_error: 错误回调，接收 (error: Exception) 参数
        """

        class Callback(RecognitionCallback):
            def __init__(self, result_cb, error_cb):
                self.result_cb = result_cb
                self.error_cb = error_cb

            def on_open(self) -> None:
                logger.info("ASR识别已启动")

            def on_close(self) -> None:
                logger.info("ASR识别已关闭")

            def on_complete(self) -> None:
                logger.info("ASR识别已完成")

            def on_error(self, result: RecognitionResult) -> None:
                error_msg = f"ASR识别错误: {result.message}"
                logger.error(error_msg)
                if self.error_cb:
                    self.error_cb(Exception(error_msg))

            def on_event(self, result: RecognitionResult) -> None:
                sentence = result.get_sentence()
                if isinstance(sentence, dict) and "text" in sentence:
                    text = str(sentence.get("text", ""))
                    is_final = RecognitionResult.is_sentence_end(sentence)
                    if text and self.result_cb:
                        self.result_cb(text, is_final)

        return Callback(on_result, on_error)

    def create_recognition(self, callback: RecognitionCallback) -> Recognition:
        """创建识别实例

        Args:
            callback: 识别回调

        Returns:
            Recognition实例
        """
        return Recognition(
            model=self.model,
            format=self.format,
            sample_rate=self.sample_rate,
            semantic_punctuation_enabled=self.semantic_punctuation_enabled,
            callback=callback,
        )
