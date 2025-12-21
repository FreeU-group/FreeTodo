"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PanelFeature, PanelPosition } from "@/lib/config/panel-config";
import { FEATURE_ICON_MAP } from "@/lib/config/panel-config";
import type { DragData, DropData } from "@/lib/dnd";
import { useLocaleStore } from "@/lib/store/locale";
import { useUiStore } from "@/lib/store/ui-store";
import { cn } from "@/lib/utils";
import { PanelSelectorMenu } from "./PanelSelectorMenu";

interface BottomDockProps {
	className?: string;
}

interface DockItem {
	id: string;
	icon: LucideIcon;
	label: string;
	isActive: boolean;
	onClick: () => void;
	group?: string;
}

const FEATURE_LABEL_MAP: Partial<Record<PanelFeature, string>> = {
	calendar: "calendar",
	activity: "activity",
	todos: "todos",
	chat: "chat",
	todoDetail: "todoDetail",
	diary: "diary",
	settings: "settings",
	costTracking: "costTracking",
	achievements: "achievements",
	voiceModule: "voiceModule",
	debugShots: "debugShots",
};

// 功能到翻译键的映射配置，缺失项回退到 todos
function getFeatureLabelKey(feature: PanelFeature): string {
	return FEATURE_LABEL_MAP[feature] ?? "todos";
}

// Dock Item 组件 - 单独组件以正确使用 hooks
interface DockItemButtonProps {
	item: DockItem;
	position: PanelPosition;
	onContextMenu: (
		e: React.MouseEvent<HTMLButtonElement>,
		position: PanelPosition,
	) => void;
	setItemRef: (position: PanelPosition, el: HTMLButtonElement | null) => void;
	mounted: boolean;
}

function DockItemButton({
	item,
	position,
	onContextMenu,
	setItemRef,
	mounted,
}: DockItemButtonProps) {
	const Icon = item.icon;

	// 构建拖拽数据
	const dragData: DragData = useMemo(
		() => ({
			type: "PANEL_HEADER" as const,
			payload: {
				position,
			},
		}),
		[position],
	);

	// 构建放置数据
	const dropData: DropData = useMemo(
		() => ({
			type: "PANEL_HEADER" as const,
			metadata: {
				position,
			},
		}),
		[position],
	);

	// 可拖拽 - 只在客户端挂载后使用，避免 SSR hydration 问题
	const {
		attributes: dragAttributes,
		listeners: dragListeners,
		setNodeRef: setDragRef,
		transform: dragTransform,
		isDragging: isDraggingItem,
	} = useDraggable({
		id: `dock-item-${position}`,
		data: dragData,
		disabled: !mounted,
	});

	// 可放置 - 只在客户端挂载后使用
	const { setNodeRef: setDropRef, isOver: isOverItem } = useDroppable({
		id: `dock-drop-${position}`,
		data: dropData,
		disabled: !mounted,
	});

	// 合并 refs
	const setRefs = (el: HTMLButtonElement | null) => {
		setItemRef(position, el);
		if (mounted) {
			setDragRef(el);
			setDropRef(el);
		}
	};

	const dragStyle = dragTransform
		? {
				transform: CSS.Translate.toString(dragTransform),
			}
		: undefined;

	return (
		<button
			ref={setRefs}
			type="button"
			style={dragStyle}
			{...(mounted ? dragAttributes : {})}
			{...(mounted ? dragListeners : {})}
			onClick={item.onClick}
			onContextMenu={(e) => onContextMenu(e, position)}
			className={cn(
				"relative flex items-center gap-2",
				"px-3 py-2 rounded-lg",
				"transition-all duration-200",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(var(--ring))] focus-visible:ring-offset-2",
				mounted && "cursor-grab active:cursor-grabbing",
				isDraggingItem && "opacity-50",
				isOverItem && !isDraggingItem && "ring-2 ring-primary/50 ring-offset-2",
				item.isActive
					? "bg-[oklch(var(--primary-weak))] dark:bg-[oklch(var(--primary-weak-hover))] text-[oklch(var(--primary))] dark:text-[oklch(var(--primary-foreground))] shadow-[0_0_0_1px_oklch(var(--primary))] hover:bg-[oklch(var(--primary-weak-hover))] dark:hover:bg-[oklch(var(--primary-weak))]"
					: "text-[oklch(var(--foreground))] hover:bg-[oklch(var(--muted))] hover:text-[oklch(var(--foreground))]",
			)}
			aria-label={item.label}
			aria-pressed={item.isActive}
		>
			<Icon
				className={cn(
					"h-5 w-5",
					item.isActive
						? "text-[oklch(var(--primary))] dark:text-[oklch(var(--primary-foreground))]"
						: "text-[oklch(var(--foreground))]",
				)}
			/>
			<span
				className={cn(
					"text-sm font-medium",
					item.isActive
						? "text-[oklch(var(--primary))] dark:text-[oklch(var(--primary-foreground))]"
						: "text-[oklch(var(--foreground))]",
				)}
			>
				{item.label}
			</span>
			{item.isActive && (
				<span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3 h-0.5 bg-[oklch(var(--primary))] dark:bg-[oklch(var(--primary-foreground))]" />
			)}
		</button>
	);
}

export function BottomDock({ className }: BottomDockProps) {
	const {
		isPanelAOpen,
		isPanelBOpen,
		isPanelCOpen,
		togglePanelA,
		togglePanelB,
		togglePanelC,
		getFeatureByPosition,
		setPanelFeature,
	} = useUiStore();
	const { locale: _ } = useLocaleStore();
	const t = useTranslations("bottomDock");
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	const [menuState, setMenuState] = useState<{
		isOpen: boolean;
		position: PanelPosition | null;
		anchorElement: HTMLElement | null;
	}>({
		isOpen: false,
		position: null,
		anchorElement: null,
	});

	const itemRefs = useRef<Record<PanelPosition, HTMLButtonElement | null>>({
		panelA: null,
		panelB: null,
		panelC: null,
	});

	// 基于配置生成 dock items，每个位置槽位对应一个 item
	// 在 SSR 时使用默认值，避免 hydration 错误
	const DOCK_ITEMS: DockItem[] = (
		["panelA", "panelB", "panelC"] as PanelPosition[]
	).map((position) => {
		// 在 SSR 时使用默认功能分配，客户端挂载后使用实际值
		const defaultFeatureMap: Record<PanelPosition, PanelFeature> = {
			panelA: "voiceModule",
			panelB: "todoDetail",
			panelC: "chat",
		};
		const feature = mounted
			? getFeatureByPosition(position)
			: defaultFeatureMap[position];

		// 获取位置对应的状态和 toggle 方法（无论是否分配功能都需要）
		let isActive: boolean;
		let onClick: () => void;
		switch (position) {
			case "panelA":
				isActive = isPanelAOpen;
				onClick = togglePanelA;
				break;
			case "panelB":
				isActive = isPanelBOpen;
				onClick = togglePanelB;
				break;
			case "panelC":
				isActive = isPanelCOpen;
				onClick = togglePanelC;
				break;
		}

		if (!feature) {
			// 如果位置没有分配功能，返回一个占位 item
			// 但仍然需要显示激活状态，并允许点击关闭
			return {
				id: position,
				icon: FEATURE_ICON_MAP.todos,
				label: "未分配",
				isActive,
				onClick,
				group: "views",
			};
		}
		const Icon = FEATURE_ICON_MAP[feature];
		const labelKey = getFeatureLabelKey(feature);

		return {
			id: position,
			icon: Icon,
			label: t(labelKey),
			isActive,
			onClick,
			group: "views",
		};
	});

	// 按组分组，用于添加分隔符
	const groupedItems = DOCK_ITEMS.reduce(
		(acc, item) => {
			const group = item.group || "default";
			if (!acc[group]) {
				acc[group] = [];
			}
			acc[group].push(item);
			return acc;
		},
		{} as Record<string, DockItem[]>,
	);

	const groupEntries = Object.entries(groupedItems);
	const hasMultipleGroups = groupEntries.length > 1;

	return (
		<div
			className={cn(
				"pointer-events-auto fixed bottom-6 left-1/2 z-50 -translate-x-1/2",
				className,
			)}
		>
			<div
				className={cn(
					"flex items-center gap-2",
					"bg-[oklch(var(--card))]/80",
					"backdrop-blur-md",
					"border border-[oklch(var(--border))]",
					"shadow-lg",
					"px-2 py-1.5",
					"rounded-(--radius)",
				)}
			>
				{groupEntries.map(([groupName, groupItems], groupIndex) => (
					<div key={groupName} className="flex items-center gap-2">
						{groupIndex > 0 && hasMultipleGroups && (
							<div className="h-6 w-px bg-[oklch(var(--border))] mx-1" />
						)}
						{groupItems.map((item) => {
							const position = item.id as PanelPosition;
							return (
								<DockItemButton
									key={item.id}
									item={item}
									position={position}
									mounted={mounted}
									onContextMenu={(e, pos) => {
										e.preventDefault();
										setMenuState({
											isOpen: true,
											position: pos,
											anchorElement: e.currentTarget,
										});
									}}
									setItemRef={(pos, el) => {
										itemRefs.current[pos] = el;
									}}
								/>
							);
						})}
					</div>
				))}
			</div>
			{menuState.position && (
				<PanelSelectorMenu
					position={menuState.position}
					isOpen={menuState.isOpen}
					onClose={() =>
						setMenuState({
							isOpen: false,
							position: null,
							anchorElement: null,
						})
					}
					onSelect={(feature) => {
						if (menuState.position) {
							setPanelFeature(menuState.position, feature);
						}
					}}
					anchorElement={menuState.anchorElement}
				/>
			)}
		</div>
	);
}
