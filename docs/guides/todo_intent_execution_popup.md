# Todo 意图执行弹窗

## 适用范围

本文描述感知流识别出 `pending_todo` / `pending_execute` 后，Electron 交互弹窗如何承接确认和执行。

相关实现：

- `server/routers/intent_actions.py`
- `server/services/perception_todo_intent/pending_actions.py`
- `server/services/perception_todo_intent/execution_engine.py`
- `frontend/electron/notification-popup-manager.ts`

## 当前交互目标

`executable` 类型的意图不再把“执行”理解成一个后台黑盒动作，而是要求：

- 用户在同一个弹窗里完成“确认是否执行”的决策
- 用户点击“执行”后，弹窗原地切换到执行态，不关闭
- 执行计划、实时动作和文字日志都在同一个弹窗里持续更新
- 完成或失败后，结果保留在当前弹窗中，等待用户手动关闭

`todo` 类型则继续使用轻量确认流，只负责“确认添加 / 忽略”。

## 状态机

### 1. 待确认态

入口：

- `notification-poller` 从通知表中发现 `pending_todo` / `pending_execute`
- 或 `todo-intent-stream-store` 在 `queued_review` 记录中直接触发 Electron 弹窗

展示内容：

- 任务标题与说明
- 识别类型提示
- 对 `executable` 展示预期执行计划摘要
- 操作按钮

按钮规则：

- `todo`：`确认` / `忽略`
- `executable`：`执行` / `仅添加待办` / `忽略`

### 2. 执行中态

点击 `执行` 后：

1. 前端调用 `POST /api/intent-actions/{action_id}/execute`
2. 后端将 `PendingAction.status` 切换到 `executing`
3. `execution_engine` 启动子 Agent
4. 弹窗切换为进度模式，并轮询 `GET /api/intent-actions/{action_id}/progress`

展示内容：

- 顶部状态徽标：`执行中`
- `执行计划` 区块：展示预设 `execution_plan`
- `实时动作` 区块：展示由工具调用事件生成的 `execution_steps`
- `结果/日志` 区块：展示 `streaming_output`

## 数据约定

`GET /api/intent-actions/{action_id}/progress` 需要返回：

- `title`
- `description`
- `status`
- `execution_plan`
- `execution_steps`
- `streaming_output`
- `result`

其中：

- `execution_plan` 是意图识别阶段给出的预设步骤
- `execution_steps` 是执行阶段维护的结构化步骤列表
- `streaming_output` 是面向用户的实时文本输出
- `result` 是执行完成后的最终总结

## 步骤维护规则

`PendingAction` 在创建时会先用 `execution_plan` 预填一组 `plan_*` 步骤。

执行过程中：

- 子 Agent 开始执行后，后端把第一个 `plan_*` 步骤标记为 `running`
- 收到工具调用开始事件时，写入或更新 `tool_<tool_name>` 步骤为 `running`
- 收到工具调用结束事件时，把对应 `tool_<tool_name>` 步骤标记为 `done` 或 `failed`
- 执行成功后，把全部 `plan_*` 步骤标记为 `done`
- 执行失败或取消时，把当前计划步骤标记为 `failed`

这套结构不是完整的 agent plan 系统，而是给弹窗提供足够稳定的“当前在做什么”视图。

## 完成态

执行完成或失败后：

- 停止轮询
- 弹窗继续停留在当前任务上
- 顶部状态切换为 `已完成` 或 `执行失败`
- 保留计划、动作、结果文本
- 只显示 `关闭` 按钮

关闭后：

- 当前弹窗出队
- 如果队列中还有下一条交互项，则继续展示下一条

## 设计约束

- 该弹窗承担“即时处理”职责，不替代 Todo 详情页
- Todo 详情页仍适合查看长期产物、附件和更完整的计划视图
- 若后续要统一到单一执行体验，优先复用这里的状态语义：`待确认 -> 执行中 -> 完成/失败`
