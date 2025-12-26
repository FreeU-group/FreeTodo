# 错误恢复机制

## ✅ 已实现的错误恢复功能

### 1. RecordingService 错误恢复

**功能**：
- 设备断开后自动重连
- 系统音频轨道结束时尝试恢复
- 最多重试3次，指数退避延迟

**实现逻辑**：
```typescript
// 监听音频轨道结束事件
audioTrack.addEventListener('ended', () => {
  if (this.isRecording && this.shouldAutoReconnect) {
    this.attemptReconnect(); // 自动重连
  }
});

// 重连逻辑
private async attemptReconnect(): Promise<void> {
  // 1. 清理旧的流和 MediaRecorder
  // 2. 重新获取音频流
  // 3. 重新创建 AudioContext 和 MediaRecorder
  // 4. 恢复录音状态
}
```

**重连策略**：
- 最多重试3次
- 延迟：1秒 → 2秒 → 4秒（指数退避，最多5秒）
- 只在 `shouldAutoReconnect = true` 时重连（用户主动停止时不重连）

### 2. WebSocket 识别服务错误恢复

**功能**：
- WebSocket 断开后自动重连
- 网络错误恢复
- 智能判断是否需要重连（正常关闭不重连）

**实现逻辑**：
```typescript
this.ws.onclose = (event) => {
  // 判断是否应该重连
  const shouldReconnect = event.code !== 1000 && event.code !== 1001;
  
  if (this.isRunning && shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
    // 指数退避重连
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 10000);
    setTimeout(() => this.connect(), delay);
  }
};
```

**重连策略**：
- 最多重试5次
- 延迟：1秒 → 2秒 → 4秒 → 8秒 → 10秒（指数退避，最多10秒）
- 正常关闭（code 1000, 1001）不重连

### 3. 网络状态监听

**功能**：
- 监听网络在线/离线状态
- 网络恢复后自动恢复识别服务

**实现逻辑**：
```typescript
window.addEventListener('online', () => {
  // 网络恢复，尝试恢复识别服务
  if (isRecording && audioSource === 'system') {
    websocketRecognitionServiceRef.current?.start(stream);
  }
});

window.addEventListener('offline', () => {
  // 网络断开，显示提示
  setError('网络连接已断开，识别服务可能受影响');
});
```

---

## 📊 错误恢复流程图

```
设备断开/网络错误
    ↓
检测到错误
    ↓
判断是否应该重连
    ├─ 用户主动停止 → 不重连
    ├─ 正常关闭 → 不重连
    └─ 异常错误 → 重连
        ↓
检查重连次数
    ├─ 超过最大次数 → 停止，报告错误
    └─ 未超过 → 继续重连
        ↓
指数退避延迟
    ↓
尝试重连
    ├─ 成功 → 重置计数，恢复服务
    └─ 失败 → 增加计数，继续重试
```

---

## 🎯 错误恢复场景

### 场景1：设备断开
- **触发**：音频轨道 `ended` 事件
- **处理**：自动重连，重新获取音频流
- **重试**：最多3次

### 场景2：WebSocket 断开
- **触发**：WebSocket `onclose` 事件
- **处理**：自动重连 WebSocket
- **重试**：最多5次

### 场景3：网络断开
- **触发**：`offline` 事件
- **处理**：显示提示，等待网络恢复
- **恢复**：`online` 事件触发后自动恢复

### 场景4：系统音频标签页切换
- **触发**：用户切换标签页，音频轨道结束
- **处理**：尝试重新获取系统音频
- **重试**：最多3次

---

## ⚙️ 配置参数

### RecordingService
- `maxReconnectAttempts`: 3
- `reconnectDelay`: 1秒（基础延迟）
- `maxDelay`: 5秒（最大延迟）

### WebSocketRecognitionService
- `maxReconnectAttempts`: 5
- `reconnectDelay`: 1秒（基础延迟）
- `maxDelay`: 10秒（最大延迟）

---

## 🔍 错误处理策略

### 可恢复错误（自动重连）
- 设备断开
- 网络错误
- WebSocket 异常关闭
- 系统音频标签页切换

### 不可恢复错误（停止服务）
- 用户主动停止
- 权限被拒绝
- 设备不存在
- 重连次数过多

---

## 📝 日志和监控

所有错误恢复操作都会记录日志：
- `[RecordingService] 尝试重连 (1/3)...`
- `[RecordingService] 重连成功，录音已恢复`
- `[WebSocketRecognitionService] 尝试重连 (1/5)...`
- `[VoiceModule] 网络已恢复`

用户可以通过控制台查看详细的错误恢复过程。

