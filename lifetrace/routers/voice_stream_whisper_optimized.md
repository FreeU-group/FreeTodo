# WhisperLiveKit 架构优化方案

## 核心优化点

### 1. **智能缓冲和增量处理**（参考 Simul-Whisper）
- ✅ 当前已有：300ms 处理块，100ms 重叠
- 🔄 优化：实现真正的增量处理，保持上下文窗口
- 🔄 优化：使用滑动窗口，避免重复处理相同数据

### 2. **更好的 VAD**（参考 Silero VAD）
- ✅ 当前已有：简单 RMS 检测
- 🔄 优化：使用更智能的 VAD（Silero VAD 或改进的 RMS）
- 🔄 优化：动态阈值调整

### 3. **流式策略优化**（参考 StreamingPolicy）
- ✅ 当前已有：StreamingPolicy 类
- 🔄 优化：更智能的部分结果提交
- 🔄 优化：上下文感知的结果合并

### 4. **性能优化**
- 🔄 优化：跳过明显静音（已实现）
- 🔄 优化：更短的超时时间（已优化到 1.0-2.0 秒）
- 🔄 优化：缓冲区溢出保护（已优化到 3 秒）

## 实现建议

### 增量处理上下文窗口
```python
class IncrementalContext:
    """增量处理上下文 - 保持语音上下文，避免切割"""
    def __init__(self, context_duration: float = 1.0):
        self.context_duration = context_duration
        self.context_buffer = deque()

    def add_audio(self, audio_array: np.ndarray):
        """添加音频到上下文缓冲区"""
        self.context_buffer.extend(audio_array)
        # 保持最多 context_duration 秒的上下文
        max_samples = int(self.context_duration * 16000)
        while len(self.context_buffer) > max_samples:
            self.context_buffer.popleft()

    def get_context(self, current_audio: np.ndarray) -> np.ndarray:
        """获取带上下文的音频（用于识别）"""
        context = np.array(list(self.context_buffer))
        return np.concatenate([context, current_audio]) if len(context) > 0 else current_audio
```

### 改进的 VAD
```python
class ImprovedVAD:
    """改进的 VAD - 参考 Silero VAD 思路"""
    def __init__(self):
        self.energy_threshold = 0.01
        self.zero_crossing_rate_threshold = 0.1
        self.silence_duration = 0.0

    def detect(self, audio: np.ndarray) -> bool:
        """多特征 VAD 检测"""
        # 1. 能量检测
        energy = np.mean(audio ** 2)
        if energy < self.energy_threshold:
            return False

        # 2. 过零率检测（语音通常有较高的过零率）
        zero_crossings = np.sum(np.diff(np.sign(audio)) != 0)
        zcr = zero_crossings / len(audio)
        if zcr < self.zero_crossing_rate_threshold:
            return False

        return True
```

### 智能结果合并
```python
class ResultMerger:
    """智能结果合并 - 避免重复和切割"""
    def __init__(self):
        self.last_result = ""
        self.partial_results = []

    def merge(self, new_text: str, is_final: bool) -> str:
        """合并新的识别结果"""
        if is_final:
            # 最终结果：清除部分结果，返回完整结果
            self.partial_results = []
            self.last_result = new_text
            return new_text
        else:
            # 部分结果：累积，返回增量部分
            if new_text.startswith(self.last_result):
                # 新结果是旧结果的扩展
                incremental = new_text[len(self.last_result):]
                self.partial_results.append(incremental)
                return self.last_result + "".join(self.partial_results)
            else:
                # 新结果与旧结果不同，可能是修正
                self.partial_results = [new_text]
                return new_text
```
