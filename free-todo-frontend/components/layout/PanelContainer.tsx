"use client";

import { motion } from "framer-motion";
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
	const flexBasis = `${Math.round(width * 1000) / 10}%`;
	// panelA 从左侧滑入，panelB 和 panelC 从右侧滑入
	const isLeftPanel = position === "panelA";

	// 计算滑动方向
	// panelA：从左侧滑入（x: -100%）/ 向左侧滑出（x: -100%）
	// panelB 和 panelC：从右侧滑入（x: 100%）/ 向右侧滑出（x: 100%）
	const getInitialX = () => (isLeftPanel ? "-100%" : "100%");
	const getExitX = () => (isLeftPanel ? "-100%" : "100%");

	// 获取位置对应的功能，用于 aria-label
	const feature = getFeatureByPosition(position);
	const ariaLabelMap: Record<string, string> = {
		calendar: "Calendar Panel",
		todos: "Todos Panel",
		chat: "Chat Panel",
		todoDetail: "Todo Detail Panel",
		diary: "Diary Panel",
		settings: "Settings Panel",
	};

	// 拖动时使用即时更新，禁用动画
	const transition = isDragging ? { duration: 0 } : ANIMATION_CONFIG.spring;

	return (
		<motion.section
			key={position}
			aria-label={feature ? ariaLabelMap[feature] || "Panel" : "Panel"}
			className={cn(
				"relative flex h-full min-h-0 flex-1 flex-col",
				"bg-white dark:bg-zinc-900",
				"rounded-[var(--radius-panel)]",
				"overflow-hidden",
				className,
			)}
			initial={{
				flexBasis: "0%",
				x: getInitialX(),
				opacity: 0,
				scale: 0.95,
			}}
			animate={{
				flexBasis: isVisible ? flexBasis : "0%",
				x: isVisible ? 0 : getExitX(),
				opacity: isVisible ? 1 : 0,
				scale: isVisible ? 1 : 0.95,
			}}
			exit={{
				flexBasis: "0%",
				x: getExitX(),
				opacity: 0,
				scale: 0.95,
			}}
			transition={transition}
			style={{
				minWidth: 0,
				willChange: isDragging
					? "flex-basis"
					: "flex-basis, transform, opacity",
			}}
		>
			{children}
		</motion.section>
	);
}
