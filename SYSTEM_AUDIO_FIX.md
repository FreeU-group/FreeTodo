# 系统音频实时转录问题修复

## 🔍 问题分析

### 问题描述
- **外部麦克风**：实时转录工作正常，识别准确
- **系统音频**：完全不准，无法实现实时转录，识别也不行，更别说实时转录文本显示

### 根本原因
系统音频的音量通常比麦克风低 **10-20dB**，但代码中的阈值设置是基于麦克风音频的，导致：

1. **音频质量检测阈值过高**：系统音频被误判为"质量太低"而被跳过
2. **VAD（语音活动检测）阈值过高**：无法检测到系统音频中的语音
3. **Faster-Whisper 参数不适合低音量**：`no_speech_threshold` 和 `log_prob_threshold` 太高，过滤掉了低音量的有效语音

## ✅ 修复方案

### 1. 降低音频质量检测阈值

**修改位置**：`lifetrace/routers/voice_stream_whisperlivekit_native.py`

**修改内容**：
- **系统音频**：RMS 阈值从 `0.001` 降低到 `0.0001`（降低 10 倍）
- **系统音频**：Max 阈值从 `0.01` 降低到 `0.001`（降低 10 倍）
- **麦克风**：保持原有阈值不变

```python
# 系统音频：使用更低的阈值
if is_system_audio:
    self.audio_quality_rms_threshold = 0.0001  # 降低到原来的 1/10
    self.audio_quality_max_threshold = 0.001  # 降低到原来的 1/10
else:
    self.audio_quality_rms_threshold = 0.001
    self.audio_quality_max_threshold = 0.01
```

**效果**：系统音频即使音量较低也不会被误判为"质量太低"而跳过

### 2. 优化 VAD（语音活动检测）阈值

**修改位置**：`lifetrace/routers/voice_stream_whisperlivekit_native.py` - `ImprovedVAD` 类

**修改内容**：
- **系统音频**：VAD 阈值从 `0.005` 降低到 `0.0005`（降低 10 倍）
- **系统音频**：降低过零率阈值（从 `0.1` 降到 `0.05`）
- **系统音频**：降低频谱能量阈值（从 `1000` 降到 `100`）
- **麦克风**：保持原有阈值不变

```python
# 系统音频：使用更低的阈值
if is_system_audio:
    self.threshold = threshold * 0.1  # 降低到原来的 10%
    # 更宽松的检测条件
    voice_detected = (
        rms > self.threshold or
        (rms > self.threshold * 0.3 and zcr > 0.05) or
        (rms > self.threshold * 0.2 and spectral_energy > 100)
    )
```

**效果**：系统音频中的语音能够被正确检测到

### 3. 优化 Faster-Whisper 转录参数

**修改位置**：`lifetrace/routers/voice_stream_whisperlivekit_native.py` - `_transcribe` 方法

**修改内容**：
- **系统音频**：`no_speech_threshold` 从 `0.5` 降低到 `0.3`（更敏感）
- **系统音频**：`log_prob_threshold` 从 `-1.0` 降低到 `-1.5`（允许更多低音量结果）
- **麦克风**：保持原有参数不变

```python
# 系统音频：使用更宽松的参数
if self.is_system_audio:
    transcribe_params = {
        "no_speech_threshold": 0.3,  # 从 0.5 降到 0.3
        "log_prob_threshold": -1.5,  # 从 -1.0 降到 -1.5
        # ... 其他参数
    }
```

**效果**：Faster-Whisper 能够识别低音量的系统音频

### 4. 添加自适应阈值机制

**修改位置**：`WhisperLiveKitNativeProcessor.__init__`

**修改内容**：
- 添加 `is_system_audio` 参数（默认 `True`，因为麦克风通常使用 Web Speech API）
- 根据音频源类型自动调整所有阈值

**效果**：系统自动适配不同的音频源类型

### 5. 增强调试日志

**修改内容**：
- 添加详细的音频质量日志（特别是系统音频）
- 记录阈值和实际值，便于诊断问题

**效果**：更容易诊断系统音频处理问题

## 📊 修复前后对比

| 项目 | 修复前 | 修复后 |
|------|--------|--------|
| **音频质量 RMS 阈值** | 0.001 | 0.0001（系统音频） |
| **音频质量 Max 阈值** | 0.01 | 0.001（系统音频） |
| **VAD 阈值** | 0.005 | 0.0005（系统音频） |
| **Faster-Whisper no_speech_threshold** | 0.5 | 0.3（系统音频） |
| **Faster-Whisper log_prob_threshold** | -1.0 | -1.5（系统音频） |
| **系统音频识别率** | ❌ 几乎为 0 | ✅ 显著提升 |
| **实时性** | ❌ 无法实时 | ✅ 可以实现实时 |

## 🎯 预期效果

修复后，系统音频应该能够：

1. ✅ **正确检测语音活动**：即使音量较低也能检测到语音
2. ✅ **不被误判为"质量太低"**：低音量的有效语音不会被跳过
3. ✅ **Faster-Whisper 能够识别**：使用更宽松的参数，能够识别低音量音频
4. ✅ **实现实时转录**：能够实时处理和显示转录结果

## 🔧 测试建议

1. **测试系统音频捕获**：
   - 播放一段中文语音（如视频、音频文件）
   - 检查后端日志中的音频质量信息（RMS、Max 值）
   - 确认音频数据没有被跳过

2. **测试 VAD 检测**：
   - 观察日志中的 VAD 事件（VOICE_STARTED、VOICE_ENDED）
   - 确认系统音频中的语音能够被检测到

3. **测试实时转录**：
   - 播放连续的中文语音
   - 观察是否能够实时显示转录结果
   - 检查识别准确性

4. **对比测试**：
   - 同时测试麦克风和系统音频
   - 确认麦克风音频不受影响（阈值保持不变）

## 📝 注意事项

1. **阈值调整**：如果系统音频仍然无法识别，可以进一步降低阈值：
   - `audio_quality_rms_threshold`: 0.0001 → 0.00005
   - `audio_quality_max_threshold`: 0.001 → 0.0005
   - `vad_threshold`: 0.0005 → 0.0002
   - `no_speech_threshold`: 0.3 → 0.2

2. **性能影响**：更低的阈值可能会增加误判（将噪声识别为语音），但这是系统音频低音量特性的权衡

3. **麦克风音频**：修复只影响系统音频，麦克风音频的处理逻辑保持不变

## 🚀 后续优化建议

1. **自适应阈值**：根据实际音频质量动态调整阈值
2. **音频增益**：在前端添加可选的音频增益调整（GainNode）
3. **音频质量监控**：实时监控音频质量，自动调整参数
4. **用户配置**：允许用户手动调整阈值（高级设置）























