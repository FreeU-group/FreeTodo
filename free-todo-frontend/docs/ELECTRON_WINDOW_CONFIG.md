# Electron 窗口配置说明

本文档详细说明在 Electron 环境中如何创建、定制窗口，以及如何在最新版本中处理安全性和节点集成。

## 目录

- [窗口大小](#窗口大小)
- [窗口标题及环境](#窗口标题及环境)
- [安全配置选项](#安全配置选项)
- [窗口控制](#窗口控制)
- [透明窗口与点击穿透](#透明窗口与点击穿透)
- [进程间通信 (IPC)](#进程间通信-ipc)

## 窗口大小

### 基本窗口配置

```javascript
const { BrowserWindow } = require('electron');

// 将创建窗口独立成一个函数
let mainWin = new BrowserWindow({
  x: 100,
  y: 100, // 设置窗口显示的位置，相对于当前屏幕的左上角
  show: false, // 默认情况下创建一个窗口对象之后就会显示，设置为 false 就不会显示了
  width: 800,
  height: 400,
  maxHeight: 600,
  maxWidth: 1000,
  minHeight: 200,
  minWidth: 300, // 可以通过 min max 来设置当前应用窗口的最大和最小尺寸
  resizable: false // 是否允许缩放应用的窗口大小
});

// 加载 index.html  loadFile加载界面  在当前窗口中加载指定界面让它显示具体的内容
mainWin.loadFile('index.html');

// 监听内容加载完成之后再去显示，不会有白屏，完成当他等待好了，要去加载执行的时候
mainWin.on('ready-to-show', () => {
  mainWin.show();
});
```

### 窗口位置和尺寸控制

- `x`, `y`: 窗口的初始位置（相对于屏幕左上角）
- `width`, `height`: 窗口的初始大小
- `minWidth`, `minHeight`: 窗口的最小尺寸
- `maxWidth`, `maxHeight`: 窗口的最大尺寸
- `resizable`: 是否允许用户调整窗口大小

## 窗口标题及环境

### 窗口外观配置

```javascript
let mainWin = new BrowserWindow({
  show: false, // 默认情况下创建一个窗口对象之后就会显示，设置为 false 就不会显示了
  width: 800,
  height: 400,
  frame: true, // 用于自定义 menu，设置为 false 可以将默认的菜单栏和标题栏隐藏
  titleBarStyle: 'customButtonsOnHover', // 如需隐藏 mac 左上角的红绿灯
  transparent: true, // 设置窗口为透明
  autoHideMenuBar: true,  // 隐藏菜单栏
  icon: 'my.ico', // 设置一个图片路径，可以自定义当前应用的显示图标
  title: "自定义标题", // 自定义当前应用的显示标题
  webPreferences: {
    nodeIntegration: true, // 允许 node 的集成环境 允许在渲染进程中使用 Node.js API
    contextIsolation: false,
    enableRemoteModule: false, // 是否允许开启 remote 模块
  }
});

// 加载 index.html
mainWin.loadFile('index.html');

// 监听内容加载完成之后再去显示，不会有白屏
mainWin.on('ready-to-show', () => {
  mainWin.show();
});
```

### 窗口外观选项

- `frame`: 是否显示窗口边框和标题栏
- `titleBarStyle`: macOS 上的标题栏样式
- `transparent`: 是否使用透明背景
- `autoHideMenuBar`: 是否自动隐藏菜单栏
- `icon`: 窗口图标路径
- `title`: 窗口标题

## 安全配置选项

### contextIsolation

**`false`**: 当设置为 `false` 时，主进程和渲染进程共享相同的网络上下文。这意味着在渲染进程中执行的 JavaScript 可以访问主进程的上下文，反之亦然。这可以提高性能，但也可能增加安全风险，因为恶意代码可以在两个进程之间自由地传递数据。

**`true`**: 当设置为 `true` 时，每个渲染进程都有自己的网络上下文。这增加了安全性，因为渲染进程不能直接访问主进程的上下文。

### enableRemoteModule

**`false`**: 默认情况下，远程模块是被禁用的。这意味着即使在渲染进程中导入了一个 Node.js 模块，Electron 也不会在主进程中暴露这个模块。这增加了安全性，因为渲染进程不能直接访问主进程的模块。

**`true`**: 如果设置为 `true`，那么渲染进程可以导入任何 Node.js 模块。这允许开发者在渲染进程中使用 Node.js 特性，但也可能增加安全风险。

### nodeIntegration

**`true`**: 如果设置为 `true`，那么在渲染进程中可以直接使用 Node.js 特性。这意味着你可以在渲染进程中使用 `require()` 来导入 Node.js 模块。

**`false`**: 如果设置为 `false`，则禁止使用 Node.js 特性。

### 推荐的安全配置

```javascript
webPreferences: {
  nodeIntegration: false,        // 禁用 Node.js 集成（推荐）
  contextIsolation: true,         // 启用上下文隔离（推荐）
  preload: path.join(__dirname, 'preload.js'), // 使用 preload 脚本暴露安全的 API
}
```

## 窗口控制

### 键盘快捷键

- `CTRL+R`: 重载窗口
- `CTRL+SHIFT+I`: 调出调试面板

### 在渲染进程中控制窗口

在新版本的 Electron 中，渲染进程无法直接操作窗口的放大、缩小和关闭功能。正确的做法是通过与主进程进行通信，在主进程中执行这些操作。

#### 渲染进程代码 (renderer.js)

```javascript
const { ipcRenderer } = require('electron');

// 获取按钮元素
const maximizeBtn = document.getElementById('maximize-btn');
const minimizeBtn = document.getElementById('minimize-btn');
const closeBtn = document.getElementById('close-btn');

// 绑定按钮点击事件
maximizeBtn.addEventListener('click', () => {
  ipcRenderer.send('window-action', 'maximize');
});

minimizeBtn.addEventListener('click', () => {
  ipcRenderer.send('window-action', 'minimize');
});

closeBtn.addEventListener('click', () => {
  ipcRenderer.send('window-action', 'close');
});
```

#### 主进程代码 (main.js)

```javascript
const { ipcMain, BrowserWindow } = require('electron');

ipcMain.on('window-action', (event, action) => {
  const currentWindow = BrowserWindow.getFocusedWindow();

  if (action === 'maximize') {
    if (currentWindow.isMaximized()) { // 返回 boolean - 判断窗口是否最大化
      currentWindow.unmaximize();  // 取消窗口最大化
      // currentWindow.restore(); // 回到原始的状态  将窗口从最小化状态恢复到以前的状态。
    } else {
      currentWindow.maximize();  // 让当前窗口最大化 最大化窗口。 如果窗口尚未显示，该方法也会将其显示 (但不会聚焦)。
    }
  } else if (action === 'minimize') { // 返回 boolean - 判断窗口是否最小化
    currentWindow.minimize(); // 最小化窗口。 在某些平台上, 最小化的窗口将显示在 Dock 中。
  } else if (action === 'close') {
    currentWindow.close(); // 关闭窗口
  }
});
```

### restore() vs unmaximize()

`currentWindow.restore()` 和 `currentWindow.unmaximize()` 都是用于将窗口从最大化状态还原回普通状态的方法，但它们的具体行为略有不同。

- **`restore()`**: 将窗口从最大化状态还原到上一次的尺寸和位置。如果窗口之前没有被调整过大小和位置，那么这个方法的行为会和 `unmaximize()` 方法相同，将窗口还原到默认大小。

- **`unmaximize()`**: 将窗口从最大化状态还原到默认大小，而不是还原到上一次的尺寸和位置。

## 透明窗口与点击穿透

### 透明窗口配置

```javascript
const mainWin = new BrowserWindow({
  width: 800,
  height: 600,
  transparent: true, // 启用透明背景
  frame: false,      // 无边框窗口
  backgroundColor: '#00000000', // 透明背景色
  webPreferences: {
    nodeIntegration: false,
    contextIsolation: true,
    preload: path.join(__dirname, 'preload.js'),
  }
});
```

### 点击穿透设置

在透明窗口中，可以设置窗口忽略鼠标事件，实现点击穿透效果：

#### 主进程代码

```javascript
const { ipcMain, BrowserWindow } = require('electron');

// 注册 IPC 处理器：设置窗口是否忽略鼠标事件（用于透明窗口点击穿透）
ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    win.setIgnoreMouseEvents(ignore, options || {});
  }
});
```

#### 渲染进程代码（通过 preload 脚本）

```javascript
// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  setIgnoreMouseEvents: (ignore, options) => {
    ipcRenderer.send('set-ignore-mouse-events', ignore, options);
  }
});
```

#### 使用示例

```javascript
// 渲染进程中
window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
// forward: true 表示即使忽略鼠标事件，仍然可以接收鼠标移动事件，用于检测鼠标位置
```

## 进程间通信 (IPC)

### 在渲染进程中打开新窗口

在最新版本的 Electron 中，为了提高安全性，默认禁用了渲染进程中直接使用 Node.js 的能力。因此，需要通过 IPC 进行进程间通信。

#### 主进程代码 (main.js)

```javascript
const { app, BrowserWindow, ipcMain } = require('electron');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      contextIsolation: false,
      enableRemoteModule: false,
      nodeIntegration: true
    }
  });

  mainWindow.loadFile('index.html');
}

// 监听渲染进程的消息
ipcMain.on('open-new-window', (event, pageUrl) => {
  const newWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      contextIsolation: false,
      enableRemoteModule: false,
      nodeIntegration: true
    }
  });

  newWindow.loadFile(pageUrl);
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
```

#### 渲染进程代码 (renderer.js)

```javascript
const { ipcRenderer } = require('electron');

const openBtn = document.getElementById('open-window');
openBtn.addEventListener('click', () => {
  // 向主进程发送消息请求打开新窗口
  ipcRenderer.send('open-new-window', 'new-window.html');
});
```

### 打开不同窗口的通用函数

```javascript
// 主进程代码 (main.js)
const { app, BrowserWindow, ipcMain } = require('electron');

// 创建新窗口的函数
function createNewWindow(pageUrl) {
  const newWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      contextIsolation: false,
      enableRemoteModule: false,
      nodeIntegration: true
    }
  });

  newWindow.loadFile(pageUrl);
}

// 监听渲染进程的消息
ipcMain.on('open-new-window', (event, pageUrl) => {
  createNewWindow(pageUrl);
});
```

```javascript
// 渲染进程代码 (renderer.js)
const { ipcRenderer } = require('electron');

// 获取按钮元素
const btn1 = document.getElementById('btn1');
const btn2 = document.getElementById('btn2');

// 按钮点击事件处理函数
function handleButtonClick(pageUrl) {
  // 向主进程发送消息请求打开新窗口
  ipcRenderer.send('open-new-window', pageUrl);
}

// 绑定按钮点击事件
btn1.addEventListener('click', () => {
  handleButtonClick('page1.html');
});

btn2.addEventListener('click', () => {
  handleButtonClick('page2.html');
});
```

## 阻止窗口关闭

```javascript
const { remote } = require('electron');

// 利用 remote 可以获取当前窗口对象
let mainWin = remote.getCurrentWindow();

window.addEventListener('DOMContentLoaded', () => {
  // onbeforeunload 事件在即将离开当前页面（刷新或关闭）时触发
  // 点击关闭时触发
  window.onbeforeunload = function () {
    let oBox = document.getElementsByClassName('isClose')[0];
    oBox.style.display = 'block';

    let yesBtn = oBox.getElementsByTagName('span')[0];
    let noBtn = oBox.getElementsByTagName('span')[1];

    yesBtn.addEventListener('click', () => {
      mainWin.destroy(); // 销毁，不能用 close，会再次触发这个事件（onbeforeunload），死循环
    });

    noBtn.addEventListener('click', () => {
      oBox.style.display = 'none';
    });

    return false;
  };
});
```

## 父子及模态窗口

```javascript
const { remote } = require('electron');

function openModalWindow() {
  const modalWindow = new remote.BrowserWindow({
    parent: remote.getCurrentWindow(), // 父子窗口
    modal: true, // 模态窗口
    width: 400,
    height: 300,
    webPreferences: {
      contextIsolation: false,
      enableRemoteModule: false,
      nodeIntegration: true
    }  
  });

  modalWindow.loadFile('modal.html');
  modalWindow.on('close', () => {
    modalWindow = null;
  });
}
```

## BrowserView

BrowserView 是 Electron 中一个用于在主窗口中显示网页内容的模块。它可以被看做是一个嵌入式的浏览器视图，可以添加到主窗口中，以显示其他页面或应用程序。

### 使用 BrowserView 创建父子窗口

```javascript
const { BrowserWindow, BrowserView } = require('electron');

let mainWindow;

app.whenReady().then(() => {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true
    }
  });

  const childView = new BrowserView();
  mainWindow.setBrowserView(childView);
  childView.setBounds({ x: 0, y: 0, width: 400, height: 300 });
  childView.webContents.loadFile('child.html');
});
```

### BrowserView vs BrowserWindow

- **BrowserView**: 更轻量级，只是一个嵌入式的浏览器视图，不具备完整的窗口功能
- **BrowserWindow**: 完整的窗口，具有标题栏、边框等完整的窗口功能

## 本项目中的窗口配置

在本项目中，窗口配置位于 `free-todo-frontend/electron/main.ts` 文件中。主要特点：

1. **灵动岛模式**: 支持透明窗口和点击穿透
2. **窗口大小**: 根据模式动态调整（全屏或小窗口）
3. **安全配置**: 使用 `contextIsolation: true` 和 `preload` 脚本
4. **IPC 通信**: 通过 IPC 实现窗口控制（展开、折叠、点击穿透等）

### 关键配置示例

```typescript
mainWindow = new BrowserWindow({
  width: enableDynamicIsland ? screenWidth : 1200,
  height: enableDynamicIsland ? screenHeight : 800,
  frame: enableDynamicIsland ? false : true,
  transparent: enableDynamicIsland ? true : false,
  alwaysOnTop: enableDynamicIsland ? true : false,
  resizable: enableDynamicIsland ? false : true,
  webPreferences: {
    nodeIntegration: false,
    contextIsolation: true,
    preload: preloadPath,
  },
});
```

## 参考资源

- [Electron 官方文档 - BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window)
- [Electron 安全指南](https://www.electronjs.org/docs/latest/tutorial/security)
- [进程间通信 (IPC)](https://www.electronjs.org/docs/latest/tutorial/ipc)
