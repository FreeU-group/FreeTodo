# 感知流下游模块：意图识别与结构化待办提取技术设计

## 一、背景与动机

当前 `Perception Stream` 已将音频 ASR、OCR、用户输入等统一为 `PerceptionEvent`，但“待办识别”仍分散在特定链路（如音频提取、事件截图提取）中，存在以下问题：

- 触发路径分裂：不同感知源的待办提取逻辑不统一，复用低。
- 成本不可控：所有文本都直接进入提取模型，token 成本高。
- 跨模态弱：无法对“同一语义在多个事件中逐步成形”的场景做统一识别。
- 整合不一致：提取结果落地 Todo 时缺少统一去重与证据链。

目标是在感知流下游新增一个统一的"意图识别模块"，作为 `PerceptionStream` 的下游订阅者，替换现有分散的待办提取逻辑。模块采用多阶段流水线：

1. 非阻塞接收：`on_event` 回调立即入队，不阻塞感知流 dispatch loop。
2. 短窗聚合：按时间窗口聚合多模态事件为统一上下文。
3. Pre-Gate 去重：过滤重复文本，减少模型调用。
4. Stage-1 Gate（小模型）：判断是否值得进入待办提取。
5. Stage-2 Extractor（大模型）：提取结构化待办。
6. Integration：归一化、去重、入库（或进入待确认池）。

感知流遵循 **text-first** 原则，所有模态（音频 ASR、OCR、用户输入）均已归一化为 `content_text`，意图识别模块统一基于文本处理，不依赖原始图像或音频。

## 二、设计目标

### 2.1 目标

- 高召回：尽量不漏掉真实待办意图。
- 低成本：通过 Gate 显著减少大模型调用次数。
- 可追踪：每条待办可追溯到原始 `PerceptionEvent` 证据。
- 可扩展：后续可平滑接入更多感知源/模型。
- 不阻塞感知流：订阅者回调立即返回，LLM 处理在独立 worker 协程中进行。

### 2.2 非目标（MVP）

- 不做复杂项目管理推理（如自动拆解多级子任务）。
- 不做跨天长时记忆推理（只处理短窗口上下文）。
- 不强依赖前端改造（先以后端可用为主）。
- 不依赖原始截图图像（统一使用 OCR 文本，即 `content_text`）。

## 三、整体架构

```text
PerceptionStream(事件总线)
        │ subscribe（on_event 回调）
        ▼
TodoIntentSubscriber.on_event()
  └── asyncio.Queue.put(event)   ← 立即返回，不阻塞 dispatch loop
        │
        │（独立 _worker_loop 协程）
        ▼
事件预过滤（source/modality/长度/噪声）
        │
        ▼
窗口内去重（intra-window dedup）
  同一来源的重复文本不重复加入窗口缓存
        │
        ▼
短窗聚合（按时间窗口 + 触发条件）→ 构建 TodoIntentContext
        │
        ▼
Pre-Gate 跨窗口去重
  检查 merged_text 是否在缓存有效期内已处理过
  输出：dedupe_hit / dedupe_key / reason
        │
        ├─ hit -> 跳过 Gate（记录指标）
        ▼
Stage-1 Gate（小模型）
  输出：should_extract / reason
        │
        ├─ false -> 结束（记录指标）
        ▼
Stage-2 Extractor（大模型）
  输出：结构化 todo_candidates[]
        │
        ▼
Post Processor
  时间标准化 / 字段补全 / 去重 / 置信度校准
        │
        ▼
Todo Integration
  create/update/draft + evidence 关联 + 审计日志
```

## 四、核心概念与数据结构

### 4.1 输入上下文 `TodoIntentContext`

由感知流事件聚合得到：

- `context_id`: 上下文唯一 ID
- `events`: `PerceptionEvent[]`（按 `sequence_id` 排序）
- `merged_text`: 合并文本（用于 LLM）
- `time_window`: `{start, end}`
- `source_set`: 涉及来源（`mic_pc`/`mic_hardware`/`ocr_screen`/`ocr_proactive`/`user_input`，即 `SourceType` 枚举全集）
- `metadata`: 应用名、窗口标题、speaker、置信度等

**`merged_text` 构建规则：**

多个事件的 `content_text` 按 `sequence_id` 顺序拼接，不同来源之间加来源标注：

```
[音频] 嗯下午三点好像有课
[OCR] 张三: 下午3点能开会吗？
[输入] 帮我记一下
```

- 来源标注：`mic_pc`/`mic_hardware` → `[音频]`，`ocr_screen`/`ocr_proactive` → `[OCR]`，`user_input` → `[输入]`
- 总长度超过 `max_context_chars` 时，优先保留高优先级来源（`user_input > audio > ocr`），从低优先级末尾截断。

### 4.2 通用去重指纹 `DedupeFingerprint`

在构建 `TodoIntentContext` 后、进入 Gate 前，检查该上下文的文本是否在近期（TTL，Time To Live，缓存有效期内）已经被处理过。目的是防止同一段内容在多个连续聚合窗口中重复消耗 Gate 和 Extractor（例如：同一条微信消息被 OCR 多次捕获，或用户反复提到同一件事）。

去重粒度是**跨窗口**的：当前窗口内的事件在入缓存时已经过窗口内去重（见下文），`merged_text` 中不会出现重复行。

- `canonical_text`: 归一化文本（大小写、空白、标点、口语噪声清洗）
- `context_anchor`: `app/window/speaker` 等上下文锚点
- `time_bucket`: 时间桶（例如 10 秒），用于将短时间内的同源文本归为同一 key
- `exact_key`: `hash(canonical_text + context_anchor + time_bucket)`
- `semantic_key`（可选）：用于近似去重（SimHash/Embedding）

去重结果：

- `dedupe_hit=true`：该文本在缓存有效期（TTL，`exact_window_seconds`）内已处理过，跳过 Gate，节省 token
- `dedupe_hit=false`：未命中缓存，进入 Gate

### 4.3 Gate 输出 `IntentGateDecision`

```json
{
  "should_extract": true,
  "reason": "包含明确承诺与时间约定"
}
```

### 4.4 提取输出 `ExtractedTodoCandidate`

建议与现有 `TodoCreate` 对齐（最小必填为 `name`）：

- `name`: 待办标题（必填）
- `description`: 详细描述
- `start_time` / `due` / `deadline`: 时间字段（统一转 UTC 存储）
- `time_zone`: 时区（默认用户时区）
- `priority`: `high|medium|low|none`
- `tags`: 标签数组
- `confidence`: 0~1
- `source_text`: 证据原文
- `source_event_ids`: 来源事件 ID 列表（由 Post Processor 从上下文中填充，不要求 Extractor 输出）

### 4.5 整合结果 `TodoIntegrationResult`

- `action`: `created | updated | skipped | queued_review`
- `todo_id`: 创建/更新后的 todo id
- `dedupe_key`: 去重键
- `reason`: 跳过或合并原因

## 五、多阶段流水线设计

### 5.0 窗口内去重（事件入缓存时）

#### 目标

防止同一模态的重复文本在同一聚合窗口内多次出现，避免 `merged_text` 重复堆叠（典型场景：OCR_SCREEN 与 OCR_PROACTIVE 在 20 秒窗口内同时捕获到同一屏幕内容）。

#### 策略

事件从内部队列取出后、写入窗口缓存前，检查：

- 当前窗口缓存中是否已存在来自**相同模态**（`modality`）且 `canonical_text` 相同（或包含关系）的事件。
- 若命中：丢弃新事件（或更新已有事件的时间戳），不重复加入缓存。
- 若未命中：正常加入缓存。

联调阶段说明：

- 当前实现采用“同模态去重”而非“同 source 去重”，原因是 `ocr_screen` 与 `ocr_proactive` 在同窗口下常有高重复，仅按 source 去重不够干净。
- 该策略会降低 OCR 冗余，但会让精确的单条证据映射更困难（`source_text -> source_event_ids` 可能不是稳定的一对一关系）。

#### 与跨窗口去重的区别

| | 窗口内去重 | 跨窗口去重（Pre-Gate） |
|--|-----------|----------------------|
| 发生时机 | 事件入缓存时（逐条） | 窗口触发后（整体） |
| 操作对象 | 单条事件 vs 当前窗口已有事件 | 整个 `merged_text` vs 历史缓存 |
| 目的 | 防止 `merged_text` 重复堆叠 | 防止相同内容跨窗口重复跑模型 |

### 5.1 Stage-0：跨窗口去重（进入 Gate 前）

#### 目标

- 过滤短时间内跨源重复内容，减少 Gate 与 Extractor 的重复调用。
- 保持来源无关（audio / ocr / user_input 统一规则）。

#### 策略

- 精确去重（默认开启）：基于 `exact_key + 缓存有效期（TTL）`。
- 近似去重（可选）：文本相似度超过阈值时命中。
- 命中后的行为：记录 `dedupe_hit` 指标并结束当前上下文处理。

#### 实现建议

- 内存 LRU + 缓存有效期（TTL，Time To Live）（MVP），后续可切 Redis。
- 去重缓存项存储：`dedupe_key`、首条 `event_id`、命中次数、过期时间（TTL，Time To Live）。

### 5.2 Stage-1：小模型 Gate（是否提取）

#### 输入

- `merged_text`（主输入）
- 精简元信息：`source_set`（本次上下文涉及的所有来源）、`app`、`speaker`、最近时间窗口

#### 输出约束

- 严格 JSON，至少包含：`should_extract`（bool）、`reason`（str）
- 允许扩展字段：`intent_type`、`evidence`

#### 策略

- 先规则预筛：空文本、超短文本、纯噪声直接跳过。
- 仅对 `pre-gate dedupe miss` 的上下文调用 Gate。
- 再 LLM Gate：高召回优先，但排除教程/示例/广播等误报场景。
- 失败降级：Gate 解析失败时默认 `should_extract=true`（保召回）。

#### 实现复用

Gate 的 JSON 解析与容错逻辑直接复用 `services/audio_extraction/gate.py` 中的 `parse_gate_response()`、`coerce_gate_bool()`、`coerce_gate_decision()`，无需重新实现。

#### 模型建议

- 默认：低成本文本模型（如 `qwen-turbo` 级别）
- 配置项：`perception.todo_intent.gate.model`

### 5.3 Stage-2：大模型 Extractor（结构化提取）

#### 输入

- Gate 命中的 `TodoIntentContext`
- 标准化系统提示词 + 用户提示词（要求仅返回 JSON）

#### 输出约束（示例）

```json
{
  "todos": [
    {
      "name": "下午3点前发送需求文档",
      "description": "发送给张三并抄送项目群",
      "start_time": null,
      "due": "2026-02-18T15:00:00+08:00",
      "priority": "high",
      "tags": ["工作", "沟通"],
      "confidence": 0.82,
      "source_text": "我明天下午三点前把需求文档发你"
    }
  ]
}
```

理想状态：`source_event_ids` 由 Post Processor 根据 `source_text` 与上下文事件匹配后填充，不要求 Extractor 输出。

#### 后处理

- 时间解析：复用现有时间解析工具，统一绝对时间。
- 字段归一：映射到 `TodoCreate` 字段。
- 去重键：`hash(name + due + source_text_normalized)`。
- 多候选裁剪：限制每个上下文最大提取条数（默认 5）。
- `source_event_ids`（联调阶段临时实现）：由于窗口内采用同模态去重，且输入中未携带稳定逐行锚点，当前先回填当前上下文 `event_ids` 作为上下文级证据，不保证精确到单条事件。
- `source_event_ids`（后续目标）：在去重策略稳定后，恢复为基于 `source_text` 的精确事件映射。

#### 模型建议

- 默认：`llm.todo_extraction_model`（未配置则回退主模型）
- 配置项：`perception.todo_intent.extractor.model`

## 六、整合策略（Integration）

### 6.1 入库模式

- `draft` 模式（默认）：创建 `status=draft` 的 Todo，待用户确认。
- `active` 模式：直接创建激活态 Todo（仅在高置信阈值下）。
- `review_queue` 模式：只入候选表，不直接建 Todo。

### 6.2 去重与更新

- Pre-Gate 去重：避免重复文本重复进模型（省成本）。
- 短窗去重：同一 `dedupe_key` 在 N 分钟内只处理一次。
- 近似去重：标题相似 + 时间接近时合并为同一候选。
- 更新策略：命中已有未完成 Todo 时补充描述/证据，不重复创建。

### 6.3 证据链

- 记录 `source_event_ids`、`source_text`、`gate_decision`、模型版本。
- 便于后续前端展示“该待办来自哪句语音/OCR 文本”。

## 七、模块划分（建议）

```text
lifetrace/
├── perception/
│   └── subscribers/
│       ├── __init__.py
│       └── todo_intent_subscriber.py      # 订阅 stream，内部队列 + worker 协程
├── services/
│   └── perception_todo_intent/
│       ├── __init__.py
│       ├── orchestrator.py                # Gate + Extract + Integration 编排
│       ├── gate.py                        # 复用 audio_extraction/gate.py 的解析工具函数
│       ├── extractor.py                   # 大模型提取
│       ├── normalizer.py                  # 时间/字段归一化
│       ├── dedupe.py                      # 通用去重引擎（pre-gate + post-extract）
│       └── integration.py                 # TodoService 落库与证据写入
├── schemas/
│   └── perception_todo_intent.py          # 内部/调试接口 schema
└── routers/
    └── perception_todo_intent.py          # 可选：状态与回放接口
```

## 八、配置设计（建议）

在 `default_config.yaml` 增加：

```yaml
perception:
  todo_intent:
    enabled: true
    mode: draft # draft | active | review_queue
    window_seconds: 20
    max_context_chars: 5000
    max_todos_per_context: 5
    internal_queue_maxsize: 200       # subscriber 内部队列上限，超出时丢弃低优先级事件
    pre_gate_dedupe:
      enabled: true
      exact_window_seconds: 90        # 去重缓存有效期 TTL（Time To Live），比聚合窗口长，防止跨窗口重复提取
      similarity_enabled: false
      similarity_threshold: 0.92
      max_cache_size: 5000
    gate:
      enabled: true
      model: qwen-turbo
      temperature: 0.0
      max_tokens: 160
      min_text_length: 8
    extractor:
      model: "" # 空则回退 llm.todo_extraction_model 或 llm.model
      temperature: 0.2
      max_tokens: 800
    integration:
      post_extract_dedupe_window_seconds: 600
      create_confidence_threshold: 0.7
      update_confidence_threshold: 0.75
```

## 九、时序流程（MVP）

### 9.1 两阶段异步架构

感知流 dispatch loop 与意图识别处理完全解耦：

```text
感知流 dispatch loop（不可阻塞）
    │
    │ on_event(event)
    ▼
TodoIntentSubscriber.on_event()
    └── self._queue.put_nowait(event)   ← 立即返回

独立 _worker_loop 协程（后台运行，与 dispatch loop 无关）
    │
    ├─ 1. 从 _queue 取事件，执行窗口内去重后写入短窗缓存
    ├─ 2. 检查触发条件，构建 TodoIntentContext
    ├─ 3. Pre-Gate 去重
    ├─ 4. Stage-1 Gate LLM 调用
    ├─ 5. Stage-2 Extractor LLM 调用
    └─ 6. Integration 落库
```

### 9.2 窗口触发条件

每个事件入队后，worker 检查是否触发处理：

- **定时触发**：距上次处理超过 `window_seconds`（默认 20 秒），且缓存非空。
- **立即触发**：收到 `user_input` 类型事件时立即触发（用户主动输入优先级最高）。
- **长度触发**：缓存内 `merged_text` 超过 `max_context_chars` 时立即触发，防止上下文过长。

触发后清空当前窗口缓存，开始新一轮聚合。

### 9.3 完整处理步骤

1. `_worker_loop` 从内部队列取事件，执行窗口内去重后写入短窗缓存。
2. 满足触发条件后，构建 `TodoIntentContext`（含 `merged_text`）。
3. 执行 `Pre-Gate` 通用去重：
   - `hit`：跳过 Gate，记录命中指标。
   - `miss`：进入 Stage-1 Gate。
4. 调用 Stage-1 Gate：
   - `false`：记录指标并结束。
   - `true`：进入 Stage-2。
5. Stage-2 输出 `todos[]`，进入后处理与去重。
6. 根据模式执行 `create/update/queued_review`。
7. 记录审计日志与指标（成功率、耗时、token、创建数、去重率）。

## 十、异常与降级

- Gate 异常：默认放行到 Extractor（避免漏召回）。
- Extractor 异常：重试 1 次（更严格 JSON 提示）；仍失败则只记录候选失败日志。
- 下游落库异常：不阻塞主感知流，写失败队列异步补偿。
- 内部队列满：按感知流优先级丢弃低优先级事件（`ocr_screen` priority=0 最先被丢弃）。
- 背压场景：遵循 `PerceptionStream` 优先级丢弃策略，模块内再做长度裁剪。

## 十一、可观测性

关键指标：

- `todo_intent_gate_qps` / `todo_intent_extract_qps`
- `todo_intent_pre_gate_dedupe_hit_rate`
- `todo_intent_gate_pass_rate`
- `todo_intent_extract_success_rate`
- `todo_intent_create_count` / `update_count` / `dedupe_count`
- `todo_intent_internal_queue_drop_count`（内部队列丢弃计数）
- P50/P95 端到端延迟
- 按模型维度 token 消耗与成本

日志字段建议统一包含：

- `context_id`、`event_ids`、`gate_model`、`extract_model`、`decision`、`todo_count`

## 十二、测试方案

### 12.1 单元测试

- Pre-Gate 去重键生成与 TTL 过期逻辑。
- 跨 source 的重复文本命中行为（通用去重有效性）。
- Gate JSON 解析与容错（复用 `services/audio_extraction/gate.py` 的测试用例）。
- 去重键一致性与近似去重规则。
- 时间解析与时区转换。
- 结构化结果到 `TodoCreate` 的字段映射。
- `merged_text` 构建规则（来源标注、截断策略）。
- 窗口触发条件（定时/立即/长度三种触发）。

### 12.2 集成测试

- 多源事件（音频+OCR）合并后提取。
- Gate false 路径不触发 Extractor。
- Extractor 输出异常 JSON 的重试与降级。
- `draft/active/review_queue` 三种整合模式。
- `on_event` 回调不阻塞感知流（验证 dispatch loop 延迟不受 LLM 调用影响）。

### 12.3 回归测试

- 感知流吞吐下的延迟与丢弃率可控。
- 内部队列满时低优先级事件被正确丢弃，高优先级事件正常处理。

## 十三、实施计划

### Phase 1（MVP）

- 打通 `PerceptionStream -> 内部队列 -> Gate -> Extract -> draft Todo` 最短闭环。
- 处理所有文本类事件：`audio`（mic_pc/mic_hardware）、`ocr_proactive`、`user_input`。
- 复用 `services/audio_extraction/gate.py` 的解析工具函数。

### Phase 2

- 接入 `ocr_screen`，支持跨模态短窗聚合。
- 增加证据链落库与调试接口。
- 流程验证稳定后，移除旧的分散提取逻辑：
  - `llm/auto_todo_detection_service.py`
  - `llm/ocr_todo_extractor.py`
  - `services/audio_extraction_service._auto_extract_todos()`
  - `jobs/proactive_ocr/service.py` 中的直接提取调用

### Phase 3

- 引入更精细去重（语义相似度）与用户反馈闭环（采纳/驳回反哺 Gate）。

## 十四、开放问题

1. 同一待办跨多个上下文重复出现时，采用“更新原 Todo”还是“生成子任务”？
2. `draft` 与 `active` 的切换阈值是否按用户个性化学习？
3. 是否需要独立候选表保存所有“未入库”的提取结果用于复盘？
4. 前端是否需要“待办来源证据”可视化面板作为 Phase 2 范围？
5. 在“同模态窗口去重”前提下，`source_text -> source_event_ids` 应采用何种稳定映射策略（输入锚点、后处理匹配、还是混合方案）？

## 十五、当前联调阶段补充（临时约束）

为优先跑通“感知流 -> 意图识别 -> 前端可视化”闭环，当前阶段采用以下临时约束。该约束优先级高于上文 Phase 计划中的入库动作。

### 15.1 本阶段目标

- 先跑通实时识别链路与可视化，不做 Todo 自动入库。
- 提取结果先保存在进程内存中（候选池/状态缓存），用于前端面板实时展示与联调。
- 等识别质量、稳定性、前后端交互确认无问题后，再开启数据库写入与证据链持久化。

### 15.2 后端实现范围（立即执行）

- `Stage-1 Gate` 与 `Stage-2 Extractor` 本阶段必须接入真实 LLM 调用，不再使用占位逻辑。
- 实现方式参考 `audio` 链路，优先复用 `services/audio_extraction/gate.py` 的 JSON 解析与容错能力：
  - `parse_gate_response()`
  - `coerce_gate_bool()`
  - `coerce_gate_decision()`
- 模型调用直接走 OpenAI 兼容接口（按当前项目 LLMClient 配置），Gate 与 Extractor 均输出严格 JSON。
- 本阶段 `Integration` 仅做内存态状态更新，不执行 `todo` 表写入。
- 本阶段暂不实现 `source_text -> source_event_ids` 的精确映射；先保留上下文级证据，待去重策略稳定后再实现精确引用。

### 15.3 前端面板实现范围（立即执行）

- 在前端新增“意图识别实时面板”，整体交互参考现有感知流实时展示方式（WebSocket/流式事件）。
- 面板应实时展示至少以下信息：
  - 窗口与上下文信息：`app/window/source/speaker/time_window`
  - 输入与聚合文本：`content_text/merged_text`
  - Gate 结果：`should_extract/reason`
  - Extractor 结果：候选 todo 列表（名称、时间、置信度、来源文本）
  - 处理状态：排队中/已处理/失败
- “创建 Todo”在本阶段仅指面板内可见的创建结果展示（联调态），不作为后端自动落库动作。

### 15.4 阶段切换条件（后续）

当以下条件满足后，再进入“持久化与收敛”阶段：

- Gate/Extractor 识别效果达到可用阈值（召回与误报可接受）。
- 实时面板联调稳定，关键异常路径可观测、可回放。
- 内存态流程经过一轮真实使用验证，数据结构与交互字段基本稳定。

进入下一阶段后再执行：

- 开启 Integration 数据库写入（`draft/active/review_queue` 模式按配置落地）。
- 增加证据链持久化与审计字段。
- 逐步移除旧分散链路（`auto_todo_detection_service`、`ocr_todo_extractor`、`audio_extraction_service` 直提取、`proactive_ocr` 直提取）。
