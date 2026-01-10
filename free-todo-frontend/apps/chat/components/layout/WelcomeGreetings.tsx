"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

type WelcomeGreetingsProps = {
	className?: string;
};

export function WelcomeGreetings({
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
					<div className="flex h-13 w-13 items-center justify-center">
						<Image
							src="/free-todo-logos/free_todo_icon_with_grid.png"
							alt="Free Todo Logo"
							width={128}
							height={128}
							className="object-contain"
						/>
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
