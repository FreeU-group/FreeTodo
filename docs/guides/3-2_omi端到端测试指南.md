# Omi 端到端测试指南

> 本指南描述如何验证 LifeTrace Center ↔ omi Flutter App ↔ omi 硬件的完整链路。

## 当前配置状态

以下配置已在代码中完成，**无需手动修改**：

| 配置项 | 值 | 文件 |
|--------|-----|------|
| Center API 地址 | `https://tybbackend.cpolar.cn/` | `phone/lib/env/lifetrace_env.dart` |
| LifeTrace 模式 | `true` | `phone/lib/main.dart` (`_kLifeTraceMode`) |
| 认证 Token | `lifetrace-omi-compat-2026` | `lifetrace_env.dart` ↔ `config.yaml → omi_compat.token` |
| 用户 UID | `lifetrace-user` | `lifetrace_env.dart` ↔ `config.yaml → omi_compat.uid` |
| Firebase Auth | 已跳过 | `auth_service.dart` / `auth_provider.dart` / `shared.dart` |
| Onboarding | 已跳过 | `main.dart` 预填 `onboardingCompleted = true` |
| WebSocket Token | 自动附加 | `transcription_service.dart` 自动在 WS URL 中带 `&token=` |

## 前提条件

| 组件 | 要求 |
|------|------|
| Python | 3.11+ |
| Flutter | 3.24+ (Dart 3.5+) |
| Center 后端 | `omi_compat` 模块已启用（`config.yaml → backend_modules.enabled` 含 `omi_compat`） |
| cpolar | 后端隧道已配置（`tybbackend.cpolar.cn` → `127.0.0.1:8001`） |
| 手机 | Android 或 iOS，可访问公网 |
| omi 硬件 | 可选，纯 App 测试可跳过 |

## 一、启动 Center

使用一键启动脚本（会同时启动 Phoenix、AgentOS、后端、前端、cpolar 隧道）：

```bash
scripts\start-center.bat
```

或者单独启动后端：

```bash
uv run python -m lifetrace.server --role center
```

然后手动启动 cpolar 隧道：

```bash
cpolar http 8001 -subdomain=tybbackend
```

## 二、运行 API 冒烟测试

本地测试：

```bash
uv run python scripts/test_omi_compat.py http://127.0.0.1:8001
```

通过 cpolar 公网测试（验证隧道通畅）：

```bash
uv run python scripts/test_omi_compat.py https://tybbackend.cpolar.cn
```

预期 9 项全部 `[OK]`：

```
[1] GET /v1/users/me           → 200, uid=lifetrace-user
[2] GET /v1/users/onboarding   → completed=True
[3] GET /v3/speech-profile     → has_profile=False
[4] GET /v1/conversations      → returned N conversations
[5] GET /v3/memories           → returned N memories
[6] POST store-device-token    → accepted
[7] GET /v2/firmware/latest    → 404 (expected)
[8] WebSocket /v4/listen       → connected and closed cleanly
[9] Auth rejection (bad token) → 401 correctly rejected
```

## 三、构建 Flutter App

### 3.1 Firebase 配置文件（仅编译需要）

虽然运行时完全跳过 Firebase Auth，但 Flutter 编译仍需要 Firebase 配置文件存在：

- **Android**: 在 [Firebase Console](https://console.firebase.google.com/) 创建一个免费项目，
  下载 `google-services.json` 放到 `phone/android/app/google-services.json`
- **iOS**: 下载 `GoogleService-Info.plist` 放到 `phone/ios/Runner/GoogleService-Info.plist`

> 这些文件已在 `phone/.gitignore` 中排除，不会提交到仓库。

### 3.2 构建并运行

```bash
cd phone
flutter pub get
flutter run
```

其余配置（API 地址、Token、LifeTrace 模式开关等）已全部内置，无需手动修改。

## 四、端到端验证流程

### 测试 1：App 启动 → 跳过登录 → 直接进入主页

1. 启动 App
2. **预期**：跳过 Google/Apple 登录和 Onboarding 向导，直接进入主页
3. **验证**：后端日志应出现 `GET /v1/users/me`（带 `Authorization: Bearer lifetrace-omi-compat-2026`）

### 测试 2：纯 App 语音测试（无硬件）

1. 在 App 主页点击"录音"按钮（Phone mic source）
2. 对手机说话
3. **预期**：后端日志显示 WebSocket `v4/listen` 连接建立，DashScope ASR 开始工作
4. **预期**：App 上实时显示转录文本
5. **预期**：停止录音后，生成一条 Conversation

### 测试 3：omi 硬件连接

1. 开启 omi 硬件（nRF52840 或 ESP32）
2. App 自动扫描并连接蓝牙设备
3. 佩戴设备后正常说话
4. **预期**：音频链路 BLE → App → WebSocket → Center → Opus 解码 → DashScope ASR → 转录
5. **预期**：App 上实时显示转录文本

### 测试 4：查看历史会话

1. 在 App 中查看 Conversations 列表
2. **预期**：显示来自 LifeTrace Events 的会话记录

### 测试 5：查看记忆

1. 在 App 中查看 Memories 部分
2. **预期**：显示 LifeTrace 的记忆条目

## 五、常见问题

### Q: App 停在登录页

A: 确认 `phone/lib/main.dart` 中 `_kLifeTraceMode = true`。
执行 `flutter clean && flutter run` 重新构建。

### Q: API 请求 401

A: Token 不匹配。当前配置：
- App 端：`lifetrace_env.dart` → `lifetraceToken = 'lifetrace-omi-compat-2026'`
- 后端：`config.yaml` → `omi_compat.token: "lifetrace-omi-compat-2026"`

两边必须一致。如需修改，同步改两处。

### Q: WebSocket 连接失败

A: App 通过 cpolar HTTPS 访问，WebSocket URL 自动推导为 `wss://tybbackend.cpolar.cn/v4/listen`。
确认 cpolar 隧道正在运行（`cpolar http 8001 -subdomain=tybbackend`）。

### Q: Opus 解码失败

A: 确认后端已安装 `opuslib` 和 `pyogg`：

```bash
uv run python -c "import opuslib; print('OK')"
```

### Q: 转录无结果

A: 检查 `config.yaml` 中 DashScope ASR 的 API Key 是否配置且有效。
查看后端日志中是否有 ASR 相关错误。

## 六、架构图

```
┌──────────────┐      BLE       ┌─────────────────┐
│  omi 硬件    │  ─────────────>│  omi Flutter App │
│  (Opus 音频) │                │  (LifeTrace 模式)│
└──────────────┘                └────────┬────────┘
                                         │ wss://tybbackend.cpolar.cn/v4/listen
                                         │ https://tybbackend.cpolar.cn/v1/...
                                         ▼
                            ┌─── cpolar 隧道 ───┐
                            │  tybbackend.cpolar.cn  │
                            └────────┬────────┘
                                     │ → 127.0.0.1:8001
                                     ▼
                           ┌──────────────────┐
                           │  LifeTrace Center │
                           │  (FastAPI 后端)   │
                           ├──────────────────┤
                           │ omi_compat 路由   │
                           │  ├─ auth.py       │  ← Token 认证
                           │  ├─ listen.py     │  ← Opus→PCM + DashScope ASR
                           │  ├─ conversations │  ← 映射 LifeTrace Events
                           │  ├─ memories.py   │  ← 映射 LifeTrace Memory
                           │  └─ users.py      │  ← Stub 响应
                           └──────────────────┘
```
