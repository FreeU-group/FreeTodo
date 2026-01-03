"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { InputBox } from "@/apps/chat/components/input/InputBox";
import { LinkedTodos } from "@/apps/chat/components/input/LinkedTodos";
import { ModeSwitcher } from "@/apps/chat/components/input/ModeSwitcher";
import { WebSearchToggle } from "@/apps/chat/components/input/WebSearchToggle";
import type { ChatMode } from "@/apps/chat/types";
import type { Todo } from "@/lib/types";

type ChatInputSectionProps = {
	chatMode: ChatMode;
	locale: string;
	inputValue: string;
	isStreaming: boolean;
	error: string | null;
	effectiveTodos: Todo[];
	hasSelection: boolean;
	showTodosExpanded: boolean;
	modeMenuOpen: boolean;
	webSearchEnabled: boolean;
	onInputChange: (value: string) => void;
	onSend: () => void;
	onStop?: () => void;
	onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
	onCompositionStart: () => void;
	onCompositionEnd: () => void;
	onToggleExpand: () => void;
	onClearSelection: () => void;
	onToggleTodo: (todoId: number) => void;
	onToggleModeMenu: () => void;
	onChangeMode: (mode: ChatMode) => void;
	onToggleWebSearch: () => void;
};

export function ChatInputSection({
	chatMode,
	locale,
	inputValue,
	isStreaming,
	error,
	effectiveTodos,
	hasSelection,
	showTodosExpanded,
	modeMenuOpen,
	webSearchEnabled,
	onInputChange,
	onSend,
	onStop,
	onKeyDown,
	onCompositionStart,
	onCompositionEnd,
	onToggleExpand,
	onClearSelection,
	onToggleTodo,
	onToggleModeMenu,
	onChangeMode,
	onToggleWebSearch,
}: ChatInputSectionProps) {
	const tChat = useTranslations("chat");
	const tPage = useTranslations("page");
	const modeMenuRef = useRef<HTMLDivElement | null>(null);

	const inputPlaceholder =
		chatMode === "plan"
			? tChat("planModeInputPlaceholder")
			: chatMode === "edit"
				? tChat("editMode.inputPlaceholder")
				: chatMode === "difyTest"
					? tChat("difyTest.inputPlaceholder")
					: tPage("chatInputPlaceholder");

	useEffect(() => {
		if (!modeMenuOpen) return;
		const handleClickOutside = (event: MouseEvent) => {
			const target = event.target as Node;
			if (modeMenuRef.current?.contains(target)) return;
			onToggleModeMenu();
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [modeMenuOpen, onToggleModeMenu]);

	return (
		<div className="bg-background p-4">
			<InputBox
				linkedTodos={
					<LinkedTodos
						effectiveTodos={effectiveTodos}
						hasSelection={hasSelection}
						locale={locale}
						showTodosExpanded={showTodosExpanded}
						onToggleExpand={onToggleExpand}
						onClearSelection={onClearSelection}
						onToggleTodo={onToggleTodo}
					/>
				}
				modeSwitcher={
					<div className="flex items-center gap-2" ref={modeMenuRef}>
						<div className="relative">
							<ModeSwitcher
								chatMode={chatMode}
								locale={locale}
								modeMenuOpen={modeMenuOpen}
								onToggleMenu={onToggleModeMenu}
								onChangeMode={(mode) => {
									onChangeMode(mode);
									onToggleModeMenu();
								}}
								variant="inline"
							/>
						</div>
						<WebSearchToggle
							enabled={webSearchEnabled}
							onToggle={onToggleWebSearch}
						/>
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
