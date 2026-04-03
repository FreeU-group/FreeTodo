/**
 * Island 窗口管理器
 * 负责创建和管理 Dynamic Island 悬浮窗口
 */

import path from "node:path";
import { app, BrowserWindow, ipcMain, screen } from "electron";
import { logger } from "./logger";

/**
 * Island 模式枚举（与前端保持一致）
 */
export enum IslandMode {
  FLOAT = "FLOAT",
  POPUP = "POPUP",
  SIDEBAR = "SIDEBAR",
  FULLSCREEN = "FULLSCREEN",
}

/**
 * 各模式对应的窗口尺寸
 */
const ISLAND_SIZES: Record<IslandMode, { width: number; height: number }> = {
  [IslandMode.FLOAT]: { width: 200, height: 56 },
  [IslandMode.POPUP]: { width: 380, height: 120 },
  [IslandMode.SIDEBAR]: { width: 420, height: 700 },
  [IslandMode.FULLSCREEN]: { width: 0, height: 0 }, // 动态计算
};

/**
 * Island 窗口管理器类
 */
export class IslandWindowManager {
  /** Island 窗口实例 */
  private islandWindow: BrowserWindow | null = null;
  /** 当前模式 */
  private currentMode: IslandMode = IslandMode.FLOAT;
  /** 是否启用 Island */
  private enabled: boolean = false;
  /** 窗口位置配置 */
  private readonly marginRight: number = 20;
  private readonly marginTop: number = 20;
  /** 当前 Y 位置（用于垂直拖动时保持位置） */
  private currentY: number = 20;
  /** SIDEBAR 模式的固定状态（默认为 true）*/
  private sidebarPinned: boolean = true;
  /** 可见性变化回调 */
  private onVisibilityChange?: (visible: boolean) => void;

  /**
   * 获取 preload 脚本路径
   */
  private getPreloadPath(): string {
    if (app.isPackaged) {
      return path.join(app.getAppPath(), "dist-electron", "preload.js");
    }
    return path.join(__dirname, "preload.js");
  }

  /**
   * 计算窗口 X 位置（右边缘对齐）
   * 所有非全屏模式共享相同的 X 位置，以便平滑过渡
   */
  private calculateRightAlignedX(width: number): number {
    const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;
    return screenWidth - width - this.marginRight;
  }

  /**
   * 计算窗口 Y 位置
   * 如果 preferredY 未提供，则使用保存的位置；否则约束在屏幕边界内
   */
  private calculateYPosition(height: number, preferredY?: number): number {
    const { height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;

    if (preferredY !== undefined) {
      // 约束在屏幕边界内
      const minY = this.marginTop;
      const maxY = screenHeight - height - this.marginTop;
      return Math.max(minY, Math.min(preferredY, maxY));
    }

    // 使用已保存的位置
    return this.currentY;
  }

  /**
   * 智能计算 SIDEBAR 的 Y 位置
   * 根据当前窗口位置和可用空间，选择最佳的锚点（顶部或底部对齐）
   * @param sidebarHeight SIDEBAR 窗口的高度
   * @returns 计算出的 Y 位置和使用的锚点类型
   */
  private calculateSmartSidebarPosition(
    sidebarHeight: number
  ): { y: number; anchor: 'top' | 'bottom' } {
    const { height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
    const currentWindowY = this.currentY;
    const currentWindowHeight = this.islandWindow?.getBounds().height || 56;

    // 计算当前窗口的底部位置
    const currentWindowBottom = currentWindowY + currentWindowHeight;

    // 计算如果使用底部对齐，SIDEBAR 的顶部位置
    const bottomAlignedY = currentWindowBottom - sidebarHeight;

    // 计算如果使用顶部对齐，SIDEBAR 的顶部位置
    const topAlignedY = currentWindowY;

    // 检查底部对齐是否可行（SIDEBAR 完全在屏幕内）
    const canBottomAlign = bottomAlignedY >= this.marginTop;

    // 检查顶部对齐是否可行
    const canTopAlign = (topAlignedY + sidebarHeight) <= (screenHeight - this.marginTop);

    // 决策逻辑：
    // 1. 如果当前窗口在屏幕上半部分，优先使用顶部对齐
    // 2. 如果当前窗口在屏幕下半部分，优先使用底部对齐
    // 3. 如果首选方案不可行，尝试另一种
    // 4. 如果两种都不可行，居中显示并调整位置

    const isInUpperHalf = currentWindowY < screenHeight / 2;

    if (isInUpperHalf) {
      // 上半部分：优先顶部对齐
      if (canTopAlign) {
        return { y: topAlignedY, anchor: 'top' };
      } else if (canBottomAlign) {
        return { y: bottomAlignedY, anchor: 'bottom' };
      }
    } else {
      // 下半部分：优先底部对齐
      if (canBottomAlign) {
        return { y: bottomAlignedY, anchor: 'bottom' };
      } else if (canTopAlign) {
        return { y: topAlignedY, anchor: 'top' };
      }
    }

    // 如果两种对齐都不可行，计算一个安全的居中位置
    const safeY = Math.max(
      this.marginTop,
      Math.min(
        screenHeight - sidebarHeight - this.marginTop,
        currentWindowY
      )
    );

    logger.warn(`SIDEBAR doesn't fit with current anchor, adjusted to Y=${safeY}`);
    return { y: safeY, anchor: isInUpperHalf ? 'top' : 'bottom' };
  }

  /**
   * 获取指定模式的窗口尺寸
   */
  private getSizeForMode(mode: IslandMode): { width: number; height: number } {
    if (mode === IslandMode.FULLSCREEN) {
      return screen.getPrimaryDisplay().workAreaSize;
    }
    return ISLAND_SIZES[mode];
  }

  /**
   * 创建 Island 窗口
   * @param serverUrl 前端服务器 URL
   */
  create(serverUrl: string): void {
    if (this.islandWindow) {
      logger.warn("Island window already exists");
      return;
    }

    const preloadPath = this.getPreloadPath();
    const { width, height } = this.getSizeForMode(this.currentMode);
    const x = this.calculateRightAlignedX(width);
    const y = this.calculateYPosition(height);
    this.currentY = y; // 初始化 Y 位置

    this.islandWindow = new BrowserWindow({
      width,
      height,
      x,
      y,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false, // 禁用原生拖动，使用自定义拖动
      hasShadow: false, // 禁用系统阴影以避免透明窗口出现黑边，使用 CSS box-shadow 代替
      focusable: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: preloadPath,
      },
      show: false,
      backgroundColor: "#00000000",
    });

    // 设置窗口级别，使其始终在最上层（包括全屏应用之上）
    this.islandWindow.setAlwaysOnTop(true, "floating");

    // macOS 特定：设置窗口在所有工作区可见
    if (process.platform === "darwin") {
      this.islandWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    }

    // 加载 Island 页面
    const islandUrl = `${serverUrl}/island`;
    this.islandWindow.loadURL(islandUrl);

    // 窗口准备好后显示
    this.islandWindow.once("ready-to-show", () => {
      this.islandWindow?.show();
      logger.info("Island window ready and shown");
    });

    // 窗口关闭时清理引用
    this.islandWindow.on("closed", () => {
      this.islandWindow = null;
      logger.info("Island window closed");
      // Island 是主窗口，关闭时退出应用（macOS 除外）
      if (process.platform !== "darwin") {
        app.quit();
      }
    });

    // 设置 IPC 处理器
    this.setupIpcHandlers();

    // 设置自定义拖拽处理器
    this.setupCustomDragHandlers();

    this.enabled = true;
    logger.info(`Island window created at ${islandUrl}`);
  }

  /**
   * 设置 Island 专用的 IPC 处理器
   */
  private setupIpcHandlers(): void {
    // 处理窗口大小调整请求
    ipcMain.on("island:resize-window", (_event, mode: string) => {
      this.resizeToMode(mode as IslandMode);
    });

    // 处理 SIDEBAR 模式多栏展开/收起请求
    ipcMain.on("island:resize-sidebar", (_event, columnCount: number) => {
      this.resizeSidebarToColumns(columnCount as 1 | 2 | 3);
    });

    // 处理 SIDEBAR 模式固定状态变化
    ipcMain.on("island:set-pinned", (event, isPinned: boolean) => {
      // 只处理来自 Island 窗口的请求
      if (this.islandWindow && event.sender === this.islandWindow.webContents) {
        this.setSidebarPinned(isPinned);
      }
    });

    // 兼容旧的 resize-window 通道（来自原始 Island 代码）
    ipcMain.on("resize-window", (event, mode: string) => {
      // 只处理来自 Island 窗口的请求
      if (this.islandWindow && event.sender === this.islandWindow.webContents) {
        this.resizeToMode(mode as IslandMode);
      }
    });
  }

  /**
   * 设置自定义拖拽处理器（仅允许垂直拖动）
   */
  private setupCustomDragHandlers(): void {
    // 存储拖拽起始位置
    let dragStartY = 0;
    let windowStartY = 0;

    // 处理拖拽开始
    ipcMain.on("island:drag-start", (event, mouseY: number) => {
      // 只处理来自 Island 窗口的请求
      if (!this.islandWindow || event.sender !== this.islandWindow.webContents) return;

      // 全屏模式不允许拖拽
      if (this.currentMode === IslandMode.FULLSCREEN) return;

      const [, currentY] = this.islandWindow.getPosition();
      dragStartY = mouseY;
      windowStartY = currentY;
    });

    // 处理拖拽移动
    ipcMain.on("island:drag-move", (event, mouseY: number) => {
      // 只处理来自 Island 窗口的请求
      if (!this.islandWindow || event.sender !== this.islandWindow.webContents) return;

      // 全屏模式不允许拖拽
      if (this.currentMode === IslandMode.FULLSCREEN) return;

      const { width, height } = this.islandWindow.getBounds();

      // 计算新的 Y 位置（仅垂直移动）
      const deltaY = mouseY - dragStartY;
      const newY = windowStartY + deltaY;

      // 锁定 X 位置到右边缘
      const x = this.calculateRightAlignedX(width);

      // 约束 Y 在屏幕边界内
      const y = this.calculateYPosition(height, newY);

      // 更新窗口位置
      this.islandWindow.setPosition(x, y);

      // 发送位置更新到渲染进程
      const { height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
      this.islandWindow.webContents.send('island:position-update', {
        y: y,
        screenHeight: screenHeight
      });
    });

    // 处理拖拽结束
    ipcMain.on("island:drag-end", (event) => {
      // 只处理来自 Island 窗口的请求
      if (!this.islandWindow || event.sender !== this.islandWindow.webContents) return;

      // 保存最终的 Y 位置
      const [, currentY] = this.islandWindow.getPosition();
      this.currentY = currentY;

      // 发送最终位置更新到渲染进程
      const { height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
      this.islandWindow.webContents.send('island:position-update', {
        y: currentY,
        screenHeight: screenHeight
      });
    });
  }

  /**
   * 调整窗口到指定模式
   */
  resizeToMode(mode: IslandMode): void {
    if (!this.islandWindow) return;

    const validModes = Object.values(IslandMode);
    if (!validModes.includes(mode)) {
      logger.warn(`Invalid Island mode: ${mode}`);
      return;
    }

    this.currentMode = mode;
    const { width, height } = this.getSizeForMode(mode);

    // 形态3/4 使用正常窗口样式，形态1/2 使用透明悬浮窗样式
    // SIDEBAR 模式下根据 pin 状态决定行为
    const isExpandedMode = mode === IslandMode.SIDEBAR || mode === IslandMode.FULLSCREEN;
    const shouldAlwaysOnTop = mode === IslandMode.SIDEBAR
      ? this.sidebarPinned  // SIDEBAR: 根据 pin 状态
      : !isExpandedMode;     // 其他模式: FLOAT/POPUP 为 true, FULLSCREEN 为 false

    // 设置窗口属性
    this.islandWindow.setAlwaysOnTop(shouldAlwaysOnTop, shouldAlwaysOnTop ? "floating" : "normal");
    this.islandWindow.setSkipTaskbar(shouldAlwaysOnTop);

    // macOS 特定：根据 pin 状态设置工作区可见性
    if (process.platform === "darwin") {
      this.islandWindow.setVisibleOnAllWorkspaces(shouldAlwaysOnTop, { visibleOnFullScreen: shouldAlwaysOnTop });
    }

    if (mode === IslandMode.FULLSCREEN) {
      // 全屏模式：覆盖整个工作区
      const { x: screenX, y: screenY } = screen.getPrimaryDisplay().workArea;
      this.islandWindow.setBounds({ x: screenX, y: screenY, width, height });
      logger.info(`Island window resized to mode: ${mode} (${width}x${height})`);

      // 发送锚点更新到渲染进程（全屏无锚点）
      this.islandWindow.webContents.send('island:anchor-update', {
        anchor: null,
        y: screenY
      });
    } else if (mode === IslandMode.SIDEBAR) {
      // SIDEBAR 模式：使用智能定位算法
      const x = this.calculateRightAlignedX(width);
      const { y, anchor } = this.calculateSmartSidebarPosition(height);
      this.currentY = y; // 保存位置
      this.islandWindow.setBounds({ x, y, width, height });
      logger.info(`Island window resized to mode: ${mode} (${width}x${height}) with ${anchor} anchor at Y=${y}`);

      // 发送锚点更新到渲染进程
      this.islandWindow.webContents.send('island:anchor-update', {
        anchor: anchor,
        y: y
      });
    } else {
      // FLOAT/POPUP 模式：右边缘对齐，保持当前 Y 位置
      const x = this.calculateRightAlignedX(width);
      const y = this.calculateYPosition(height);
      this.currentY = y; // 保存位置以供下次调整使用
      this.islandWindow.setBounds({ x, y, width, height });
      logger.info(`Island window resized to mode: ${mode} (${width}x${height})`);

      // 发送锚点更新到渲染进程（FLOAT/POPUP 使用当前位置）
      const { height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
      const isInUpperHalf = y < screenHeight / 2;
      this.islandWindow.webContents.send('island:anchor-update', {
        anchor: isInUpperHalf ? 'top' : 'bottom',
        y: y
      });
    }
  }

  /**
   * 调整 SIDEBAR 窗口到指定栏数
   * @param columnCount 栏数: 1 | 2 | 3
   */
  resizeSidebarToColumns(columnCount: 1 | 2 | 3): void {
    if (!this.islandWindow) return;

    // 验证栏数有效性
    if (columnCount < 1 || columnCount > 3) {
      logger.warn(`Invalid column count: ${columnCount}`);
      return;
    }

    // 定义各栏数的宽度
    const widthMap: Record<1 | 2 | 3, number> = {
      1: 420,
      2: 800,
      3: 1200,
    };

    const width = widthMap[columnCount];
    const height = 700;

    // 右边缘对齐，使用智能定位算法（如果当前是 SIDEBAR 模式）
    const x = this.calculateRightAlignedX(width);
    let y: number;

    if (this.currentMode === IslandMode.SIDEBAR) {
      // SIDEBAR 模式：使用智能定位算法
      const { y: smartY, anchor } = this.calculateSmartSidebarPosition(height);
      y = smartY;
      logger.info(`Island sidebar resized to ${columnCount} column(s): ${width}x${height} with ${anchor} anchor at Y=${y}`);
    } else {
      // 其他模式：保持当前 Y 位置
      y = this.calculateYPosition(height);
      logger.info(`Island sidebar resized to ${columnCount} column(s): ${width}x${height}`);
    }

    this.islandWindow.setBounds({ x, y, width, height });
    this.currentY = y; // 保存位置
  }

  /**
   * 显示 Island 窗口
   */
  show(): void {
    if (this.islandWindow && !this.islandWindow.isVisible()) {
      this.islandWindow.show();
      this.notifyVisibilityChange(true);
      logger.info("Island window shown");
    }
  }

  /**
   * 隐藏 Island 窗口
   */
  hide(): void {
    if (this.islandWindow?.isVisible()) {
      this.islandWindow.hide();
      this.notifyVisibilityChange(false);
      logger.info("Island window hidden");
    }
  }

  /**
   * 切换 Island 窗口显示/隐藏
   */
  toggle(): void {
    if (this.islandWindow) {
      if (this.islandWindow.isVisible()) {
        this.hide();
      } else {
        this.show();
      }
    }
  }

  /**
   * 销毁 Island 窗口
   */
  destroy(): void {
    if (this.islandWindow) {
      this.islandWindow.close();
      this.islandWindow = null;
    }
    this.enabled = false;
  }

  /**
   * 获取 Island 窗口实例
   */
  getWindow(): BrowserWindow | null {
    return this.islandWindow;
  }

  /**
   * 检查 Island 是否已启用
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * 检查窗口是否存在
   */
  hasWindow(): boolean {
    return this.islandWindow !== null && !this.islandWindow.isDestroyed();
  }

  /**
   * 获取当前模式
   */
  getCurrentMode(): IslandMode {
    return this.currentMode;
  }

  /**
   * 向 Island 窗口发送消息
   */
  sendMessage(channel: string, ...args: unknown[]): void {
    if (this.islandWindow && !this.islandWindow.isDestroyed()) {
      this.islandWindow.webContents.send(channel, ...args);
    }
  }

  /**
   * 设置可见性变化回调
   * @param callback 回调函数，接收 visible 参数
   */
  setVisibilityChangeCallback(callback: (visible: boolean) => void): void {
    this.onVisibilityChange = callback;
  }

  /**
   * 通知可见性变化
   * @param visible 当前可见性状态
   */
  private notifyVisibilityChange(visible: boolean): void {
    if (this.onVisibilityChange) {
      try {
        this.onVisibilityChange(visible);
      } catch (error) {
        logger.error(
          `Error in visibility change callback: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  /**
   * 检查窗口当前是否可见
   */
  isVisible(): boolean {
    return this.islandWindow?.isVisible() ?? false;
  }

  /**
   * 设置 SIDEBAR 模式的固定状态
   * @param isPinned true = 固定（始终在顶部），false = 非固定（正常窗口行为）
   */
  setSidebarPinned(isPinned: boolean): void {
    if (!this.islandWindow) return;

    this.sidebarPinned = isPinned;

    // 如果当前是 SIDEBAR 模式，立即更新窗口属性
    if (this.currentMode === IslandMode.SIDEBAR) {
      this.islandWindow.setAlwaysOnTop(isPinned, isPinned ? "floating" : "normal");
      this.islandWindow.setSkipTaskbar(isPinned);

      // macOS 特定：根据 pin 状态设置工作区可见性
      if (process.platform === "darwin") {
        this.islandWindow.setVisibleOnAllWorkspaces(isPinned, { visibleOnFullScreen: isPinned });
      }

      logger.info(`Island SIDEBAR pin state changed to: ${isPinned ? "pinned" : "unpinned"}`);
    }
  }
}
