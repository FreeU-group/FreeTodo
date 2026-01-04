"""实时语音识别 WebSocket 路由 - 直接实现 WhisperLiveKit 核心技术

不依赖独立的 WhisperLiveKit 服务器，直接使用 Faster-Whisper + WhisperLiveKit 算法
实现超低延迟实时转录（< 300ms）
"""

import asyncio
import json
from typing import Optional, Dict, Any, List
from collections import deque
import time
import numpy as np

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from lifetrace.util.logging_config import get_logger
from lifetrace.util.settings import settings

logger = get_logger()

router = APIRouter(prefix="/api/voice", tags=["voice-stream-whisperlivekit-native"])


def convert_traditional_to_simplified(text: str) -> str:
    """将繁体中文转换为简体中文"""
    try:
        import opencc
        converter = opencc.OpenCC('t2s')
        return converter.convert(text)
    except ImportError:
        return text


class IncrementalContext:
    """增量处理上下文 - 保持语音上下文，避免切割（参考 WhisperLiveKit）
    
    核心思想：保持一个滑动窗口的上下文，每次处理时包含前面的上下文，
    这样可以避免在词中间切割，保持语义连贯性。
    """
    
    def __init__(self, context_duration: float = 1.0, sample_rate: int = 16000):
        self.context_duration = context_duration
        self.sample_rate = sample_rate
        self.max_context_samples = int(context_duration * sample_rate)
        self.context_buffer = deque(maxlen=self.max_context_samples)
        logger.debug(f"增量上下文初始化: context_duration={context_duration}s, max_samples={self.max_context_samples}")
    
    def add_audio(self, audio_array: np.ndarray):
        """添加音频到上下文缓冲区"""
        self.context_buffer.extend(audio_array)
    
    def get_context_audio(self, current_audio: np.ndarray) -> np.ndarray:
        """获取带上下文的音频（用于识别）"""
        context = np.array(list(self.context_buffer))
        if len(context) > 0:
            # 拼接上下文和当前音频
            combined = np.concatenate([context, current_audio])
            # 更新上下文（保留部分当前音频作为下次的上下文）
            overlap_samples = min(len(current_audio), self.max_context_samples // 2)
            self.context_buffer.clear()
            self.context_buffer.extend(current_audio[-overlap_samples:])
            return combined
        else:
            # 没有上下文，直接使用当前音频
            overlap_samples = min(len(current_audio), self.max_context_samples // 2)
            self.context_buffer.extend(current_audio[-overlap_samples:])
            return current_audio


class ImprovedVAD:
    """改进的 VAD（参考 WhisperLiveKit 的 Silero VAD）
    
    使用多特征检测：
    - RMS（均方根）
    - 过零率（Zero Crossing Rate）
    - 频谱能量
    
    ⚡ 针对系统音频优化：系统音频音量通常比麦克风低很多，需要更敏感的检测
    """
    
    def __init__(self, threshold: float = 0.01, min_silence_duration: float = 0.3, is_system_audio: bool = False):
        # ⚡ 系统音频使用更低的阈值（音量通常比麦克风低 10-20dB）
        if is_system_audio:
            self.threshold = threshold * 0.1  # 降低到原来的 10%
            logger.info(f"🎯 系统音频模式：VAD 阈值降低到 {self.threshold:.6f}（原阈值：{threshold:.6f}）")
        else:
            self.threshold = threshold
        self.min_silence_duration = min_silence_duration
        self.voice_started = False
        self.silence_duration = 0.0
        self.sample_rate = 16000
        self.is_system_audio = is_system_audio
    
    def detect(self, audio_array: np.ndarray) -> Optional[str]:
        """检测语音事件
        
        Returns:
            "VOICE_STARTED": 语音开始
            "VOICE_ENDED": 语音结束
            None: 无事件
        """
        has_voice = self._detect_voice(audio_array)
        duration = len(audio_array) / self.sample_rate
        
        if has_voice:
            if not self.voice_started:
                self.voice_started = True
                self.silence_duration = 0.0
                return "VOICE_STARTED"
            self.silence_duration = 0.0
        else:
            if self.voice_started:
                self.silence_duration += duration
                if self.silence_duration >= self.min_silence_duration:
                    self.voice_started = False
                    self.silence_duration = 0.0
                    return "VOICE_ENDED"
        
        return None
    
    def _detect_voice(self, audio_array: np.ndarray) -> bool:
        """多特征语音检测"""
        if len(audio_array) == 0:
            return False
        
        # 特征1: RMS（均方根）
        rms = np.sqrt(np.mean(audio_array ** 2))
        
        # 特征2: 过零率（Zero Crossing Rate）
        zcr = np.mean(np.abs(np.diff(np.sign(audio_array)))) / 2.0
        
        # 特征3: 频谱能量（简单版本：高频能量）
        fft = np.fft.rfft(audio_array)
        spectral_energy = np.sum(np.abs(fft) ** 2)
        
        # ⚡ 系统音频优化：使用更宽松的检测条件
        if self.is_system_audio:
            # 系统音频：降低所有阈值，提高灵敏度
            zcr_threshold = 0.05  # 降低过零率阈值
            spectral_threshold = 100  # 降低频谱能量阈值（从 1000 降到 100）
            
            # 综合判断：更宽松的条件
            voice_detected = (
                rms > self.threshold or
                (rms > self.threshold * 0.3 and zcr > zcr_threshold) or  # 降低 RMS 要求
                (rms > self.threshold * 0.2 and spectral_energy > spectral_threshold)  # 进一步降低要求
            )
        else:
            # 麦克风音频：使用原有逻辑
            voice_detected = (
                rms > self.threshold or
                (rms > self.threshold * 0.5 and zcr > 0.1 and spectral_energy > 1000)
            )
        
        return voice_detected
    
    def has_silence(self) -> bool:
        """当前是否有静音"""
        return self.silence_duration >= self.min_silence_duration


class StreamingPolicy:
    """流式策略（参考 WhisperLiveKit 的智能提交策略）
    
    决定何时提交部分结果，何时提交最终结果
    """
    
    def __init__(
        self,
        min_chunk_duration: float = 0.3,
        max_chunk_duration: float = 2.0,
        silence_threshold: float = 0.5,
    ):
        self.min_chunk_duration = min_chunk_duration
        self.max_chunk_duration = max_chunk_duration
        self.silence_threshold = silence_threshold
    
    def should_commit(
        self,
        audio_duration: float,
        has_silence: bool,
        text_length: int = 0,
        is_voice_ended: bool = False,
    ) -> tuple[bool, bool]:
        """
        判断是否应该提交结果（参考 WhisperLiveKit 的智能策略）
        
        ⚡ 参考 WhisperLiveKit 的流式策略：
        - 支持部分结果（isFinal=False）：实时更新，提升用户体验
        - 支持最终结果（isFinal=True）：语句结束时提交，确保准确性
        
        Returns:
            (should_commit, is_final): 是否提交，是否为最终结果
        """
        # 策略1: 检测到语音结束 + 有文本 → 提交最终结果
        if is_voice_ended and text_length >= 1:
            return True, True
        
        # 策略2: 有静音 + 有文本 + 音频时长足够 → 提交最终结果（语句结束）
        if has_silence and text_length >= 1 and audio_duration >= self.min_chunk_duration:
            return True, True
        
        # 策略3: 短句（<1秒）+ 有文本 + 有静音 → 可能是完整短句
        if audio_duration < 1.0 and text_length >= 1 and has_silence:
            return True, True
        
        # 策略4: 长句（>=0.3秒）+ 有文本 → 提交部分结果（实时更新）
        # ⚡ 参考 WhisperLiveKit：即使没有静音，也提交部分结果，实现实时更新
        # ⚡ 关键修复：降低阈值，确保更多结果被提交（实时性优先）
        if audio_duration >= self.min_chunk_duration and text_length >= 1:
            # 如果音频时长超过最大时长，强制提交最终结果
            if audio_duration >= self.max_chunk_duration:
                return True, True
            # ⚡ 关键修复：只要有文本就提交部分结果，不等待静音
            # 这样可以实现真正的实时更新（< 300ms 延迟）
            return True, False
        
        # 策略5: 文本太短 → 不提交（可能是噪声或未完成的词）
        if text_length < 1:
            return False, False
        
        return False, False


class WhisperLiveKitNativeProcessor:
    """WhisperLiveKit 原生处理器 - 直接实现核心技术
    
    不依赖独立服务器，直接使用 Faster-Whisper + WhisperLiveKit 算法
    """
    
    def __init__(
        self,
        sample_rate: int = 16000,
        chunk_duration: float = 0.3,  # 300ms 处理块（超低延迟）
        overlap: float = 0.1,  # 100ms 重叠
        min_samples: int = 4800,  # 最小 0.3 秒
        context_duration: float = 1.0,  # 上下文窗口 1 秒
        is_system_audio: bool = True,  # ⚡ 默认假设是系统音频（因为麦克风通常用 Web Speech API）
    ):
        self.sample_rate = sample_rate
        self.chunk_duration = chunk_duration
        self.overlap = overlap
        self.min_samples = min_samples
        self.is_system_audio = is_system_audio
        
        # 音频缓冲区
        max_buffer_samples = int(sample_rate * 10.0)  # 最多 10 秒
        max_buffer_size = max_buffer_samples * 2  # Int16 = 2 bytes
        self.pcm_buffer = deque(maxlen=max_buffer_size)
        
        # 增量上下文（参考 WhisperLiveKit）
        self.incremental_context = IncrementalContext(
            context_duration=context_duration,
            sample_rate=sample_rate,
        )
        
        # ⚡ 改进的 VAD（系统音频需要更低的阈值）
        # 参考 WhisperLiveKit：系统音频音量通常比麦克风低 10-20dB，需要更敏感的检测
        # 系统音频：阈值降低到 0.0005（原来的 1/10）
        # 麦克风：使用 0.005（原来的值）
        vad_threshold = 0.0005 if is_system_audio else 0.005
        self.vad = ImprovedVAD(
            threshold=vad_threshold,
            min_silence_duration=0.5,
            is_system_audio=is_system_audio
        )
        
        # ⚡ 音频质量检测阈值（系统音频需要更低的阈值）
        # 系统音频音量通常比麦克风低很多，需要更宽松的质量检测
        if is_system_audio:
            self.audio_quality_rms_threshold = 0.0001  # 降低到原来的 1/10
            self.audio_quality_max_threshold = 0.001  # 降低到原来的 1/10
            logger.info(f"🎯 系统音频模式：音频质量检测阈值降低（RMS: {self.audio_quality_rms_threshold:.6f}, Max: {self.audio_quality_max_threshold:.6f}）")
        else:
            self.audio_quality_rms_threshold = 0.001
            self.audio_quality_max_threshold = 0.01
        
        # 流式策略
        self.streaming_policy = StreamingPolicy(
            min_chunk_duration=chunk_duration,
            max_chunk_duration=2.0,
            silence_threshold=0.5,
        )
        
        # 处理状态
        self.is_processing = False
        self.last_process_time = time.time()
        self.voice_activity_detected = False
        self.voice_ended_detected = False
        self.total_processed_samples = 0
        self.recognition_start_time = None
        
        logger.info(f"✅ WhisperLiveKit 原生处理器初始化: chunk={chunk_duration}s, overlap={overlap}s, context={context_duration}s")
    
    def add_pcm_data(self, data: bytes):
        """接收 PCM 数据（Int16）并添加到缓冲区"""
        self.pcm_buffer.extend(data)
        
        # 转换为 numpy 进行 VAD 检测
        if len(data) >= 2:
            audio_int16 = np.frombuffer(data, dtype=np.int16)
            audio_float = audio_int16.astype(np.float32) / 32768.0
            
            # VAD 事件检测
            vad_event = self.vad.detect(audio_float)
            if vad_event:
                logger.debug(f"🎤 VAD 事件: {vad_event}")
                if vad_event == "VOICE_STARTED":
                    self.voice_activity_detected = True
                elif vad_event == "VOICE_ENDED":
                    self.voice_ended_detected = True
    
    async def try_process(self, model) -> Optional[dict]:
        """尝试处理音频数据 - WhisperLiveKit 核心算法
        
        ⚡ 关键优化：确保实时处理，不等待
        - 每次收到数据后立即检查是否可以处理
        - 即使没有 VAD 事件，也按时间触发（300ms）
        - 避免处理阻塞导致数据积压
        """
        current_samples = len(self.pcm_buffer) // 2
        current_time = time.time()
        time_since_last = current_time - self.last_process_time
        
        # 初始化识别开始时间
        if self.recognition_start_time is None:
            self.recognition_start_time = current_time
        
        # ⚡ 关键修复：降低最小样本数要求，确保更快响应
        # 从 0.3秒（4800 samples）降低到 0.1秒（1600 samples）
        min_samples_for_processing = max(1600, self.min_samples // 3)  # 至少 0.1秒
        
        # 检查处理条件
        has_enough_data = current_samples >= min_samples_for_processing
        event_triggered = self.voice_ended_detected or self.voice_activity_detected
        time_triggered = time_since_last >= self.chunk_duration
        buffer_overflow = current_samples > int(self.sample_rate * 2.0)  # 2秒溢出保护（降低阈值）
        
        # ⚡ 参考 WhisperLiveKit：即使没有 VAD 事件，也按时间触发处理
        # 这样可以确保系统音频（可能音量较低）也能被处理
        should_process = has_enough_data and (event_triggered or time_triggered or buffer_overflow)
        
        # ⚡ 调试日志：记录处理条件
        if should_process and not self.is_processing:
            logger.debug(f"🎯 触发处理: samples={current_samples}, time_since_last={time_since_last:.3f}s, event={event_triggered}, time={time_triggered}, overflow={buffer_overflow}")
        
        if not should_process:
            return None
        
        # ⚡ 关键修复：如果正在处理，但缓冲区溢出或时间触发，允许并行处理
        # 这样可以避免处理速度慢导致的数据积压
        if self.is_processing and not (buffer_overflow or time_triggered):
            return None
        
        # 重置事件标志
        self.voice_activity_detected = False
        self.voice_ended_detected = False
        
        self.is_processing = True
        process_start_time = time.time()
        
        try:
            # 提取要处理的数据（chunk_duration 长度）
            target_samples = int(self.sample_rate * self.chunk_duration)
            process_samples = min(target_samples, current_samples)
            process_bytes = process_samples * 2
            
            pcm_bytes = bytes(list(self.pcm_buffer)[:process_bytes])
            
            if len(pcm_bytes) % 2 != 0:
                pcm_bytes = pcm_bytes[:-1]
                process_bytes = len(pcm_bytes)
                process_samples = process_bytes // 2
            
            # 转换为 numpy
            audio_int16 = np.frombuffer(pcm_bytes, dtype=np.int16)
            audio_float = audio_int16.astype(np.float32) / 32768.0
            
            # ⚡ 调试：检查音频数据质量
            audio_rms = np.sqrt(np.mean(audio_float ** 2))
            audio_max = np.max(np.abs(audio_float))
            
            # ⚡ 关键优化：如果音频质量太低，跳过处理
            # ⚡ 系统音频优化：使用更低的阈值（系统音频音量通常比麦克风低 10-20dB）
            # 对于系统音频，即使 RMS 很低也可能包含有效语音，所以阈值要更低
            if audio_rms < self.audio_quality_rms_threshold or audio_max < self.audio_quality_max_threshold:
                # ⚡ 系统音频：即使质量较低也记录日志，但不一定跳过（可能包含有效语音）
                if self.is_system_audio:
                    logger.debug(f"⚠️ 系统音频质量较低（但可能包含有效语音）: rms={audio_rms:.6f}, max={audio_max:.6f}, 阈值: rms>{self.audio_quality_rms_threshold:.6f}, max>{self.audio_quality_max_threshold:.6f}")
                    # ⚡ 系统音频：即使质量低也尝试处理（可能包含有效语音，只是音量低）
                    # 但如果实在太低（RMS < 0.00001），则跳过（可能是完全静音）
                    if audio_rms < 0.00001 and audio_max < 0.0001:
                        logger.debug(f"⚠️ 系统音频完全静音，跳过处理: rms={audio_rms:.9f}, max={audio_max:.9f}")
                        samples_to_remove = min(process_samples // 2, len(self.pcm_buffer) // 2)
                        bytes_to_remove = samples_to_remove * 2
                        for _ in range(bytes_to_remove):
                            if self.pcm_buffer:
                                self.pcm_buffer.popleft()
                        return None
                    # 否则继续处理（即使质量较低）
                else:
                    # 麦克风：使用原有逻辑
                    logger.debug(f"⚠️ 音频质量太低，跳过处理: rms={audio_rms:.6f}, max={audio_max:.6f}")
                    samples_to_remove = min(process_samples // 2, len(self.pcm_buffer) // 2)
                    bytes_to_remove = samples_to_remove * 2
                    for _ in range(bytes_to_remove):
                        if self.pcm_buffer:
                            self.pcm_buffer.popleft()
                    return None
            
            # ⚡ 详细日志：记录音频质量（特别是系统音频）
            if self.is_system_audio:
                logger.debug(f"📊 系统音频数据: samples={len(audio_float)}, rms={audio_rms:.6f}, max={audio_max:.6f}, 阈值: rms>{self.audio_quality_rms_threshold:.6f}, max>{self.audio_quality_max_threshold:.6f}")
            else:
                logger.debug(f"📊 音频数据: samples={len(audio_float)}, rms={audio_rms:.6f}, max={audio_max:.6f}")
            
            # 使用增量上下文（参考 WhisperLiveKit）
            audio_with_context = self.incremental_context.get_context_audio(audio_float)
            
            # 移除已处理的数据（保留重叠部分）
            overlap_samples = int(self.sample_rate * self.overlap)
            samples_to_remove = max(0, process_samples - overlap_samples)
            bytes_to_remove = samples_to_remove * 2
            
            for _ in range(bytes_to_remove):
                if self.pcm_buffer:
                    self.pcm_buffer.popleft()
            
            # 识别
            # ⚡ 参考 WhisperLiveKit：时间戳基于实际处理的音频块（不包含上下文）
            # 上下文只是用于提高识别准确性，不影响时间戳
            actual_audio_duration = len(audio_float) / self.sample_rate  # 实际处理的音频时长
            result = await self._transcribe(model, audio_with_context, self.voice_ended_detected)
            
            if result:
                # ⚡ 参考 WhisperLiveKit：计算精确的时间戳
                # 基于实际处理的音频块长度，而不是包含上下文的长度
                relative_time = time.time() - self.recognition_start_time
                # start_time 应该是当前时间减去实际处理的音频时长
                start_time = max(0.0, relative_time - actual_audio_duration)
                end_time = relative_time
                
                result['startTime'] = start_time
                result['endTime'] = end_time
                
                self.total_processed_samples += process_samples
                self.last_process_time = process_start_time
            
            return result
            
        except Exception as e:
            logger.error(f"处理音频失败: {e}", exc_info=True)
            return None
        finally:
            self.is_processing = False
    
    async def _transcribe(self, model, audio_array: np.ndarray, voice_ended: bool = False) -> Optional[dict]:
        """使用 Faster-Whisper 进行转录（参考 WhisperLiveKit 参数）
        
        ⚡ 系统音频优化：针对低音量特性调整参数
        """
        try:
            loop = asyncio.get_event_loop()
            
            def transcribe_task():
                # ⚡ 参考 WhisperLiveKit：使用我们自己的 VAD，禁用 Faster-Whisper 的 VAD
                # 因为系统音频的音量可能较低，Faster-Whisper 的 VAD 阈值太高会过滤掉所有音频
                # 我们已经在 add_pcm_data 中做了 VAD 检测，这里直接转录
                
                # ⚡ 系统音频优化：使用更宽松的参数，适配低音量特性
                if self.is_system_audio:
                    # 系统音频：更宽松的阈值，提高识别灵敏度
                    transcribe_params = {
                        "beam_size": 5,  # 提高 beam_size 提升准确性
                        "language": "zh",
                        "task": "transcribe",
                        "vad_filter": False,  # ⚡ 禁用 Faster-Whisper 的 VAD，使用我们自己的 ImprovedVAD
                        "condition_on_previous_text": True,  # ⚡ 启用上下文条件，提升准确性
                        "best_of": 5,  # ⚡ 提高 best_of 提升准确性
                        "temperature": 0.0,  # ⚡ 使用确定性解码，提升准确性
                        "compression_ratio_threshold": 2.4,  # ⚡ 压缩比阈值，过滤重复文本
                        "log_prob_threshold": -1.5,  # ⚡ 系统音频：降低阈值（从 -1.0 降到 -1.5），允许更多低音量结果
                        "no_speech_threshold": 0.3,  # ⚡ 系统音频：大幅降低无语音阈值（从 0.5 降到 0.3），更敏感
                        "initial_prompt": "这是一段中文语音转录。",  # ⚡ 添加初始提示，提升中文识别准确性
                    }
                    logger.debug(f"🎯 系统音频模式：使用优化的转录参数（no_speech_threshold=0.3, log_prob_threshold=-1.5）")
                else:
                    # 麦克风：使用原有参数
                    transcribe_params = {
                        "beam_size": 5,
                        "language": "zh",
                        "task": "transcribe",
                        "vad_filter": False,
                        "condition_on_previous_text": True,
                        "best_of": 5,
                        "temperature": 0.0,
                        "compression_ratio_threshold": 2.4,
                        "log_prob_threshold": -1.0,
                        "no_speech_threshold": 0.5,
                        "initial_prompt": "这是一段中文语音转录。",
                    }
                
                segments, info = model.transcribe(audio_array, **transcribe_params)
                return list(segments), info
            
            segments_list, info = await loop.run_in_executor(None, transcribe_task)
            
            if not segments_list:
                return None
            
            # ⚡ 关键修复：合并所有片段，并过滤重复文本
            text = "".join(seg.text for seg in segments_list)
            text = convert_traditional_to_simplified(text.strip())
            
            # ⚡ 过滤重复文本（中文按字符检查，英文按词检查）
            if len(text) > 0:
                # 检查是否有重复模式（如"认认认认..."或"快快快快..."）
                # 中文：检查连续重复的字符
                chars = list(text)
                if len(chars) > 3:
                    repeat_count = 0
                    max_repeat = 0
                    for i in range(1, len(chars)):
                        if chars[i] == chars[i-1]:
                            repeat_count += 1
                            max_repeat = max(max_repeat, repeat_count)
                        else:
                            repeat_count = 0
                    
                    # ⚡ 如果连续重复超过3个字符，认为是错误识别
                    if max_repeat >= 3:
                        logger.warning(f"检测到重复文本，可能识别错误: {text[:50]}...")
                        return None  # 过滤掉重复文本
                    
                    # ⚡ 额外检查：如果整个文本都是同一个字符，过滤掉
                    if len(set(chars)) == 1 and len(chars) > 2:
                        logger.warning(f"检测到单一字符重复，可能识别错误: {text[:50]}...")
                        return None
            
            if not text:
                return None
            
            # 使用流式策略决定是否提交
            audio_duration = len(audio_array) / self.sample_rate
            has_silence = self.vad.has_silence()
            should_commit, is_final = self.streaming_policy.should_commit(
                audio_duration=audio_duration,
                has_silence=has_silence,
                text_length=len(text),
                is_voice_ended=voice_ended,
            )
            
            # ⚡ 关键修复：如果流式策略拒绝提交，但文本长度足够，强制提交部分结果
            # 这样可以确保实时性，不丢失识别结果
            if not should_commit:
                # 如果文本长度 >= 1，强制提交部分结果（实时性优先）
                if len(text) >= 1 and audio_duration >= 0.1:  # 至少 0.1秒
                    should_commit = True
                    is_final = False
                else:
                    return None
            
            return {
                'text': text,
                'isFinal': is_final,
            }
            
        except Exception as e:
            logger.error(f"转录失败: {e}", exc_info=True)
            return None
    
    async def flush(self, model) -> Optional[dict]:
        """刷新剩余数据"""
        if len(self.pcm_buffer) >= self.min_samples:
            # 处理剩余数据
            pcm_bytes = bytes(self.pcm_buffer)
            if len(pcm_bytes) >= 2:
                audio_int16 = np.frombuffer(pcm_bytes, dtype=np.int16)
                audio_float = audio_int16.astype(np.float32) / 32768.0
                audio_with_context = self.incremental_context.get_context_audio(audio_float)
                
                result = await self._transcribe(model, audio_with_context, voice_ended=True)
                if result:
                    result['isFinal'] = True
                return result
        return None


@router.websocket("/stream")
async def stream_transcription_native(websocket: WebSocket):
    """
    实时语音识别 WebSocket 端点 - 直接实现 WhisperLiveKit 核心技术
    
    不依赖独立服务器，直接使用 Faster-Whisper + WhisperLiveKit 算法
    实现超低延迟实时转录（< 300ms）
    
    参考 WhisperLiveKit 实现：
    - 支持 keepalive ping/pong 机制，防止连接超时
    - 实时处理音频流，支持部分结果
    - 事件驱动的 VAD 和智能流式策略
    """
    await websocket.accept()
    logger.info("WebSocket 连接已建立（WhisperLiveKit 原生实现）")
    
    # 获取 Faster-Whisper 模型
    try:
        from lifetrace.routers.voice_stream_whisper import get_whisper_model
        model = await get_whisper_model()
    except ImportError as e:
        error_msg = str(e)
        logger.error(f"Faster-Whisper 未安装: {error_msg}")
        await websocket.send_json({
            "error": "Faster-Whisper 未安装，无法进行实时识别",
            "details": error_msg,
        })
        await websocket.close()
        return
    
    # 创建 WhisperLiveKit 原生处理器
    # ⚡ 关键优化：增加 chunk_duration 提升识别准确性
    # 从 0.3秒 增加到 0.6秒，提供更多上下文，提升识别准确性
    # ⚡ 系统音频优化：默认假设是系统音频（因为麦克风通常使用 Web Speech API）
    processor = WhisperLiveKitNativeProcessor(
        sample_rate=16000,
        chunk_duration=0.6,  # 600ms（平衡延迟和准确性）
        overlap=0.2,  # 200ms 重叠（增加重叠，确保不丢失边界）
        min_samples=4800,  # 0.3 秒（最小处理块）
        context_duration=2.0,  # 2 秒上下文（增加上下文，提升准确性）
        is_system_audio=True,  # ⚡ 默认假设是系统音频（优化低音量处理）
    )
    
    # ⚡ 参考 WhisperLiveKit：添加 keepalive ping 任务
    # 每 20 秒发送一次 ping，防止连接超时（降低间隔，更频繁检查）
    keepalive_interval = 20.0  # 20 秒（降低间隔，更频繁检查）
    last_ping_time = time.time()
    last_pong_time = time.time()  # ⚡ 添加：记录最后一次收到 pong 的时间
    ping_task = None
    
    async def send_keepalive_ping():
        """发送 keepalive ping"""
        nonlocal last_ping_time, last_pong_time  # ⚡ 修复：使用 nonlocal 访问外部变量
        while True:
            try:
                await asyncio.sleep(keepalive_interval)
                
                # ⚡ 检查：如果超过 60 秒没有收到 pong，认为连接已断开
                if time.time() - last_pong_time > 60.0:
                    logger.warning("超过 60 秒未收到 pong，连接可能已断开")
                    break
                
                if websocket.client_state.name == 'CONNECTED':
                    # 发送 ping（使用 JSON 格式，便于前端处理）
                    await websocket.send_json({"type": "ping", "timestamp": time.time()})
                    last_ping_time = time.time()
                    logger.debug(f"📤 发送 keepalive ping (等待 pong，上次 pong: {time.time() - last_pong_time:.1f}秒前)")
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning(f"发送 keepalive ping 失败: {e}")
                break
    
    # 启动 keepalive 任务
    ping_task = asyncio.create_task(send_keepalive_ping())
    
    try:
        while True:
            try:
                # ⚡ 参考 WhisperLiveKit：使用 timeout 避免阻塞
                # 如果 30 秒内没有收到消息，检查连接状态（降低超时时间）
                try:
                    message = await asyncio.wait_for(websocket.receive(), timeout=30.0)
                except asyncio.TimeoutError:
                    # ⚡ 超时检查：如果长时间没有数据，检查连接状态
                    # 注意：last_pong_time 在外部作用域，可以直接访问
                    time_since_last_pong = time.time() - last_pong_time
                    if time_since_last_pong > 60.0:
                        logger.warning(f"超过 60 秒未收到 pong ({time_since_last_pong:.1f}秒)，连接可能已断开")
                        break
                    # 如果超时但没有数据，继续等待（keepalive ping 任务会处理）
                    continue
                
                if "bytes" in message:
                    # ⚡ 参考 WhisperLiveKit：接收二进制音频数据（PCM Int16, 16kHz, 单声道）
                    audio_data = message["bytes"]
                    processor.add_pcm_data(audio_data)
                    
                    # ⚡ 关键修复：每次收到数据后立即尝试处理（事件驱动）
                    # 不等待时间条件，立即检查是否可以处理
                    # 这样可以实现真正的实时处理（< 300ms 延迟）
                    result = await processor.try_process(model)
                    
                    if result:
                        # ⚡ 参考 WhisperLiveKit：支持部分结果和最终结果
                        # 部分结果（isFinal=False）：实时更新，提升用户体验
                        # 最终结果（isFinal=True）：语句结束，确保准确性
                        await websocket.send_json({
                            "text": result.get('text', ''),
                            "isFinal": result.get('isFinal', False),
                            "startTime": result.get('startTime', 0),
                            "endTime": result.get('endTime', 0),
                        })
                        logger.info(f"✅ 发送识别结果: text={result.get('text', '')[:50]}..., isFinal={result.get('isFinal', False)}, startTime={result.get('startTime', 0):.2f}s")
                
                elif "text" in message:
                    text_msg = message["text"]
                    
                    # ⚡ 处理 keepalive pong
                    if text_msg == "pong":
                        # ⚡ 修复：更新 pong 时间（在外部作用域，可以直接访问）
                        last_pong_time = time.time()
                        logger.debug(f"📥 收到 keepalive pong (距离上次 ping: {time.time() - last_ping_time:.1f}秒)")
                        continue
                    
                    if text_msg == "EOS":  # End of Stream
                        # 处理剩余数据
                        final_result = await processor.flush(model)
                        if final_result:
                            await websocket.send_json({
                                "text": final_result.get('text', ''),
                                "isFinal": True,
                                "startTime": final_result.get('startTime', 0),
                                "endTime": final_result.get('endTime', 0),
                            })
                        break
                
            except WebSocketDisconnect:
                logger.info("WebSocket 连接已断开")
                break
            except Exception as e:
                logger.error(f"WebSocket 处理错误: {e}", exc_info=True)
                try:
                    await websocket.send_json({
                        "error": f"处理错误: {str(e)}",
                    })
                except Exception:
                    pass
                break
    
    except asyncio.CancelledError:
        logger.info("WebSocket 任务被取消")
    except Exception as e:
        logger.error(f"WebSocket 连接错误: {e}", exc_info=True)
    finally:
        # 取消 keepalive 任务
        if ping_task:
            ping_task.cancel()
            try:
                await ping_task
            except asyncio.CancelledError:
                pass
        
        try:
            if websocket.client_state.name != 'DISCONNECTED':
                await websocket.close()
        except Exception:
            pass
        logger.info("WebSocket 连接已关闭")

