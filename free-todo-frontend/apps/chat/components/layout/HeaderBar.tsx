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
					<PanelActionButton
						variant="default"
						icon={History}
						onClick={onToggleHistory}
						aria-label={chatHistoryLabel}
					/>
					<PanelActionButton
						variant="default"
						icon={PlusCircle}
						onClick={onNewChat}
						aria-label={newChatLabel}
					/>
				</>
			}
		/>
	);
}
