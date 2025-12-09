"use client";

import { Send } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { useLocaleStore } from "@/lib/store/locale";
import { cn } from "@/lib/utils";

export function ChatPanel() {
	const { locale } = useLocaleStore();
	const t = useTranslations(locale);
	const [inputValue, setInputValue] = useState("");

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (inputValue.trim()) {
			// TODO: 处理消息发送
			console.log("发送消息:", inputValue);
			setInputValue("");
		}
	};

	const handleSuggestionClick = (suggestion: string) => {
		setInputValue(suggestion);
	};

	return (
		<div className="flex h-full flex-col bg-background">
			{/* 主内容区域 */}
			<div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
				{/* 标题 */}
				<h1 className="mb-3 text-center text-4xl font-bold text-foreground">
					{t.page.chatTitle}
				</h1>

				{/* 副标题 */}
				<p className="mb-12 text-center text-sm text-muted-foreground max-w-md">
					{t.page.chatSubtitle}
				</p>

				{/* 问题提示 */}
				<p className="mb-8 text-center text-lg text-foreground">
					{t.page.chatQuestion}
				</p>

				{/* 建议按钮 */}
				<div className="mb-12 flex flex-wrap items-center justify-center gap-3">
					{t.page.chatSuggestions.map((suggestion) => (
						<button
							key={suggestion}
							type="button"
							onClick={() => handleSuggestionClick(suggestion)}
							className={cn(
								"px-5 py-2.5",
								"rounded-[var(--radius-panel)]",
								"border border-foreground/20",
								"bg-transparent text-foreground",
								"transition-all",
								"hover:bg-foreground/5 hover:border-foreground/30",
								"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
							)}
						>
							{suggestion}
						</button>
					))}
				</div>
			</div>

			{/* 输入区域 */}
			<div className="shrink-0 border-t border-border bg-background p-4">
				<form onSubmit={handleSubmit} className="flex items-center gap-2">
					<input
						type="text"
						value={inputValue}
						onChange={(e) => setInputValue(e.target.value)}
						placeholder={t.page.chatInputPlaceholder}
						className={cn(
							"flex-1",
							"rounded-[var(--radius-panel)]",
							"border-0",
							"bg-muted px-4 py-3",
							"text-foreground",
							"placeholder:text-muted-foreground",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						)}
					/>
					<button
						type="submit"
						disabled={!inputValue.trim()}
						className={cn(
							"flex h-11 w-11 shrink-0 items-center justify-center",
							"rounded-[var(--radius-panel)]",
							"bg-blue-500 text-white",
							"transition-colors",
							"hover:bg-blue-600",
							"disabled:opacity-50 disabled:cursor-not-allowed",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						)}
						aria-label={t.page.chatSendButton}
					>
						<Send className="h-5 w-5" />
					</button>
				</form>
			</div>
		</div>
	);
}
