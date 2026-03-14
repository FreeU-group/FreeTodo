"use client";

import { Paperclip, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef } from "react";
import { InputBox } from "@/apps/chat/components/input/InputBox";
import { LinkedCrawlerContent } from "@/apps/chat/components/input/LinkedCrawlerContent";
import { LinkedTodos } from "@/apps/chat/components/input/LinkedTodos";
import { ToolSelector } from "@/apps/chat/components/input/ToolSelector";
import { getModeForBackend } from "@/apps/chat/utils/messageBuilder";
import type { CrawlResultItem } from "@/apps/crawler/types";
import { formatBytes } from "@/lib/preview/utils";
import type { Todo } from "@/lib/types";

type ChatInputSectionProps = {
	locale: string;
	inputValue: string;
	isStreaming: boolean;
	error: string | null;
	effectiveTodos: Todo[];
	hasSelection: boolean;
	showTodosExpanded: boolean;
	crawlerResult?: CrawlResultItem | null;
	pendingAttachments: File[];
	onAddAttachments: (files: File[]) => void;
	onRemoveAttachment: (index: number) => void;
	onInputChange: (value: string) => void;
	onSend: () => void;
	onStop?: () => void;
	onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
	onCompositionStart: () => void;
	onCompositionEnd: () => void;
	onToggleExpand: () => void;
	onClearSelection: () => void;
	onToggleTodo: (todoId: number) => void;
	onClearCrawlerSelection?: () => void;
};

export function ChatInputSection({
	locale,
	inputValue,
	isStreaming,
	error,
	effectiveTodos,
	hasSelection,
	showTodosExpanded,
	crawlerResult,
	pendingAttachments,
	onAddAttachments,
	onRemoveAttachment,
	onInputChange,
	onSend,
	onStop,
	onKeyDown,
	onCompositionStart,
	onCompositionEnd,
	onToggleExpand,
	onClearSelection,
	onToggleTodo,
	onClearCrawlerSelection,
}: ChatInputSectionProps) {
	const tPage = useTranslations("page");
	const tChat = useTranslations("chat");
	const modeMenuRef = useRef<HTMLDivElement | null>(null);
	const inputPlaceholder = tPage("chatInputPlaceholder");
	const isAgnoMode = getModeForBackend() === "agno";

	const attachmentList =
		isAgnoMode && pendingAttachments.length > 0 ? (
			<div className="mb-2">
				<div className="mb-1 text-xs text-muted-foreground">
					{tChat("attachments.pending", { count: pendingAttachments.length })}
				</div>
				<div className="flex flex-wrap gap-2">
					{pendingAttachments.map((file, index) => (
						<div
							key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
							className="flex items-center gap-2 rounded-lg border border-border bg-background/70 px-2 py-1 text-xs"
						>
							<Paperclip className="h-3 w-3 text-muted-foreground" />
							<span className="max-w-[180px] truncate">{file.name}</span>
							<span className="text-muted-foreground">
								{formatBytes(file.size)}
							</span>
							<button
								type="button"
								onClick={() => onRemoveAttachment(index)}
								className="rounded p-0.5 text-muted-foreground hover:bg-foreground/5"
								aria-label={tChat("attachments.remove")}
							>
								<X className="h-3 w-3" />
							</button>
						</div>
					))}
				</div>
			</div>
		) : null;

	return (
		<div className="bg-background p-4">
			<InputBox
				linkedTodos={
					<>
						{attachmentList}
						<LinkedCrawlerContent
							crawlerResult={crawlerResult ?? null}
							onClear={onClearCrawlerSelection ?? (() => {})}
						/>
						<LinkedTodos
							effectiveTodos={effectiveTodos}
							hasSelection={hasSelection}
							locale={locale}
							showTodosExpanded={showTodosExpanded}
							onToggleExpand={onToggleExpand}
							onClearSelection={onClearSelection}
							onToggleTodo={onToggleTodo}
						/>
					</>
				}
				modeSwitcher={
					<div className="flex items-center gap-2" ref={modeMenuRef}>
						<ToolSelector disabled={isStreaming} />
					</div>
				}
				inputValue={inputValue}
				placeholder={inputPlaceholder}
				isStreaming={isStreaming}
				locale={locale}
				onChange={onInputChange}
				onSend={onSend}
				onStop={onStop}
				onKeyDown={onKeyDown}
				onCompositionStart={onCompositionStart}
				onCompositionEnd={onCompositionEnd}
				enableAttachments={isAgnoMode}
				onAddAttachments={onAddAttachments}
			/>

			{error && <p className="mt-2 text-sm">{error}</p>}
		</div>
	);
}
