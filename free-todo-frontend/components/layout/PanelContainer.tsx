"use client";

import { motion } from "framer-motion";

import { cn } from "@/lib/utils";

export type PanelVariant = "calendar" | "todos" | "chat";

interface PanelContainerProps {
	variant: PanelVariant;
	isVisible: boolean;
	width: number;
	children: React.ReactNode;
	className?: string;
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
	variant,
	isVisible,
	width,
	children,
	className,
}: PanelContainerProps) {
	const flexBasis = `${Math.round(width * 1000) / 10}%`;
	const isCalendar = variant === "calendar";

	// 计算滑动方向
	// 日历面板：从左侧滑入（x: -100%）/ 向左侧滑出（x: -100%）
	// 待办面板和聊天面板：从右侧滑入（x: 100%）/ 向右侧滑出（x: 100%）
	const getInitialX = () => (isCalendar ? "-100%" : "100%");
	const getExitX = () => (isCalendar ? "-100%" : "100%");

	return (
		<motion.section
			key={variant}
			aria-label={
				variant === "calendar"
					? "Calendar Panel"
					: variant === "chat"
						? "Chat Panel"
						: "Todos Panel"
			}
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
			transition={ANIMATION_CONFIG.spring}
			style={{
				minWidth: 0,
				willChange: "flex-basis, transform, opacity",
			}}
		>
			{children}
		</motion.section>
	);
}
