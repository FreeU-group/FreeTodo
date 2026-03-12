"use client";

import type { ToolCallStep } from "@/apps/chat/types";
import { cn } from "@/lib/utils";
import { ToolCallSteps } from "./ToolCallSteps";

type ToolCallBlockProps = {
	steps: ToolCallStep[];
	className?: string;
};

export function ToolCallBlock({ steps, className }: ToolCallBlockProps) {
	if (!steps || steps.length === 0) {
		return null;
	}

	return (
		<div className={cn("flex w-full justify-start", className)}>
			<div className="max-w-[80%]">
				<ToolCallSteps steps={steps} className="mb-0" />
			</div>
		</div>
	);
}
