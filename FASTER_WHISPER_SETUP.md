# Faster-Whisper 安装和使用指南

## ✅ 安装状态

**Faster-Whisper 已成功安装！**

```bash
✅ faster-whisper==1.2.1
✅ ctranslate2==4.6.2
✅ av==16.0.1
```

## 🚀 快速开始

### 1. 首次运行

首次运行时，Faster-Whisper 会自动下载模型文件：
- **base 模型**：约 1.5GB（推荐，平衡速度和准确率）
- 下载位置：`~/.cache/huggingface/hub/`

### 2. 配置（可选）

在 `lifetrace/config/config.yaml` 中配置：

```yaml
speech_recognition:
  # Faster-Whisper 配置
  whisper_model_size: base  # 可选: tiny, base, small, medium, large
  whisper_device: cpu  # cpu 或 cuda（如果有 GPU）
```

**模型大小对比**：
- `tiny`：最快，准确率较低（适合测试）
- `base`：推荐，平衡速度和准确率（默认）
- `small`：更准确，稍慢
- `medium`：高准确率，较慢
- `large`：最高准确率，最慢

### 3. 使用

系统会自动使用 Faster-Whisper 进行实时识别：
1. 选择"系统音频（FunASR 实时识别）"
2. 点击"开始录音"
3. 系统会自动使用 Faster-Whisper 进行识别

## 📊 性能对比

| 模型 | 速度 | 准确率 | 模型大小 | 推荐场景 |
|------|------|--------|----------|----------|
| tiny | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | 75MB | 快速测试 |
| base | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 1.5GB | **推荐使用** |
| small | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 5GB | 高准确率需求 |
| medium | ⭐⭐ | ⭐⭐⭐⭐⭐ | 15GB | 专业场景 |
| large | ⭐ | ⭐⭐⭐⭐⭐ | 30GB | 最高质量 |

## 🔧 故障排除

### 问题 1：模型下载慢

**解决方案**：
- 使用国内镜像（如果可用）
- 或手动下载模型到 `~/.cache/huggingface/hub/`

### 问题 2：CPU 运行慢

**解决方案**：
- 使用 `tiny` 或 `base` 模型
- 或使用 GPU（如果有）：设置 `whisper_device: cuda`

### 问题 3：内存不足

**解决方案**：
- 使用较小的模型（`tiny` 或 `base`）
- 关闭其他占用内存的程序

## 📝 技术细节

### 优势

1. **不需要 Visual C++ 构建工具**：安装简单
2. **识别准确率高**：接近人类水平
3. **速度优化**：比原版 Whisper 快 4-5 倍
4. **支持实时流式识别**：满足实时需求
5. **完全免费开源**：无使用限制

### 工作原理

1. 前端通过 WebSocket 发送音频流（WebM/Opus 格式）
2. 后端使用 `pydub` 转换为 WAV 格式
3. Faster-Whisper 进行实时识别
4. 结果通过 WebSocket 返回前端

## 🎯 与 FunASR 对比

| 特性 | Faster-Whisper | FunASR |
|------|---------------|--------|
| 安装难度 | ⭐ 简单 | ⭐⭐⭐ 需要 Visual C++ |
| 识别准确率 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| 实时性 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 模型大小 | 1.5GB (base) | 较小 |
| 中文支持 | ✅ 原生支持 | ✅ 专门优化 |
| 费用 | 免费 | 免费 |

**结论**：Faster-Whisper 更适合当前场景（安装简单，准确率高）！

## 📚 参考资源

- 官方文档：https://github.com/guillaumekln/faster-whisper
- 模型下载：https://huggingface.co/models?search=whisper

