# 系统音频捕获实现

## ✅ 已实现：直接捕获系统音频（无需用户手动选择）

### 核心改进

**之前**：使用 `getDisplayMedia` API，需要用户手动选择要共享的标签页
**现在**：使用 Electron `desktopCapturer` + `getUserMedia`，直接捕获系统全局音频

---

## 🎯 实现方式

### Electron 环境（推荐）

```typescript
// 1. 通过 IPC 获取系统音频源
const sourceInfo = await electronAPI.getSystemAudioStream();

// 2. 使用 getUserMedia 配合 sourceId 直接获取流
const stream = await navigator.mediaDevices.getUserMedia({
  audio: {
    mandatory: {
      chromeMediaSource: 'desktop',
      chromeMediaSourceId: sourceInfo.sourceId,
    },
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  },
  video: false,
});
```

**优势**：
- ✅ **无需用户手动选择**：自动捕获系统音频
- ✅ **捕获所有应用音频**：不只是浏览器标签页
- ✅ **更好的用户体验**：一键开始录音
- ✅ **自动选择最佳源**：优先选择屏幕源（通常包含系统音频）

### 浏览器环境（降级方案）

如果不在 Electron 环境中，自动回退到 `getDisplayMedia`：

```typescript
const stream = await navigator.mediaDevices.getDisplayMedia({
  audio: { ... },
  video: { displaySurface: 'browser' },
});
// 移除视频轨道，只保留音频
```

---

## 📋 实现细节

### 1. Electron Main Process (`main.ts`)

```typescript
ipcMain.handle('get-system-audio-stream', async (_event, sourceId?: string) => {
  // 获取所有可用的桌面源
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
  });
  
  // 优先选择屏幕源（通常包含系统音频）
  if (!sourceId) {
    const screenSource = sources.find(s => s.id.startsWith('screen:'));
    sourceId = screenSource?.id || sources[0].id;
  }
  
  return { sourceId, name: selectedSource?.name, success: true };
});
```

### 2. RecordingService (`RecordingService.ts`)

```typescript
if (electronAPI && electronAPI.getSystemAudioStream) {
  // Electron 环境：直接获取系统音频
  const sourceInfo = await electronAPI.getSystemAudioStream();
  this.stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: sourceInfo.sourceId,
      },
      // ...
    },
    video: false,
  });
} else {
  // 浏览器环境：回退到 getDisplayMedia
  await this.getSystemAudioViaDisplayMedia();
}
```

---

## 🔄 自动降级机制

系统会自动检测环境并选择最佳方案：

```
Electron 环境？
  ├─ 是 → 使用 desktopCapturer + getUserMedia（直接捕获）
  │         └─ 失败？→ 降级到 getDisplayMedia
  │
  └─ 否 → 使用 getDisplayMedia（需要用户选择标签页）
```

---

## 🎨 用户体验对比

### 之前（getDisplayMedia）
1. 用户点击"开始录音"
2. 浏览器弹出窗口
3. 用户需要手动选择要共享的标签页
4. 只能捕获浏览器标签页的音频
5. 如果标签页关闭，音频捕获停止

### 现在（Electron desktopCapturer）
1. 用户点击"开始录音"
2. **自动捕获系统全局音频**（无需选择）
3. 捕获所有应用的音频（不只是浏览器）
4. 更稳定的音频捕获

---

## ⚙️ 技术细节

### Electron 特有约束

```typescript
audio: {
  mandatory: {
    chromeMediaSource: 'desktop',        // 桌面音频源
    chromeMediaSourceId: sourceId,       // 源ID（从 desktopCapturer 获取）
  },
  echoCancellation: false,              // 系统音频不需要回声消除
  noiseSuppression: false,               // 系统音频不需要降噪
  autoGainControl: false,                // 系统音频不需要自动增益
}
```

### 源选择策略

1. **优先选择屏幕源**：`screen:` 开头的源通常包含系统音频
2. **回退到窗口源**：如果没有屏幕源，选择第一个窗口源
3. **用户指定**：如果用户指定了 sourceId，使用指定的源

---

## 🔍 错误处理

### 常见错误及处理

1. **Electron API 不可用**
   - 自动降级到 `getDisplayMedia`
   - 提示用户选择标签页

2. **无法获取音频源**
   - 检查系统音频设置
   - 提示用户检查权限

3. **音频轨道结束**
   - 自动重连（如果启用）
   - 或停止录音

---

## 📊 性能对比

| 特性 | getDisplayMedia | Electron desktopCapturer |
|------|----------------|-------------------------|
| **用户交互** | 需要手动选择 | 自动捕获 |
| **捕获范围** | 浏览器标签页 | 系统全局音频 |
| **稳定性** | 中等 | 高 |
| **用户体验** | 一般 | 优秀 |

---

## 🚀 未来改进

1. **用户选择音频源**：提供 UI 让用户选择要捕获的窗口/屏幕
2. **多源支持**：同时捕获多个音频源
3. **音频源预览**：显示可用的音频源列表

---

## 📝 总结

通过使用 Electron 的 `desktopCapturer` API，我们实现了**直接捕获系统全局音频**的功能，无需用户手动选择标签页，提供了更好的用户体验和更稳定的音频捕获能力。

