# FreeTodo 逻辑问题全面审计报告

**审查日期**: 2026-04-02
**审查范围**: 全仓库核心模块 (server/, frontend/, electron/)
**审查方法**: 逐文件人工代码审查，重点关注数据完整性、并发安全、用户体验影响

---

## 一、问题汇总

| 严重级别 | 数量 | 说明 |
|---------|------|------|
| **Critical** | 8 | 可能导致服务崩溃、数据丢失、核心功能不可用 |
| **High** | 12 | 安全风险、数据不一致、显著影响用户体验 |
| **Medium** | 15 | 逻辑不严谨但不一定立即可见 |
| **Low** | 10 | 代码质量、注释、死代码 |

**已修复**: Critical 级别 8 个问题已在本次修复中全部处理。

---

## 二、Critical 级别（已修复）

### C-01: 子任务循环引用导致服务端栈溢出 [已修复]

**文件**: `server/storage/todo_manager.py` L128-138, L281-299

**问题**: `_get_children_recursive` 和 `_delete_todo_recursive` 两个递归函数都没有 `visited` 集合防止循环。与 C-02 叠加，如果数据库中出现循环引用（A→B→A），这两个函数会无限递归直到 Python 栈溢出导致服务崩溃。

**修复**: 为两个递归函数添加了 `visited: set[int]` 参数，在进入每个节点前检查是否已访问过。

---

### C-02: create_todo 缺少 parent_todo_id 校验 [已修复]

**文件**: `server/storage/todo_manager_ical.py` L58-161, `server/services/todo_service.py` L86-168

**问题**: `create_todo` 直接将 `parent_todo_id` 写入数据库，不校验父任务是否存在。相比之下 `update_todo` 和 `reorder_todos` 都会调用 `_validate_parent_link`。这允许创建指向不存在 todo 的子任务，或构造循环引用。

**用户体验影响**: 前端创建子任务时可能指向已删除的父任务，导致任务树结构异常，子任务"消失"在列表中。

**修复**: 在 `todo_manager_ical.py` 的 `create_todo` 中添加父任务存在性检查，不存在时将 `parent_todo_id` 置为 `None`。

---

### C-03: reorder 端点无法将子任务提升为顶级任务 [已修复]

**文件**: `server/routers/todo.py` L172-179

**问题**: 原代码使用条件展开 `**({"parent_todo_id": item.parent_todo_id} if item.parent_todo_id is not None else {})`，当 `parent_todo_id=None`（表示提升为顶级任务）时，`parent_todo_id` 键被完全省略。下游 `reorder_todos` 只在 `"parent_todo_id" in item` 时更新父子关系，因此用户永远无法通过 reorder API 将子任务拖回顶级。

**用户体验影响**: 用户拖拽子任务到顶级位置时操作看似成功但实际上父子关系没有改变，刷新后任务又回到子任务位置。

**修复**: 始终包含 `parent_todo_id` 键。

---

### C-04: 防抖 Promise 永不 settle 导致内存泄漏 [已修复]

**文件**: `frontend/lib/query/todos.ts` L241-292

**问题**: 当用户快速连续编辑 description/userNotes 字段时，每次编辑创建一个新 Promise 并 clearTimeout 旧定时器。旧 Promise 的 resolve/reject 闭包被 GC 引用但永远不会执行。React Query 将这些 mutation 视为永久 pending 状态。

**用户体验影响**:
- 内存泄漏（大量快速编辑累积不可回收的 Promise）
- `isUpdating` 永久为 true，可能导致 UI 显示"保存中"状态卡住
- 乐观更新的 rollback 机制失效（`onError` 不触发）

**修复**: 引入 `pendingUpdateResolvers` Map 收集所有等待中的 resolver。当定时器触发或被非防抖更新覆盖时，统一 settle 所有等待的 Promise。

---

### C-05: 1 秒轮询覆盖乐观更新导致 UI 闪烁 [已修复]

**文件**: `frontend/lib/query/todos.ts` L131

**问题**: `refetchInterval: 1000` 每秒轮询一次，不受乐观更新状态约束。当用户执行操作后（特别是防抖延迟 500ms 的字段），refetch 返回的旧数据会立即覆盖乐观更新，导致 UI 先显示新值再闪回旧值再变回新值。

**用户体验影响**: 几乎每次操作后 Todo 状态都会短暂闪烁回弹，体验极差。对于 description/userNotes 等防抖字段，由于有效延迟 >= 500ms，几乎 100% 会被 1s 轮询覆盖。

**修复**: 将 `refetchInterval` 从 1000ms 调整为 5000ms，与 `staleTime: 5000` 对齐，减少无意义的竞争覆盖。

---

### C-06: 时区处理不一致导致日历全天事件检测失败 [已修复]

**文件**: `frontend/lib/api/fetcher.ts` L13-16, `frontend/apps/calendar/utils.ts` L106-118

**问题**: 数据流存在不一致：
1. 用户设置纯日期 deadline "2024-06-15"
2. `normalizeDateTimeValue` 转为 "2024-06-15T00:00:00"
3. 后端存储并返回 "2024-06-15T00:00:00"
4. Fetcher 的 `normalizeTimestamps` 追加 Z → "2024-06-15T00:00:00Z"
5. `isAllDayDeadlineString` 检查 `!value.includes("Z")` → false
6. 全天事件被错误当作定时事件

**用户体验影响**: 日历视图中所有"全天"deadline 事件不会显示在全天区域，而是显示在 UTC+8 时区的 08:00 位置，完全偏离预期。

**修复**: 更新 `isAllDayDeadlineString` 正则匹配，接受 `T00:00:00`、`T00:00:00Z`、`T00:00:00.000Z` 三种格式。

---

### C-07: BackendReadyGate 端口不一致 + 不阻止子组件挂载 [已修复]

**文件**: `frontend/components/common/ui/BackendReadyGate.tsx`

**问题**:
1. 健康检查硬编码默认端口 8100，而 `runtime-backend-url.ts` 和 `next.config.ts` 默认端口是 8001。桌面模式未设置 `NEXT_PUBLIC_API_URL` 时，健康检查打到错误端口永远不通。
2. `{children}` 始终渲染，仅用 overlay 遮盖。后端未就绪时子组件（React Query 等）就开始 fetch，产生大量失败请求。
3. 非桌面模式下首帧会闪现"启动中"遮罩（`ready` 初始为 false，effect 才设为 true）。

**用户体验影响**: 桌面版可能永远卡在"正在连接后端"页面无法使用。

**修复**:
- 使用 `getRuntimeBackendUrl()` 统一端口来源
- 用 `useState(() => !isDesktop())` 消除非桌面模式的闪烁
- 后端未就绪时直接返回加载 UI，不渲染 children

---

### C-08: 拖拽排序 TODO_CARD_SLOT 处理器是空实现 [已修复]

**文件**: `frontend/lib/dnd/handlers.ts` L471-481

**问题**: `handleTodoToTodoCardSlot` 已注册到 handler registry，但函数体只有一行 `return { success: true }`。拖拽 todo 到另一个 todo 的"前面"或"后面"插槽时返回成功但不做任何重排序。

**用户体验影响**: 用户拖拽排序看似成功（无错误提示），但 todo 顺序不会改变。刷新后发现排序未生效。

**修复**: 实现完整的插入逻辑——读取同级 todo 列表、计算插入位置、乐观更新缓存、调用 reorder API。

---

## 三、High 级别（待修复）

### H-01: CORS 全开放 + 无鉴权

**文件**: `server/server.py` L116-123

`allow_origins=["*"]` + `allow_credentials=True` + 所有 API 无任何认证中间件。任何人可以读取、修改、删除所有 todo 数据。

**用户体验影响**: 在公网部署时任何人都可以操作你的待办数据。

---

### H-02: 附件路径穿越风险

**文件**: `server/routers/todo.py` L119-133

`get_attachment_file` 从数据库读取 `file_path` 直接传给 `FileResponse`，未验证路径是否在预期目录内。

**用户体验影响**: 如果数据库被篡改，攻击者可以读取服务器任意文件。

---

### H-03: 双重防抖导致笔记保存延迟约 1 秒

**文件**: `frontend/apps/todo-detail/TodoDetail.tsx` L134-158, `frontend/lib/query/todos.ts` L228-231

`TodoDetail.handleNotesChange` 已经防抖 500ms，然后调用 `updateTodo`，`useUpdateTodo` 检测到 `userNotes` 字段后再次防抖 500ms。实际延迟约 1000ms。

**用户体验影响**: 用户编辑笔记后要等约 1 秒才真正保存，快速切换 todo 时可能丢失最后编辑的内容。

**建议修复**: 在 `TodoDetail` 的防抖回调中发送时使用不触发二次防抖的方式，或在 `useUpdateTodo` 中排除已在组件层防抖的字段。

---

### H-04: 防抖字段与非防抖字段的 payload 合并逻辑问题

**文件**: `frontend/lib/query/todos.ts` L232-300

如果用户正在编辑 description（防抖中），然后点击修改 status，会导致 description 被搭载到 status 更新中一起发送，而原防抖 Promise 从缓存返回可能过时的数据。

**用户体验影响**: 修改状态时可能无意中提交了未完成编辑的描述内容。

---

### H-05: ChatPanel pendingPrompt 发送时序不保证

**文件**: `frontend/apps/chat/ChatPanel.tsx` L56-68

`handleNewChat(true)` 是同步调用但触发异步状态更新，`setTimeout(, 0)` 不保证新会话状态已就绪。`setPendingPrompt(null)` 在 `sendMessage` 执行前就清空了 prompt。

**用户体验影响**: 从 TodoCard 点击"获取建议"时消息可能发送到旧会话或发送失败。

---

### H-06: 软删除逻辑形同虚设

**文件**: `server/storage/todo_manager.py` L188-189

`suppress(Exception)` 吞掉 `deleted_at` 过滤异常。`_delete_todo_recursive` 执行硬删除(`session.delete`)，而查询用软删除过滤。两种逻辑混用，且如果 `deleted_at` 列不存在，所有已删除数据会重新出现。

**用户体验影响**: 某些情况下已删除的 todo 可能重新出现在列表中。

---

### H-07: "未来" 过滤器显示无时间的 todo

**文件**: `frontend/apps/todo-list/hooks/useOrderedTodos.ts` L12-17

没有设置时间的 todo 在 `dueTimeFilter === "future"` 时也被显示。

**用户体验影响**: 用户选择"未来"过滤器期望看到有未来时间的 todo，却看到大量无时间的 todo 混在其中。

---

### H-08: 通知内存存储无限增长

**文件**: `server/storage/notification_storage.py` L16-19

`_notifications` 和 `_dismissed_notifications` 两个内存字典只增不减，无 TTL 和大小上限。

**用户体验影响**: 长时间运行后服务端内存持续上升最终可能 OOM。

---

### H-09: 附件上传先写磁盘后验证 todo

**文件**: `server/routers/todo.py` L74-103

文件先写入磁盘（`target_path.write_bytes(content)`），然后才调用 `service.add_attachment` 验证 todo 是否存在。如果 todo 不存在，文件成为永久孤儿。

**用户体验影响**: 磁盘上积累无人引用的附件文件。

---

### H-10: delete_attachment 不清理磁盘文件

**文件**: `server/routers/todo.py` L108-115

只解绑 todo-attachment 关联，不删除实际文件和 attachment 记录。

**用户体验影响**: 磁盘持续膨胀。

---

### H-11: 三栏模式下面板宽度计算错误

**文件**: `frontend/lib/store/ui-store/store.ts` L276-308

`getFeatureWidth("panelB")` 在三栏模式下返回 `1 - panelAWidth`，实际应为 `1 - panelAWidth - panelCWidth`。`setFeatureWidth("panelB", w)` 同样没有考虑 panelC。

**用户体验影响**: 三栏布局时面板宽度计算错误，调整面板大小时行为异常。

---

### H-12: useToggleTodoStatus 读取原始缓存而非 select 转换后的数据

**文件**: `frontend/lib/query/todos.ts` L438-457

`queryClient.getQueryData<TodoListResponse>` 读取原始缓存格式，字段可能是 snake_case，与 `select` 转换后的 camelCase `Todo` 不一致。

**用户体验影响**: 在某些缓存状态下 toggle 可能因为找不到 todo 而失败。

---

## 四、Medium 级别（待修复）

### M-01: TOCTOU 竞态 — update/delete 先查后改

`server/services/todo_service.py` 的 `update_todo` 和 `delete_todo` 先调用 `get_by_id` 检查存在性，再在独立事务中执行操作。并发请求可能导致双重删除（500 错误）。

### M-02: 流式 API 跨 chunk 的 TOOL_EVENT 前缀丢失

`frontend/lib/api.ts` L249-263 — 如果一个 chunk 以 `"\n[TO"` 结尾（前缀的一部分），不会匹配完整前缀，工具事件被当作正常文本。

### M-03: 日历拖拽 pointer 事件闭包过时

`frontend/apps/calendar/views/DayView.tsx` L340-374 — `handleMove` 闭包在 `pointerdown` 时捕获 `displayStart` 等值，drag 过程中状态变化但闭包使用旧值。

### M-04: breakdown-store 使用 snake_case 的 parent_todo_id

`frontend/lib/store/breakdown-store.ts` L163-168 — 命名不一致，虽然运行时因 `camelToSnake` 幂等不会报错。

### M-05: WeekView 的 weekDays 未被 memo 化

每次 render 创建新 Date 数组，触发不必要的子组件重渲染。

### M-06: 布局切换不清除 autoClosedPanels 栈

`frontend/lib/store/ui-store/layout-actions.ts` — 切换布局预设时不清除自动关闭的面板记录，窗口变大时恢复旧布局中的面板。

### M-07: validatePanelFeatureMap 不检查重复功能

同一功能可以出现在两个面板位置，违反设计不变量。

### M-08: Electron requestSingleInstanceLock 的 lockName 无效

`frontend/electron/main.ts` L63-64 — Electron API 不支持 `lockName` 参数，`as never` 掩盖了问题。不同 serverMode 共享同一个锁。

### M-09: DnD pendingTodoId 的 150ms 固定超时竞态

`frontend/lib/dnd/context.tsx` — 硬编码 150ms 等待乐观更新传播，低性能设备上可能过早清除。

### M-10: 前端通知 notifiedIds Set 无限增长

`frontend/lib/store/notification-store.ts` — 只增不减的 Set 在长期运行的 Electron 应用中造成渐进内存泄漏。

### M-11: Fetcher 不转换查询参数的 key 命名

`frontend/lib/api/fetcher.ts` L117-119 — 请求体自动 camelToSnake，但查询参数 key 不转换。当前碰巧没问题但随时可能爆。

### M-12: useWindowAdaptivePanels 中 storeRef 可能读到过时状态

`frontend/lib/hooks/useWindowAdaptivePanels.ts` — `storeRef` 仅在 render 时更新，`ResizeObserver` 回调可能使用过时值。

### M-13: reorder_todos 报告更新数量不准

`server/services/todo_service.py` L295-299 — 不存在的 todo 被跳过但消息仍报告全部成功。

### M-14: who_founder/who_executor 在 update 路径未做空字符串清理

create 标准化为 None，update 允许空字符串 ""，数据不一致。

### M-15: deadline 到 start_time 的双层归一化

Service 层和 Storage 层各做一次字段同步，产生意外交互效果。

---

## 五、Low 级别（待修复）

### L-01: 配置变更日志泄露 API Key

`server/core/config_watcher.py` L88 — 当 key 为 `llm.api_key` 时，新旧值都打印到日志。

### L-02: AI plan 端点泄露内部错误信息

`server/routers/todo.py` L424 — `f"LLM 调用失败: {exc}"` 可能包含 API Key 和内部 URL。

### L-03: 生产代码遗留 console.log

`frontend/lib/dnd/context.tsx` L128, L140 — 每次拖拽操作输出调试日志。

### L-04: ui-store storage.ts 中 backendDisabledFeatures 验证是死代码

验证代码紧接着被默认值覆盖，完全无效。

### L-05: VALID_EXTERNAL_TOOL_IDS 硬编码限制外部工具扩展

验证白名单来自默认值，后端动态新增的工具无法被持久化保存。

### L-06: PanelRegion 双层 requestAnimationFrame 违背 useLayoutEffect 意义

高度修正延迟到 2 帧后，初始绘制会出现抖动。

### L-07: ResizeHandle MouseEvent 到 PointerEvent 不安全类型转换

`as unknown as ReactPointerEvent` 掩盖了类型不兼容。

### L-08: Electron cleanup 被重复调用

`before-quit` 和 `quit` 都调用 cleanup，如果不幂等可能产生错误。

### L-09: Electron bootstrap 失败返回未初始化的 TrayManager

错误恢复路径创建的管理器未调用初始化方法。

### L-10: 布局预设注释与代码不一致

`panelAWidth: 1/3` 但注释说"占左边 1/4"。

---

## 六、修复优先级建议

### 第一优先（Critical）— 已完成

所有 8 个 Critical 问题已在本次修复中处理。

### 第二优先（建议尽快处理）

1. **H-03** 双重防抖 — 影响每个用户的笔记编辑体验
2. **H-05** ChatPanel 时序 — 影响从 todo 跳转 AI 建议的核心工作流
3. **H-11** 三栏面板宽度 — 影响所有使用三栏布局的用户
4. **H-07** 未来过滤器 — 简单一行修复

### 第三优先（安全相关，部署前必须处理）

1. **H-01** CORS + 无鉴权 — 公网部署安全红线
2. **H-02** 路径穿越 — 添加路径白名单校验
3. **L-01/L-02** 日志泄密 — 敏感字段脱敏

### 第四优先（长期维护）

其余 Medium 和 Low 级别问题可根据开发节奏逐步处理。
