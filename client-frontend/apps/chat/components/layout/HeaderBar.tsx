"use client";

import { History, MessageSquare, PlusCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import {
	PanelActionButton,
	PanelHeader,
} from "@/components/common/layout/PanelHeader";

type HeaderBarProps = {
	chatHistoryLabel: string;
	newChatLabel: string;
	onToggleHistory: () => void;
	onNewChat: () => void;
	historyOpen: boolean;
};

export function HeaderBar({
	chatHistoryLabel,
	newChatLabel,
	onToggleHistory,
	onNewChat,
	historyOpen,
}: HeaderBarProps) {
	const t = useTranslations("page");

	const historyButtonOverrides = historyOpen
		? {
				background: "bg-muted/60",
				hoverBackground: "hover:bg-muted/70",
				textColor: "text-foreground",
			}
		: undefined;

	return (
		<PanelHeader
			icon={MessageSquare}
			title={t("chatLabel")}
			titleAddon={
				<span data-history-toggle="true">
					<PanelActionButton
						variant="default"
						icon={History}
						onClick={onToggleHistory}
						aria-label={chatHistoryLabel}
						buttonOverrides={historyButtonOverrides}
						iconOverrides={historyOpen ? { color: "text-foreground" } : undefined}
					/>
				</span>
			}
			actions={
				<PanelActionButton
					variant="default"
					icon={PlusCircle}
					onClick={onNewChat}
					aria-label={newChatLabel}
				/>
			}
		/>
	);
}
