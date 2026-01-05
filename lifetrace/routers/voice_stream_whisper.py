"""实时语音识别 WebSocket 路由 - 使用 Faster-Whisper 进行流式识别（优化版）"""

import asyncio
import time
from collections import deque
from typing import Any

import numpy as np
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from lifetrace.util.logging_config import get_logger
from lifetrace.util.settings import settings

logger = get_logger()

# 常量定义
MIN_TEXT_LENGTH_FOR_COMMIT = 2  # 提交文本的最小长度
MIN_AUDIO_DURATION_FOR_SHORT_SENTENCE = 1.0  # 短句的最大时长（秒）
VAD_THRESHOLD_EPSILON = 0.0001  # VAD阈值的最小值
VAD_THRESHOLD_LOW = 0.01  # VAD低阈值
VAD_THRESHOLD_MEDIUM = 0.05  # VAD中等阈值
SILENCE_DURATION_THRESHOLD = 0.5  # 静音时长阈值（秒）


def convert_traditional_to_simplified(text: str) -> str:
    """
    将繁体中文转换为简体中文

    优先使用 opencc-python-reimplemented，如果没有安装则使用简单映射
    """
    # 尝试使用 opencc（如果已安装）
    try:
        import opencc

        converter = opencc.OpenCC("t2s")  # 繁体转简体
        return converter.convert(text)
    except ImportError:
        # 如果没有安装 opencc，使用简单映射（常用字）
        traditional_to_simplified = {
            "學": "学",
            "會": "会",
            "從": "从",
            "感": "感",
            "全": "全",
            "在": "在",
            "心": "心",
            "頭": "头",
            "的": "的",
            "悲": "悲",
            "鳴": "鸣",
            "人": "人",
            "需": "需",
            "要": "要",
            "愛": "爱",
            "和": "和",
            "關": "关",
            "結": "结",
            "果": "果",
            "城": "城",
            "市": "市",
            "哪": "哪",
            "有": "有",
            "阻": "阻",
            "礙": "碍",
            "圍": "围",
            "都": "都",
            "看": "看",
            "自": "自",
            "己": "己",
            "想": "想",
            "像": "像",
            "走": "走",
            "過": "过",
            "當": "当",
            "你": "你",
            "做": "做",
            "了": "了",
            "些": "些",
            "什": "什",
            "麼": "么",
            "事": "事",
            "情": "情",
            "也": "也",
            "許": "许",
            "是": "是",
            "傷": "伤",
            "給": "给",
            "我": "我",
            "一": "一",
            "個": "个",
            "失": "失",
            "誤": "误",
            "真": "真",
            "實": "实",
            "口": "口",
            "徑": "径",
            "花": "花",
            "點": "点",
            "時": "时",
            "間": "间",
            "那": "那",
            "不": "不",
            "意": "意",
            "原": "原",
            "曲": "曲",
            "而": "而",
            "能": "能",
            "重": "重",
            "唱": "唱",
            "們": "们",
            "終": "终",
            "究": "究",
            "回": "回",
            "去": "去",
            "別": "别",
            "再": "再",
            "憶": "忆",
            "年": "年",
        }
        result = []
        for char in text:
            result.append(traditional_to_simplified.get(char, char))
        return "".join(result)


router = APIRouter(prefix="/api/voice", tags=["voice-stream"])

# 全局 Faster-Whisper 模型（延迟加载）
_whisper_model: Any = None
_model_loading_lock = asyncio.Lock()
_model_loading_task: asyncio.Task | None = None


def _load_whisper_model_sync():
    """同步加载 Whisper 模型（在线程池中运行）"""
    global _whisper_model
    if _whisper_model is not None:
        return _whisper_model

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        error_msg = (
            "Faster-Whisper 未安装。系统音频实时识别需要 Faster-Whisper。\n"
            "安装方法：\n"
            "uv pip install faster-whisper\n"
            "注意：首次运行会自动下载模型（约 1.5GB）"
        )
        logger.error(error_msg)
        raise ImportError(error_msg) from None

    try:
        # 从配置读取模型大小（默认使用 base 模型，平衡速度和准确率）
        model_size = getattr(settings.speech_recognition, "whisper_model_size", "base")
        device = getattr(settings.speech_recognition, "whisper_device", "cpu")
        compute_type = "int8" if device == "cpu" else "float16"  # CPU 使用 int8，GPU 使用 float16

        logger.info(
            f"初始化 Faster-Whisper 模型: size={model_size}, device={device}, compute_type={compute_type}"
        )

        _whisper_model = WhisperModel(
            model_size,
            device=device,
            compute_type=compute_type,
        )
        logger.info("Faster-Whisper 模型初始化成功")
    except Exception:
        logger.error("Faster-Whisper 模型初始化失败", exc_info=True)
        raise

    return _whisper_model


async def get_whisper_model():
    """获取 Faster-Whisper 模型（异步，支持后台预加载）"""
    global _whisper_model, _model_loading_task

    # 如果模型已加载，直接返回
    if _whisper_model is not None:
        return _whisper_model

    # 如果正在后台加载，等待加载完成
    if _model_loading_task is not None:
        logger.info("模型正在后台加载，等待加载完成...")
        try:
            await _model_loading_task
            if _whisper_model is not None:
                logger.info("✅ 模型后台加载完成")
                return _whisper_model
        except Exception as e:
            logger.warning(f"模型后台加载失败: {e}，将立即加载")
            _model_loading_task = None

    # 如果模型仍未加载，立即加载（在线程池中运行，避免阻塞）
    async with _model_loading_lock:
        # 双重检查（可能在等待锁时，其他协程已经加载完成）
        if _whisper_model is not None:
            return _whisper_model

        logger.info("开始加载 Faster-Whisper 模型...")
        loop = asyncio.get_event_loop()
        _whisper_model = await loop.run_in_executor(None, _load_whisper_model_sync)
        logger.info("✅ Faster-Whisper 模型加载完成")
        return _whisper_model


async def preload_whisper_model():
    """后台预加载 Whisper 模型（不阻塞启动）"""
    global _whisper_model, _model_loading_task

    # 如果模型已加载，直接返回
    if _whisper_model is not None:
        logger.info("Whisper 模型已加载，跳过预加载")
        return

    # 如果正在加载，等待完成
    if _model_loading_task is not None:
        logger.info("Whisper 模型正在后台加载中，等待完成...")
        try:
            await _model_loading_task
            logger.info("✅ Whisper 模型后台预加载完成")
        except Exception as e:
            logger.warning(f"Whisper 模型后台预加载失败: {e}")
        return

    # 启动后台加载任务
    async def load_task():
        try:
            await get_whisper_model()
        except Exception as e:
            logger.warning(f"Whisper 模型预加载失败: {e}")

    _model_loading_task = asyncio.create_task(load_task())
    logger.info("✅ 已启动 Whisper 模型后台预加载任务")


class StreamingPolicy:
    """流式策略 - 智能决定何时提交识别结果"""

    def __init__(
        self,
        min_chunk_duration: float = 0.3,  # 最小块时长（秒）
        max_chunk_duration: float = 2.0,  # 最大块时长（秒）
        silence_threshold: float = 0.5,  # 静音阈值（秒）
    ):
        self.min_chunk_duration = min_chunk_duration
        self.max_chunk_duration = max_chunk_duration
        self.silence_threshold = silence_threshold

    def should_commit(
        self, audio_duration: float, has_silence: bool, text_length: int = 0
    ) -> tuple[bool, bool]:
        """
        判断是否应该提交结果（参考 WhisperLiveKit 的智能策略）

        Returns:
            (should_commit, is_final): 是否提交，是否为最终结果
        """
        # ⚡ 参考 WhisperLiveKit：策略1 - 有文本 + 检测到静音 → 提交最终结果（语句结束）
        if has_silence and text_length >= MIN_TEXT_LENGTH_FOR_COMMIT:
            return True, True

        # ⚡ 参考 WhisperLiveKit：策略2 - 短句（<1秒）+ 有文本 → 可能是完整短句，提交最终结果
        if (
            audio_duration < MIN_AUDIO_DURATION_FOR_SHORT_SENTENCE
            and text_length >= MIN_TEXT_LENGTH_FOR_COMMIT
            and has_silence
        ):
            return True, True

        # ⚡ 参考 WhisperLiveKit：策略3 - 长句（>0.3秒）+ 有文本 → 提交部分结果（实时更新）
        if audio_duration >= self.min_chunk_duration and text_length >= MIN_TEXT_LENGTH_FOR_COMMIT:
            return True, False

        # ⚡ 参考 WhisperLiveKit：策略4 - 文本太短 → 不提交（可能是噪声或未完成的词）
        if text_length < MIN_TEXT_LENGTH_FOR_COMMIT:
            return False, False

        return False, False


class EventDrivenVAD:
    """事件驱动的 VAD - 检测语音开始/结束事件"""

    def __init__(self, threshold: float = 0.01, min_silence_duration: float = 0.3):
        self.threshold = threshold
        self.min_silence_duration = min_silence_duration
        self.voice_started = False
        self.silence_duration = 0.0
        self.silence_sample_count = 0
        self.sample_rate = 16000

    def detect(self, pcm_data: bytes) -> str | None:
        """检测语音事件

        Returns:
            "VOICE_STARTED": 语音开始
            "VOICE_ENDED": 语音结束
            None: 无事件
        """
        has_voice = self._detect_voice(pcm_data)
        samples = len(pcm_data) // 2
        silence_duration = samples / self.sample_rate

        if has_voice:
            if not self.voice_started:
                self.voice_started = True
                self.silence_duration = 0.0
                return "VOICE_STARTED"
            self.silence_duration = 0.0
        elif self.voice_started:
            self.silence_duration += silence_duration
            if self.silence_duration >= self.min_silence_duration:
                self.voice_started = False
                self.silence_duration = 0.0
                return "VOICE_ENDED"

        return None

    def _detect_voice(self, pcm_data: bytes) -> bool:
        """检测是否有语音"""
        if len(pcm_data) < 2:
            return False

        audio_int16 = np.frombuffer(pcm_data, dtype=np.int16)
        audio_float = audio_int16.astype(np.float32) / 32768.0
        rms = np.sqrt(np.mean(audio_float**2))
        return rms > self.threshold

    def has_silence(self) -> bool:
        """当前是否有静音"""
        return self.silence_duration >= self.min_silence_duration


class PCMAudioProcessor:
    """PCM 音频数据处理器 - 事件驱动的实时识别

    支持事件驱动 VAD 和智能流式策略
    每300ms处理一次，100ms重叠，极致实时性
    """

    def __init__(
        self,
        sample_rate: int = 16000,
        chunk_duration: float = 0.3,  # ⚡ 0.3秒处理一次（极致实时性）
        overlap: float = 0.1,  # ⚡ 0.1秒重叠（100ms重叠）
        min_samples: int = 4800,  # ⚡ 最小样本数（约 0.3 秒 @ 16kHz）
    ):
        self.sample_rate = sample_rate
        self.chunk_duration = chunk_duration
        self.overlap = overlap
        self.min_samples = min_samples

        # 使用 deque 作为 PCM 数据缓冲区（Int16，2 bytes per sample）
        max_buffer_samples = int(sample_rate * 10.0)  # 最多 10 秒
        max_buffer_size = max_buffer_samples * 2  # Int16 = 2 bytes
        self.pcm_buffer = deque(maxlen=max_buffer_size)

        # ⚡ 事件驱动 VAD
        self.vad = EventDrivenVAD(threshold=0.01, min_silence_duration=0.5)

        # ⚡ 流式策略
        self.streaming_policy = StreamingPolicy(
            min_chunk_duration=0.3,
            max_chunk_duration=2.0,
            silence_threshold=0.5,
        )

        # 处理状态
        self.is_processing = False
        self.last_process_time = time.time()

        # ⚡ 事件驱动标志（参考 WhisperLiveKit）
        self.voice_activity_detected = False  # 检测到语音活动
        self.voice_ended_detected = False  # 检测到语音结束

        # ⚡ 累积音频时长（用于精确时间戳计算）
        self.total_processed_samples = 0  # 累积处理的样本数（不包括重叠部分）

        logger.info(
            f"⚡ PCM 音频处理器初始化（事件驱动）: chunk={chunk_duration}s, overlap={overlap}s, min_samples={min_samples} (约 {min_samples / sample_rate:.2f}s)"
        )

    def _detect_voice_activity(self, pcm_data: bytes) -> bool:
        """VAD检测：判断PCM数据中是否有语音活动

        使用简单的RMS（Root Mean Square）音频电平检测
        """
        if len(pcm_data) < 2:
            return False

        # 将PCM Int16转换为numpy数组
        audio_int16 = np.frombuffer(pcm_data, dtype=np.int16)

        # 转换为浮点数（-1到1范围）
        audio_float = audio_int16.astype(np.float32) / 32768.0

        # 计算RMS（均方根）
        rms = np.sqrt(np.mean(audio_float**2))

        # 如果RMS超过阈值，认为有语音
        return rms > self.vad_threshold

    def add_pcm_data(self, data: bytes):
        """接收 PCM 数据（Int16）并添加到缓冲区

        ⚡ 参考 WhisperLiveKit：事件驱动架构
        - 立即检测 VAD 事件
        - 如果有语音活动，标记需要处理
        - 不在这里处理，避免阻塞数据接收
        """
        self.pcm_buffer.extend(data)
        current_samples = len(self.pcm_buffer) // 2  # Int16 = 2 bytes per sample

        # ⚡ 事件驱动 VAD 检测（立即检测，不等待）
        vad_event = self.vad.detect(data)
        if vad_event:
            logger.debug(f"🎤 VAD 事件: {vad_event}, 缓冲区: {current_samples} samples")
            # 标记有语音活动，下次 try_process 时优先处理
            if vad_event == "VOICE_STARTED":
                self.voice_activity_detected = True
            elif vad_event == "VOICE_ENDED":
                self.voice_ended_detected = True

    async def try_process(self) -> dict | None:
        """尝试处理音频数据 - 真正的事件驱动实时识别

        ⚡ 参考 WhisperLiveKit 架构：
        1. 优先响应 VAD 事件（语音开始/结束）
        2. 时间条件作为兜底（确保定期处理）
        3. 缓冲区溢出保护（如果积压过多，立即处理）
        4. 避免无效检查，提高实时性
        """
        current_samples = len(self.pcm_buffer) // 2  # Int16 = 2 bytes per sample
        current_time = time.time()
        time_since_last = current_time - self.last_process_time

        # ⚡ 缓冲区溢出保护：如果缓冲区超过 3 秒，立即处理（避免积压）
        # ⚡ 优化：提高阈值到3秒，减少频繁溢出触发（因为处理速度可能跟不上）
        max_buffer_duration = 3.0  # 最多 3 秒（提高阈值，减少频繁触发）
        max_buffer_samples = int(self.sample_rate * max_buffer_duration)
        buffer_overflow = current_samples > max_buffer_samples

        # ⚡ 事件驱动优先级1：检测到语音结束 → 立即处理
        voice_ended = self.voice_ended_detected or (
            self.vad.has_silence() and current_samples >= self.min_samples
        )

        # ⚡ 事件驱动优先级2：检测到语音活动 + 有足够数据 → 可以处理
        voice_started = self.voice_activity_detected

        # ⚡ 检查是否满足处理条件（事件优先，时间兜底，溢出保护）
        # 条件1：有足够的数据
        has_enough_data = current_samples >= self.min_samples

        # 条件2：满足事件或时间条件或缓冲区溢出
        event_triggered = voice_ended or (voice_started and time_since_last >= self.chunk_duration)
        time_triggered = time_since_last >= self.chunk_duration

        should_process = has_enough_data and (event_triggered or time_triggered or buffer_overflow)

        if not should_process:
            return None

        # ⚡ 重置事件标志（避免重复触发）
        self.voice_activity_detected = False
        self.voice_ended_detected = False

        # ⚡ 如果缓冲区溢出，记录警告
        if buffer_overflow:
            logger.warning(
                f"⚠️ 缓冲区溢出保护触发: {current_samples} samples (约 {current_samples / self.sample_rate:.2f}s) > {max_buffer_samples} samples ({max_buffer_duration}s)，立即处理"
            )

        # ⚡ 参考 WhisperLiveKit：如果正在处理，检查是否需要中断（实现真正的实时）
        if self.is_processing:
            # 情况1：缓冲区溢出 → 必须处理（即使上次处理未完成）
            if buffer_overflow:
                logger.warning("⚠️ 缓冲区溢出，中断上次处理，立即处理新数据")
                # 不返回 None，继续处理（但上次处理的结果可能丢失）
            # 情况2：上次处理卡住（超过 2 倍 chunk_duration）→ 允许新处理
            elif time_since_last > self.chunk_duration * 2:
                logger.warning(f"上次处理可能卡住，允许新处理: time={time_since_last:.2f}s")
            # 情况3：正常处理中 → 跳过（避免并发处理）
            else:
                logger.debug(f"已有处理任务在运行，跳过（time={time_since_last:.2f}s）")
                return None

        # ⚡ 确定触发原因（用于日志）
        if voice_ended:
            trigger_reason = "VAD检测到语音结束"
        elif voice_started:
            trigger_reason = "VAD检测到语音活动+时间条件"
        else:
            trigger_reason = "时间条件（兜底）"

        logger.info(
            f"✅ 满足处理条件，开始处理: samples={current_samples} (约 {current_samples / self.sample_rate:.2f}s), time={time_since_last:.2f}s, 触发原因: {trigger_reason}"
        )

        self.is_processing = True
        process_start_time = time.time()

        try:
            # 记录处理开始时的相对时间（用于返回精确时间戳）
            if not hasattr(self, "recognition_start_time"):
                self.recognition_start_time = process_start_time

            # ⚡ 关键修复：只处理600ms的数据，而不是整个缓冲区
            # 1. 计算要处理的样本数（600ms = 9600 samples）
            target_samples = int(self.sample_rate * self.chunk_duration)  # 600ms = 9600 samples
            current_buffer_samples = len(self.pcm_buffer) // 2

            # 如果缓冲区数据不足，使用实际数据量（但不能小于min_samples）
            if current_buffer_samples < self.min_samples:
                logger.debug(f"缓冲区数据不足: {current_buffer_samples} samples, 跳过处理")
                return None

            # ⚡ 只处理300ms的数据（或实际可用的数据，取较小值）
            process_samples = min(target_samples, current_buffer_samples)
            process_bytes = process_samples * 2  # Int16 = 2 bytes per sample

            # 2. 提取要处理的数据（只提取300ms，不是整个缓冲区）
            pcm_bytes = bytes(list(self.pcm_buffer)[:process_bytes])

            # 检查字节对齐（Int16 需要 2 字节对齐）
            if len(pcm_bytes) % 2 != 0:
                logger.warning(
                    f"PCM 数据未对齐，截断最后 1 字节: {len(pcm_bytes)} -> {len(pcm_bytes) - 1}"
                )
                pcm_bytes = pcm_bytes[:-1]
                process_bytes = len(pcm_bytes)
                process_samples = process_bytes // 2

            # 计算处理的音频时长（用于返回时间戳）
            audio_duration = process_samples / self.sample_rate

            # 2. 转换为 numpy array（直接处理 PCM Int16）
            logger.debug(
                f"🔍 开始转换 PCM 到 numpy，样本数: {process_samples} (约 {audio_duration:.2f}s)"
            )
            audio_array = self._convert_pcm_to_numpy(pcm_bytes)

            if audio_array is None or len(audio_array) == 0:
                logger.warning(f"⚠️ PCM 转换失败或为空，样本数: {process_samples}")
                return None

            # 3. 执行语音识别（在线程池中运行，避免阻塞）
            # 记录处理开始时间
            process_start_time = time.time()
            audio_duration = len(audio_array) / self.sample_rate
            logger.info(
                f"✅ PCM 转换成功，开始识别，音频长度: {audio_duration:.2f}s, 样本数: {len(audio_array)}"
            )

            # ⚡ 添加超时机制（根据音频长度动态调整，更快响应）
            # ⚡ 优化：对于300ms短音频，使用更短的超时时间（1.0秒），避免等待太久
            # ⚡ 如果识别超过1秒还没完成，说明可能有问题，直接超时
            timeout_seconds = min(2.0, max(1.0, audio_duration * 2.0 + 0.3))  # 300ms音频约0.9秒超时
            try:
                result_dict = await asyncio.wait_for(
                    self._transcribe(audio_array, voice_ended), timeout=timeout_seconds
                )
            except TimeoutError:
                logger.error(
                    f"识别超时（>{timeout_seconds:.1f}秒），音频长度: {audio_duration:.2f}s"
                )
                result_dict = None

            process_duration = time.time() - process_start_time

            # ⚡ 关键修复：无论识别成功与否，都要清理缓冲区，否则会无限积累
            # 4. 清理已处理的缓冲区（保留100ms重叠）
            # ⚡ 计算时间戳（使用累积音频时长，而不是处理时间）
            # 每次处理300ms，但只累积200ms（减去100ms重叠）
            overlap_samples = int(self.sample_rate * self.overlap)  # 100ms = 1600 samples
            new_samples = process_samples - overlap_samples  # 本次新增的样本数（200ms）

            # 计算时间戳：基于累积的音频时长
            relative_start_time = self.total_processed_samples / self.sample_rate  # 秒
            relative_end_time = (
                self.total_processed_samples + process_samples
            ) / self.sample_rate  # 秒

            # 更新累积样本数（只累积新增的部分，不包括重叠）
            self.total_processed_samples += new_samples

            # ⚡ 参考 WhisperLiveKit：智能流式策略
            # 1. 检测静音状态
            has_silence = self.vad.has_silence() or voice_ended
            # 2. 获取识别文本
            text_length = len(result_dict.get("text", "")) if result_dict else 0
            # 3. 智能决策：是否提交以及是否为最终结果
            should_commit, is_final = self.streaming_policy.should_commit(
                audio_duration=audio_duration,
                has_silence=has_silence,
                text_length=text_length,
            )

            # ⚡ 参考 WhisperLiveKit：如果检测到语音结束，强制标记为最终结果
            if voice_ended:
                is_final = True
                should_commit = True

            # ⚡ 关键修复：只清理已处理的300ms数据，保留100ms重叠
            # 已处理：process_samples (300ms)
            # 保留重叠：overlap_samples (100ms)
            # 需要清理：process_samples - overlap_samples (200ms)
            remove_samples = max(0, process_samples - overlap_samples)  # 清理200ms，保留100ms
            remove_bytes = remove_samples * 2

            # 从缓冲区头部移除已处理的数据（只移除200ms，保留100ms重叠）
            removed_count = 0
            for _ in range(min(remove_bytes, len(self.pcm_buffer))):
                if len(self.pcm_buffer) > 0:
                    self.pcm_buffer.popleft()
                    removed_count += 1

            remaining_samples = len(self.pcm_buffer) // 2
            result_text = result_dict.get("text", "") if result_dict else ""

            # ⚡ 更新 last_process_time（无论是否成功，都要更新，避免卡住）
            self.last_process_time = current_time

            if result_dict:
                # ⚡ 使用智能流式策略的结果
                final_is_final = is_final if should_commit else result_dict.get("isFinal", False)

                logger.info(
                    f"✅ 处理完成（耗时 {process_duration:.3f}s），识别: {result_text[:30]}..., 时间: {relative_start_time:.2f}s - {relative_end_time:.2f}s, 策略: {'最终' if final_is_final else '部分'}, 清理: {removed_count} bytes ({remove_samples} samples, {remove_samples / self.sample_rate:.2f}s), 保留: {remaining_samples} samples ({remaining_samples / self.sample_rate:.2f}s)"
                )

                # ⚡ 返回结果和时间戳（用于前端精确回放）
                # ⚡ 确保时间戳格式正确：必须是数字（秒），且 endTime >= startTime
                final_start_time = max(0.0, float(relative_start_time))
                final_end_time = max(
                    final_start_time, float(relative_end_time)
                )  # 确保 endTime >= startTime

                return {
                    "text": result_dict.get("text", ""),
                    "isFinal": final_is_final,  # ⚡ 使用智能策略的结果
                    "startTime": final_start_time,  # ⚡ 确保是浮点数（秒）
                    "endTime": final_end_time,  # ⚡ 确保是浮点数（秒）
                    "segments": result_dict.get("segments", []),
                }
            else:
                logger.warning(
                    f"⚠️ 识别结果为空（耗时 {process_duration:.3f}s），但仍清理缓冲区: 清理 {removed_count} bytes ({remove_samples} samples), 保留: {remaining_samples} samples"
                )
                return None

        except Exception as e:
            logger.error(f"音频处理异常: {e}", exc_info=True)
            # ⚡ 即使出错，也要清理缓冲区，避免积压
            # 但只清理部分数据（避免丢失太多）
            try:
                if len(self.pcm_buffer) > 0:
                    # 清理至少 200ms 的数据（与正常处理一致）
                    cleanup_samples = int(self.sample_rate * 0.2)  # 200ms
                    cleanup_bytes = cleanup_samples * 2
                    for _ in range(min(cleanup_bytes, len(self.pcm_buffer))):
                        if len(self.pcm_buffer) > 0:
                            self.pcm_buffer.popleft()
                    logger.warning(
                        f"⚠️ 处理异常后清理缓冲区: {len(self.pcm_buffer) // 2} samples 剩余"
                    )
            except Exception as cleanup_error:
                logger.error(f"清理缓冲区失败: {cleanup_error}")
            return None
        finally:
            # ⚡ 确保处理状态正确更新
            self.is_processing = False
            # last_process_time 已在上面更新，这里不需要重复更新

    def _convert_pcm_to_numpy(self, pcm_bytes: bytes) -> np.ndarray | None:
        """
        将 PCM Int16 数据转换为 numpy array（Faster-Whisper 需要）
        关键点：
        1. 直接使用 np.frombuffer 解析 Int16
        2. 转换为 float32 并归一化到 [-1, 1]
        3. 数据验证
        """
        try:
            # 检查数据大小
            if len(pcm_bytes) < 2:  # 至少 1 个样本（2 bytes）
                return None

            # 检查字节对齐（Int16 需要 2 字节对齐）
            if len(pcm_bytes) % 2 != 0:
                logger.warning(
                    f"PCM 数据未对齐，截断最后 1 字节: {len(pcm_bytes)} -> {len(pcm_bytes) - 1}"
                )
                pcm_bytes = pcm_bytes[:-1]

            # 转换为 Int16 数组
            audio_int16 = np.frombuffer(pcm_bytes, dtype=np.int16)

            if len(audio_int16) == 0:
                logger.error("转换后数组为空")
                return None

            # 转换为 float32 并归一化到 [-1.0, 1.0]
            # 这是 Whisper 要求的格式
            audio_float32 = audio_int16.astype(np.float32) / 32768.0

            # 数据验证
            if not np.isfinite(audio_float32).all():
                logger.error("音频数据包含无效值(inf/nan)")
                return None

            # ⚡ 参考 WhisperLiveKit：智能静音检测（多特征检测）
            # 1. 能量检测
            energy = np.mean(audio_float32**2)
            # 2. 峰值检测
            peak = np.max(np.abs(audio_float32))
            # 3. 过零率检测（语音通常有较高的过零率）
            zero_crossings = np.sum(np.diff(np.sign(audio_float32)) != 0)
            zcr = zero_crossings / len(audio_float32) if len(audio_float32) > 0 else 0

            # 综合判断：能量低 + 峰值低 + 过零率低 = 静音
            is_silence = (
                (energy < VAD_THRESHOLD_EPSILON)
                and (peak < VAD_THRESHOLD_LOW)
                and (zcr < VAD_THRESHOLD_MEDIUM)
            )

            logger.info(
                f"✅ PCM 转换成功: {len(audio_int16)} samples (约 {len(audio_int16) / self.sample_rate:.2f}s), range=[{audio_float32.min():.3f}, {audio_float32.max():.3f}], 能量={energy:.6f}, 峰值={peak:.3f}, 过零率={zcr:.3f}, 静音={'是' if is_silence else '否'}"
            )

            # ⚡ 如果是明显静音，返回None，跳过识别（节省资源，参考 WhisperLiveKit）
            if is_silence:
                logger.debug(
                    f"🔇 检测到静音，跳过识别: energy={energy:.6f}, peak={peak:.3f}, zcr={zcr:.3f}"
                )
                return None

            return audio_float32

        except Exception as e:
            logger.error(f"PCM 转换异常: {e}", exc_info=True)
            return None

    async def _transcribe(self, audio_array: np.ndarray, voice_ended: bool = False) -> dict | None:
        """执行语音识别（在线程池中运行，避免阻塞事件循环）"""
        try:
            model = await get_whisper_model()
            audio_duration = len(audio_array) / self.sample_rate

            logger.debug(f"准备识别，音频长度: {audio_duration:.2f}s, 样本数: {len(audio_array)}")

            # 在线程池中运行（避免阻塞事件循环）
            loop = asyncio.get_event_loop()

            # 使用更快的参数配置，提高实时性
            def transcribe_task():
                logger.debug(f"线程池中开始识别，音频长度: {audio_duration:.2f}s")
                start_time = time.time()

                try:
                    # ⚡ 优化：对于300ms的短音频，降低VAD阈值，避免过滤掉有效语音
                    # 300ms音频太短，如果VAD阈值太高，可能会误判为静音
                    vad_threshold = 0.3 if audio_duration < 0.5 else 0.5  # 短音频使用更低阈值

                    segments, info = model.transcribe(
                        audio_array,
                        beam_size=1,  # 降低 beam_size 从 5 到 1，提高速度
                        language="zh",  # 中文
                        task="transcribe",
                        vad_filter=True,  # ⚡ 启用 VAD，过滤静音部分，提高识别准确率
                        vad_parameters={
                            "threshold": vad_threshold,  # ⚡ 动态VAD阈值：短音频使用更低阈值
                            "min_speech_duration_ms": 100,  # ⚡ 降低最小语音时长（100ms），适配300ms短音频
                            "max_speech_duration_s": float("inf"),  # 最大语音时长（秒）
                            "min_silence_duration_ms": 200,  # ⚡ 降低最小静音时长（200ms），更快响应
                        },
                        condition_on_previous_text=False,  # 不依赖前文，提高速度
                        # 添加更多优化参数
                        best_of=1,  # 只尝试一次，提高速度
                        temperature=0.0,  # 使用贪婪解码，最快
                    )

                    # 立即转换为列表（避免生成器延迟）
                    segments_list = list(segments)
                    transcribe_duration = time.time() - start_time
                    logger.debug(
                        f"识别完成，耗时: {transcribe_duration:.2f}s, 片段数: {len(segments_list)}"
                    )

                    return segments_list, info
                except Exception as e:
                    logger.error(f"线程池中识别异常: {e}", exc_info=True)
                    raise

            segments_list, info = await loop.run_in_executor(None, transcribe_task)

            # ⚡ 支持部分结果：实时返回部分结果，提高用户体验
            # 策略：如果只有一个片段且音频较短（<1秒），可能是部分结果
            # 多个片段、检测到语音结束、或音频较长（>=1秒），标记为最终结果
            audio_duration_seconds = audio_duration
            is_final = (
                len(segments_list) > 1  # 多个片段 = 最终结果
                or voice_ended  # 检测到语音结束 = 最终结果
                or audio_duration_seconds >= 1.0  # 音频较长（>=1秒）= 最终结果
            )

            # 收集所有片段文本
            texts = []
            segment_times = []  # 记录每个片段的时间范围
            for segment in segments_list:
                text = segment.text.strip()
                if text:
                    texts.append(text)
                    # 记录片段时间（相对于识别开始时间）
                    segment_times.append(
                        {
                            "start": segment.start,
                            "end": segment.end,
                        }
                    )

            result = " ".join(texts)
            if result:
                # 繁简转换（将繁体转为简体）
                result = convert_traditional_to_simplified(result)
                result_type = "最终结果" if is_final else "部分结果"
                logger.info(
                    f"✅ 识别结果 ({result_type}): {result} (音频长度: {audio_duration:.2f}s, 片段数: {len(segments_list)})"
                )

                # 返回结果和时间戳，以及是否为最终结果
                return {
                    "text": result,
                    "isFinal": is_final,
                    "segments": segment_times,  # 片段时间信息
                }
            else:
                logger.debug(f"识别结果为空 (音频长度: {audio_duration:.2f}s)")

            return None

        except Exception as e:
            logger.error(f"语音识别异常: {e}", exc_info=True)
            return ""

    async def flush(self) -> dict | None:
        """强制处理剩余数据"""
        if len(self.pcm_buffer) > 0:
            pcm_bytes = bytes(self.pcm_buffer)
            current_samples = len(pcm_bytes) // 2
            audio_duration = current_samples / self.sample_rate

            logger.debug(f"强制处理剩余数据: {current_samples} samples (约 {audio_duration:.2f}s)")
            audio_array = self._convert_pcm_to_numpy(pcm_bytes)

            if audio_array is not None and len(audio_array) > 0:
                result_dict = await self._transcribe(audio_array, voice_ended=True)
                if result_dict and result_dict.get("text"):
                    # ⚡ 使用累积样本数计算时间戳（与 try_process 一致）
                    relative_start_time = self.total_processed_samples / self.sample_rate
                    relative_end_time = (
                        self.total_processed_samples + current_samples
                    ) / self.sample_rate

                    # ⚡ 更新累积样本数
                    self.total_processed_samples += current_samples

                    # ⚡ 确保时间戳格式正确
                    final_start_time = max(0.0, float(relative_start_time))
                    final_end_time = max(final_start_time, float(relative_end_time))

                    return {
                        "text": result_dict.get("text", ""),
                        "isFinal": True,  # flush 总是返回最终结果
                        "startTime": final_start_time,
                        "endTime": final_end_time,
                    }
        return None


@router.websocket("/stream")
async def stream_transcription(websocket: WebSocket):
    """
    实时语音识别 WebSocket 端点（使用 Faster-Whisper）

    接收音频流（PCM Int16 格式），使用 Faster-Whisper 进行实时识别
    返回识别结果（JSON 格式）
    """
    await websocket.accept()
    logger.info("WebSocket 连接已建立（Faster-Whisper 优化版）")

    # 获取 Faster-Whisper 模型
    try:
        await get_whisper_model()
    except ImportError as e:
        error_msg = str(e)
        logger.error(f"Faster-Whisper 未安装: {error_msg}")
        await websocket.send_json(
            {
                "error": "Faster-Whisper 未安装，无法进行实时识别。请安装 Faster-Whisper 依赖。",
                "details": error_msg,
            }
        )
        await websocket.close()
        return

    # ⚡ 创建音频处理器（事件驱动的实时识别）
    # 极致实时优化：类似飞书/输入法的实时识别体验
    processor = PCMAudioProcessor(
        sample_rate=16000,
        chunk_duration=0.3,  # ⚡ 每 0.3 秒处理一次（极致实时性，延迟 < 200ms）
        overlap=0.1,  # ⚡ 0.1 秒重叠（100ms重叠，确保不丢失边界内容）
        min_samples=4800,  # ⚡ 最小 4800 样本（约 0.3 秒 @ 16kHz，极致实时）
    )

    try:
        while True:
            try:
                # 接收音频数据
                message = await websocket.receive()

                if "bytes" in message:
                    # 二进制音频数据（PCM Int16）
                    audio_data = message["bytes"]
                    processor.add_pcm_data(audio_data)

                    # ⚡ 尝试处理（如果满足条件）- 极致实时
                    result = await processor.try_process()

                    if result:
                        # ⚡ 立即发送识别结果（极致实时，支持部分结果）
                        # ⚡ 确保时间戳格式正确：startTime 和 endTime 必须是数字（秒）
                        start_time = result.get("startTime", 0)
                        end_time = result.get("endTime", 0)

                        # 验证时间戳格式
                        if not isinstance(start_time, int | float) or not isinstance(
                            end_time, int | float
                        ):
                            logger.warning(
                                f"时间戳格式错误: startTime={start_time}, endTime={end_time}，使用默认值"
                            )
                            start_time = 0
                            end_time = 0

                        # 确保 endTime >= startTime
                        if end_time < start_time:
                            logger.warning(
                                f"时间戳逻辑错误: endTime ({end_time}) < startTime ({start_time})，修正为 startTime"
                            )
                            end_time = start_time

                        await websocket.send_json(
                            {
                                "text": result.get("text", ""),
                                "isFinal": result.get("isFinal", True),  # 部分结果或最终结果
                                "startTime": float(start_time),  # ⚡ 确保是浮点数（秒）
                                "endTime": float(end_time),  # ⚡ 确保是浮点数（秒）
                                "segments": result.get("segments", []),  # 片段时间信息（可选）
                            }
                        )

                elif "text" in message:
                    # 文本消息（控制消息）
                    text_msg = message["text"]
                    if text_msg == "EOS":  # End of Stream
                        # 处理剩余的音频
                        final_result = await processor.flush()
                        if final_result:
                            await websocket.send_json(
                                {
                                    "text": final_result.get("text", ""),
                                    "isFinal": True,  # 最终结果
                                    "startTime": final_result.get("startTime", 0),
                                    "endTime": final_result.get("endTime", 0),
                                }
                            )
                        break

            except WebSocketDisconnect:
                logger.info("WebSocket 连接已断开")
                break
            except Exception as e:
                logger.error(f"WebSocket 处理错误: {e}", exc_info=True)
                await websocket.send_json(
                    {
                        "error": f"处理错误: {str(e)}",
                    }
                )
                break

    except asyncio.CancelledError:
        logger.info("WebSocket 任务被取消")
    except Exception as e:
        logger.error(f"WebSocket 连接错误: {e}", exc_info=True)
    finally:
        try:
            # 清理资源
            if websocket.client_state.name != "DISCONNECTED":
                await websocket.close()
        except Exception:
            pass
        logger.info("WebSocket 连接已关闭")
