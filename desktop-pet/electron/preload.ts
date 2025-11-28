import { contextBridge, ipcRenderer } from 'electron';

type WindowMode = 'ball' | 'panel';

// 预加载脚本，用于安全地暴露 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  closeApp: () => {
    ipcRenderer.send('close-app');
  },
  setWindowMode: (mode: WindowMode) => {
    ipcRenderer.send('set-window-mode', mode);
  },
});

