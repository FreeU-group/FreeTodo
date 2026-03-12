import type { PanelFeature, PanelPosition } from "@/lib/config/panel-config";

// Dock 显示模式类型
export type DockDisplayMode = "fixed" | "auto-hide";

// 布局预设类型
export interface LayoutPreset {
	id: string;
	name: string;
	panelFeatureMap: Record<PanelPosition, PanelFeature | null>;
	isPanelAOpen: boolean;
	isPanelBOpen: boolean;
	isPanelCOpen: boolean;
	panelAWidth?: number;
	panelCWidth?: number;
}

// UI Store 状态接口
export interface UiStoreState {
	// 位置槽位状态
	isPanelAOpen: boolean;
	isPanelBOpen: boolean;
	isPanelCOpen: boolean;
	// 位置槽位宽度
	panelAWidth: number;
	panelCWidth: number;
	// panelBWidth 是计算值，不需要单独存储
	// 动态功能分配映射：每个位置当前显示的功能
	panelFeatureMap: Record<PanelPosition, PanelFeature | null>;
	// 面板是否固定（固定面板不会被替换）
	panelPinMap: Record<PanelPosition, boolean>;
	// 被禁用的功能列表
	disabledFeatures: PanelFeature[];
	// 后端能力不足导致的禁用功能列表
	backendDisabledFeatures: PanelFeature[];
	// 自动关闭的panel栈（记录因窗口缩小而自动关闭的panel，从右到左的顺序）
	autoClosedPanels: PanelPosition[];
	// Dock 显示模式：固定显示或鼠标离开时自动隐藏
	dockDisplayMode: DockDisplayMode;
	// 是否显示 Agno 模式的工具选择器（默认关闭）
	showAgnoToolSelector: boolean;
	// Agno 模式下选中的 FreeTodo 工具列表（空数组表示不使用任何工具）
	selectedAgnoTools: string[];
	// Agno 模式下选中的外部工具列表（如 ['duckduckgo']）
	selectedExternalTools: string[];
	// 位置槽位 toggle 方法
	togglePanelA: () => void;
	togglePanelB: () => void;
	togglePanelC: () => void;
	// 位置槽位宽度设置方法
	setPanelAWidth: (width: number) => void;
	setPanelCWidth: (width: number) => void;
	// panelBWidth 是计算值，不需要单独设置方法
	// 动态功能分配方法
	setPanelFeature: (position: PanelPosition, feature: PanelFeature) => void;
	getFeatureByPosition: (position: PanelPosition) => PanelFeature | null;
	getAvailableFeatures: () => PanelFeature[];
	setFeatureEnabled: (feature: PanelFeature, enabled: boolean) => void;
	setBackendDisabledFeatures: (features: PanelFeature[]) => void;
	isFeatureEnabled: (feature: PanelFeature) => boolean;
	// 面板固定设置
	setPanelPinned: (position: PanelPosition, pinned: boolean) => void;
	togglePanelPinned: (position: PanelPosition) => void;
	// 兼容性方法：为了保持向后兼容，保留基于功能的访问方法
	// 这些方法内部会通过动态映射查找位置
	getIsFeatureOpen: (feature: PanelFeature) => boolean;
	toggleFeature: (feature: PanelFeature) => void;
	getFeatureWidth: (feature: PanelFeature) => number;
	setFeatureWidth: (feature: PanelFeature, width: number) => void;
	// 应用预设布局
	applyLayout: (layoutId: string) => void;
	// 交换两个面板的位置（功能分配）
	swapPanelPositions: (
		position1: PanelPosition,
		position2: PanelPosition,
	) => void;
	// 用户自定义布局
	customLayouts: LayoutPreset[];
	saveCustomLayout: (name: string, options?: { overwrite?: boolean }) => boolean;
	renameCustomLayout: (
		layoutId: string,
		name: string,
		options?: { overwrite?: boolean },
	) => boolean;
	deleteCustomLayout: (layoutId: string) => void;
	// 自动关闭panel管理方法
	setAutoClosePanel: (position: PanelPosition) => void;
	restoreAutoClosedPanel: () => void;
	clearAutoClosedPanels: () => void;
	// Dock 显示模式设置方法
	setDockDisplayMode: (mode: DockDisplayMode) => void;
	// 设置是否显示 Agno 工具选择器
	setShowAgnoToolSelector: (show: boolean) => void;
	// 设置 Agno 模式下选中的 FreeTodo 工具
	setSelectedAgnoTools: (tools: string[]) => void;
	// 设置 Agno 模式下选中的外部工具
	setSelectedExternalTools: (tools: string[]) => void;
	// 通知弹窗设置
	notificationPopupEnabled: boolean;
	setNotificationPopupEnabled: (enabled: boolean) => void;
}
