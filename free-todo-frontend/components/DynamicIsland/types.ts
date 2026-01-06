export enum IslandMode {
	FLOAT = "FLOAT", // 1. 常驻悬浮窗 (Orb/Core)
	PANEL = "PANEL", // 2. 可拖拽缩放面板 (高级交互面板)
	FULLSCREEN = "FULLSCREEN", // 3. 全屏工作台 (显示完整应用)
}

// We can simplify dimensions logic as we will rely more on CSS classes for this layout
export interface IslandDimensions {
	className: string;
}
