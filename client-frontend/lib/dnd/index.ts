/**
 * 跨面板拖拽系统入口
 * Cross-Panel Drag and Drop System Entry
 */

// 上下文
export {
	GlobalDndContext,
	GlobalDndProvider,
	useGlobalDnd,
	useGlobalDndSafe,
	usePendingUpdate,
} from "./context";
// 处理器
export {
	dispatchDragDrop,
	getHandler,
	registerHandler,
} from "./handlers";
// 预览组件
export { GlobalDragOverlay } from "./overlays";
// 类型导出
export type {
	ActiveDragState,
	DragData,
	DragDropHandler,
	DragDropResult,
	DragSourceType,
	DropData,
	DropTargetType,
	GlobalDndContextValue,
	HandlerKey,
} from "./types";
// 类型守卫
export {
	isCalendarDateDropData,
	isTodoCardDragData,
	isTodoDropZoneDropData,
	isTodoListDropData,
} from "./types";
