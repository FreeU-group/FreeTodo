import { History, PlusCircle, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type HeaderBarProps = {
	title: string;
	chatHistoryLabel: string;
	newChatLabel: string;
	onToggleHistory: () => void;
	onNewChat: () => void;
};

export function HeaderBar({
	title,
	chatHistoryLabel,
	newChatLabel,
	onToggleHistory,
	onNewChat,
}: HeaderBarProps) {
	return (
		<div className="flex items-center justify-between gap-2">
			<div className="flex items-center gap-2">
				<Sparkles className="h-5 w-5 text-blue-500" />
				<h1 className="text-lg font-semibold text-foreground">{title}</h1>
			</div>
			<div className="flex items-center gap-2">
				<button
					type="button"
					onClick={onToggleHistory}
					className={cn(
						"flex h-9 w-9 items-center justify-center rounded-[var(--radius)]",
						"border border-border text-muted-foreground transition-colors",
						"hover:bg-foreground/5 hover:text-foreground",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
					)}
					aria-label={chatHistoryLabel}
				>
					<History className="h-4 w-4" />
				</button>
				<button
					type="button"
					onClick={onNewChat}
					className={cn(
						"flex h-9 w-9 items-center justify-center rounded-[var(--radius)]",
						"bg-blue-500 text-white transition-colors",
						"hover:bg-blue-600",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
					)}
					aria-label={newChatLabel}
				>
					<PlusCircle className="h-4 w-4" />
				</button>
			</div>
		</div>
	);
}
