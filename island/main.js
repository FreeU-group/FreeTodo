const { app, BrowserWindow, screen, globalShortcut, Tray, Menu, ipcMain } = require('electron');
const path = require('path');

// Check if we are in development mode
const isDev = !app.isPackaged;

let mainWindow;
let tray;

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: width, // Full width to allow expansion
    height: height, // Full height to allow expansion
    x: 0,
    y: 0,
    frame: false, // No OS window chrome
    transparent: true, // Transparent background
    alwaysOnTop: true, // Float above other apps
    hasShadow: false, // Handle shadow in CSS
    resizable: false, // Fixed size container
    skipTaskbar: true, // Don't show in taskbar (widget mode)
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, // Allowed for this local demo to use window.require
      devTools: isDev
    }
  });

  // Decide what to load based on environment
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  // IPC: Handle mouse events to allow clicking through the transparent window
  // When the user hovers the island, we capture mouse. When they leave, we ignore mouse.
  ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      win.setIgnoreMouseEvents(ignore, options);
    }
  });

  // Default to ignoring mouse events (click-through) until the UI tells us otherwise
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  // Create Context Menu (Right Click)
  mainWindow.webContents.on('context-menu', (e, params) => {
    // Only show context menu if we are interacting with the UI
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Quit Dynamic Island', click: () => app.quit() }
    ]);
    contextMenu.popup();
  });
}

function createTray() {
  const iconPath = path.join(__dirname, isDev ? 'public/favicon.ico' : 'resources/icon.ico'); 
  
  try {
    tray = new Tray(iconPath);
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Show/Hide', click: () => {
        if (mainWindow.isVisible()) mainWindow.hide();
        else mainWindow.show();
      }},
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ]);
    tray.setToolTip('Dynamic Island');
    tray.setContextMenu(contextMenu);
  } catch (error) {
    console.log("Tray icon could not be loaded, skipping tray creation.");
  }
}

app.whenReady().then(() => {
  // Give React a moment to load before creating window to avoid white flash
  setTimeout(createWindow, 500);
  createTray();

  globalShortcut.register('CommandOrControl+Q', () => {
    app.quit();
  });

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});