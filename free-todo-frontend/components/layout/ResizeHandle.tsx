"use client";

import { motion } from "framer-motion";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface ResizeHandleProps {
	onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
	isDragging: boolean;
}

export function ResizeHandle({ onPointerDown, isDragging }: ResizeHandleProps) {
	const [isHovered, setIsHovered] = useState(false);

	return (
		<motion.div
			role="separator"
			aria-orientation="vertical"
			onPointerDown={onPointerDown}
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
			initial={{ opacity: 0, scaleX: 0 }}
			animate={{ opacity: 1, scaleX: 1 }}
			exit={{ opacity: 0, scaleX: 0 }}
			transition={{ type: "spring", stiffness: 300, damping: 30 }}
			className={cn(
				"relative flex h-full w-3 items-stretch justify-center cursor-col-resize select-none touch-none",
				isDragging || isHovered ? "bg-foreground/5" : "bg-transparent",
			)}
		>
			<div
				className={cn(
					"pointer-events-none h-full w-[3px] rounded-full transition-all duration-150",
					isDragging
						? "bg-primary shadow-[0_0_0_1px_hsl(var(--primary))]"
						: isHovered
							? "bg-muted-foreground/60 shadow-[0_0_0_1px_hsla(0,0%,0%,0.06)]"
							: "bg-border",
				)}
			/>
		</motion.div>
	);
}
