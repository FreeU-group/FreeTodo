import { app, BrowserWindow, screen, ipcMain, Menu } from 'electron';
import path from 'path';

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

const BALL_SIZE = 64;
const PANEL_WIDTH = 360;
const PANEL_HEIGHT = 480;
const MARGIN = 16;

type WindowMode = 'ball' | 'panel';

let mainWindow: BrowserWindow | null = null;

function updateWindowBounds(mode: WindowMode) {
  if (!mainWindow) return;

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  if (mode === 'ball') {
    mainWindow.setSize(BALL_SIZE, BALL_SIZE);
    mainWindow.setPosition(
      Math.round(screenWidth - BALL_SIZE - MARGIN),
      Math.round(screenHeight - BALL_SIZE - MARGIN),
    );
  } else {
    mainWindow.setSize(PANEL_WIDTH, PANEL_HEIGHT);
    mainWindow.setPosition(
      Math.round(screenWidth - PANEL_WIDTH - MARGIN),
      Math.round(screenHeight - PANEL_HEIGHT - MARGIN),
    );
  }

}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: BALL_SIZE,
    height: BALL_SIZE,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5174');
    // 开发时可以打开开发者工具，生产环境注释掉
    // mainWindow.webContents.openDevTools();
  } else {
    // 生产环境：加载打包后的 HTML 文件
    // 在打包后，dist 文件夹会被复制到 app.asar 中，路径需要调整
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // 初始为悬浮球模式
  updateWindowBounds('ball');

  // 创建右键菜单
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '切换到日程面板',
      click: () => {
        updateWindowBounds('panel');
        mainWindow?.webContents.send('window-mode-changed', 'panel');
      },
    },
    {
      label: '切换到悬浮球',
      click: () => {
        updateWindowBounds('ball');
        mainWindow?.webContents.send('window-mode-changed', 'ball');
      },
    },
    { type: 'separator' },
    {
      label: '关闭',
      click: () => {
        app.quit();
      },
    },
  ]);

  mainWindow.webContents.on('context-menu', () => {
    contextMenu.popup();
  });

  // 处理关闭应用的 IPC 消息
  ipcMain.on('close-app', () => {
    app.quit();
  });

  // 处理窗口模式切换
  ipcMain.on('set-window-mode', (_event, mode: WindowMode) => {
    updateWindowBounds(mode);
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

