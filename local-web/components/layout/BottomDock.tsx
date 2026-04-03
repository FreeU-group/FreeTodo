"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "framer-motion";
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

// 动画配置常量
const DOCK_ANIMATION_CONFIG = {
	spring: {
		type: "spring" as const,
		stiffness: 350,
		damping: 30,
		mass: 0.8,
	},
};

// Dock 高度相关常量（单位: px）
const DOCK_TRIGGER_ZONE = 80; // 触发展开的底部区域高度（鼠标进入此区域时展开）
const HIDE_DELAY_MS = 1000; // 鼠标离开触发区域后收起的延迟时间
const DOCK_BOTTOM_OFFSET = 12; // 收起时，向下隐藏的偏移量
const PANEL_VISIBLE_OFFSET = 8; // Panel 模式展开时，向上抬高的偏移量，让 dock 离底边更高一点

interface BottomDockProps {
	className?: string;
	/** 是否在 Panel 模式下（用于调整鼠标位置检测和动画） */
	isInPanelMode?: boolean;
	/** Panel 容器的 ref（用于计算相对于 Panel 的鼠标位置） */
	panelContainerRef?: React.RefObject<HTMLElement | null>;
	/** 当前显示的 panel 个数（1, 2, 或 3），用于决定显示哪些 dock items */
	visiblePanelCount?: number;
	/** 指定需要显示的 panel 槽位（优先级高于 visiblePanelCount） */
	visiblePositions?: PanelPosition[];
}

interface DockItem {
	id: string;
	icon: LucideIcon;
	label: string;
	isActive: boolean;
	onClick: () => void;
	group?: string;
}

function getFeatureLabelKey(feature: PanelFeature): string {
	return feature;
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
			data-tour={`dock-item-${position}`}
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
					? "bg-[oklch(var(--primary-weak))] dark:bg-[oklch(var(--primary-weak-hover))] text-[oklch(var(--primary))] dark:text-[oklch(var(--foreground))] shadow-[0_0_0_1px_oklch(var(--primary))] hover:bg-[oklch(var(--primary-weak-hover))] dark:hover:bg-[oklch(var(--primary-weak))]"
					: "text-[oklch(var(--foreground))] hover:bg-[oklch(var(--muted))] hover:text-[oklch(var(--foreground))]",
			)}
			aria-label={item.label}
			aria-pressed={item.isActive}
		>
			<Icon
				className={cn(
					"h-5 w-5",
					item.isActive
						? "text-[oklch(var(--primary))] dark:text-[oklch(var(--foreground))]"
						: "text-[oklch(var(--foreground))]",
				)}
			/>
			<span
				className={cn(
					"text-sm font-semibold",
					item.isActive
						? "text-[oklch(var(--primary))] dark:text-[oklch(var(--foreground))]"
						: "text-[oklch(var(--foreground))]",
				)}
			>
				{item.label}
			</span>
			{item.isActive && (
				<span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3 h-0.5 bg-[oklch(var(--primary))]" />
			)}
		</button>
	);
}

export function BottomDock({
	className,
	isInPanelMode = false,
	panelContainerRef,
	visiblePanelCount,
	visiblePositions,
}: BottomDockProps) {
	const {
		isPanelAOpen,
		isPanelBOpen,
		isPanelCOpen,
		togglePanelA,
		togglePanelB,
		togglePanelC,
		setPanelFeature,
		dockDisplayMode,
		panelFeatureMap, // ✅ 直接订阅 panelFeatureMap，确保交换位置后能触发重新渲染
		disabledFeatures, // ✅ 也需要订阅 disabledFeatures，确保禁用功能被正确处理
		backendDisabledFeatures,
		getFeatureByPosition, // ✅ 用于根据位置获取功能（用于引导流程）
	} = useUiStore();
	const { locale: _ } = useLocaleStore();
	const t = useTranslations("bottomDock");
	const [mounted, setMounted] = useState(false);

	// Dock 展开/收起状态
	const [isExpanded, setIsExpanded] = useState(false);
	const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const dockRef = useRef<HTMLDivElement | null>(null);
	const [dockHeight, setDockHeight] = useState(52); // 默认高度估算值

	const [menuState, setMenuState] = useState<{
		isOpen: boolean;
		position: PanelPosition | null;
		anchorElement: HTMLElement | null;
	}>({
		isOpen: false,
		position: null,
		anchorElement: null,
	});

	useEffect(() => {
		setMounted(true);
	}, []);

	// 根据当前显示的 panel 个数决定显示哪些 dock items
	// 如果 visiblePositions 指定，则按指定显示；否则使用 visiblePanelCount（兼容完整页面模式）
	const visiblePositionsResolved: PanelPosition[] = useMemo(() => {
		if (visiblePositions && visiblePositions.length > 0) return visiblePositions;

		// Panel 模式 & 完整页面模式都按 visiblePanelCount 显示 1/2/3 个，保证与面板数量同步
		const count = visiblePanelCount ?? 3;
		return count === 1
			? ["panelA"]
			: count === 2
				? ["panelA", "panelB"]
				: ["panelA", "panelB", "panelC"]; // 默认或 3 个
	}, [visiblePanelCount, visiblePositions]);

	// 监听外部事件以程序化打开右键菜单（用于引导流程）
	useEffect(() => {
		const handleOpenMenu = (
			e: CustomEvent<{ feature?: PanelFeature; position?: PanelPosition }>,
		) => {
			const { feature: targetFeature, position: targetPosition } = e.detail;

			// 优先使用 position 参数
			if (targetPosition) {
				const anchorEl = itemRefs.current[targetPosition];
				if (anchorEl) {
					setMenuState({
						isOpen: true,
						position: targetPosition,
						anchorElement: anchorEl,
					});
				}
				return;
			}

			// 回退到使用 feature 参数
			if (targetFeature) {
				const positions: PanelPosition[] = ["panelA", "panelB", "panelC"];
				for (const pos of positions) {
					if (getFeatureByPosition(pos) === targetFeature) {
						const anchorEl = itemRefs.current[pos];
						if (anchorEl) {
							setMenuState({
								isOpen: true,
								position: pos,
								anchorElement: anchorEl,
							});
						}
						break;
					}
				}
			}
		};

		window.addEventListener(
			"onboarding:open-dock-menu",
			handleOpenMenu as EventListener,
		);
		return () => {
			window.removeEventListener(
				"onboarding:open-dock-menu",
				handleOpenMenu as EventListener,
			);
		};
	}, [getFeatureByPosition]);

	// 基于配置生成 dock items，每个位置槽位对应一个 item
	// 在 SSR 时使用默认值，避免 hydration 错误
	const DOCK_ITEMS: DockItem[] = useMemo(() => {
		const disabledSet = new Set([
			...disabledFeatures,
			...backendDisabledFeatures,
		]);

		return visiblePositionsResolved.map((position) => {
		// 在 SSR 时使用默认功能分配，客户端挂载后使用实际值
		const defaultFeatureMap: Record<PanelPosition, PanelFeature> = {
			panelA: "todos",
			panelB: "todoDetail",
			panelC: "chat",
		};
		// ✅ 修复：直接使用 panelFeatureMap，而不是 getFeatureByPosition，确保交换位置后能触发重新计算
		// 同时检查功能是否被禁用
		const rawFeature = mounted ? (panelFeatureMap[position] || null) : defaultFeatureMap[position];
		const feature = rawFeature && disabledSet.has(rawFeature) ? null : rawFeature;

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
				label: t("unassigned"),
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
	}, [visiblePositionsResolved, mounted, panelFeatureMap, disabledFeatures, backendDisabledFeatures, isPanelAOpen, isPanelBOpen, isPanelCOpen, togglePanelA, togglePanelB, togglePanelC, t]); // ✅ 修复：依赖 panelFeatureMap 和 disabledFeatures，确保交换位置后能触发重新计算

	// 测量 dock 实际高度
	useEffect(() => {
		if (dockRef.current) {
			const height = dockRef.current.offsetHeight;
			if (height > 0) {
				setDockHeight(height);
			}
		}
	}, []);

	// 全局鼠标位置监听 - 当鼠标接近屏幕底部时展开 dock（仅在自动隐藏模式下生效）
	useEffect(() => {
		if (!mounted) return;

		// 固定模式：始终展开，不需要监听鼠标事件
		if (dockDisplayMode === "fixed") {
			setIsExpanded(true);
			// 清除可能存在的隐藏定时器
			if (hideTimeoutRef.current) {
				clearTimeout(hideTimeoutRef.current);
				hideTimeoutRef.current = null;
			}
			return;
		}

		const handleMouseMove = (e: MouseEvent) => {
			// 如果右键菜单打开，保持 dock 展开，不执行隐藏逻辑
			if (menuState.isOpen) {
				// 清除可能存在的隐藏定时器
				if (hideTimeoutRef.current) {
					clearTimeout(hideTimeoutRef.current);
					hideTimeoutRef.current = null;
				}
				setIsExpanded(true);
				return;
			}

			let distanceFromBottom: number;

			if (isInPanelMode && panelContainerRef?.current) {
				// Panel 模式：使用 Panel 容器的底边，确保在面板底部附近就能触发展开
				const rect = panelContainerRef.current.getBoundingClientRect();
				const mouseY = e.clientY;
				distanceFromBottom = rect.bottom - mouseY;
			} else {
				// 全屏 / 浏览器模式：使用窗口高度
				const windowHeight = window.innerHeight;
				const mouseY = e.clientY;
				distanceFromBottom = windowHeight - mouseY;
			}

			// 鼠标在底部触发区域内
			if (distanceFromBottom <= DOCK_TRIGGER_ZONE) {
				// 清除可能存在的隐藏定时器
				if (hideTimeoutRef.current) {
					clearTimeout(hideTimeoutRef.current);
					hideTimeoutRef.current = null;
				}
				setIsExpanded(true);
			} else {
				// 鼠标离开触发区域，启动延迟收起
				if (!hideTimeoutRef.current) {
					hideTimeoutRef.current = setTimeout(() => {
						setIsExpanded(false);
						hideTimeoutRef.current = null;
					}, HIDE_DELAY_MS);
				}
			}
		};

		window.addEventListener("mousemove", handleMouseMove);

		return () => {
			window.removeEventListener("mousemove", handleMouseMove);
			if (hideTimeoutRef.current) {
				clearTimeout(hideTimeoutRef.current);
			}
		};
	}, [mounted, menuState.isOpen, dockDisplayMode, isInPanelMode, panelContainerRef]);

	// 计算收起时的 translateY 值
	// 收起时，dock 完全隐藏到屏幕底部外
	const hiddenTranslateY = dockHeight + DOCK_BOTTOM_OFFSET;
	// 展开时的 translateY：Panel 模式下稍微往上抬一点，避免贴边/遮挡
	const visibleTranslateY = isInPanelMode ? -PANEL_VISIBLE_OFFSET : 0;

	const itemRefs = useRef<Record<PanelPosition, HTMLButtonElement | null>>({
		panelA: null,
		panelB: null,
		panelC: null,
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
		<motion.div
			className={cn(
				isInPanelMode
					? "pointer-events-auto relative z-1000000"
					: "pointer-events-auto fixed bottom-1 left-1/2 z-1000000",
				className,
			)}
			initial={false}
			animate={isInPanelMode
				? {
					x: 0,
					// Panel 模式：展开时略微抬高，隐藏时继续向下滑出容器
					y: isExpanded ? visibleTranslateY : hiddenTranslateY,
				}
				: {
					// 全屏 / 浏览器模式：行为保持不变
					x: "-50%",
					y: isExpanded ? 0 : hiddenTranslateY,
				}
			}
			transition={DOCK_ANIMATION_CONFIG.spring}
		>
		<div
			ref={dockRef}
			data-tour="bottom-dock"
			className={cn(
				"flex items-center gap-2",
				"bg-[oklch(var(--card))] dark:bg-[oklch(var(--card))]/60",
				"backdrop-blur-md",
				"border border-[oklch(var(--border))]",
				"shadow-lg dark:shadow-[0_12px_32px_-18px_oklch(var(--overlay))]",
				"px-2 py-1.5",
				"rounded-xl",
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
							// ✅ 如果 Panel 当前未激活，则自动激活它
							const pos = menuState.position;
							const isPanelActive =
								pos === "panelA" ? isPanelAOpen :
								pos === "panelB" ? isPanelBOpen :
								isPanelCOpen;
							if (!isPanelActive) {
								const toggleFn =
									pos === "panelA" ? togglePanelA :
									pos === "panelB" ? togglePanelB :
									togglePanelC;
								toggleFn();
							}
							// ✅ 修复：选择功能后立即关闭菜单，重置状态
							setMenuState({
								isOpen: false,
								position: null,
								anchorElement: null,
							});
						}
					}}
					anchorElement={menuState.anchorElement}
				/>
			)}
		</motion.div>
	);
}
