/**
 * Electron Preload Script
 * 用于在渲染进程中安全地访问 Electron API
 */

import { contextBridge, ipcRenderer } from 'electron';

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * 获取系统音频源列表（使用 desktopCapturer）
   */
  getSystemAudioSources: async () => {
    return await ipcRenderer.invoke('get-system-audio-sources');
  },

  /**
   * 获取系统音频流（自动选择或使用指定源）
   */
  getSystemAudioStream: async (sourceId?: string) => {
    return await ipcRenderer.invoke('get-system-audio-stream', sourceId);
  },

  /**
   * 检查虚拟音频设备是否可用
   */
  checkVirtualAudioDevice: async () => {
    return await ipcRenderer.invoke('check-virtual-audio-device');
  },

  /**
   * 设置虚拟音频设备
   */
  setupVirtualAudioDevice: async () => {
    return await ipcRenderer.invoke('setup-virtual-audio-device');
  },

  /**
   * 设置窗口是否忽略鼠标事件（用于透明窗口点击穿透）
   */
  setIgnoreMouseEvents: (ignore: boolean, options?: { forward?: boolean }) => {
    ipcRenderer.send('set-ignore-mouse-events', ignore, options);
  },
});

