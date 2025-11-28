import { app, BrowserWindow, screen, ipcMain, Menu } from 'electron';
import path from 'path';

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 64,
    height: 64,
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

  // 设置窗口位置到屏幕右下角
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
  mainWindow.setPosition(screenWidth - 80, screenHeight - 80);

  // 创建右键菜单
  const contextMenu = Menu.buildFromTemplate([
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

