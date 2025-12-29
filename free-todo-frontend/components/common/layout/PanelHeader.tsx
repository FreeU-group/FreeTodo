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
 * Panel Icon 样式配置接口
 */
export interface PanelIconStyleConfig {
	/** 图标大小类名（如 "h-4 w-4", "h-5 w-5"） */
	size?: string;
	/** 图标颜色类名（如 "text-primary", "text-foreground"） */
	color?: string;
	/** 图标粗细类名（如 "stroke-[1.5]", "stroke-[2]"） */
	strokeWidth?: string;
	/** 额外的自定义类名 */
	className?: string;
}

/**
 * Panel Action Button 样式配置接口
 */
export interface PanelActionButtonStyleConfig {
	/** 按钮大小类名（如 "h-7 w-7", "h-8 w-8"） */
	size?: string;
	/** 按钮背景色类名（如 "bg-primary", "bg-muted/50"） */
	background?: string;
	/** 按钮文字颜色类名（如 "text-primary-foreground", "text-muted-foreground"） */
	textColor?: string;
	/** 按钮边框圆角类名（如 "rounded-md", "rounded-lg"） */
	rounded?: string;
	/** Hover 状态背景色类名（如 "hover:bg-primary/90", "hover:bg-muted/50"） */
	hoverBackground?: string;
	/** Hover 状态文字颜色类名（如 "hover:text-foreground"） */
	hoverTextColor?: string;
	/** Focus 可见时的样式类名（如 "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"） */
	focusVisible?: string;
	/** 过渡效果类名（如 "transition-colors"） */
	transition?: string;
	/** 额外的自定义类名 */
	className?: string;
}

/**
 * 默认的 Panel Header Icon 样式配置
 * 用于 PanelHeader 最左侧代表 panel 的 icon
 */
const DEFAULT_HEADER_ICON_STYLE: PanelIconStyleConfig = {
	size: "h-4.5 w-4.5", // 图标大小，可改为 "h-5 w-5", "h-6 w-6" 等
	color: "text-primary", // 图标颜色，可改为 "text-foreground", "text-primary" 等
	strokeWidth: "stroke-[2]", // 图标粗细，可改为 "stroke-[1.5]", "stroke-[2]" 等
	className: undefined, // 额外的自定义类名
};

/**
 * 默认的 Panel Action Icon 样式配置
 * 用于 PanelHeader actions 区域中的 icon
 */
const DEFAULT_ACTION_ICON_STYLE: PanelIconStyleConfig = {
	size: "h-4.5 w-4.5", // 图标大小，可改为 "h-5 w-5", "h-6 w-6" 等
	color: "text-muted-foreground", // 图标颜色，可改为 "text-foreground", "text-primary" 等
	strokeWidth: "stroke-[2.2]", // 图标粗细，可改为 "stroke-[1.5]", "stroke-[2]" 等
	className: undefined, // 额外的自定义类名
};

/**
 * 默认的 Panel Action Button 样式配置
 *
 * 在这里统一调整所有 PanelHeader actions 区域中 button 的样式
 *
 * 支持三种变体：
 * - default: 普通按钮（默认）
 * - primary: 主按钮（蓝色背景）
 * - destructive: 危险按钮（红色文字）
 */
const DEFAULT_ACTION_BUTTON_STYLE: PanelActionButtonStyleConfig = {
	size: "h-6 w-6", // 按钮大小，可改为 "h-8 w-8" 等
	background: undefined, // 默认无背景
	textColor: "text-muted-foreground", // 文字颜色
	rounded: "rounded-md", // 圆角
	hoverBackground: "hover:bg-muted/50", // Hover 背景
	hoverTextColor: "hover:text-foreground", // Hover 文字颜色
	focusVisible:
		"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", // Focus 样式
	transition: "transition-colors", // 过渡效果
	className: undefined, // 额外的自定义类名
};

const PRIMARY_ACTION_BUTTON_STYLE: PanelActionButtonStyleConfig = {
	...DEFAULT_ACTION_BUTTON_STYLE,
	background: "bg-primary",
	textColor: "text-primary-foreground",
	hoverBackground: "hover:bg-primary/90",
	hoverTextColor: undefined, // 主按钮 hover 时文字颜色不变
};

const DESTRUCTIVE_ACTION_BUTTON_STYLE: PanelActionButtonStyleConfig = {
	...DEFAULT_ACTION_BUTTON_STYLE,
	textColor: "text-destructive",
	hoverBackground: "hover:bg-destructive/10",
	hoverTextColor: undefined, // 危险按钮 hover 时文字颜色不变
};

/**
 * Panel Icon 样式配置 Context
 * 用于在全局范围内统一配置所有 PanelHeader 中的 icon 样式
 */
interface PanelIconConfigContextValue {
	/** 主标题 icon 的样式配置 */
	headerIcon: PanelIconStyleConfig;
	/** Actions 区域中 icon 的样式配置 */
	actionIcon: PanelIconStyleConfig;
	/** 普通按钮样式配置 */
	defaultButton: PanelActionButtonStyleConfig;
	/** 主按钮样式配置 */
	primaryButton: PanelActionButtonStyleConfig;
	/** 危险按钮样式配置 */
	destructiveButton: PanelActionButtonStyleConfig;
}

const PanelIconConfigContext = createContext<PanelIconConfigContextValue>({
	headerIcon: DEFAULT_HEADER_ICON_STYLE,
	actionIcon: DEFAULT_ACTION_ICON_STYLE,
	defaultButton: DEFAULT_ACTION_BUTTON_STYLE,
	primaryButton: PRIMARY_ACTION_BUTTON_STYLE,
	destructiveButton: DESTRUCTIVE_ACTION_BUTTON_STYLE,
});

/**
 * Panel Icon 样式配置 Provider
 * 用于在应用顶层或特定区域统一配置 icon 和 button 样式
 */
export function PanelIconConfigProvider({
	headerIcon,
	actionIcon,
	defaultButton,
	primaryButton,
	destructiveButton,
	children,
}: {
	/** 主标题 icon 的样式配置（会与默认配置合并） */
	headerIcon?: Partial<PanelIconStyleConfig>;
	/** Actions 区域中 icon 的样式配置（会与默认配置合并） */
	actionIcon?: Partial<PanelIconStyleConfig>;
	/** 普通按钮样式配置（会与默认配置合并） */
	defaultButton?: Partial<PanelActionButtonStyleConfig>;
	/** 主按钮样式配置（会与默认配置合并） */
	primaryButton?: Partial<PanelActionButtonStyleConfig>;
	/** 危险按钮样式配置（会与默认配置合并） */
	destructiveButton?: Partial<PanelActionButtonStyleConfig>;
	children: ReactNode;
}) {
	const value = useMemo<PanelIconConfigContextValue>(
		() => ({
			headerIcon: { ...DEFAULT_HEADER_ICON_STYLE, ...headerIcon },
			actionIcon: { ...DEFAULT_ACTION_ICON_STYLE, ...actionIcon },
			defaultButton: { ...DEFAULT_ACTION_BUTTON_STYLE, ...defaultButton },
			primaryButton: { ...PRIMARY_ACTION_BUTTON_STYLE, ...primaryButton },
			destructiveButton: {
				...DESTRUCTIVE_ACTION_BUTTON_STYLE,
				...destructiveButton,
			},
		}),
		[headerIcon, actionIcon, defaultButton, primaryButton, destructiveButton],
	);

	return (
		<PanelIconConfigContext.Provider value={value}>
			{children}
		</PanelIconConfigContext.Provider>
	);
}

/**
 * Hook: 获取 Panel Icon 样式类名
 * 用于在 actions 区域或其他地方统一使用 icon 样式
 * @param type - icon 类型：'header' 用于主标题 icon，'action' 用于操作区域的 icon
 * @param overrides - 可选的样式覆盖
 * @returns 合并后的样式类名字符串
 */
export function usePanelIconStyle(
	type: "header" | "action" = "action",
	overrides?: Partial<PanelIconStyleConfig>,
): string {
	const config = useContext(PanelIconConfigContext);
	const baseConfig = type === "header" ? config.headerIcon : config.actionIcon;
	const mergedConfig = { ...baseConfig, ...overrides };

	return cn(
		mergedConfig.size,
		mergedConfig.color,
		mergedConfig.strokeWidth,
		mergedConfig.className,
	);
}

/**
 * Hook: 获取 Panel Action Button 样式类名
 * 用于在 actions 区域统一使用 button 样式
 * @param variant - 按钮变体：'default' 普通按钮，'primary' 主按钮，'destructive' 危险按钮
 * @param overrides - 可选的样式覆盖
 * @returns 合并后的样式类名字符串
 */
export function usePanelActionButtonStyle(
	variant: "default" | "primary" | "destructive" = "default",
	overrides?: Partial<PanelActionButtonStyleConfig>,
): string {
	const config = useContext(PanelIconConfigContext);
	const baseConfig =
		variant === "primary"
			? config.primaryButton
			: variant === "destructive"
				? config.destructiveButton
				: config.defaultButton;
	const mergedConfig = { ...baseConfig, ...overrides };

	return cn(
		"flex items-center justify-center",
		mergedConfig.size,
		mergedConfig.background,
		mergedConfig.textColor,
		mergedConfig.rounded,
		mergedConfig.hoverBackground,
		mergedConfig.hoverTextColor,
		mergedConfig.focusVisible,
		mergedConfig.transition,
		mergedConfig.className,
	);
}

/**
 * 统一的 Panel Action Button 组件
 * 用于在 PanelHeader 的 actions 区域创建统一样式的按钮
 */
export interface PanelActionButtonProps
	extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	/** 按钮变体 */
	variant?: "default" | "primary" | "destructive";
	/** 按钮内的图标 */
	icon: LucideIcon;
	/** 图标样式覆盖 */
	iconOverrides?: Partial<PanelIconStyleConfig>;
	/** 按钮样式覆盖 */
	buttonOverrides?: Partial<PanelActionButtonStyleConfig>;
	/** 无障碍标签 */
	"aria-label": string;
}

export function PanelActionButton({
	variant = "default",
	icon: Icon,
	iconOverrides,
	buttonOverrides,
	className,
	...buttonProps
}: PanelActionButtonProps) {
	const buttonStyle = usePanelActionButtonStyle(variant, buttonOverrides);

	// 对于 destructive 按钮，如果没有显式覆盖 icon 颜色，则自动使用红色
	const finalIconOverrides =
		variant === "destructive" && !iconOverrides?.color
			? { ...iconOverrides, color: "text-destructive" }
			: iconOverrides;

	const iconStyle = usePanelIconStyle("action", finalIconOverrides);

	return (
		<button
			type="button"
			className={cn(buttonStyle, className)}
			{...buttonProps}
		>
			<Icon className={iconStyle} />
		</button>
	);
}

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
	/** 自定义标题 icon 的样式（会覆盖全局配置） */
	iconClassName?: string;
}

export function PanelHeader({
	icon: Icon,
	title,
	actions,
	className,
	disableDrag = false,
	iconClassName,
}: PanelHeaderProps) {
	const position = usePanelPosition();
	const isDraggable = !disableDrag && position !== null;
	const headerIconStyle = usePanelIconStyle("header");

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
				<h2 className="flex items-center gap-2 text-base font-medium text-foreground">
					<Icon className={cn(headerIconStyle, iconClassName)} />
					{title}
				</h2>
				{actions && <div className="flex items-center gap-2">{actions}</div>}
			</div>
		</div>
	);

	return headerContent;
}
