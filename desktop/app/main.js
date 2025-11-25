const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const { app, BrowserWindow, dialog } = require("electron");

// Enforce single instance to avoid duplicate windows when launched twice.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

const FRONTEND_HOST = "127.0.0.1";
const FRONTEND_PORT = process.env.FRONTEND_PORT || 3000;
const BACKEND_PORT = process.env.BACKEND_PORT || 8000;
const FRONTEND_URL = `http://${FRONTEND_HOST}:${FRONTEND_PORT}`;
// Use a known 200 endpoint; root may 404 and cause long wait.
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}/docs`;

let backendProcess = null;
let frontendProcess = null;
let isLaunching = true;

const resolveResourcePath = (...segments) => {
  const base = app.isPackaged
    ? path.join(process.resourcesPath, "resources")
    : path.join(__dirname, "../resources");
  return path.join(base, ...segments);
};

const ensureExecutable = (filePath) => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing runtime dependency: ${filePath}`);
  }
};

const startBackend = () => {
  const executableName =
    process.platform === "win32" ? "lifetrace-api.exe" : "lifetrace-api";
  // Onedir build: binary sits under backend/lifetrace-api/<executableName>
  const executablePath = resolveResourcePath(
    "backend",
    "lifetrace-api",
    executableName
  );
  ensureExecutable(executablePath);

  backendProcess = spawn(executablePath, [], {
    cwd: path.dirname(executablePath),
    env: {
      ...process.env,
      PORT: BACKEND_PORT,
    },
  });

  backendProcess.stdout?.on("data", (data) =>
    console.log(`[backend] ${data.toString().trim()}`)
  );
  backendProcess.stderr?.on("data", (data) =>
    console.error(`[backend] ${data.toString().trim()}`)
  );
  backendProcess.on("exit", (code, signal) => {
    console.log(`[backend] exited with code ${code} signal ${signal}`);
    backendProcess = null;
  });
};

const startFrontend = () => {
  const frontendRoot = resolveResourcePath("frontend");
  const standaloneDir = path.join(frontendRoot, "standalone");
  const entryPoint = path.join(standaloneDir, "server.js");
  ensureExecutable(entryPoint);

  // Use Electron's bundled Node as fallback to avoid missing /usr/local/bin/node on target machines.
  const nodeBinary =
    process.env.ELECTRON_NODE_BINARY ||
    process.env.NPM_NODE_EXEC_PATH ||
    process.execPath;

  const spawnEnv = {
    ...process.env,
    PORT: FRONTEND_PORT,
    HOSTNAME: FRONTEND_HOST,
    NEXT_TELEMETRY_DISABLED: "1",
  };

  // If we are falling back to the Electron binary, force Node mode.
  if (!process.env.ELECTRON_NODE_BINARY && !process.env.NPM_NODE_EXEC_PATH) {
    spawnEnv.ELECTRON_RUN_AS_NODE = "1";
  }

  frontendProcess = spawn(nodeBinary, [entryPoint], {
    cwd: standaloneDir,
    env: spawnEnv,
  });

  frontendProcess.stdout?.on("data", (data) =>
    console.log(`[frontend] ${data.toString().trim()}`)
  );
  frontendProcess.stderr?.on("data", (data) =>
    console.error(`[frontend] ${data.toString().trim()}`)
  );
  frontendProcess.on("exit", (code, signal) => {
    console.log(`[frontend] exited with code ${code} signal ${signal}`);
    frontendProcess = null;
  });
};

const waitForServer = async (url, timeoutMs = 20000, intervalMs = 500) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch (err) {
      // swallow errors until timeout
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out waiting for ${url}`);
};

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false, // 创建时不显示窗口
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // 当页面加载完成并准备显示时再显示窗口
  win.once('ready-to-show', () => {
    win.show();
  });

  win.loadURL(FRONTEND_URL);
};

const cleanup = () => {
  if (frontendProcess) {
    frontendProcess.kill();
    frontendProcess = null;
  }
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
};

const launch = async () => {
  try {
    startBackend();
    // Backend can take a while to warm up; allow up to 5 minutes.
    await waitForServer(BACKEND_URL, 300000, 1000);

    startFrontend();
    await waitForServer(FRONTEND_URL, 60000, 500);
    createWindow();
  } catch (err) {
    dialog.showErrorBox("Startup error", err.message);
  } finally {
    isLaunching = false;
  }
};

app.whenReady().then(launch);

app.on("before-quit", () => {
  cleanup();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (!isLaunching && BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
