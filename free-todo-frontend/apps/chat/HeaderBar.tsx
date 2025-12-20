"use client";

import { History, MessageSquare, PlusCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { PanelHeader } from "@/components/common/PanelHeader";
import { cn } from "@/lib/utils";

type HeaderBarProps = {
	chatHistoryLabel: string;
	newChatLabel: string;
	onToggleHistory: () => void;
	onNewChat: () => void;
};

export function HeaderBar({
	chatHistoryLabel,
	newChatLabel,
	onToggleHistory,
	onNewChat,
}: HeaderBarProps) {
	const t = useTranslations("page");

	return (
		<PanelHeader
			icon={MessageSquare}
			title={t("chatLabel")}
			actions={
				<>
					<button
						type="button"
						onClick={onToggleHistory}
						className={cn(
							"flex h-9 w-9 items-center justify-center rounded-md",
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
							"flex h-9 w-9 items-center justify-center rounded-md",
							"bg-primary text-primary-foreground transition-colors",
							"hover:bg-primary/90",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						)}
						aria-label={newChatLabel}
					>
						<PlusCircle className="h-4 w-4" />
					</button>
				</>
			}
		/>
	);
}
