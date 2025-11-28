# 前端配置键名对照表

本文档记录前端使用的配置键名及其与后端配置路径的对应关系。

## 配置键名映射

根据新的命名规则，前端使用完全驼峰形式的配置键，后端自动将其转换为点分隔+下划线格式。

| 前端键名 | 后端配置路径 | 说明 |
|---------|------------|------|
| **LLM 配置** | | |
| `llmApiKey` | `llm.api_key` | LLM API 密钥 |
| `llmBaseUrl` | `llm.base_url` | LLM API 基础 URL |
| `llmModel` | `llm.model` | LLM 模型名称 |
| `llmTemperature` | `llm.temperature` | LLM 温度参数 |
| `llmMaxTokens` | `llm.max_tokens` | LLM 最大 Token 数 |
| **录制配置** | | |
| `jobsRecorderEnabled` | `jobs.recorder.enabled` | 是否启用录制 |
| `jobsRecorderInterval` | `jobs.recorder.interval` | 截图间隔（秒） |
| `jobsRecorderParamsScreens` | `jobs.recorder.params.screens` | 屏幕选择 |
| `jobsRecorderParamsDeduplicate` | `jobs.recorder.params.deduplicate` | 是否去重 |
| `jobsRecorderParamsAutoExcludeSelf` | `jobs.recorder.params.auto_exclude_self` | 是否自动排除自身 |
| **黑名单配置** | | |
| `jobsRecorderParamsBlacklistEnabled` | `jobs.recorder.params.blacklist.enabled` | 是否启用黑名单 |
| `jobsRecorderParamsBlacklistApps` | `jobs.recorder.params.blacklist.apps` | 黑名单应用列表 |
| **清理配置** | | |
| `jobsCleanDataParamsMaxDays` | `jobs.clean_data.params.max_days` | 保留天数 |
| `jobsCleanDataParamsMaxScreenshots` | `jobs.clean_data.params.max_screenshots` | 最大截图数 |
| **聊天配置** | | |
| `chatEnableHistory` | `chat.enable_history` | 是否启用上下文历史 |
| `chatHistoryLimit` | `chat.history_limit` | 上下文轮次限制 |
| **服务器配置** | | |
| `serverHost` | `server.host` | 服务器主机 |
| `serverPort` | `server.port` | 服务器端口 |
| **UI 配置** | | |
| `uiTheme` | `ui.theme` | 主题模式 (light/dark/system) |
| `uiLanguage` | `ui.language` | 界面语言 |
| `uiNotifications` | `ui.notifications` | 是否启用通知 |
| `uiSoundEnabled` | `ui.sound_enabled` | 是否启用声音 |
| `uiAutoSave` | `ui.auto_save` | 是否自动保存 |

## 使用示例

### SettingsModal.tsx

```typescript
interface ConfigSettings {
  llmApiKey: string;
  llmBaseUrl: string;
  llmModel: string;
  llmTemperature: number;
  llmMaxTokens: number;
  jobsRecorderEnabled: boolean;
  jobsRecorderInterval: number;
  jobsRecorderParamsBlacklistEnabled: boolean;
  jobsRecorderParamsBlacklistApps: string[];
  chatEnableHistory: boolean;
  chatHistoryLimit: number;
}

// 加载配置
const config = response.data.config;
const newSettings = {
  llmApiKey: config.llmApiKey || '',
  llmBaseUrl: config.llmBaseUrl || '',
  llmModel: config.llmModel || 'qwen3-max',
  // ...
};

// 保存配置
await api.saveConfig({
  llmApiKey: settings.llmApiKey,
  llmBaseUrl: settings.llmBaseUrl,
  llmModel: settings.llmModel,
  // ...
});
```

### API 接口

```typescript
// lib/api.ts
testLlmConfig: (config: {
  llmApiKey: string;
  llmBaseUrl: string;
  llmModel?: string;
}) => apiClient.post('/api/test-llm-config', config),

saveAndInitLlm: (config: {
  llmApiKey: string;
  llmBaseUrl: string;
  llmModel: string;
}) => apiClient.post('/api/save-and-init-llm', config),
```

## 注意事项

1. **统一命名规范**：前端所有配置键都使用驼峰命名，后端自动转换
2. **嵌套路径**：多级配置路径在前端也是完全驼峰的，如 `jobsRecorderParamsBlacklistEnabled`
3. **类型安全**：TypeScript 类型定义已更新，确保类型安全
4. **向后兼容**：后端同时支持旧的和新的键名格式（暂时）

## 迁移清单

- [x] 更新 `SettingsModal.tsx` 中的配置键名
- [x] 更新 `api.ts` 中的 API 接口类型定义
- [x] 更新后端路由接口 `test-llm-config` 和 `save-and-init-llm`
- [x] 后端自动转换函数已实现
- [ ] 移除旧键名的兼容代码（可选，建议保留一段时间）

## 相关文档

- [配置键命名规则](./CONFIG_KEY_NAMING.md) - 详细说明前后端键名转换规则
