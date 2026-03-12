"use client";

import { motion } from "framer-motion";
import type {
	MouseEvent as ReactMouseEvent,
	PointerEvent as ReactPointerEvent,
} from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface ResizeHandleProps {
	onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
	isDragging: boolean;
	isVisible?: boolean;
}

// 与 PanelContainer 使用相同的动画配置，确保同步
const ANIMATION_CONFIG = {
	spring: {
		type: "spring" as const,
		stiffness: 280,
		damping: 28,
		mass: 0.9,
	},
};

export function ResizeHandle({
	onPointerDown,
	isDragging,
	isVisible = true,
}: ResizeHandleProps) {
	const [isHovered, setIsHovered] = useState(false);

	return (
		<motion.div
			role="separator"
			aria-orientation="vertical"
			onPointerDown={isVisible ? onPointerDown : undefined}
			// 兼容性更好：同时监听 mouseDown，转交给同一个处理函数
			onMouseDown={
				isVisible
					? (event: ReactMouseEvent<HTMLDivElement>) =>
							onPointerDown(
								event as unknown as ReactPointerEvent<HTMLDivElement>,
							)
					: undefined
			}
			onMouseEnter={() => isVisible && setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
			initial={false}
			animate={{
				opacity: isVisible ? 1 : 0,
				scaleX: isVisible ? 1 : 0,
				// 分隔条整体宽度（含可点击区域）
				width: isVisible ? 5 : 0,
				// 取消左右 margin，让 panel 之间的间距再小一点
				marginLeft: 0,
				marginRight: 0,
			}}
			transition={ANIMATION_CONFIG.spring}
			className={cn(
				"relative z-10 flex h-full items-center justify-center select-none touch-none",
				isVisible && "cursor-col-resize",
				isDragging || isHovered ? "bg-foreground/5" : "bg-transparent",
			)}
			style={{
				// 当不可见时不占用 flex 空间
				flexShrink: isVisible ? 0 : 1,
			}}
		>
			<div
				className={cn(
					// 分隔条本体宽度 2px
					"pointer-events-none h-7 w-0.5 rounded-full transition-all duration-150",
					isDragging
						? "bg-primary shadow-[0_0_0_1px_oklch(var(--primary))]"
						: isHovered
							? "bg-muted-foreground/60 shadow-[0_0_0_1px_oklch(var(--border))]"
							: "bg-border",
				)}
			/>
		</motion.div>
	);
}
