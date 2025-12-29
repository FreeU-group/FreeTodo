const { app, BrowserWindow } = require('electron');
const path = require('path');

const isDev = !app.isPackaged;

let mainWindow;

function createWindow() {
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  mainWindow = new BrowserWindow({
    width: width,
    height: height,
    x: 0,
    y: 0,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false,
    backgroundColor: 'transparent',
  });

  // 关键：在页面加载前注入 CSS
  mainWindow.webContents.insertCSS(`
    html, body, #__next, #__next > div {
      background-color: transparent !important;
      background: transparent !important;
    }
  `);
  console.log('✅ Transparent CSS injected');

  // 加载 URL
  const url = isDev ? 'http://localhost:3000' : `file://${path.join(__dirname, '../out/index.html')}`;
  mainWindow.loadURL(url);

  // 等待页面加载完成后再显示
  mainWindow.once('ready-to-show', () => {
    // 再次注入 CSS（防止第一次失败）
    mainWindow.webContents.insertCSS(`
      html, body, #__next, #__next > div {
        background-color: transparent !important;
        background: transparent !important;
      }
    `).catch(() => {});

    // 延迟显示，确保 CSS 已应用
    setTimeout(() => {
      mainWindow.show();
      mainWindow.setIgnoreMouseEvents(true, { forward: true });
      console.log('✅ Window shown with transparent background');
    }, 1000);
  });

  // 默认点击穿透
  mainWindow.setIgnoreMouseEvents(true, { forward: true });
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










