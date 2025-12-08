"use client";

import { motion } from "framer-motion";
import type { PointerEvent as ReactPointerEvent } from "react";

interface ResizeHandleProps {
	onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
	isDragging: boolean;
}

export function ResizeHandle({ onPointerDown, isDragging }: ResizeHandleProps) {
	return (
		<motion.div
			role="separator"
			aria-orientation="vertical"
			onPointerDown={onPointerDown}
			initial={{ opacity: 0, scaleX: 0 }}
			animate={{ opacity: 1, scaleX: 1 }}
			exit={{ opacity: 0, scaleX: 0 }}
			transition={{ type: "spring", stiffness: 300, damping: 30 }}
			className={`flex items-stretch justify-center ${
				isDragging
					? "w-2 cursor-col-resize px-1"
					: "w-1 cursor-col-resize px-0.5"
			}`}
		>
			<div
				className={`h-full rounded-full transition-all duration-200 ${
					isDragging
						? "w-1 bg-primary shadow-[0_0_8px_hsl(var(--primary))]"
						: "w-px bg-border"
				}`}
			/>
		</motion.div>
	);
}
