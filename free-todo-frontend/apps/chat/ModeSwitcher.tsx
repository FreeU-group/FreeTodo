import { ChevronDown } from "lucide-react";
import type { ChatMode } from "@/apps/chat/types";
import { cn } from "@/lib/utils";

type ModeSwitcherProps = {
	chatMode: ChatMode;
	locale: string;
	modeMenuOpen: boolean;
	onToggleMenu: () => void;
	onChangeMode: (mode: ChatMode) => void;
	variant?: "default" | "inline";
};

export function ModeSwitcher({
	chatMode,
	locale,
	modeMenuOpen,
	onToggleMenu,
	onChangeMode,
	variant = "default",
}: ModeSwitcherProps) {
	return (
		<div className="relative">
			<label className="sr-only" htmlFor="chat-mode">
				{locale === "zh" ? "对话模式" : "Chat mode"}
			</label>
			<button
				type="button"
				id="chat-mode"
				onClick={onToggleMenu}
				className={cn(
					"flex items-center gap-2 rounded-(--radius) border border-border px-3 text-sm text-foreground",
					"hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
					variant === "inline" ? "h-10 bg-background/80" : "h-11 bg-muted/60",
				)}
				aria-label={
					locale === "zh" ? "切换 Ask/Plan 模式" : "Toggle Ask/Plan mode"
				}
			>
				<span>
					{chatMode === "plan"
						? locale === "zh"
							? "Plan 模式"
							: "Plan"
						: locale === "zh"
							? "Ask 模式"
							: "Ask"}
				</span>
				<ChevronDown className="h-4 w-4 text-muted-foreground" />
			</button>
			{modeMenuOpen && (
				<div className="absolute z-20 mb-2 w-32 overflow-hidden rounded-lg border border-border bg-background shadow-lg bottom-full">
					{(["ask", "plan"] as const).map((mode) => (
						<button
							key={mode}
							type="button"
							onClick={() => onChangeMode(mode)}
							className={cn(
								"flex w-full items-center justify-between px-3 py-2 text-sm transition-colors",
								mode === chatMode
									? "bg-foreground/5 text-foreground"
									: "text-foreground hover:bg-foreground/5",
							)}
						>
							<span>
								{mode === "ask"
									? locale === "zh"
										? "Ask 模式"
										: "Ask"
									: locale === "zh"
										? "Plan 模式"
										: "Plan"}
							</span>
							{mode === chatMode && (
								<span className="text-xs text-primary">
									{locale === "zh" ? "当前" : "Active"}
								</span>
							)}
						</button>
					))}
				</div>
			)}
			{variant === "default" && (
				<p className="mt-1 text-[11px] text-muted-foreground">
					{chatMode === "plan"
						? locale === "zh"
							? "拆解需求并生成待办"
							: "Break down and add todos"
						: locale === "zh"
							? "直接聊天或提问"
							: "Chat freely"}
				</p>
			)}
		</div>
	);
}
