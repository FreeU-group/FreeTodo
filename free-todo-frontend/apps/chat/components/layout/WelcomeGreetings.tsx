"use client";

import { type LucideIcon, SquareCheckBig } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

type WelcomeGreetingsProps = {
	icon?: LucideIcon;
	className?: string;
};

export function WelcomeGreetings({
	icon: Icon = SquareCheckBig,
	className,
}: WelcomeGreetingsProps) {
	const tChat = useTranslations("chat");

	const title = tChat("greetings.title");
	const subtitle = tChat("greetings.subtitle");

	return (
		<div
			className={cn(
				"flex flex-1 flex-col items-center justify-center px-4",
				className,
			)}
		>
			<div className="flex flex-col items-center gap-4">
				{/* 图标 + 主标题 */}
				<div className="flex items-center gap-4">
					<div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/70 dark:bg-primary/50">
						<Icon className="h-7 w-7 text-white" strokeWidth={2.5} />
					</div>
					<h1 className="text-3xl font-bold tracking-tight text-foreground">
						{title}
					</h1>
				</div>

				{/* 副标题 */}
				<p className="mt-1 max-w-md text-center text-base text-muted-foreground">
					{subtitle}
				</p>
			</div>
		</div>
	);
}
