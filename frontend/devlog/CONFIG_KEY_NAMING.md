# 配置键命名规则文档

## 概述

前后端配置键采用自动转换机制，前端使用驼峰命名，后端使用点分隔+下划线命名，通过工具函数自动转换。

## 命名规则

### 后端配置格式

后端配置使用点号(`.`)分隔路径层级，每个层级内部使用下划线(`_`)连接单词：

```yaml
jobs:
  recorder:
    params:
      auto_exclude_self: true
      blacklist:
        enabled: true
llm:
  api_key: "xxx"
  base_url: "xxx"
ui:
  dark_mode: false
```

### 前端配置格式

前端使用完全驼峰命名，将点和下划线都视为分隔符，全部转换为驼峰形式：

```typescript
{
  jobsRecorderParamsAutoExcludeSelf: true,
  jobsRecorderParamsBlacklistEnabled: true,
  llmApiKey: "xxx",
  llmBaseUrl: "xxx",
  uiDarkMode: false
}
```

## 转换示例

| 后端配置路径 | 前端配置键 |
|------------|----------|
| `jobs.recorder.params.auto_exclude_self` | `jobsRecorderParamsAutoExcludeSelf` |
| `jobs.recorder.params.blacklist.enabled` | `jobsRecorderParamsBlacklistEnabled` |
| `jobs.recorder.params.blacklist.apps` | `jobsRecorderParamsBlacklistApps` |
| `jobs.recorder.enabled` | `jobsRecorderEnabled` |
| `jobs.recorder.interval` | `jobsRecorderInterval` |
| `jobs.recorder.params.screens` | `jobsRecorderParamsScreens` |
| `jobs.recorder.params.deduplicate` | `jobsRecorderParamsDeduplicate` |
| `jobs.clean_data.params.max_days` | `jobsCleanDataParamsMaxDays` |
| `jobs.clean_data.params.max_screenshots` | `jobsCleanDataParamsMaxScreenshots` |
| `llm.api_key` | `llmApiKey` |
| `llm.base_url` | `llmBaseUrl` |
| `llm.model` | `llmModel` |
| `llm.temperature` | `llmTemperature` |
| `llm.max_tokens` | `llmMaxTokens` |
| `server.host` | `serverHost` |
| `server.port` | `serverPort` |
| `chat.enable_history` | `chatEnableHistory` |
| `chat.history_limit` | `chatHistoryLimit` |
| `ui.theme` | `uiTheme` |
| `ui.language` | `uiLanguage` |
| `ui.notifications` | `uiNotifications` |
| `ui.sound_enabled` | `uiSoundEnabled` |
| `ui.auto_save` | `uiAutoSave` |

## 转换函数

转换函数位于 `lifetrace/util/config.py`：

### backend_to_frontend_key()

将后端配置路径转换为前端格式：

```python
from lifetrace.util.config import backend_to_frontend_key

# 后端格式 -> 前端格式
backend_to_frontend_key('jobs.recorder.params.auto_exclude_self')
# 返回: 'jobsRecorderParamsAutoExcludeSelf'
```

### frontend_to_backend_key()

将前端配置键转换为后端格式：

```python
from lifetrace.util.config import frontend_to_backend_key

# 前端格式 -> 后端格式
frontend_to_backend_key('jobsRecorderParamsAutoExcludeSelf')
# 返回: 'jobs.recorder.params.auto_exclude_self'
```

## 使用说明

### 前端使用

前端在调用配置API时，直接使用驼峰格式的键名：

```typescript
// 获取配置
const response = await fetch('/api/get-config');
const { config } = await response.json();
// config.uiDarkMode, config.llmApiKey 等

// 保存配置
await fetch('/api/save-config', {
  method: 'POST',
  body: JSON.stringify({
    uiDarkMode: true,
    llmApiKey: 'sk-xxx',
    llmBaseUrl: 'https://xxx'
  })
});
```

### 后端使用

后端在配置服务层自动处理转换：

```python
# ConfigService 会自动处理前后端格式转换
config_service = ConfigService(config)

# 保存时：前端格式 -> 后端格式
result = config_service.save_config({
    'uiDarkMode': True,
    'llmApiKey': 'sk-xxx'
})

# 获取时：后端格式 -> 前端格式
frontend_config = config_service.get_config_for_frontend()
# 返回: {'uiDarkMode': False, 'llmApiKey': 'xxx', ...}
```

## 优势

1. **无需维护映射表**：前后端键名通过算法自动转换，减少维护成本
2. **规则清晰**：简单的命名规则，易于理解和遵循
3. **自动化**：开发者只需关注各自的命名规范，转换自动完成
4. **类型安全**：前端使用驼峰命名符合 TypeScript 规范，后端使用下划线符合 Python 规范

## 注意事项

1. **新增配置时**：
   - 后端在 YAML 中按照点+下划线规范定义
   - 前端直接使用对应的驼峰形式，无需额外配置

2. **敏感信息**：
   - 包含 `apiKey` 或 `api_key` 的配置项会自动脱敏
   - 日志中只显示前10个字符

3. **默认值**：
   - 如果配置项不存在，在 `get_config_detailed` 中设置默认值
   - 使用前端格式的键名设置默认值
