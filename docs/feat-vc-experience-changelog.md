# feat/vc_experience 分支改动总结

> 分支创建时间：2026-03-25 21:20  
> 统计截止：2026-03-26 16:04（共 21 次提交 + 未提交更改）

---

## 一、已提交改动概览

### 1. 系统托盘 & 图标体系（6 次提交）

| 时间 | 提交 | 说明 |
|------|------|------|
| 10:41 | `552dea9` | 为 signal-sensor 添加系统托盘图标（pystray），新增 `tray_icon.py` 和 `freeu_tray.ico` |
| 11:02 | `d28592e` | 恢复 hi_dog2.png 作为托盘图标来源 |
| 11:15 | `745faef` | 更新浏览器 tab favicon 为 hi_dog2 |
| 11:22 | `25c5e51` | 托盘图标添加白色圆角矩形背景 |
| 12:05 | `bfed793` | 统一更新所有图标为新版"酷狗"圆角矩形风格（favicon、hi_dog2.png、tray icon） |
| — | — | 完成了品牌图标从旧版到新版的全面替换 |

### 2. 待办提醒弹窗系统（7 次提交）

| 时间 | 提交 | 说明 |
|------|------|------|
| 12:27 | `02716a9` | 新增待办提醒轮询功能：每 60 秒检查未来 10 分钟内到期的待办，通过 signal-popup 弹窗提醒 |
| 12:50 | `fc29496` | 弹窗 UI 重构为 Windows 11 风格暗色毛玻璃设计（glassmorphism） |
| 12:56 | `0a7d186` | 弹窗背景不透明度从 75% 提升到 95% |
| 12:58 | `56b9339` | 弹窗添加关闭按钮和"忽略/确认"按钮组 |
| 13:00 | `43d237b` | 移除弹窗标题中的 emoji |
| 14:52 | `8964117` | 弹窗最小高度从 120px 提升到 220px |
| 15:42 | `78f6124` | 弹窗背景不透明度微调到 98% |
| 16:03 | `b917739` | 修复 Windows 下弹窗背景透明问题（`backgroundColor: #00000000`） |

### 3. 主动 OCR 感知优化（4 次提交）

| 时间 | 提交 | 说明 |
|------|------|------|
| 14:37 | `274a7d0` | 设置页重构：将黑名单输入框替换为简洁的"微信/浏览器"开关 |
| 14:43 | `03d2d21` | 将黑名单机制应用到主动 OCR，使开关同时控制两种 OCR 模式 |
| 14:44 | `5029d8f` | 国际化文案移除飞书相关描述和"仅 Windows"提示 |
| 14:53 | `5169869` | 主动 OCR 目标应用精简为仅支持微信（移除飞书） |

### 4. 国际化补充（2 次提交）

| 时间 | 提交 | 说明 |
|------|------|------|
| 15:40 | `107f8f8` | 添加 todoIntentPanel 缺失的 i18n key（whoFounder、whoExecutor、when） |
| 15:41 | `885ea34` | 补充 todoIntentPanel.where 的 i18n key |

### 5. 其他修复（2 次提交）

| 时间 | 提交 | 说明 |
|------|------|------|
| 11:07 | `7e6e8b1` | signal-sensor 启动时先等待后端健康检查通过，再启动轮询线程 |
| 12:24 | `0b55b77` | 修复聊天流式响应结束时 isStreaming 状态未及时重置的问题 |

---

## 二、未提交更改（27 个文件，+568 / -130）

### A. 新增感知源：前台应用切换检测

**完整的端到端新功能**，检测用户当前在使用哪个应用程序，并记录切换行为。

- **客户端采集**（`scripts/signal-sensor.py`）：新增第 6 号轮询线程，每秒通过 Windows `GetForegroundWindow` / macOS `osascript` 获取当前前台窗口的 `app_name` 和 `window_title`，当发生切换时 POST 到服务端
- **服务端接入**（`server/routers/perception_ingest.py`）：新增 `POST /api/perception/app-switch` 端点，接收应用切换事件
- **感知适配器**（`server/perception/adapters/app_switch_adapter.py`）：新文件，`AppSwitchAdapter` 负责去重（连续相同应用不重复记录）并构建 `PerceptionEvent`，事件标记为 `SourceType.APP_SWITCH`
- **感知管理器**（`server/perception/manager.py`）：注册 `app_switch` 适配器，新增 `try_publish_app_switch` 和 `try_publish_app_switch_threadsafe` 方法，支持异步/同步两种调用方式
- **数据模型**（`server/perception/models.py` + `client/perception/models.py`）：新增 `APP_SWITCH` 感知源类型
- **定位**：纯上下文记录（写入 Memory L0/L1），不触发待办意图识别

### B. 新增感知源：PC 扬声器音频回环（Audio Loopback）

**完整的端到端新功能**，采集电脑扬声器输出的音频（如会议、视频播放内容）。

- **客户端采集**（`client/sensor.py`）：新增 `_audio_loopback_loop` 循环，通过 WASAPI Loopback / BlackHole / 立体声混音设备捕获系统音频输出，经 WebSocket 流式传输到服务端进行 ASR 转录
- **设备检测**：`_find_loopback_device` 方法自动查找可用的回环设备，支持 Windows WASAPI Loopback、macOS BlackHole、立体声混音
- **独立开关**：新增 `--no-audio-loopback` 命令行参数和 `audio_loopback_enabled` 远程配置项，与麦克风音频独立控制
- **前端设置**（`frontend/apps/settings/components/SensorNodesSection.tsx`）：传感器节点面板新增 Audio Loopback 运行状态指示灯和独立开关
- **数据模型**：新增 `SPEAKER_PC` 感知源类型
- **意图编排**（`server/services/perception_todo_intent/orchestrator.py`）：`SPEAKER_PC` 归类为"音频"类源，纳入待办意图提取流程

### C. 微信 OCR 消息解析器优化

对 `client/proactive_ocr/wechat_message_parser.py` 进行重构，改善消息归属判断准确率。

- **合并分类逻辑**：将原来的 `_classify_side_by_color` + `_classify_side_by_position` 两步判断合并为统一的 `_classify_speaker` 函数
- **多信号融合策略**：① 绿色气泡 → 判定为"我"（微信中只有自己的气泡是绿色）；② 位置明确偏右(>60%) → "我"；③ 位置明确偏左(<40%) → "对方"；④ 模糊区域(40%-60%) → 回退到 RGB 颜色匹配，再回退到位置
- **日志格式**：统一改为 f-string 格式

### D. 待办意图提取 Prompt 大幅升级

对 `server/config/prompts/todo.yaml` 进行重大优化，提升从聊天内容自动提取待办的准确度。

- **"已发送 = 已执行"原则**（核心新增）：[我] 发出的消息本身就是动作的执行，不应为已完成的动作创建待办。例如 [我] 说"王哥你方便把md文件再发我一下"→ 正确待办是"等待王烨权发送MD文件"（executor=对方），而非"向王哥索取MD文件"（executor=我）
- **who_executor 判定规则细化**：明确 [我] 请求对方→executor=对方，对方指派用户→executor=用户，用户自己计划→executor=用户
- **时间计算增强**：新增 `{current_time}` 变量注入，要求 LLM 将相对时间（"20分钟后"、"明天下午3点"）转换为绝对 ISO 8601 时间
- **提取器代码**（`server/services/perception_todo_intent/extractor.py`）：在调用 LLM 前获取当前本地时间并注入到 prompt

### E. 一键启停脚本 & 环境配置

- **quick-start-all.bat**（新文件）：一键启动全部服务
- **quick-stop-all---.bat**（新文件）：一键停止全部服务
- **start-center.bat / stop-center.bat / local-env.bat**：启停流程优化和环境变量调整

---

## 三、改动主线总结

本次 `feat/vc_experience` 分支围绕 **VC 体验演示** 展开，核心工作包括：

1. **前台应用切换感知**（全新）— 每秒检测当前前台应用并上报，构建用户行为上下文（端到端：采集→接口→适配器→存储）
2. **扬声器音频回环感知**（全新）— 通过 WASAPI Loopback 采集 PC 扬声器输出，流式 ASR 转录，感知会议/视频内容
3. **待办主动提醒弹窗** — 轮询即将到期待办，Windows 11 毛玻璃风格弹窗提醒
4. **待办意图提取大幅优化** — "已发送=已执行"原则、who_executor 精确判定、相对时间自动转绝对时间
5. **微信 OCR 解析升级** — 多信号融合的消息归属判断，提高"我说的"vs"对方说的"识别率
6. **品牌视觉统一** — 全面更新图标为新版"酷狗"圆角矩形风格
7. **体验打磨** — 设置页简化为开关式、国际化完善、一键启停脚本、启动健康检查
