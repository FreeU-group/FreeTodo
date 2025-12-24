"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { type ReactNode, useState } from "react";
import { cn } from "@/lib/utils";

interface SectionHeaderProps {
	title: ReactNode;
	show?: boolean;
	onToggle?: () => void;
	headerClassName?: string;
	titleClassName?: string;
	buttonClassName?: string;
	showToggleButton?: boolean;
	isHovered?: boolean;
}

export function SectionHeader({
	title,
	show,
	onToggle,
	headerClassName,
	titleClassName,
	buttonClassName,
	showToggleButton = true,
	isHovered: externalIsHovered,
}: SectionHeaderProps) {
	const [internalIsHovered, setInternalIsHovered] = useState(false);

	// 如果外部提供了 isHovered，使用外部的；否则使用内部状态
	const isHovered =
		externalIsHovered !== undefined ? externalIsHovered : internalIsHovered;

	return (
		<div
			role="group"
			className={cn("flex items-center justify-between", headerClassName)}
			onMouseEnter={
				externalIsHovered === undefined
					? () => setInternalIsHovered(true)
					: undefined
			}
			onMouseLeave={
				externalIsHovered === undefined
					? () => setInternalIsHovered(false)
					: undefined
			}
		>
			<div
				className={cn(
					"text-xs font-semibold uppercase tracking-wider text-muted-foreground",
					titleClassName,
				)}
			>
				{title}
			</div>
			{showToggleButton && onToggle && (
				<button
					type="button"
					onClick={onToggle}
					aria-pressed={show}
					aria-label={show ? "折叠" : "展开"}
					className={cn(
						"rounded-md px-2 py-1 transition-all hover:bg-muted/40 text-muted-foreground",
						isHovered ? "opacity-100" : "opacity-0 pointer-events-none",
						buttonClassName,
					)}
				>
					{show ? (
						<ChevronUp className="h-4 w-4" />
					) : (
						<ChevronDown className="h-4 w-4" />
					)}
				</button>
			)}
		</div>
	);
}
