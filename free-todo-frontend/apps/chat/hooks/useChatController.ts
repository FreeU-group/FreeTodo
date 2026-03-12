import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { ClipboardEvent, DragEvent, KeyboardEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSendMessage } from "@/apps/chat/hooks/useSendMessage";
import { useSessionCache } from "@/apps/chat/hooks/useSessionCache";
import { useSessionManager } from "@/apps/chat/hooks/useSessionManager";
import { useStreamController } from "@/apps/chat/hooks/useStreamController";
import { useToolCallTracker } from "@/apps/chat/hooks/useToolCallTracker";
import type { ChatAttachment, ChatMessage } from "@/apps/chat/types";
import { useCrawlerStore } from "@/apps/crawler/store";
import { MAX_ATTACHMENT_SIZE_BYTES } from "@/lib/attachments";
import { uploadChatFiles } from "@/lib/chat-uploads";
import { useChatHistory, useChatSessions, useTodos } from "@/lib/query";
import { useBreakdownStore } from "@/lib/store/breakdown-store";
import { useChatStore } from "@/lib/store/chat-store";
import { useUiStore } from "@/lib/store/ui-store";
import { toastError, toastSuccess } from "@/lib/toast";
import type { Todo } from "@/lib/types";

type UseChatControllerParams = {
	locale: string;
	selectedTodoIds: number[];
};

const ALLOWED_TEXT_EXTENSIONS = new Set([
	"txt",
	"md",
	"markdown",
	"json",
	"csv",
	"tsv",
	"yaml",
	"yml",
	"log",
	"xml",
]);

const ALLOWED_TEXT_MIME_TYPES = new Set([
	"application/json",
	"application/xml",
	"application/x-yaml",
	"application/yaml",
	"application/markdown",
	"application/x-markdown",
	"text/csv",
	"text/markdown",
]);

export const useChatController = ({
	locale,
	selectedTodoIds,
}: UseChatControllerParams) => {
	const t = useTranslations("chat");
	const tCommon = useTranslations("common");
	const queryClient = useQueryClient();

	// ==================== 基础 Hooks ====================

	const sessionCache = useSessionCache();
	const streamController = useStreamController();
	const toolCallTracker = useToolCallTracker();

	// ==================== Store 数据 ====================

	const { data: todos = [] } = useTodos();

	// 获取爬虫 store 中选中的爬取结果
	const selectedCrawlerResult = useCrawlerStore((state) => state.selectedResult);

	// 使用 chat-store 管理持久化状态
	const {
		conversationId,
		historyOpen,
		historyPinned,
		setConversationId,
		setHistoryOpen,
		setHistoryPinned,
	} = useChatStore();

	const resetBreakdown = useBreakdownStore((state) => state.resetBreakdown);
	const selectedAgnoTools = useUiStore((state) => state.selectedAgnoTools);
	const selectedExternalTools = useUiStore(
		(state) => state.selectedExternalTools,
	);

	// 调试：打印选中的工具
	useEffect(() => {
		console.log(
			"[useChatController] Current selectedAgnoTools:",
			selectedAgnoTools,
		);
		console.log(
			"[useChatController] Current selectedExternalTools:",
			selectedExternalTools,
		);
	}, [selectedAgnoTools, selectedExternalTools]);

	// ==================== TanStack Query ====================

	const {
		data: sessions = [],
		isLoading: historyLoading,
		error: sessionsError,
	} = useChatSessions({
		enabled: historyOpen,
		refetchInterval: historyOpen ? 3000 : false,
	});

	const {
		data: sessionHistory = [],
		isFetching: historyFetching,
		isFetched: historyFetched,
	} = useChatHistory(conversationId);

	// ==================== 本地状态 ====================

	const [messages, setMessages] = useState<ChatMessage[]>(() => []);
	const [inputValue, setInputValue] = useState("");
	const [isStreaming, setIsStreaming] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [isComposing, setIsComposing] = useState(false);
	const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
	const [uploadWorkspacePath, setUploadWorkspacePath] = useState<string | null>(null);

	const historyError = sessionsError ? t("loadHistoryFailed") : null;

	// ==================== 计算属性 ====================

	const selectedTodos = useMemo(
		() => todos.filter((todo: Todo) => selectedTodoIds.includes(todo.id)),
		[selectedTodoIds, todos],
	) as Todo[];

	const effectiveTodos = useMemo(
		() => (selectedTodos.length ? selectedTodos : []),
		[selectedTodos],
	);

	const hasSelection = selectedTodoIds.length > 0;

	// ==================== 组合 Hooks ====================

	// 会话管理 hook
	const { handleNewChat, handleLoadSession } = useSessionManager({
		sessionCache,
		streamController,
		resetBreakdown,
		setConversationId,
		setHistoryOpen,
		setMessages,
		setInputValue,
		setIsStreaming,
		setError,
		sessionHistory,
		historyFetched,
		historyFetching,
		conversationId,
	});

	// 发送消息 hook
	const { sendMessage } = useSendMessage({
		locale,
		hasSelection,
		effectiveTodos,
		todos,
		selectedAgnoTools,
		selectedExternalTools,
		sessionCache,
		streamController,
		toolCallTracker,
		queryClient,
		t,
		tCommon,
		setConversationId,
		setMessages,
		setInputValue,
		setIsStreaming,
		setError,
	});

	// ==================== 事件处理 ====================

	const handleStop = useCallback(() => {
		streamController.cancelRequest();
		setIsStreaming(false);
	}, [streamController]);

	const handleRemoveAttachment = useCallback((id: string) => {
		setAttachments((prev) => {
			const next = prev.filter((item) => item.id !== id);
			if (next.length === 0) {
				setUploadWorkspacePath(null);
			}
			return next;
		});
	}, []);

	const handleUploadFiles = useCallback(
		async (files: File[]) => {
			if (files.length === 0) return;

			const accepted: File[] = [];
			for (const file of files) {
				if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
					toastError(t("uploadSizeLimit"));
					continue;
				}
				const ext = file.name.split(".").pop()?.toLowerCase() || "";
				const isImage = file.type.startsWith("image/");
				const isText =
					file.type.startsWith("text/") ||
					ALLOWED_TEXT_MIME_TYPES.has(file.type) ||
					ALLOWED_TEXT_EXTENSIONS.has(ext);
				if (!isImage && !isText) {
					toastError(t("uploadInvalidType"));
					continue;
				}
				accepted.push(file);
			}

			if (accepted.length === 0) return;

			try {
				const response = await uploadChatFiles(accepted);
				const nextAttachments: ChatAttachment[] = response.files.map((file) => ({
					id: file.id,
					name: file.fileName,
					path: file.filePath,
					url: `/api/preview/file?path=${encodeURIComponent(file.filePath)}`,
					size: file.size,
					mimeType: file.mimeType,
					kind: file.isImage ? "image" : "text",
				}));

				setAttachments((prev) => [...prev, ...nextAttachments]);
				setUploadWorkspacePath(response.workspacePath);
				toastSuccess(t("uploadSuccess"));
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				toastError(`${t("uploadFailed")}: ${message}`);
			}
		},
		[t],
	);

	const handleUploadClick = useCallback(() => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept =
			"image/*,.txt,.md,.markdown,.json,.csv,.tsv,.yaml,.yml,.log,.xml";
		input.multiple = true;
		input.onchange = () => {
			const selected = input.files ? Array.from(input.files) : [];
			void handleUploadFiles(selected);
		};
		input.click();
	}, [handleUploadFiles]);

	const handleSend = useCallback(async () => {
		await sendMessage(
			inputValue,
			true,
			attachments,
			uploadWorkspacePath || undefined,
		);
		setAttachments([]);
		setUploadWorkspacePath(null);
	}, [sendMessage, inputValue, attachments, uploadWorkspacePath]);

	const handleKeyDown = useCallback(
		(event: KeyboardEvent<HTMLTextAreaElement>) => {
			if (
				event.key === "Enter" &&
				!event.shiftKey &&
				!isComposing &&
				!event.nativeEvent.isComposing
			) {
				event.preventDefault();
				void handleSend();
			}
		},
		[handleSend, isComposing],
	);

	const handlePaste = useCallback(
		(event: ClipboardEvent<HTMLTextAreaElement>) => {
			const items = event.clipboardData?.items
				? Array.from(event.clipboardData.items)
				: [];
			const files: File[] = [];
			for (const item of items) {
				if (item.kind === "file") {
					const file = item.getAsFile();
					if (file) files.push(file);
				}
			}

			if (files.length > 0) {
				event.preventDefault();
				void handleUploadFiles(files);
			}
		},
		[handleUploadFiles],
	);

	const handleDrop = useCallback(
		(event: DragEvent<HTMLDivElement>) => {
			const files = event.dataTransfer?.files
				? Array.from(event.dataTransfer.files)
				: [];
			if (files.length === 0) return;
			event.preventDefault();
			event.stopPropagation();
			void handleUploadFiles(files);
		},
		[handleUploadFiles],
	);

	// ==================== 返回接口（保持向后兼容） ====================

	return {
		messages,
		setMessages,
		inputValue,
		setInputValue,
		attachments,
		uploadWorkspacePath,
		conversationId,
		setConversationId,
		isStreaming,
		setIsStreaming,
		error,
		setError,
		historyOpen,
		setHistoryOpen,
		historyPinned,
		setHistoryPinned,
		historyLoading,
		historyError,
		sessions,
		isComposing,
		setIsComposing,
		sendMessage,
		handleSend,
		handleStop,
		handleNewChat,
		handleLoadSession,
		handleKeyDown,
		handlePaste,
		handleUploadClick,
		handleRemoveAttachment,
		handleDrop,
		effectiveTodos,
		hasSelection,
		todos,
		// 暴露 streamController，供其他 hooks 使用（如 usePromptHandlers）
		streamController,
		// 爬取内容上下文
		selectedCrawlerResult,
	};
};
