# Todo 意图执行弹窗

## 适用范围

本文描述感知流识别出 `pending_todo` / `pending_execute` 后，Electron 交互弹窗如何承接确认和执行。

相关实现：

- `server/routers/intent_actions.py`
- `server/services/perception_todo_intent/pending_actions.py`
- `server/services/perception_todo_intent/execution_engine.py`
- `scripts/signal-sensor.py`
- `frontend/scripts/pending-action-popup.js`

## 当前交互目标

`executable` 类型的意图不再把“执行”理解成一个后台黑盒动作，而是要求：

- 用户在同一个弹窗里完成“确认是否执行”的决策
- 用户点击“执行”后，弹窗原地扩展成 mini chat，不关闭
- 执行计划、实时动作和聊天消息都在同一个弹窗里持续更新
- 完成或失败后，结果保留在当前弹窗中，等待用户手动关闭
- 对短时间内重复出现的同内容意图，要在弹窗层做抑制，避免反复确认轰炸

`todo` 类型则继续使用轻量确认流，只负责“确认添加 / 忽略”。

## 状态机

### 1. 待确认态

入口：

- `signal-sensor` 轮询到 `pending_todo` / `pending_execute` 通知后，拉起专用的 pending action popup

展示内容：

- 任务标题与说明
- 识别类型提示
- 对 `executable` 展示预期执行计划摘要
- 操作按钮

按钮规则：

- 统一为：`确认` / `确认并执行` / `忽略`
- `确认`：创建 Todo 后关闭弹窗
- `确认并执行`：先创建 Todo，再在当前弹窗内进入执行聊天

### 2. 执行聊天态

点击 `确认并执行` 后：

1. 弹窗调用 `POST /api/intent-actions/{action_id}/confirm-and-execute`
2. 后端先创建 Todo，再创建或恢复执行专用 chat session，并返回 `session_id`
3. 弹窗原地进入“建立执行会话中”的过渡态，不关闭
4. 建立成功后，弹窗原地切换为 mini chat 视图
5. 弹窗使用同一个 `session_id` 直接调用 `/api/chat/stream`
6. 后续用户输入继续发送到同一个 chat session，不再新开窗口

展示内容：

- 顶部状态徽标：`执行中`
- `执行计划` 区块：展示预设 `execution_plan`
- `执行对话` 区块：展示 `user / assistant / tool / system` 聊天气泡
- 底部输入框：允许用户在执行过程中直接继续发消息
- 工具调用会作为 `tool` 气泡即时出现

## 数据约定

`POST /api/intent-actions/{action_id}/confirm-and-execute` 需要返回：

- `session_id`
- `initial_message`
- `initial_user_input`
- `selected_tools`
- `external_tools`
- `todo_id`

其中：

- `session_id` 是这次弹窗执行使用的唯一聊天会话
- `initial_message` 是第一次发给 Agno 的完整 kickoff prompt
- `initial_user_input` 是弹窗里显示给用户的第一条用户消息
- `selected_tools / external_tools` 用于保证弹窗后续消息继续走同一组 agent 能力

## 步骤维护规则

`PendingAction` 在创建时会先用 `execution_plan` 预填一组 `plan_*` 步骤，并在第一次执行时记录 `execution_session_id`。

执行聊天过程中：

- 弹窗第一条消息会触发 kickoff prompt 的流式执行
- 后续每次用户输入都继续写入同一个 `session_id`
- tool event 会直接在弹窗里渲染成聊天消息
- assistant 文本 chunk 会持续追加到当前 assistant 气泡

这套结构本质上是“popup first”的执行聊天体验，弹窗本身就是主执行界面，而不是后台任务的附属观察窗。

## 完成态

用户主动关闭后：

- 当前弹窗出队
- 如果队列中还有下一条交互项，则继续展示下一条

## 设计约束

- 该弹窗承担“即时处理 + 持续对话”职责
- 不再依赖“展开到中枢”来承接执行过程
- Todo 详情页仍适合查看长期产物、附件和更完整的计划视图
- 当上游在短时间内连续生成多个相似 `PendingAction` 时，弹窗侧需要用 `actionType + title + description` 做短时去重抑制
