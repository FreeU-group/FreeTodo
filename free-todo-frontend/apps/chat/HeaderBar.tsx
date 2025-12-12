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
				<Sparkles className="h-5 w-5 text-primary" />
				<h1 className="text-lg font-semibold text-foreground">{title}</h1>
			</div>
			<div className="flex items-center gap-2">
				<button
					type="button"
					onClick={onToggleHistory}
					className={cn(
						"flex h-9 w-9 items-center justify-center rounded-(--radius)",
						"border border-border text-muted-foreground transition-colors",
						"hover:bg-foreground/5 hover:text-foreground",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
					)}
					aria-label={chatHistoryLabel}
				>
					<History className="h-4 w-4" />
				</button>
				<button
					type="button"
					onClick={onNewChat}
					className={cn(
						"flex h-9 w-9 items-center justify-center rounded-(--radius)",
						"bg-primary text-primary-foreground transition-colors",
						"hover:bg-primary/90",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
					)}
					aria-label={newChatLabel}
				>
					<PlusCircle className="h-4 w-4" />
				</button>
			</div>
		</div>
	);
}
