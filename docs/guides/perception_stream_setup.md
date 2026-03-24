# 感知流功能配置与启用指南

本文档说明如何在 FreeTodo 中配置并使用「感知流（Perception Stream）」功能。

## 1. 配置文件位置

- 默认开发环境：`lifetrace/config/config.yaml`
- 如果设置了环境变量 `LIFETRACE_DATA_DIR`：配置文件在 `$LIFETRACE_DATA_DIR/config/config.yaml`
- 不要修改 `lifetrace/config/default_config.yaml`，应只改 `config.yaml`

## 2. 最小可用配置（推荐先跑通）

先只开启「用户输入」事件，最容易验证。下面只展示关键字段，保持你现有配置不变：

```yaml
backend_modules:
  enabled:
    - ...            # 保留原有模块
    - perception
  disabled:
    - ...            # 确保不包含 perception

perception:
  enabled: true
  input_enabled: true
  audio_enabled: false
  ocr_enabled: false
  window_seconds: 300
  max_pending_events: 1000
  status_online_window_seconds: 60
```

说明：

- `backend_modules.enabled` 里必须包含 `perception`
- `perception.enabled` 必须为 `true`
- 修改 `perception.*` 后需要重启后端（仅重载配置不会重建感知流管理器）

## 3. 多源事件配置（可选）

如果你要接入音频/OCR：

```yaml
perception:
  enabled: true
  input_enabled: true
  audio_enabled: true
  audio_source: mic_pc   # 可选: mic_pc / mic_hardware
  ocr_enabled: true
  window_seconds: 300
  max_pending_events: 1000
  status_online_window_seconds: 60
```

事件来源与开关关系：

- 聊天输入事件：`input_enabled: true`
- 音频转写事件：`audio_enabled: true`
- 屏幕 OCR / 主动 OCR 事件：`ocr_enabled: true`

## 4. 启动服务

在仓库根目录：

```bash
python -m lifetrace.server
```

前端（新终端）：

```bash
pnpm -C free-todo-frontend dev
```

如果你不用 `pnpm dev`（自动探测后端），请确保设置 `NEXT_PUBLIC_API_URL` 指向后端地址。

## 5. 前端启用感知流面板

1. 打开设置面板  
2. 进入「面板开关」  
3. 展开「开发中的面板」  
4. 启用 `感知流（perceptionStream）`  

如果该开关是灰色，通常是后端 `perception` 模块未启用。

## 6. 验证是否生效

### 6.1 检查模块能力

```bash
curl http://127.0.0.1:8001/api/capabilities
```

确认返回中：

- `enabled_modules` 包含 `perception`
- `available_modules` 包含 `perception`

### 6.2 检查感知流状态

```bash
curl http://127.0.0.1:8001/api/perception/status
```

可看到各来源 `enabled/online/last_seen` 以及 `_stream` 队列状态。

### 6.3 产生一条测试事件

最简单方式：

1. 在前端聊天面板发送一句话（例如“测试感知流”）
2. 再执行：

```bash
curl "http://127.0.0.1:8001/api/perception/events/recent?count=5"
```

若 `input_enabled: true`，应能看到 `source: "user_input"` 的事件。

## 7. 常见问题

- `503 Perception stream not initialized`  
  通常是 `perception.enabled` 关闭、`perception` 模块未启用，或后端未重启。

- 面板显示已连接但没有事件  
  常见原因是对应来源未开启（如 `input_enabled/audio_enabled/ocr_enabled`）或上游没有产生数据。

- 前端看不到感知流接口数据  
  多为前后端端口不一致，请检查 `NEXT_PUBLIC_API_URL` 与后端实际端口。
