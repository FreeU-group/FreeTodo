# 语音模块完善建议

## 一、实时转录功能 ✅ 已实现

### 当前状态
- ✅ 已支持实时显示临时识别结果（灰色斜体，带动画）
- ✅ 最终结果会替换临时结果
- ✅ 用户体验：说话时立即看到文字，无需等待

### 实现方式
- 使用 `interimResults: true` 获取临时结果
- 临时结果用 `isInterim: true` 标记
- UI 区分显示：临时结果（灰色闪烁）vs 最终结果（正常显示）

---

## 二、系统集成建议

### 1. 日程 → Todo 自动创建 ⭐⭐⭐

**需求**：提取的日程自动创建为 Todo

**实现方案**：
```typescript
// 在 ScheduleExtractionService 中
const handleScheduleExtracted = async (schedule: ScheduleItem) => {
  addSchedule(schedule);
  
  // 自动创建 Todo
  const { useCreateTodo } = await import('@/lib/query/todos');
  const createTodo = useCreateTodo();
  
  await createTodo.mutateAsync({
    name: schedule.description,
    deadline: schedule.scheduleTime.toISOString(),
    startTime: schedule.scheduleTime.toISOString(),
    status: 'active',
    priority: 'medium',
    tags: ['语音提取', '日程'],
  });
};
```

**后端 API**：
- `POST /api/todos` - 创建 Todo
- 需要添加关联字段：`source_type: 'voice'`, `source_id: schedule.id`

---

### 2. 语音提取 Todo ⭐⭐⭐

**需求**：从语音中提取待办事项（不仅仅是日程）

**实现方案**：
- 扩展 `OptimizationService` 的 Prompt，识别待办事项
- 使用 LLM 提取：任务名称、截止时间、优先级
- 自动创建 Todo

**Prompt 示例**：
```
如果文本中包含待办事项（例如"记得买牛奶"、"明天要完成报告"），
请用 [TODO: 任务名称 | deadline: 时间 | priority: 优先级] 格式标记。
```

**后端集成**：
- 复用现有的 `/api/todo-extraction/extract` API
- 或创建新的 `/api/voice/todos/extract` 端点

---

### 3. 录音关联 Event ⭐⭐

**需求**：录音时间段关联到系统 Event（活动记录）

**实现方案**：
- 录音开始时，查找当前时间段的 Event
- 如果找到，将录音关联到 Event
- 在 Event 详情中显示录音和转录

**数据结构**：
```typescript
interface AudioSegment {
  // ... 现有字段
  eventId?: number;  // 关联的 Event ID
  eventTitle?: string; // Event 标题（快照）
}
```

**后端 API**：
- `GET /api/events?start_time=...&end_time=...` - 查询时间段内的 Event
- `PUT /api/events/{event_id}` - 更新 Event，添加录音关联

---

### 4. 语音控制 Todo ⭐⭐⭐⭐

**需求**：通过语音命令操作 Todo（创建、完成、删除等）

**实现方案**：
- 识别语音命令模式：`"完成待办：买牛奶"`、`"删除任务：写报告"`
- 使用 LLM 解析命令意图
- 调用相应的 Todo API

**命令模式**：
```
- "创建待办：XXX" → 创建 Todo
- "完成待办：XXX" → 查找并完成 Todo
- "删除待办：XXX" → 删除 Todo
- "设置优先级：XXX，高" → 更新优先级
```

**实现位置**：
- 在 `OptimizationService` 中添加命令识别
- 或创建新的 `VoiceCommandService`

---

### 5. 日历集成 ⭐⭐

**需求**：提取的日程显示在日历模块

**实现方案**：
- 日程提取后，自动同步到日历
- 日历模块读取 `schedules` 数据
- 支持双向同步：日历修改 → 更新语音日程

**数据结构**：
```typescript
interface ScheduleItem {
  // ... 现有字段
  calendarEventId?: string; // 日历事件 ID
  synced: boolean; // 是否已同步
}
```

---

### 6. 智能摘要 ⭐⭐⭐

**需求**：自动生成录音摘要

**实现方案**：
- 录音结束后，使用 LLM 生成摘要
- 摘要包含：关键信息、待办事项、日程安排
- 保存到 Event 或独立存储

**实现位置**：
- 在 `PersistenceService` 中添加摘要生成
- 调用 LLM API 生成摘要

---

### 7. 语音笔记 ⭐⭐⭐

**需求**：将录音作为笔记保存

**实现方案**：
- 录音可以标记为"笔记"
- 笔记模式：不提取日程/Todo，只保存转录文本
- 关联到日记模块（如果有）

**UI 改进**：
- 添加"笔记模式"开关
- 笔记列表单独显示

---

### 8. 多语言支持 ⭐

**需求**：支持英文等其他语言

**实现方案**：
- `RecognitionService` 支持语言切换
- `OptimizationService` 根据语言使用不同的 Prompt
- UI 国际化

---

### 9. 离线模式 ⭐⭐

**需求**：网络断开时仍可录音和识别

**实现方案**：
- 使用本地语音识别（Web Speech API 支持离线）
- 优化和上传延迟到网络恢复
- 本地存储队列

---

### 10. 搜索和过滤 ⭐⭐

**需求**：搜索历史录音和转录

**实现方案**：
- 全文搜索转录文本
- 按时间、关键词、日程过滤
- 高亮搜索结果

**后端 API**：
- `GET /api/transcripts/search?q=关键词&start_time=...&end_time=...`

---

## 三、技术优化建议

### 1. 性能优化
- **批量处理优化**：当前批量大小为 3，可调整为 5-10
- **防抖处理**：临时结果更新使用防抖，减少 UI 更新频率
- **虚拟滚动**：转录列表很长时使用虚拟滚动

### 2. 错误处理
- **重试机制**：优化服务失败时自动重试
- **降级策略**：LLM 不可用时，只显示原始转录
- **用户提示**：错误时给出明确的解决建议

### 3. 用户体验
- **快捷键**：支持空格键开始/停止录音
- **通知**：日程提取时显示通知
- **导出**：支持导出转录文本为 Markdown/TXT

### 4. 数据安全
- **加密存储**：敏感录音加密存储
- **权限控制**：录音权限管理
- **数据清理**：自动清理过期录音

---

## 四、优先级排序

### 高优先级（立即实现）
1. ✅ **实时转录显示** - 已完成
2. ⭐⭐⭐ **日程 → Todo 自动创建** - 核心功能
3. ⭐⭐⭐ **语音提取 Todo** - 核心功能

### 中优先级（近期实现）
4. ⭐⭐⭐⭐ **语音控制 Todo** - 提升用户体验
5. ⭐⭐ **录音关联 Event** - 系统集成
6. ⭐⭐⭐ **智能摘要** - 价值功能

### 低优先级（后续优化）
7. ⭐⭐ **日历集成** - 功能增强
8. ⭐⭐⭐ **语音笔记** - 功能扩展
9. ⭐⭐ **搜索和过滤** - 便利功能
10. ⭐ **多语言支持** - 国际化
11. ⭐⭐ **离线模式** - 稳定性

---

## 五、实现示例代码

### 日程 → Todo 自动创建

```typescript
// 在 VoiceModulePanel.tsx 中
import { useCreateTodo } from '@/lib/query/todos';

const createTodoMutation = useCreateTodo();

const handleScheduleExtracted = async (schedule: ScheduleItem) => {
  addSchedule(schedule);
  
  // 自动创建 Todo
  try {
    await createTodoMutation.mutateAsync({
      name: schedule.description,
      deadline: schedule.scheduleTime.toISOString(),
      startTime: schedule.scheduleTime.toISOString(),
      status: 'active',
      priority: 'medium',
      tags: ['语音提取', '日程'],
    });
    
    // 更新日程状态为已创建
    updateSchedule(schedule.id, { 
      status: 'confirmed',
      todoId: result.id 
    });
  } catch (error) {
    console.error('创建 Todo 失败:', error);
  }
  
  // 原有的保存逻辑
  setTimeout(() => {
    const currentSchedules = useAppStore.getState().schedules;
    const pendingSchedules = currentSchedules.filter(s => s.status === 'pending');
    if (pendingSchedules.length >= 5 && persistenceServiceRef.current) {
      persistenceServiceRef.current.saveSchedules(pendingSchedules);
    }
  }, 100);
};
```

---

## 六、总结

语音模块已经具备了良好的基础架构，通过以上改进可以：
1. **提升用户体验**：实时转录、语音控制
2. **增强系统集成**：与 Todo、Event、日历无缝对接
3. **扩展功能边界**：笔记、摘要、搜索等

建议优先实现**日程→Todo**和**语音提取Todo**功能，这两个功能最能体现语音模块的价值。

---

**文档版本**：v1.0  
**最后更新**：2025-12-21  
**维护者**：LifeTrace Team From zy

