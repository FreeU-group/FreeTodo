# FreeTodo 代码审查报告

> 审查日期：2026-03-15  
> 覆盖范围：local-api（Python 后端）、local-web（TypeScript/React 前端）、local-sensor（Python 感知客户端）、cli、phone-app（Flutter 移动端）、src-tauri（Rust 桌面端）、deploy  
> 共发现 **132 个问题**：Critical 18 / High 29 / Medium 50 / Low 35

---

## 目录

- [P0 — Critical（致命）](#p0--critical致命)
- [P1 — High（高危）](#p1--high高危)
- [P2 — Medium（中等）](#p2--medium中等)
- [P3 — Low（低）](#p3--low低)
- [汇总统计](#汇总统计)

---

## P0 — Critical（致命）

### C01 — 任意文件读取漏洞（路径遍历）

| 属性 | 值 |
|------|------|
| **模块** | local-api |
| **文件** | `local-api/routers/preview.py` 第 17-28 行 |

`_resolve_path` 接受用户提供的任意绝对路径，无目录白名单限制。`expanduser()` 甚至允许 `~/.ssh/id_rsa` 等路径。攻击者可读取服务器上任何文件。

```python
def _resolve_path(raw_path: str) -> Path:
    file_path = Path(raw_path).expanduser().resolve()
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    if not file_path.is_file():
        raise HTTPException(status_code=400, detail="Path is not a file")
    return file_path
```

---

### C02 — 全局无认证：所有 API 端点无鉴权

| 属性 | 值 |
|------|------|
| **模块** | local-api |
| **文件** | 所有 `local-api/routers/` 文件 |

所有路由均无认证中间件。特别危险的有：`config.py` 暴露并允许修改 API Key；`preview.py` 可读任意文件；`system.py` 可删除数据；`vector.py` 可重置向量库。服务默认绑定 `0.0.0.0`（见 H06），若暴露到网络后果严重。

---

### C03 — Zip Slip 目录穿越漏洞（可能导致 RCE）

| 属性 | 值 |
|------|------|
| **模块** | local-api |
| **文件** | `local-api/services/plugin_manager.py` 第 245-246 行 |

`extractall` 不验证 ZIP 内文件路径。恶意 ZIP 可含 `../../etc/crontab` 类路径，将文件释放到任意目录。

```python
with zipfile.ZipFile(zip_path, "r") as zf:
    zf.extractall(install_dir)
```

---

### C04 — SSRF 服务端请求伪造

| 属性 | 值 |
|------|------|
| **模块** | local-api |
| **文件** | `local-api/services/automation_task_service.py` 第 218-220 行 |

仅校验 scheme 为 http/https，未禁止内网地址（`169.254.169.254`、`127.0.0.1` 等）。

```python
parsed_url = urlparse(str(url))
if parsed_url.scheme not in ("http", "https"):
    raise ValueError("web_fetch 仅支持 http/https 协议")
```

---

### C05 — `datetime` 仅在 TYPE_CHECKING 中导入，Pydantic 模型运行时崩溃

| 属性 | 值 |
|------|------|
| **模块** | local-api |
| **文件** | `local-api/schemas/agent_plan.py` 第 70-71 / 95-96 行 |

`PlanRunInfo` 和 `PlanRunStepInfo` 在运行时使用 `datetime` 类型注解，但 `datetime` 仅在 `if TYPE_CHECKING:` 块中导入。Pydantic v2 模型创建时需要解析类型——运行时 `datetime` 不在命名空间中，会抛出 `NameError`。

---

### C06 — LLM Vision 返回 `content=None` 时崩溃

| 属性 | 值 |
|------|------|
| **模块** | local-api |
| **文件** | `local-api/llm/llm_client_vision.py` 第 91 行 |

LLM API 可能返回 `content=None`（内容审核拒绝、token 耗尽等），调用 `.strip()` 抛出 `AttributeError`。项目其他位置使用了 `or ""` 保护，此处遗漏。

```python
result_text = response.choices[0].message.content.strip()
```

---

### C07 — `asyncio.run()` 在已运行的事件循环中调用导致崩溃

| 属性 | 值 |
|------|------|
| **模块** | local-api |
| **文件** | `local-api/llm/rag_service.py` 第 165-167 行 |

FastAPI 本身运行在事件循环中。`asyncio.run()` 会抛出 `RuntimeError: This event loop is already running`。

```python
def process_query_sync(self, user_query: str, max_results: int = 50) -> dict[str, Any]:
    return asyncio.run(self.process_query(user_query, max_results))
```

---

### C08 — PRAGMA SQL 拼接（注入风险模式）

| 属性 | 值 |
|------|------|
| **模块** | local-api |
| **文件** | `local-api/storage/database_base.py` 第 246 行 |

`table_name` 通过 f-string 直接拼接到原始 SQL 中。当前数据来自 `sqlite_master`，但此不安全模式若被复制会成为注入漏洞。

```python
columns = conn.execute(text(f"PRAGMA table_info({table_name})")).fetchall()
```

---

### C09 — Mass Assignment 漏洞（可篡改主键/外键/审计字段）

| 属性 | 值 |
|------|------|
| **模块** | local-api |
| **文件** | `local-api/storage/agent_plan_manager.py` 第 163-178 / 276-291 行 |

`update_run` 和 `update_journal` 用 `**fields` 接收任意关键字参数，仅 `hasattr` 检查就 `setattr`。可传入 `run_id`（主键）、`plan_id`（外键）、`created_at`（审计字段）。

---

### C10 — Docker 端口映射容器内侧硬编码，自定义端口时服务不可达

| 属性 | 值 |
|------|------|
| **模块** | deploy |
| **文件** | `deploy/compose.yaml` 第 21, 47 行 |

用户将端口设为 `9001` 时：容器内监听 `9001`，但 Docker 映射为 `9001:8001`（容器 8001 无人监听）→ 全部请求失败。

```yaml
- "${LIFETRACE_SERVER__PORT:-8001}:8001"     # 应为 ...:-8001}:${...:-8001}"
- "${LIFETRACE_AGNO__AGENT_OS__PORT:-8002}:8002"
```

---

### C11 — Server→Agent 通信地址硬编码，修改 Agent 端口后断联

| 属性 | 值 |
|------|------|
| **模块** | deploy |
| **文件** | `deploy/compose.yaml` 第 17-19 行 |

Server 连接 Agent 的 URL/端口硬编码为 `http://agent:8002`，若用户修改 Agent 端口 → Server 与 Agent 断联。

---

### C12 — breakdown-store 异步操作期间竞态条件

| 属性 | 值 |
|------|------|
| **模块** | local-web |
| **文件** | `local-web/lib/store/breakdown-store.ts` 第 142-194 行 |

`applyBreakdown` 通过 `get()` 获取状态快照后，多个 `await` 让出主线程。用户在此期间调用 `resetBreakdown()` 或 `startBreakdown(newId)`，子任务可能被创建到错误的父任务下。

---

### C13 — breakdown-store setTimeout 意外重置新操作

| 属性 | 值 |
|------|------|
| **模块** | local-web |
| **文件** | `local-web/lib/store/breakdown-store.ts` 第 192-194 行 |

成功后 2 秒延迟调用 `resetBreakdown()`。若用户在 2 秒内发起新 breakdown，此回调仍触发，将新 breakdown 状态全部清零。

```typescript
setTimeout(() => { get().resetBreakdown(); }, 2000);
```

---

### C14 — breakdown-store 部分失败无回滚，产生幽灵数据

| 属性 | 值 |
|------|------|
| **模块** | local-web |
| **文件** | `local-web/lib/store/breakdown-store.ts` 第 150-183 行 |

递归创建子任务使用串行 `for...of + await`。如果第 3 个子任务 API 失败，前 2 个已创建到后端，无回滚机制。

---

### C15 — 录音并发竞态窗口导致资源泄漏

| 属性 | 值 |
|------|------|
| **模块** | local-web |
| **文件** | `local-web/lib/store/audio-recording-store.ts` 第 492-600 行 |

`isRecording` 守卫在同步阶段执行，但 `isRecording = true` 直到第 596 行才设置。快速双击会创建两套 AudioContext + MediaStream + WebSocket，第一套永不清理。

---

### C16 — CaptureProvider Observer 内存泄漏（移动端永不 removeObserver）

| 属性 | 值 |
|------|------|
| **模块** | phone-app |
| **文件** | `phone-app/lib/providers/capture_provider.dart` 第 197 行 vs 第 1012-1015 行 |

构造函数中 `addObserver(this)` 在所有平台调用，但 `dispose()` 中 `removeObserver` 仅在 `PlatformService.isDesktop` 条件下调用。移动端 observer 永远不会被移除。

---

### C17 — CaptureProvider 对可空 conversationProvider 强制解包导致崩溃

| 属性 | 值 |
|------|------|
| **模块** | phone-app |
| **文件** | `phone-app/lib/providers/capture_provider.dart` 第 66/1526/1533/1609 行 |

`conversationProvider` 声明为 `ConversationProvider?`（可空），但多处使用 `!` 强制解包。如果 WebSocket 消息在 provider 注入之前到达，运行时崩溃。

---

### C18 — Rust unsafe 代码 PID 溢出+返回值未检查

| 属性 | 值 |
|------|------|
| **模块** | src-tauri |
| **文件** | `local-web/src-tauri/src/backend.rs` 第 474-477/499-502 行；`nextjs.rs` 第 281-284 行 |

`child.id()` 返回 `u32`，强转为 `i32` 时若 PID > `i32::MAX` 会溢出。`libc::kill` 的返回值未检查。

---

## P1 — High（高危）

### H01 — API Key 前缀泄露到日志

| 属性 | 值 |
|------|------|
| **模块** | local-api |
| **文件** | `local-api/routers/config.py` 第 162/175 行；`local-api/llm/llm_client.py` 第 93-96 行 |

Key 前 10 字符被记录到日志。短于 10 字符的 Key 会被完整暴露。

---

### H02 — 附件下载/读取无路径限制

| 属性 | 值 |
|------|------|
| **模块** | local-api |
| **文件** | `local-api/routers/todo.py` 第 124-133 行；`local-api/llm/agno_agent.py` 第 414-437 行 |

从数据库读取 `file_path` 后直接返回文件内容或 `FileResponse`，未验证路径是否在附件目录内。

---

### H03 — 全局字典无大小限制（DoS）

| 属性 | 值 |
|------|------|
| **模块** | local-api |
| **文件** | `local-api/routers/sensor_control.py` 第 25-26/42-49 行 |

`_sensor_nodes` 和 `_notification_queues` 无大小限制，攻击者可发送无限 heartbeat 导致内存耗尽。

---

### H04 — Prompt 注入漏洞

| 属性 | 值 |
|------|------|
| **模块** | local-api |
| **文件** | `local-api/llm/llm_client_intent.py` 第 46 行 |

用户输入直接 `.replace("<USER_QUERY>", user_query)` 嵌入 prompt 模板，无转义。

---

### H05 — 服务默认监听 0.0.0.0

| 属性 | 值 |
|------|------|
| **模块** | local-api |
| **文件** | `local-api/util/settings.py` 第 94/132 行 |

两个 HTTP 服务默认绑定所有网络接口。作为桌面应用应默认绑定 `127.0.0.1`。

---

### H06 — async 方法中同步阻塞事件循环

| 属性 | 值 |
|------|------|
| **模块** | local-api |
| **文件** | `local-api/services/audio_extraction_service.py` 第 442-452 行；`local-api/services/audio_extraction/gate.py` 第 129-137 行 |

`async def` 方法中直接调用 `openai_client.chat.completions.create()` 同步 API，阻塞整个事件循环。

---

### H07 — iCalendar priority=0 被错误映射为 HIGH

| 属性 | 值 |
|------|------|
| **模块** | local-api |
| **文件** | `local-api/services/icalendar_service.py` 第 252-265 行 |

RFC 5545 规定 priority=0 为"未定义"，但 `value <= 1` 为 True → 所有不带 priority 的项都被标记为高优先级。

---

### H08 — Enum 与字符串比较永远失败

| 属性 | 值 |
|------|------|
| **模块** | local-api |
| **文件** | `local-api/services/icalendar_service.py` 第 130-131 行 |

`item_type` 为 `TodoItemType.VEVENT`（Enum），与 `"VEVENT"` 字符串比较。如果不是 `StrEnum`，VEVENT 的 `dtend` 和 VTODO 的 `due` 永远为 None。

---

### H09 — 敏感配置值明文写入日志

| 属性 | 值 |
|------|------|
| **模块** | local-api |
| **文件** | `local-api/services/config_service.py` 第 393 行 |

`update_config_file` 将所有配置值（包括 API Key）直接记录到日志。

```python
logger.info(f"更新配置: {raw_key} -> {backend_key} = {value}")
```

---

### H10 — 文件删除与数据库操作非原子

| 属性 | 值 |
|------|------|
| **模块** | local-api |
| **文件** | `local-api/storage/stats_manager.py` 第 53-86 行 |

`os.remove()` 不可回滚，事务失败时文件已丢失但 DB 记录仍在。`.all()` 一次性加载所有旧截图可能 OOM。

---

### H11 — 全局字典无线程安全保护

| 属性 | 值 |
|------|------|
| **模块** | local-api |
| **文件** | `local-api/storage/notification_storage.py` 第 12-15 行 |

`_notifications` 和 `_dismissed_notifications` 在多线程中被并发读写，无锁保护。

---

### H12 — `get_or_create_event` 竞态条件

| 属性 | 值 |
|------|------|
| **模块** | local-api |
| **文件** | `local-api/storage/event_manager.py` 第 82-145 行 |

check-then-act 模式导致并发时 event 被关闭两次，产生重复记录。

---

### H13 — `suppress(Exception)` 静默吞掉所有异常

| 属性 | 值 |
|------|------|
| **模块** | local-api |
| **文件** | `local-api/storage/todo_manager.py` 第 188/216/255 行 |

软删除过滤器用 `contextlib.suppress(Exception)` 吞掉一切异常。如果过滤失败，查询会返回已软删除的记录。

---

### H14 — 内存缓存无上限，存在内存泄漏

| 属性 | 值 |
|------|------|
| **模块** | local-api |
| **文件** | `local-api/llm/ocr_todo_extractor.py` 第 72-78 行 |

`_ocr_text_cache` 和 `_ocr_text_last_llm_call` 字典无限增长，没有淘汰机制。

---

### H15 — 参数名 `settings` 遮蔽全局导入

| 属性 | 值 |
|------|------|
| **模块** | local-api |
| **文件** | `local-api/routers/config.py` 第 531-532 行 |

函数参数 `settings: dict` 遮蔽了模块顶部 `from util.settings import settings` 的导入。

---

### H16 — 流式请求缺少 AbortSignal

| 属性 | 值 |
|------|------|
| **模块** | local-web |
| **文件** | `local-web/lib/api/plan.ts` 第 46-89/94-134 行 |

`planQuestionnaireStream` 和 `planSummaryStream` 不接受 `AbortSignal` 参数，用户导航离开时连接无法取消。

---

### H17 — 流式 reader 缺少 try/finally 清理

| 属性 | 值 |
|------|------|
| **模块** | local-web |
| **文件** | `local-web/lib/api/plan.ts` 第 75-88/120-133 行 |

如果 `onChunk` 抛异常，`reader` 永远不会被释放。

---

### H18 — 双重序列化（generated 代码与 customFetcher 交互）

| 属性 | 值 |
|------|------|
| **模块** | local-web |
| **文件** | 所有 `local-web/lib/generated/*/*.ts` + `local-web/lib/api/fetcher.ts` |

生成代码用 `JSON.stringify(data)` 传入，`customFetcher` 再 `JSON.parse` → `camelToSnake` → `JSON.stringify`。性能浪费且边界情况下 snake_case 转换可能被跳过。

---

### H19 — 错误处理丢失后端详细信息

| 属性 | 值 |
|------|------|
| **模块** | local-web |
| **文件** | `local-web/lib/api/plan.ts` 第 67-69/112-113 行 |

所有 plan.ts 的 fetch 只抛状态码，不读取响应体中的错误详情。

---

### H20 — 部署脚本复制不存在的 `.env` 文件导致中止

| 属性 | 值 |
|------|------|
| **模块** | deploy |
| **文件** | `scripts/deploy_new.sh` 第 35 行 |

脚本 `cp "$SRC/.env"` 但 `deploy/` 下只有 `.env.example`。`set -euo pipefail` 下整个部署脚本中止。

---

### H21 — GDI 资源在异常路径泄漏

| 属性 | 值 |
|------|------|
| **模块** | local-sensor |
| **文件** | `local-sensor/proactive_ocr/capture.py` 第 311-352 行 |

4 个 GDI 资源的释放代码不在 `finally` 中，异常时全部泄漏。Sensor 以 1 秒间隔运行，反复泄漏将耗尽 Windows 的 10000 GDI 句柄上限。

---

### H22 — 图像数组非连续内存可能导致 OCR 异常

| 属性 | 值 |
|------|------|
| **模块** | local-sensor |
| **文件** | `local-sensor/proactive_ocr/capture.py` 第 336 行 |

`img_array[:, :, :3][:, :, ::-1]` 产生非 C-contiguous 视图。对比 `sensor.py:91` 使用了 `.copy()`，此处遗漏。

---

### H23 — DeviceProvider 空指针强制解包崩溃

| 属性 | 值 |
|------|------|
| **模块** | phone-app |
| **文件** | `phone-app/lib/providers/device_provider.dart` 第 285-287 行 |

`_getConnectedDevice()` 返回可空，但紧接着 `connectedDevice!.name` 强制解包。

---

### H24 — CaptureProvider.dispose 缺少多个 Timer/Stream 清理

| 属性 | 值 |
|------|------|
| **模块** | phone-app |
| **文件** | `phone-app/lib/providers/capture_provider.dart` 第 1002-1018 行 |

`_reconnectTimer`、`_backgroundWatchdog`、`_bleButtonStream`、`_voiceCommandTimeoutTimer` 在 dispose 中未被清理。

---

### H25 — clearSelectedFile 索引越界导致 RangeError

| 属性 | 值 |
|------|------|
| **模块** | phone-app |
| **文件** | `phone-app/lib/providers/message_provider.dart` 第 362-367 行 |

`uploadedFiles` 在异步上传完成前数量不一致，`uploadedFiles.removeAt(index)` 可能越界。

---

### H26 — getAuthHeader 变量 hasAuthToken 捕获后不再更新

| 属性 | 值 |
|------|------|
| **模块** | phone-app |
| **文件** | `phone-app/lib/backend/http/shared.dart` 第 25-52 行 |

`hasAuthToken` 在首次获取后不再更新。Token 刷新成功后的判断逻辑使用过期值，可能导致认证异常。

---

### H27 — Rust 代理请求/响应体无大小限制（OOM 风险）

| 属性 | 值 |
|------|------|
| **模块** | src-tauri |
| **文件** | `local-web/src-tauri/src/backend_proxy.rs` 第 86/98 行 |

`to_bytes(body, usize::MAX)` 和 `response.bytes().await` 对请求/响应体无大小限制。

---

### H28 — resumeDeviceRecording 双重启动 BLE 音频流

| 属性 | 值 |
|------|------|
| **模块** | phone-app |
| **文件** | `phone-app/lib/providers/capture_provider.dart` 第 1952-1966 行 |

`_initiateDeviceAudioStreaming()` 内部已调用 `streamAudioToWs()`，之后又显式调用一次 → 音频数据发送两次。

---

### H29 — Agent 工具目录含无限制文件操作

| 属性 | 值 |
|------|------|
| **模块** | local-api |
| **文件** | `local-api/routers/agent_plan.py` 第 115-130 行 |

暴露了 `write_file`、`delete_file`、`move_file` 工具，路径参数无白名单限制。

---

## P2 — Medium（中等）

### M01 — `add_to_session_context` lost update 竞态

| 属性 | 值 |
|------|------|
| **模块** | local-api |
| **文件** | `local-api/services/chat_service.py` 第 89-114 行 |

先读 JSON → 内存 append → 整体写回。两个并发请求导致消息被覆盖丢失。

---

### M02 — `update_todo` 双次查询 TOCTOU 竞态

| 属性 | 值 |
|------|------|
| **模块** | local-api |
| **文件** | `local-api/services/todo_service.py` 第 171/181 行 |

先 `get_by_id` 检查存在性，再次 `get_by_id` 获取数据，间隔内记录可能被删除。

---

### M03 — 嵌套路径遇非 dict 崩溃

| 属性 | 值 |
|------|------|
| **模块** | local-api |
| **文件** | `local-api/services/config_service.py` 第 396-402 行 |

YAML 中某键是标量值时，`current = current[key]` 设为字符串，后续赋值触发 `TypeError`。

---

### M04 — 配置文件并发写入竞态

| 属性 | 值 |
|------|------|
| **模块** | local-api |
| **文件** | `local-api/services/config_service.py` 第 386-406 行 |

多个并发配置保存请求互相覆盖。无文件锁保护。

---

### M05 — `exclude_none=True` 无法清空字段

| 属性 | 值 |
|------|------|
| **模块** | local-api |
| **文件** | `local-api/services/journal_service.py` 第 222 行 |

应改为 `exclude_unset=True`，否则用户无法将字段重置为空。

---

### M06 — `.format(version=version)` 无效果，版本参数被忽略

| 属性 | 值 |
|------|------|
| **模块** | local-api |
| **文件** | `local-api/services/plugin_manager.py` 第 48-49/192-194 行 |

URL 中不含 `{version}` 占位符，永远下载同一个版本。

---

### M07 — API key 通过 URL 泄漏到异常信息

| 属性 | 值 |
|------|------|
| **模块** | local-api |
| **文件** | `local-api/services/diary_illustration_service.py` 第 177-179 行 |

Gemini API key 拼在 URL query string 中，httpx 异常信息可能包含完整 URL。

---

### M08 — ORM 对象返回到 session 外部

| 属性 | 值 |
|------|------|
| **模块** | local-api |
| **文件** | `local-api/services/audio_service.py` 第 121-139 行 |

`with get_session()` 退出后 session 关闭，调用方若访问 lazy-loaded 属性将报 `DetachedInstanceError`。

---

### M09 — 时区不一致导致日期查询错误

| 属性 | 值 |
|------|------|
| **模块** | local-api |
| **文件** | `local-api/services/audio_service.py` 第 151-152 行 |

存储用本地时间，查询参数无时区保证，可能多查或漏查一天数据。

---

### M10 — `status` 参数缺少枚举校验

| 属性 | 值 |
|------|------|
| **模块** | local-api |
| **文件** | `local-api/routers/todo.py` 第 41 行 |

`status` 接受任意字符串，无效值透传到服务层。

---

### M11 — ICS 导入无文件类型校验

| 属性 | 值 |
|------|------|
| **模块** | local-api |
| **文件** | `local-api/routers/todo.py` 第 202-218 行 |

不检查上传文件的 content-type 或扩展名。

---

### M12 — `count` 参数无上限

| 属性 | 值 |
|------|------|
| **模块** | local-api |
| **文件** | `local-api/routers/perception_ws.py` 第 100-101 行 |

攻击者可传入极大值导致服务端内存暴涨。

---

### M13 — 端点暴露服务器内部文件路径

| 属性 | 值 |
|------|------|
| **模块** | local-api |
| **文件** | `local-api/routers/screenshot.py` 第 128-132 行 |

将服务器本地文件系统路径返回给客户端，属于信息泄露。

---

### M14 — `datetime.fromisoformat` 格式错误返回 500 而非 400

| 属性 | 值 |
|------|------|
| **模块** | local-api |
| **文件** | `local-api/routers/event.py` 第 28-29 行 |

用户传入的日期字符串格式不对时应返回 400 而非 500。

---

### M15 — 错误信息泄露内部实现细节

| 属性 | 值 |
|------|------|
| **模块** | local-api |
| **文件** | `local-api/routers/logs.py:52` 等多处 |

将原始异常 `str(e)` 直接返回给客户端。

---

### M16 — 硬编码回退模型与配置默认值不一致

| 属性 | 值 |
|------|------|
| **模块** | local-api |
| **文件** | `local-api/llm/llm_client.py` 第 72 行 vs `local-api/util/settings.py` 第 145 行 |

配置默认 `qwen-plus`，异常回退用 `qwen3-max`。

---

### M17 — `enable_thinking` 为供应商特有参数

| 属性 | 值 |
|------|------|
| **模块** | local-api |
| **文件** | `local-api/llm/llm_client_query.py` 第 222 行 |

用户配置 OpenAI 等非阿里云供应商时该参数会被忽略或报错。

---

### M18 — JSON 提取正则贪婪匹配

| 属性 | 值 |
|------|------|
| **模块** | local-api |
| **文件** | `local-api/llm/todo_extraction_service.py` 第 276 行 |

`re.search(r"\{.*\}", ...)` 贪婪匹配到最后一个 `}`，JSON 后有额外文本时解析失败。

---

### M19 — `retention=7` 是文件数非天数

| 属性 | 值 |
|------|------|
| **模块** | local-api |
| **文件** | `local-api/util/logging_config.py` 第 118/129 行 |

Loguru 传入整数表示保留文件数量。如意图是保留天数应改为 `"7 days"`。

---

### M20 — `SearchRequest.limit` 无上界

| 属性 | 值 |
|------|------|
| **模块** | local-api |
| **文件** | `local-api/schemas/search.py` 第 13 行 |

恶意请求可设 `limit=999999999` 造成内存耗尽。

---

### M21 — 生成不可达 URL `http://0.0.0.0:port`

| 属性 | 值 |
|------|------|
| **模块** | local-api |
| **文件** | `local-api/util/agent_os_utils.py` 第 13-15 行 |

host 为 `0.0.0.0` 时构造的 URL 在大多数客户端不可访问。

---

### M22 — 双重 commit（event_manager 和 activity_manager）

| 属性 | 值 |
|------|------|
| **模块** | local-api |
| **文件** | `local-api/storage/event_manager.py` 第 178 行；`local-api/storage/activity_manager.py` 第 65 行 |

上下文管理器自动 commit 后又显式 commit，与其他 manager 使用 `flush()` 的模式不一致。

---

### M23 — 引用不存在的模型字段

| 属性 | 值 |
|------|------|
| **模块** | local-api |
| **文件** | `local-api/storage/todo_manager_ical.py` 第 155-157 行 |

`Todo` 模型中不存在 `source_type`、`source_key`、`source_date` 字段。`getattr` 始终返回 None。

---

### M24 — useSendMessage 重复的 tool_call_end 处理

| 属性 | 值 |
|------|------|
| **模块** | local-web |
| **文件** | `local-web/apps/chat/hooks/useSendMessage.ts` 第 412-443 行 |

完全相同的代码块（复制粘贴遗留），`openFromPath` 被调用两次。

---

### M25 — IPC 处理器在 destroy() 时未注销

| 属性 | 值 |
|------|------|
| **模块** | local-web |
| **文件** | `local-web/electron/island-window-manager.ts` 第 241-267 vs 492-498 行 |

7+ 个 `ipcMain.on` 监听器在 `destroy()` 时未移除，`create() → destroy() → create()` 导致监听器累积。

---

### M26 — DynamicIsland 过于激进的 1 秒轮询

| 属性 | 值 |
|------|------|
| **模块** | local-web |
| **文件** | `local-web/components/island/DynamicIsland.tsx` 第 192-194 行 |

每 1 秒调用 `listTodosApiTodosGet`，对 draft todo 检测太激进。建议 5-10 秒或 WebSocket。

---

### M27 — requestAnimationFrame 缺少清理

| 属性 | 值 |
|------|------|
| **模块** | local-web |
| **文件** | `local-web/lib/hooks/usePanelWindowStyles.ts` 第 19-49 行 |

三重嵌套 RAF 无取消机制，组件卸载后回调仍执行。

---

### M28 — 录音重连窗口期状态不一致

| 属性 | 值 |
|------|------|
| **模块** | local-web |
| **文件** | `local-web/lib/store/audio-recording-store.ts` 第 708-744 行 |

3 秒窗口内 `isRecording = true` 但无音频管道运行。UI 显示"录音中"但无转录数据。

---

### M29 — TaskFailed 后双重清理

| 属性 | 值 |
|------|------|
| **模块** | local-web |
| **文件** | `local-web/lib/store/audio-recording-store.ts` 第 607-623 行 |

`TaskFailed` 触发 `cleanupRecordingResources()`，内部 `ws.close()` 触发 `onclose` 再次清理。

---

### M30 — startBreakdown 不取消进行中的操作

| 属性 | 值 |
|------|------|
| **模块** | local-web |
| **文件** | `local-web/lib/store/breakdown-store.ts` 第 61-72 行 |

调用 `startBreakdown` 直接覆盖状态，但旧的 async 操作仍在后台继续。缺少 `AbortController`。

---

### M31 — camelToSnake 连续大写字母处理不正确

| 属性 | 值 |
|------|------|
| **模块** | local-web |
| **文件** | `local-web/lib/generated/case-transform.ts` 第 22-28 行 |

`"XMLParser"` → `"_x_m_l_parser"`（应为 `"xml_parser"`）。

---

### M32 — 时间戳正则遗漏毫秒格式

| 属性 | 值 |
|------|------|
| **模块** | local-web |
| **文件** | `local-web/lib/api/fetcher.ts` 第 14-17 行 |

正则只匹配精确到秒的格式，带毫秒的时间戳不会被标准化为 UTC。

---

### M33 — 生产环境静默跳过 schema 验证失败

| 属性 | 值 |
|------|------|
| **模块** | local-web |
| **文件** | `local-web/lib/api/fetcher.ts` 第 202-211 行 |

验证失败仅 `console.error`，返回未验证数据。下游组件可能收到形状不匹配的数据。

---

### M34 — Generated mutations 缺少 AbortSignal

| 属性 | 值 |
|------|------|
| **模块** | local-web |
| **文件** | 所有 generated mutation hooks |

`useMutation` 的 `mutationFn` 不传 `signal`，长耗时 mutation 组件卸载时无法取消。

---

### M35 — notification-store get()+set() 非原子模式

| 属性 | 值 |
|------|------|
| **模块** | local-web |
| **文件** | `local-web/lib/store/notification-store.ts` 第 156-186 行 |

先 `get()` 读状态再 `set()` 写，潜在的状态覆盖风险。

---

### M36 — 大量 API 端点返回 `data: unknown`

| 属性 | 值 |
|------|------|
| **模块** | local-web |
| **文件** | 多个 generated 服务文件 |

约 15+ 个端点响应类型为 `unknown`，源于后端 OpenAPI spec 未定义精确 response schema。

---

### M37 — WinRT OCR 每次调用创建新的事件循环

| 属性 | 值 |
|------|------|
| **模块** | local-sensor |
| **文件** | `local-sensor/proactive_ocr/ocr_engine_winrt.py` 第 134-139 行 |

每秒创建并销毁一个事件循环，带来不必要的内存分配和延迟。

---

### M38 — FeishuPrior 无参调用 OCR 可能覆盖用户配置

| 属性 | 值 |
|------|------|
| **模块** | local-sensor |
| **文件** | `local-sensor/proactive_ocr/priors/feishu.py` 第 51-54 行 |

无参调用 `get_ocr_engine()` 会以默认配置创建单例，用户在 config.yaml 中的 OCR 配置被忽略。

---

### M39 — Agent 容器缺少数据卷挂载

| 属性 | 值 |
|------|------|
| **模块** | deploy |
| **文件** | `deploy/compose.yaml` 第 29-49 行 |

Agent 容器无 `volumes` 配置，重启后工作区数据丢失。

---

### M40 — PowerShell `$pid` 覆盖内置变量

| 属性 | 值 |
|------|------|
| **模块** | scripts |
| **文件** | `scripts/stop_all.ps1` 第 52 行 |

`$pid` 覆盖了 PowerShell 内置自动变量。

---

### M41 — mss 截屏实例在 Sensor 生命周期内从不释放

| 属性 | 值 |
|------|------|
| **模块** | local-sensor |
| **文件** | `local-sensor/proactive_ocr/capture.py` 第 92-97 行；`local-sensor/sensor.py` 第 97-103 行 |

全局单例 `_window_capture` 从未调用 `cleanup()`，mss 内部持有文件描述符和共享内存映射不释放。

---

### M42 — HomeProvider.getLanguageName firstWhere 无回退

| 属性 | 值 |
|------|------|
| **模块** | phone-app |
| **文件** | `phone-app/lib/providers/home_provider.dart` 第 220-222 行 |

`firstWhere` 找不到匹配时抛出 `StateError: No element`。后端返回未预定义的语言代码时崩溃。

---

### M43 — DeviceProvider 低电量恢复时标志位设置错误

| 属性 | 值 |
|------|------|
| **模块** | phone-app |
| **文件** | `phone-app/lib/providers/device_provider.dart` 第 153-162 行 |

电量从 <20% 恢复到 >20% 时，`_hasLowBatteryAlerted` 设为 `true`（应为 `false`）→ 再次耗电到低电量时不会告警。

---

### M44 — Rust Mutex.lock().unwrap() 级联 panic

| 属性 | 值 |
|------|------|
| **模块** | src-tauri |
| **文件** | `local-web/src-tauri/src/backend.rs` 第 199/442/471/494 行 |

任何持有锁的线程 panic 后，后续所有 `.lock().unwrap()` 级联 panic。

---

### M45 — ConversationProvider 多处未检查可能失败的查找

| 属性 | 值 |
|------|------|
| **模块** | phone-app |
| **文件** | `phone-app/lib/providers/conversation_provider.dart` 第 516-521 行 |

`firstWhere` 无 orElse、`groupedConversations[date]!` 无空检查、索引无边界检查。

---

### M46 — find_available_port 用 HTTP 检查而非 TCP bind

| 属性 | 值 |
|------|------|
| **模块** | src-tauri |
| **文件** | `local-web/src-tauri/src/nextjs.rs` 第 84-96 行 |

端口被非 HTTP 服务占用时会被误判为可用。

---

### M47 — CaptureProvider 重复导入 logger.dart

| 属性 | 值 |
|------|------|
| **模块** | phone-app |
| **文件** | `phone-app/lib/providers/capture_provider.dart` 第 44-45 行 |

`logger.dart` 被导入了两次，可能掩盖了本该导入其他包的错误。

---

### M48 — CaptureProvider.resumeDeviceRecording 双重启动 BLE 流（同 H28 细节）

已在 H28 中报告。此处不重复。

---

### M49 — `undefined as T` 类型安全问题

| 属性 | 值 |
|------|------|
| **模块** | local-web |
| **文件** | `local-web/lib/api/fetcher.ts` 第 176-178 行 |

204 响应返回 `undefined as T`，对于非 void 类型是类型系统的谎言。

---

### M50 — 平台判断中的无效分支

| 属性 | 值 |
|------|------|
| **模块** | local-web |
| **文件** | `local-web/electron/main.ts` 第 108-114 行 |

`if (process.platform === "win32")` 的 if/else 两个分支执行完全相同的代码。

---

## P3 — Low（低）

### L01 — 删除不存在的通知返回 200 而非 404

| 模块 | 文件 |
|------|------|
| local-api | `local-api/routers/notification.py` 第 55-56 行 |

---

### L02 — ICS 导入 `errors="ignore"` 静默丢数据

| 模块 | 文件 |
|------|------|
| local-api | `local-api/routers/todo.py` 第 217-218 行 |

---

### L03 — 每次请求创建新服务实例

| 模块 | 文件 |
|------|------|
| local-api | `local-api/routers/automation.py` 第 18/28/37 行 |

---

### L04 — DELETE 返回 200 而非 204

| 模块 | 文件 |
|------|------|
| local-api | `local-api/routers/automation.py` 第 66-71 行 |

---

### L05 — 坐标值无范围校验

| 模块 | 文件 |
|------|------|
| local-api | `local-api/routers/location.py` 第 26-34 行 |

---

### L06 — 调用私有方法 `_get_model_price()`

| 模块 | 文件 |
|------|------|
| local-api | `local-api/routers/cost_tracking.py` 第 38 行 |

---

### L07 — API 响应格式不一致

| 模块 | 文件 |
|------|------|
| local-api | 多个路由 |

`config.py` 用 `{"success": True/False}`；`location.py` 用 `{"ok": True/False}`；无统一标准。

---

### L08 — `dify_client` 对 dict 做属性访问

| 模块 | 文件 |
|------|------|
| local-api | `local-api/services/dify_client.py` 第 35-43 行 |

`getattr({}, "api_key", "")` 始终返回默认值。

---

### L09 — 已废弃的 `.dict()` 方法

| 模块 | 文件 |
|------|------|
| local-api | `local-api/services/automation_task_service.py` 第 246 行 |

Pydantic v2 中应使用 `.model_dump()`。

---

### L10 — ASR 单例模式非线程安全

| 模块 | 文件 |
|------|------|
| local-api | `local-api/services/asr_client.py` 第 28-38 行 |

---

### L11 — `TodoResponse` 的 status/priority 使用 str 而非枚举

| 模块 | 文件 |
|------|------|
| local-api | `local-api/schemas/todo.py` 第 190-191 行 |

---

### L12 — `AddMessageRequest.role` 无枚举验证

| 模块 | 文件 |
|------|------|
| local-api | `local-api/schemas/chat.py` 第 67-68 行 |

---

### L13 — 重复定义 `ExtractedTodo` 类名

| 模块 | 文件 |
|------|------|
| local-api | `local-api/schemas/floating_capture.py:18` vs `local-api/schemas/todo_extraction.py:30` |

两个文件定义同名但字段不同的类。

---

### L14 — 占位符 API Key 作为默认值

| 模块 | 文件 |
|------|------|
| local-api | `local-api/util/settings.py` 第 143/150/155/159 行 |

`YOUR_LLM_KEY_HERE` 等占位符可能被误当真实 Key 使用。

---

### L15 — LIKE 通配符未转义

| 模块 | 文件 |
|------|------|
| local-api | `local-api/storage/event_queries.py` 第 37/87 行 |

用户搜索 `100%` 会匹配所有以 `100` 开头的结果。

---

### L16 — N+1 查询问题

| 模块 | 文件 |
|------|------|
| local-api | `local-api/storage/chat_manager.py` 第 327-342 行；`local-api/storage/event_queries.py` 第 43-52 行 |

`get_chat_summaries` 对每个 chat 单独 `count()` 查询（limit=50 时 51 次）。

---

### L17 — Stream stores 静默吞掉所有异常

| 模块 | 文件 |
|------|------|
| local-web | `local-web/lib/store/todo-intent-stream-store.ts`、`perception-stream-store.ts` |

空 `catch {}` 完全吞掉异常，调试困难。

---

### L18 — todo-store isTodoExpanded 非响应式

| 模块 | 文件 |
|------|------|
| local-web | `local-web/lib/store/todo-store.ts` 第 134-137 行 |

用 `get()` 命令式查询，`collapsedTodoIds` 变化不会触发重渲染。

---

### L19 — DynamicIsland 绕过 contextIsolation 的降级代码

| 模块 | 文件 |
|------|------|
| local-web | `local-web/components/island/DynamicIsland.tsx` 第 228-232 行 |

`window.require("electron")` 的降级代码是安全隐患。

---

### L20 — useOnboardingTour 事件监听器泄漏

| 模块 | 文件 |
|------|------|
| local-web | `local-web/lib/hooks/useOnboardingTour.ts` 第 75-84 行 |

`onDestroyed` 中不清理事件监听器。

---

### L21 — get-window-position 始终返回主窗口位置

| 模块 | 文件 |
|------|------|
| local-web | `local-web/electron/ipc-handlers.ts` 第 85-92 行 |

无论哪个窗口发起请求，始终返回主窗口位置。

---

### L22 — Stream stores loadRecent 无防抖

| 模块 | 文件 |
|------|------|
| local-web | `local-web/lib/store/todo-intent-stream-store.ts`、`perception-stream-store.ts` |

快速连续调用产生多个并发 fetch，浪费网络资源。

---

### L23 — sensor.py 中的冗余不可达检查代码

| 模块 | 文件 |
|------|------|
| local-sensor | `local-sensor/sensor.py` 第 62-66 行 |

第 57-59 行已确认不匹配后，第 63-66 行的相同检查不可能匹配，是死代码。

---

### L24 — OCR 引擎单例阻止运行时重新配置

| 模块 | 文件 |
|------|------|
| local-sensor | `local-sensor/proactive_ocr/ocr_engine.py` 第 161-168 行 |

单例一旦创建不检查新参数，用户修改 OCR 配置后必须重启进程。

---

### L25 — 用户时区硬编码为 UTC+8

| 模块 | 文件 |
|------|------|
| local-sensor | `local-sensor/util/time_utils.py` 第 8 行 |

非 UTC+8 时区的用户会遇到时间显示错误。

---

### L26 — CLI 超时参数缺少输入验证

| 模块 | 文件 |
|------|------|
| cli | `cli/freetodo_cli/config.py` 第 21 行 |

环境变量为非数字字符串时 `float()` 抛出未捕获的 `ValueError`。

---

### L27 — `.env.example` 占位密钥不够醒目

| 模块 | 文件 |
|------|------|
| deploy | `deploy/.env.example` 第 16/21/24 行 |

`your-api-key` 格式看起来像合法 Key，用户可能忘记替换。

---

### L28 — `proactive_ocr/__init__.py` 空文件无公共 API 导出

| 模块 | 文件 |
|------|------|
| local-sensor | `local-sensor/proactive_ocr/__init__.py` |

---

### L29 — MessageProvider.dispose 未断开 WebSocket

| 模块 | 文件 |
|------|------|
| phone-app | `phone-app/lib/providers/message_provider.dart` 第 981-986 行 |

`_agentChatService` 的 WebSocket 连接在 dispose 中未关闭。

---

### L30 — shared.dart `Env.apiBaseUrl!` 强制解包

| 模块 | 文件 |
|------|------|
| phone-app | `phone-app/lib/backend/http/shared.dart` 第 77-82 行 |

边界条件下 `apiBaseUrl` 可能为 null 导致崩溃。

---

### L31 — Tauri preview_read_file IPC 命令无路径沙箱

| 模块 | 文件 |
|------|------|
| src-tauri | `local-web/src-tauri/src/lib.rs` 第 162-168 行 |

接受任意路径参数，若前端存在 XSS 可读系统任意文件。

---

### L32 — TranscriptSegmentSocketService 用 hashCode 作 Map key

| 模块 | 文件 |
|------|------|
| phone-app | `phone-app/lib/services/sockets/transcription_service.dart` 第 143-150 行 |

`hashCode` 不保证唯一性，碰撞时导致 listener 误删/覆盖。

---

### L33 — Rust `std::thread::sleep` 阻塞 Tokio 异步线程

| 模块 | 文件 |
|------|------|
| src-tauri | `local-web/src-tauri/src/backend.rs` 第 512 行；`nextjs.rs` 第 293 行 |

退出时阻塞 Tokio worker 线程 2 秒，所有异步任务冻结。

---

### L34 — DeviceProvider 低电量恢复标志位错误（同 M43）

已在 M43 中报告。

---

### L35 — CaptureProvider 重复导入（同 M47）

已在 M47 中报告。

---

## 汇总统计

| 模块 | Critical | High | Medium | Low | 合计 |
|------|----------|------|--------|-----|------|
| **local-api** | 9 | 17 | 25 | 16 | 67 |
| **local-web** | 4 | 4 | 13 | 8 | 29 |
| **local-sensor + cli** | 2 | 3 | 5 | 6 | 16 |
| **phone-app + Tauri** | 3 | 5 | 7 | 5 | 20 |
| **合计** | **18** | **29** | **50** | **35** | **132** |

### 最优先修复建议

1. **P0 紧急**：C01-C04 安全漏洞（任意文件读取 + 无认证 + Zip Slip + SSRF）— 如果服务有任何网络暴露需立即修复
2. **P0 紧急**：C05-C07 运行时崩溃 — datetime 导入、content=None、asyncio.run
3. **P0 紧急**：C10-C11 Docker 部署端口配置 — 自定义端口时整个服务不可用
4. **P1 尽快**：H04-H05 Prompt 注入 + 0.0.0.0 监听 — 安全风险
5. **P1 尽快**：H06 事件循环阻塞 — 影响整体服务响应
6. **P1 尽快**：H07-H08 iCal 数据损坏 — 日历导入功能基本不可用
7. **P1 尽快**：H21 GDI 资源泄漏 — 长时间运行后 Windows 系统级故障
