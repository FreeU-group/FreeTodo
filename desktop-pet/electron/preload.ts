import { contextBridge, ipcRenderer } from 'electron';

// 预加载脚本，用于安全地暴露 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  closeApp: () => {
    ipcRenderer.send('close-app');
  },
});

