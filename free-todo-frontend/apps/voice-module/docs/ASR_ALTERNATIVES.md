# 语音识别替代方案（FunASR 替代）

## ⭐ 当前推荐：Faster-Whisper

**已实现 Faster-Whisper 支持！**

### 优点
- ✅ **完全免费开源**
- ✅ **安装简单**：`uv pip install faster-whisper`（不需要 Visual C++ 构建工具）
- ✅ **识别准确率极高**（接近人类水平）
- ✅ **速度优化**：比原版 Whisper 快 4-5 倍
- ✅ **支持实时流式识别**
- ✅ **支持中文**（原生支持）
- ✅ **支持 CPU 和 GPU**

### 安装
```bash
uv pip install faster-whisper
```

### 模型选择
- **tiny**：最快，准确率较低（适合测试）
- **base**：推荐，平衡速度和准确率（默认）
- **small**：更准确，稍慢
- **medium**：高准确率，较慢
- **large**：最高准确率，最慢

首次运行会自动下载模型（约 1.5GB for base）。

---

## 方案对比

### ⭐⭐⭐⭐⭐ 方案 1：Faster-Whisper（当前实现）✅

**优点**：
- ✅ **完全免费开源**
- ✅ **安装简单**（不需要 Visual C++ 构建工具）
- ✅ **识别准确率极高**（接近人类水平）
- ✅ **速度优化**（比原版 Whisper 快 4-5 倍）
- ✅ **支持实时流式识别**
- ✅ **支持中文**（原生支持）

**缺点**：
- ⚠️ 模型体积较大（base 约 1.5GB，首次下载）
- ⚠️ CPU 模式下实时性略低于 FunASR（但可接受）

**安装**：
```bash
uv pip install faster-whisper
```

**推荐度**：⭐⭐⭐⭐⭐ **已实现！**

---

### ⭐⭐⭐⭐ 方案 2：Vosk

**优点**：
- ✅ **完全免费开源**
- ✅ **不需要编译 C++**（纯 Python，安装简单）
- ✅ **支持中文**（有中文模型）
- ✅ **支持实时流式识别**
- ✅ **模型体积小**（约 50MB）
- ✅ **识别准确率高**（约 92%）
- ✅ **支持离线运行**（数据隐私保护）

**缺点**：
- ⚠️ 需要下载模型文件（首次使用）
- ⚠️ 实时性略低于 FunASR（但可接受）

**安装**：
```bash
# 非常简单，不需要 Visual C++ 构建工具
uv pip install vosk
```

**使用**：
```python
import vosk
import json

# 加载模型（只需一次）
model = vosk.Model("model-path")
rec = vosk.KaldiRecognizer(model, 16000)

# 实时识别
rec.AcceptWaveform(audio_data)
result = json.loads(rec.Result())
```

**推荐度**：⭐⭐⭐⭐⭐ **最推荐！**

---

### ⭐⭐⭐⭐ 方案 2：Whisper（OpenAI 开源）

**优点**：
- ✅ **完全免费开源**
- ✅ **识别准确率极高**（接近人类水平）
- ✅ **支持多语言**
- ✅ **不需要 API Key**

**缺点**：
- ❌ **延迟较高**（不适合实时识别，更适合离线转录）
- ❌ **模型体积大**（几百 MB 到几 GB）
- ❌ **需要 GPU 才能快速运行**（CPU 较慢）

**安装**：
```bash
uv pip install openai-whisper
```

**适用场景**：
- ✅ 离线批量转录
- ❌ 不适合实时识别

**推荐度**：⭐⭐⭐⭐（适合离线转录，不适合实时）

---

### ⭐⭐⭐ 方案 3：在线免费 API

#### 3.1 Google Speech-to-Text API

**优点**：
- ✅ **免费额度**：每月 60 分钟免费
- ✅ **识别准确率高**
- ✅ **支持实时流式识别**

**缺点**：
- ❌ 需要 API Key
- ❌ 需要网络连接
- ❌ 超过免费额度后收费
- ❌ 数据需要上传到 Google

**免费额度**：每月 60 分钟

---

#### 3.2 Azure Speech Services

**优点**：
- ✅ **免费额度**：每月 5 小时免费
- ✅ **识别准确率高**
- ✅ **支持实时流式识别**

**缺点**：
- ❌ 需要 Azure 账号和 API Key
- ❌ 需要网络连接
- ❌ 超过免费额度后收费

**免费额度**：每月 5 小时

---

#### 3.3 百度语音识别

**优点**：
- ✅ **免费额度**：每天 5 万次调用
- ✅ **中文识别效果好**
- ✅ **支持实时流式识别**

**缺点**：
- ❌ 需要 API Key
- ❌ 需要网络连接
- ❌ 数据需要上传到百度

**免费额度**：每天 5 万次调用

---

## 推荐方案

### 🥇 首选：Faster-Whisper（已实现）✅

**理由**：
1. **安装最简单**：不需要 Visual C++ 构建工具
2. **完全免费**：无使用限制
3. **识别准确率最高**：接近人类水平
4. **支持实时识别**：满足需求
5. **中文支持好**：原生支持中文

### 🥈 备选：Vosk

**理由**：
1. **安装最简单**：不需要 Visual C++ 构建工具
2. **完全免费**：无使用限制
3. **支持实时识别**：满足需求
4. **离线运行**：数据隐私保护
5. **中文支持好**：有专门的中文模型

### 🥈 备选：在线 API（如果网络稳定）

- **Google Speech-to-Text**：免费额度 60 分钟/月
- **Azure Speech**：免费额度 5 小时/月
- **百度语音**：免费额度 5 万次/天

---

## 实现建议

### 方案 A：使用 Vosk（推荐）

1. **安装 Vosk**
   ```bash
   uv pip install vosk
   ```

2. **下载中文模型**
   - 访问：https://alphacephei.com/vosk/models
   - 下载中文模型（推荐 `vosk-model-cn-0.22`，约 1.5GB）
   - 或使用小模型（`vosk-model-small-cn-0.22`，约 45MB）

3. **修改代码**：将 `voice_stream.py` 中的 FunASR 替换为 Vosk

### 方案 B：使用在线 API（如果网络稳定）

1. **选择服务商**（Google / Azure / 百度）
2. **获取 API Key**
3. **实现 API 调用**：修改 `voice_stream.py` 使用 API

---

## 快速开始：使用 Faster-Whisper（当前实现）

### 1. 安装
```bash
uv pip install faster-whisper
```

### 2. 配置（可选）
在 `lifetrace/config/config.yaml` 中配置：
```yaml
speech_recognition:
  whisper_model_size: base  # tiny, base, small, medium, large
  whisper_device: cpu  # cpu 或 cuda
```

### 3. 使用
系统会自动使用 Faster-Whisper 进行实时识别。首次运行会自动下载模型。

---

## 快速开始：使用 Vosk（备选方案）

### 1. 安装
```bash
uv pip install vosk
```

### 2. 下载模型
```bash
# 创建模型目录
mkdir -p models/vosk

# 下载中文模型（小模型，45MB）
# 访问：https://alphacephei.com/vosk/models
# 下载：vosk-model-small-cn-0.22.zip
# 解压到 models/vosk/ 目录
```

### 3. 代码示例
见 `lifetrace/routers/voice_stream_vosk.py`（如果实现）

---

## 总结

| 方案 | 安装难度 | 实时性 | 准确率 | 费用 | 推荐度 | 状态 |
|------|---------|--------|--------|------|--------|------|
| **Faster-Whisper** | ⭐ 简单 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 免费 | ⭐⭐⭐⭐⭐ | ✅ 已实现 |
| Vosk | ⭐ 简单 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 免费 | ⭐⭐⭐⭐ | ⚠️ 未实现 |
| Whisper | ⭐⭐ 中等 | ⭐⭐ | ⭐⭐⭐⭐⭐ | 免费 | ⭐⭐⭐⭐ | ⚠️ 未实现 |
| Google API | ⭐ 简单 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 免费额度 | ⭐⭐⭐ | ⚠️ 未实现 |
| Azure API | ⭐ 简单 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 免费额度 | ⭐⭐⭐ | ⚠️ 未实现 |
| 百度 API | ⭐ 简单 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 免费额度 | ⭐⭐⭐ | ⚠️ 未实现 |

**最终推荐**：**Faster-Whisper** - 已实现！最简单、最准确、完全免费！

