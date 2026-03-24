# macOS Vision OCR 集成方案

## 概述

在 macOS 上使用 Apple Vision Framework (`VNRecognizeTextRequest`) 替代 RapidOCR，与 Windows WinRT OCR 对称，实现系统级零模型加载的 OCR。

## 依赖

- `pyobjc-framework-Vision` — Vision framework Python 绑定
- `pyobjc-framework-Quartz` — 图像处理（截图已依赖）
- 系统要求：macOS 10.15+


## 资源占用预期

| 指标 | WinRT (Windows) | Vision (macOS) | RapidOCR |
|------|-----------------|----------------|----------|
| 模型加载内存 | 0 | 0 | 150-300MB |
| 单次识别 | 42-180ms | 50-200ms (Intel) / 20-80ms (Apple Silicon) | 800-3000ms |
| 额外依赖 | winocr | pyobjc | rapidocr-onnxruntime |
