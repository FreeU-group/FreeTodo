"use client";

import { useDroppable } from "@dnd-kit/core";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { PanelPosition } from "@/lib/config/panel-config";
import { useUiStore } from "@/lib/store/ui-store";
import { cn } from "@/lib/utils";

interface PanelContainerProps {
	position: PanelPosition;
	isVisible: boolean;
	width: number;
	children: React.ReactNode;
	className?: string;
	isDragging?: boolean;
}

// 动画配置常量 - 优化后的弹簧动画参数，确保平滑且快速
const ANIMATION_CONFIG = {
	spring: {
		type: "spring" as const,
		stiffness: 280,
		damping: 28,
		mass: 0.9,
	},
};

export function PanelContainer({
	position,
	isVisible,
	width,
	children,
	className,
	isDragging = false,
}: PanelContainerProps) {
	const { getFeatureByPosition } = useUiStore();
	const [mounted, setMounted] = useState(false);

	// 确保客户端 hydration 完成后再渲染，避免 SSR 和客户端不一致
	useEffect(() => {
		setMounted(true);
	}, []);

	const flexBasis = `${Math.round(width * 1000) / 10}%`;

	// 获取位置对应的功能，用于 aria-label
	// 在 SSR 时使用默认值，避免 hydration 错误
	const feature = mounted ? getFeatureByPosition(position) : null;
	const ariaLabelMap: Record<string, string> = {
		calendar: "Calendar Panel",
		todos: "Todos Panel",
		chat: "Chat Panel",
		todoDetail: "Todo Detail Panel",
		diary: "Diary Panel",
		settings: "Settings Panel",
		costTracking: "Cost Tracking Panel",
	};

	// 拖动时使用即时更新，禁用动画
	const transition = isDragging ? { duration: 0 } : ANIMATION_CONFIG.spring;

	// 在 SSR 时使用默认值，避免 hydration 错误
	const ariaLabel =
		mounted && feature ? ariaLabelMap[feature] || "Panel" : "Panel";

	// 设置面板header作为可放置区域
	const { setNodeRef: setDroppableRef, isOver } = useDroppable({
		id: `panel-drop-${position}`,
		data: {
			type: "PANEL_HEADER",
			metadata: {
				position,
			},
		},
	});

	return (
		<motion.section
			key={position}
			aria-label={ariaLabel}
			suppressHydrationWarning
			data-panel={position}
			ref={setDroppableRef}
			className={cn(
				"relative flex h-full min-h-0 flex-col",
				"bg-[oklch(var(--card))]",
				"rounded-(--radius)",
				"overflow-hidden",
				// 边框样式：正常状态 vs 拖拽悬停状态
				isOver && isVisible
					? "border-2 border-primary/70"
					: "border border-[oklch(var(--border))]",
				// 当不可见时，隐藏边框和背景，避免残留视觉元素
				!isVisible && "border-transparent bg-transparent",
				className,
			)}
			initial={false}
			animate={{
				flexBasis: isVisible ? flexBasis : "0%",
				opacity: isVisible ? 1 : 0,
				scale: isVisible ? 1 : 0,
				// 确保隐藏时不占用任何空间
				width: isVisible ? "auto" : 0,
				padding: isVisible ? undefined : 0,
				borderWidth: isVisible ? undefined : 0,
			}}
			transition={transition}
			style={{
				minWidth: 0,
				// 当不可见时，不需要占用空间
				flexGrow: isVisible ? 1 : 0,
				flexShrink: isVisible ? 1 : 0,
				willChange: isDragging
					? "flex-basis"
					: "flex-basis, transform, opacity",
			}}
		>
			{children}
		</motion.section>
	);
}
