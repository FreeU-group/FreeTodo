import { MoreVertical } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { ExtractionState } from "@/apps/chat/hooks/useMessageExtraction";
import type { ChatMessage } from "@/apps/chat/types";
import { cn } from "@/lib/utils";
import { MessageContent } from "./MessageContent";
import { MessageTodoExtractionPanel } from "./MessageTodoExtractionPanel";
import {
	removeToolCalls,
	removeToolEvents,
} from "./utils/messageContentUtils";

type MessageItemProps = {
	message: ChatMessage;
	contentOverride?: string;
	extractionState?: ExtractionState;
	showMenu?: boolean;
	showExtractionPanel?: boolean;
	onRemoveExtractionState: () => void;
	onMenuButtonClick: (event: React.MouseEvent, messageId: string) => void;
	onMessageBoxRef: (messageId: string, ref: HTMLDivElement | null) => void;
};

export function MessageItem({
	message,
	contentOverride,
	extractionState,
	showMenu = false,
	showExtractionPanel = false,
	onRemoveExtractionState,
	onMenuButtonClick,
	onMessageBoxRef,
}: MessageItemProps) {
	const tContextMenu = useTranslations("contextMenu");
	const [hovered, setHovered] = useState(false);

	const rawContent = contentOverride ?? message.content;
	const sanitizedContent = rawContent
		? removeToolEvents(rawContent)
		: "";
	// 移除工具调用标记后的内容
	const contentWithoutToolCalls = sanitizedContent
		? removeToolCalls(sanitizedContent)
		: "";
	const trimmedContent = contentWithoutToolCalls.trim();

	// 跳过没有内容的 assistant 消息
	// 注意：这里使用 contentWithoutToolCalls 来判断，排除工具调用标记
	if (!trimmedContent && message.role === "assistant") {
		return null;
	}

	// 是否为 assistant 消息且有内容
	// 使用 contentWithoutToolCalls 来判断，排除工具调用标记
	const isAssistantMessageWithContent =
		message.role === "assistant" && trimmedContent;

	// 处理消息菜单按钮点击
	const handleMessageMenuClick = (event: React.MouseEvent) => {
		if (!showMenu) return;
		event.stopPropagation();
		onMenuButtonClick(event, message.id);
	};

	// 使用 ref callback 来传递 ref
	const handleMessageBoxRef = (el: HTMLDivElement | null) => {
		if (!showMenu) return;
		onMessageBoxRef(message.id, el);
	};

	return (
		<div
			className={cn(
				"flex flex-col",
				message.role === "assistant" ? "items-start" : "items-end",
			)}
		>
			<div className="max-w-[80%] flex flex-col">
				<div
					ref={handleMessageBoxRef}
					role="group"
					className={cn(
						"relative rounded-2xl px-4 py-3 text-sm shadow-sm",
						message.role === "assistant"
							? "bg-muted/30 text-foreground"
							: "bg-primary/10 dark:bg-primary/20 text-foreground",
					)}
					onMouseEnter={() => {
						if (showMenu && isAssistantMessageWithContent) {
							setHovered(true);
						}
					}}
					onMouseLeave={() => {
						setHovered(false);
					}}
				>
					{/* <div className="mb-1 text-[11px] uppercase tracking-wide opacity-70">
						{message.role === "assistant" ? t("assistant") : t("user")}
					</div> */}
					<div className="leading-relaxed relative">
						{/* Hover 时显示的菜单按钮 - 位于右下角 */}
						{showMenu && hovered && isAssistantMessageWithContent && (
							<button
								type="button"
								onClick={handleMessageMenuClick}
								className="absolute -bottom-1 -right-1 opacity-70 hover:opacity-100 transition-opacity rounded-full p-1.5 bg-background/80 hover:bg-background shadow-sm border border-border/50"
								aria-label={tContextMenu("extractButton")}
							>
								<MoreVertical className="h-3.5 w-3.5" />
							</button>
						)}
						<MessageContent
							message={message}
							contentOverride={contentOverride}
						/>
					</div>
				</div>
			</div>
			{/* 提取待办面板 - 显示在消息下方 */}
			{showExtractionPanel && extractionState && (
				<div
					className={cn(
						"w-full",
						message.role === "assistant" ? "max-w-[80%]" : "max-w-[80%]",
					)}
				>
					<MessageTodoExtractionPanel
						todos={extractionState.todos}
						parentTodoId={extractionState.parentTodoId}
						isExtracting={extractionState.isExtracting}
						onComplete={onRemoveExtractionState}
					/>
				</div>
			)}
		</div>
	);
}
