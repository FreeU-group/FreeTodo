import { ListTodo, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ExtractionState } from "@/apps/chat/hooks/useMessageExtraction";
import type { ChatMessage } from "@/apps/chat/types";
import {
	BaseContextMenu,
	type MenuItem,
} from "@/components/common/context-menu/BaseContextMenu";

type MessageContextMenuProps = {
	menuOpenForMessageId: string | null;
	messages: ChatMessage[];
	extractionStates: Map<string, ExtractionState>;
	onExtractTodos: (messageId: string, messages: ChatMessage[]) => Promise<void>;
	onClose: () => void;
	open: boolean;
	position: { x: number; y: number };
};

export function MessageContextMenu({
	menuOpenForMessageId,
	messages,
	extractionStates,
	onExtractTodos,
	onClose,
	open,
	position,
}: MessageContextMenuProps) {
	const tContextMenu = useTranslations("contextMenu");

	if (!menuOpenForMessageId || !open) {
		return null;
	}

	const msg = messages.find((m) => m.id === menuOpenForMessageId);
	if (!msg || msg.role !== "assistant" || !msg.content) {
		return null;
	}

	const extractionState = extractionStates.get(msg.id);
	const isExtractingForThisMessage = extractionState?.isExtracting ?? false;

	const menuItems: MenuItem[] = [
		{
			icon: isExtractingForThisMessage ? Loader2 : ListTodo,
			label: isExtractingForThisMessage
				? tContextMenu("extracting") || "提取中..."
				: tContextMenu("extractButton"),
			onClick: () => {
				if (!menuOpenForMessageId) return;
				void onExtractTodos(menuOpenForMessageId, messages);
			},
			isFirst: true,
			isLast: true,
		},
	];

	return (
		<BaseContextMenu
			items={menuItems}
			open={open}
			position={position}
			onClose={onClose}
		/>
	);
}
