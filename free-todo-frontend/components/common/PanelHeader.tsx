"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { createContext, useContext, useMemo } from "react";
import type { PanelPosition } from "@/lib/config/panel-config";
import type { DragData } from "@/lib/dnd";
import { cn } from "@/lib/utils";

/**
 * Panel Position Context
 * 用于在面板内容中传递位置信息
 */
const PanelPositionContext = createContext<PanelPosition | null>(null);

export function usePanelPosition(): PanelPosition | null {
	return useContext(PanelPositionContext);
}

export function PanelPositionProvider({
	position,
	children,
}: {
	position: PanelPosition;
	children: ReactNode;
}) {
	return (
		<PanelPositionContext.Provider value={position}>
			{children}
		</PanelPositionContext.Provider>
	);
}

/**
 * 统一的面板头部组件
 * 确保所有面板的 headerbar 高度一致
 * 如果 PanelPositionContext 提供了位置信息，则自动启用拖拽功能
 */
interface PanelHeaderProps {
	/** 标题图标 */
	icon: LucideIcon;
	/** 标题文本 */
	title: string;
	/** 右侧操作区域 */
	actions?: ReactNode;
	/** 自定义类名 */
	className?: string;
	/** 是否禁用拖拽（即使有 position context） */
	disableDrag?: boolean;
}

export function PanelHeader({
	icon: Icon,
	title,
	actions,
	className,
	disableDrag = false,
}: PanelHeaderProps) {
	const position = usePanelPosition();
	const isDraggable = !disableDrag && position !== null;

	// 构建拖拽数据
	const dragData: DragData | undefined = useMemo(
		() =>
			isDraggable && position
				? {
						type: "PANEL_HEADER" as const,
						payload: {
							position,
						},
					}
				: undefined,
		[isDraggable, position],
	);

	const { attributes, listeners, setNodeRef, transform, isDragging } =
		useDraggable({
			id: isDraggable
				? `panel-header-${position}`
				: `panel-header-static-${title}`,
			data: dragData,
			disabled: !isDraggable,
		});

	const style = transform
		? {
				transform: CSS.Translate.toString(transform),
			}
		: undefined;

	const headerContent = (
		<div
			className={cn(
				"shrink-0 bg-background border-b",
				isDragging && "opacity-50",
			)}
		>
			<div
				ref={isDraggable ? setNodeRef : undefined}
				style={style}
				{...(isDraggable ? { ...attributes, ...listeners } : {})}
				className={cn(
					"flex items-center justify-between px-4 py-2.5",
					isDraggable && "cursor-grab active:cursor-grabbing",
					className,
				)}
			>
				<h2 className="flex items-center gap-2 text-base text-foreground">
					<Icon className="h-4 w-4 text-primary" />
					{title}
				</h2>
				{actions && <div className="flex items-center gap-2">{actions}</div>}
			</div>
		</div>
	);

	return headerContent;
}
