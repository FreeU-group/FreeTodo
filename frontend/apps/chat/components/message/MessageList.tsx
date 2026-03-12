import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useMemo, useRef, useState } from "react";
import { WelcomeGreetings } from "@/apps/chat/components/layout/WelcomeGreetings";
import { useMessageExtraction } from "@/apps/chat/hooks/useMessageExtraction";
import { useMessageScroll } from "@/apps/chat/hooks/useMessageScroll";
import type { ChatMessage, ToolCallAnchor, ToolCallStep } from "@/apps/chat/types";
import { useContextMenu } from "@/components/common/context-menu/BaseContextMenu";
import { useTodos } from "@/lib/query";
import type { Todo } from "@/lib/types";
import { MessageContextMenu } from "./MessageContextMenu";
import { MessageItem } from "./MessageItem";
import { ToolCallBlock } from "./ToolCallBlock";
import {
	removeToolEvents,
	splitContentByToolCalls,
} from "./utils/messageContentUtils";

type MessageListProps = {
	messages: ChatMessage[];
	isStreaming: boolean;
	effectiveTodos?: Todo[];
};

type RenderBlock =
	| {
			type: "message";
			key: string;
			message: ChatMessage;
			content: string;
			showMenu: boolean;
			showExtraction: boolean;
		}
	| {
			type: "tool";
			key: string;
			steps: ToolCallStep[];
		};

export function MessageList({
	messages,
	isStreaming,
	effectiveTodos = [],
}: MessageListProps) {
	const tChat = useTranslations("chat");
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

	const parseToolArgs = useCallback(
		(params?: string): Record<string, string> | undefined => {
			if (!params) return undefined;

			const result: Record<string, string> = {};
			const entries = params
				.split(",")
				.map((entry) => entry.trim())
				.filter(Boolean);

			for (const entry of entries) {
				const separatorIndex = entry.indexOf(":");
				if (separatorIndex === -1) continue;
				const key = entry.slice(0, separatorIndex).trim();
				const value = entry.slice(separatorIndex + 1).trim();
				if (key) {
					result[key] = value;
				}
			}

			return Object.keys(result).length > 0 ? result : undefined;
		},
		[],
	);

	const buildLegacyToolStep = useCallback(
		(
			messageId: string,
			index: number,
			name: string,
			params: string | undefined,
			status: ToolCallStep["status"],
		): ToolCallStep => ({
			id: `${messageId}-legacy-${index}`,
			toolName: name || "tool",
			toolArgs: parseToolArgs(params),
			status,
			startTime: 0,
			endTime: status === "completed" ? 0 : undefined,
		}),
		[parseToolArgs],
	);

	const buildAnchorFallbackStep = useCallback(
		(
			anchor: ToolCallAnchor,
			status: ToolCallStep["status"],
		): ToolCallStep => ({
			id: anchor.stepId,
			toolName: anchor.toolName,
			toolArgs: anchor.toolArgs,
			status,
			startTime: 0,
			endTime: status === "completed" ? 0 : undefined,
		}),
		[],
	);

	const buildAssistantBlocks = useCallback(
		(message: ChatMessage, isLastMessage: boolean): RenderBlock[] => {
			const blocks: RenderBlock[] = [];
			const rawContent = message.content || "";
			const anchors = (message.toolCallAnchors || [])
				.filter((anchor) => Number.isFinite(anchor.offset))
				.slice()
				.sort((a, b) => a.offset - b.offset);

			const pushMessageBlock = (content: string, allowEmpty: boolean) => {
				if (!content && !allowEmpty) return;
				if (!content.trim() && !allowEmpty) return;
				blocks.push({
					type: "message",
					key: `${message.id}-segment-${blocks.length}`,
					message,
					content,
					showMenu: false,
					showExtraction: false,
				});
			};

			if (anchors.length > 0) {
				let cursor = 0;
				for (const anchor of anchors) {
					const safeOffset = Math.min(anchor.offset, rawContent.length);
					const segment = rawContent.slice(cursor, safeOffset);
					pushMessageBlock(segment, false);

					const step =
						message.toolCallSteps?.find((item) => item.id === anchor.stepId) ||
						buildAnchorFallbackStep(
							anchor,
							isStreaming && isLastMessage ? "running" : "completed",
						);
					blocks.push({
						type: "tool",
						key: `${message.id}-tool-${anchor.stepId}`,
						steps: [step],
					});
					cursor = safeOffset;
				}

				const tail = rawContent.slice(cursor);
				const allowEmptyTail = isStreaming && isLastMessage;
				pushMessageBlock(tail, allowEmptyTail);

				const remainingSteps =
					message.toolCallSteps?.filter(
						(step) => !anchors.some((anchor) => anchor.stepId === step.id),
					) || [];
				for (const step of remainingSteps) {
					blocks.push({
						type: "tool",
						key: `${message.id}-tool-${step.id}`,
						steps: [step],
					});
				}

				return blocks;
			}

			const sanitizedContent = rawContent
				? removeToolEvents(rawContent)
				: "";
			const segments = splitContentByToolCalls(sanitizedContent);
			const toolSegments = segments.filter((segment) => segment.type === "tool");
			let toolIndex = 0;
			const lastToolIndex = toolSegments.length - 1;

			if (segments.length > 0 && toolSegments.length > 0) {
				for (const segment of segments) {
					if (segment.type === "text") {
						pushMessageBlock(segment.content, false);
						continue;
					}

					const status =
						isStreaming && isLastMessage && toolIndex === lastToolIndex
							? "running"
							: "completed";
					blocks.push({
						type: "tool",
						key: `${message.id}-tool-${toolIndex}`,
						steps: [
							buildLegacyToolStep(
								message.id,
								toolIndex,
								segment.name,
								segment.params,
								status,
							),
						],
					});
					toolIndex += 1;
				}

				const endsWithTool =
					segments.length > 0 &&
					segments[segments.length - 1].type === "tool";
				if (endsWithTool && isStreaming && isLastMessage) {
					pushMessageBlock("", true);
				}

				return blocks;
			}

			pushMessageBlock(sanitizedContent, isStreaming && isLastMessage);

			const steps = message.toolCallSteps || [];
			for (const step of steps) {
				blocks.push({
					type: "tool",
					key: `${message.id}-tool-${step.id}`,
					steps: [step],
				});
			}

			return blocks;
		},
		[buildAnchorFallbackStep, buildLegacyToolStep, isStreaming],
	);

	const renderState = useMemo(() => {
		const blocks: RenderBlock[] = [];

		messages.forEach((message, index) => {
			const isLastMessage = index === messages.length - 1;
			if (message.role === "user") {
				blocks.push({
					type: "message",
					key: `${message.id}-segment-0`,
					message,
					content: message.content,
					showMenu: false,
					showExtraction: false,
				});
				return;
			}

			blocks.push(...buildAssistantBlocks(message, isLastMessage));
		});

		const lastContentBlockKeyById = new Map<string, string>();
		blocks.forEach((block) => {
			if (block.type === "message" && block.content.trim().length > 0) {
				lastContentBlockKeyById.set(block.message.id, block.key);
			}
		});

		return { blocks, lastContentBlockKeyById };
	}, [messages, buildAssistantBlocks]);

	const respondingText = useMemo(() => tChat("aiResponding"), [tChat]);

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
			{renderState.blocks.map((block) => {
				if (block.type === "tool") {
					return <ToolCallBlock key={block.key} steps={block.steps} />;
				}

				const { message, content } = block;
				const extractionState = extractionStates.get(message.id);
				const isAssistantMessage = message.role === "assistant";
				const shouldShowMenu = isAssistantMessage && content.trim().length > 0;
				const shouldShowExtraction = shouldShowMenu;
				const isLastContentBlockForMessage =
					renderState.lastContentBlockKeyById.get(message.id) === block.key;

				return (
					<MessageItem
						key={block.key}
						message={message}
						contentOverride={content}
						extractionState={extractionState}
						showMenu={shouldShowMenu && isLastContentBlockForMessage}
						showExtractionPanel={
							shouldShowExtraction && isLastContentBlockForMessage
						}
						onRemoveExtractionState={() => removeExtractionState(message.id)}
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
			{isStreaming && (
				<div
					className="flex items-center gap-2 text-xs text-muted-foreground"
					role="status"
					aria-live="polite"
				>
					<Loader2 className="h-3.5 w-3.5 animate-spin" />
					<span>{respondingText}</span>
				</div>
			)}
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
