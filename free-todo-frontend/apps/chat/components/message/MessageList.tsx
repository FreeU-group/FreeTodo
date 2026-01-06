import { useMemo, useRef, useState } from "react";
import { WelcomeGreetings } from "@/apps/chat/components/layout/WelcomeGreetings";
import { useMessageExtraction } from "@/apps/chat/hooks/useMessageExtraction";
import { useMessageScroll } from "@/apps/chat/hooks/useMessageScroll";
import type { ChatMessage, ChatMode } from "@/apps/chat/types";
import { useContextMenu } from "@/components/common/context-menu/BaseContextMenu";
import { useTodos } from "@/lib/query";
import type { Todo, UpdateTodoInput } from "@/lib/types";
import { MessageContextMenu } from "./MessageContextMenu";
import { MessageItem } from "./MessageItem";

type MessageListProps = {
	messages: ChatMessage[];
	isStreaming: boolean;
	typingText: string;
	locale: string;
	// Edit mode props (optional)
	chatMode?: ChatMode;
	effectiveTodos?: Todo[];
	onUpdateTodo?: (params: {
		id: number;
		input: UpdateTodoInput;
	}) => Promise<Todo>;
	isUpdating?: boolean;
};

export function MessageList({
	messages,
	isStreaming,
	typingText,
	locale,
	chatMode,
	effectiveTodos = [],
	onUpdateTodo,
	isUpdating = false,
}: MessageListProps) {
	const { data: allTodos = [] } = useTodos();

	// 使用滚动管理 hook
	const { messageListRef, handleScroll } = useMessageScroll(
		messages,
		isStreaming,
	);

	// 使用提取管理 hook
	const { extractionStates, handleExtractTodos, removeExtractionState } =
		useMessageExtraction({
			effectiveTodos,
			allTodos,
		});

	// 跟踪每个消息的 hover 状态和菜单状态
	const [menuOpenForMessageId, setMenuOpenForMessageId] = useState<
		string | null
	>(null);
	const messageMenuRefs = useRef<Map<string, HTMLDivElement>>(new Map());
	const { contextMenu, openContextMenu, closeContextMenu } = useContextMenu();

	// 检查是否应该显示预设按钮：消息为空或只有一条初始assistant消息
	const shouldShowSuggestions = useMemo(() => {
		if (messages.length === 0) return true;
		if (messages.length === 1) {
			const msg = messages[0];
			// 如果是assistant消息，则显示预设按钮（不依赖内容严格匹配，避免语言切换时的问题）
			if (msg.role === "assistant") {
				return true;
			}
		}
		// 如果只有assistant消息且没有用户消息，也显示预设按钮
		if (
			messages.length > 0 &&
			messages.every((msg) => msg.role === "assistant")
		) {
			return true;
		}
		return false;
	}, [messages]);

	// 处理菜单按钮点击
	const handleMenuButtonClick = (
		event: React.MouseEvent,
		messageId: string,
	) => {
		event.stopPropagation();
		const messageBox = messageMenuRefs.current.get(messageId);
		if (!messageBox) return;

		const rect = messageBox.getBoundingClientRect();
		// 菜单位置：消息框右下角，稍微偏移
		const menuWidth = 180;
		const menuHeight = 60;
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;

		const x = Math.min(
			Math.max(rect.right - menuWidth, 8),
			viewportWidth - menuWidth,
		);
		const y = Math.min(
			Math.max(rect.bottom + 4, 8),
			viewportHeight - menuHeight,
		);

		setMenuOpenForMessageId(messageId);
		openContextMenu(event, {
			menuWidth,
			menuHeight,
			calculatePosition: () => ({ x, y }),
		});
	};

	// 如果应该显示首页，则显示欢迎界面而不是消息列表
	if (shouldShowSuggestions) {
		return (
			<div className="flex flex-1 overflow-y-auto" ref={messageListRef}>
				<WelcomeGreetings />
			</div>
		);
	}

	return (
		<div
			className="flex-1 space-y-4 overflow-y-auto px-4 py-4"
			ref={messageListRef}
			onScroll={handleScroll}
		>
			{messages.map((msg, index) => {
				const isLastMessage = index === messages.length - 1;
				const extractionState = extractionStates.get(msg.id);

				return (
					<MessageItem
						key={msg.id}
						message={msg}
						isLastMessage={isLastMessage}
						isStreaming={isStreaming}
						typingText={typingText}
						locale={locale}
						chatMode={chatMode}
						effectiveTodos={effectiveTodos}
						onUpdateTodo={onUpdateTodo}
						isUpdating={isUpdating}
						extractionState={extractionState}
						onRemoveExtractionState={() => removeExtractionState(msg.id)}
						onMenuButtonClick={handleMenuButtonClick}
						onMessageBoxRef={(messageId, ref) => {
							if (ref) {
								messageMenuRefs.current.set(messageId, ref);
							} else {
								messageMenuRefs.current.delete(messageId);
							}
						}}
					/>
				);
			})}
			{/* 消息菜单 */}
			<MessageContextMenu
				menuOpenForMessageId={menuOpenForMessageId}
				messages={messages}
				extractionStates={extractionStates}
				onExtractTodos={handleExtractTodos}
				onClose={() => {
					setMenuOpenForMessageId(null);
					closeContextMenu();
				}}
				open={contextMenu.open}
				position={{ x: contextMenu.x, y: contextMenu.y }}
			/>
		</div>
	);
}
