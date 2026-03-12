"use client";

import { useTranslations } from "next-intl";
import { useRef } from "react";
import { InputBox } from "@/apps/chat/components/input/InputBox";
import { LinkedCrawlerContent } from "@/apps/chat/components/input/LinkedCrawlerContent";
import { LinkedTodos } from "@/apps/chat/components/input/LinkedTodos";
import { ToolSelector } from "@/apps/chat/components/input/ToolSelector";
import type { CrawlResultItem } from "@/apps/crawler/types";
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
	const modeMenuRef = useRef<HTMLDivElement | null>(null);
	const inputPlaceholder = tPage("chatInputPlaceholder");

	return (
		<div className="bg-background p-4">
			<InputBox
				linkedTodos={
					<>
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
			/>

			{error && <p className="mt-2 text-sm">{error}</p>}
		</div>
	);
}
