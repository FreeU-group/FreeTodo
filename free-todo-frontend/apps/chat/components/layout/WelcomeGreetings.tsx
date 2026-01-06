"use client";

import { type LucideIcon, SquareCheckBig } from "lucide-react";
import { cn } from "@/lib/utils";

type WelcomeGreetingsProps = {
	icon?: LucideIcon;
	className?: string;
};

export function WelcomeGreetings({
	icon: Icon = SquareCheckBig,
	className,
}: WelcomeGreetingsProps) {
	return (
		<div
			className={cn(
				"flex flex-1 flex-col items-center justify-center px-4",
				className,
			)}
		>
			<div className="flex flex-col items-center gap-6">
				{/* 图标 */}
				<div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-orange-500/20">
					<Icon className="h-10 w-10 text-white" strokeWidth={2.5} />
				</div>

				{/* Slogan */}
				<h1 className="text-center text-3xl font-bold tracking-tight text-foreground">
					FreeTodo，放手去做
				</h1>

				{/* 副标题 */}
				<p className="max-w-md text-center text-base text-muted-foreground">
					智能待办助手，帮你拆解任务、规划优先级、提升效率
				</p>
			</div>
		</div>
	);
}
