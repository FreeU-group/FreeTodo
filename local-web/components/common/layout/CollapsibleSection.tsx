"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SectionHeader } from "./SectionHeader";

interface CollapsibleSectionProps {
	title: ReactNode;
	show: boolean;
	onToggle: () => void;
	children: ReactNode;
	className?: string;
	headerClassName?: string;
	titleClassName?: string;
	contentClassName?: string;
	showToggleButton?: boolean;
}

export function CollapsibleSection({
	title,
	show,
	onToggle,
	children,
	className,
	headerClassName,
	titleClassName,
	contentClassName,
	showToggleButton = true,
}: CollapsibleSectionProps) {
	return (
		<div className={cn("", className)}>
			<SectionHeader
				title={title}
				show={show}
				onToggle={onToggle}
				headerClassName={headerClassName}
				titleClassName={titleClassName}
				showToggleButton={showToggleButton}
			/>
			{show && <div className={cn("", contentClassName)}>{children}</div>}
		</div>
	);
}
