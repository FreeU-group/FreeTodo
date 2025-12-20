import { AtSign, Loader2, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import type React from "react";
import { cn } from "@/lib/utils";

type InputBoxProps = {
	inputValue: string;
	placeholder: string;
	isStreaming: boolean;
	locale: string;
	onChange: (value: string) => void;
	onSend: () => void;
	onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
	onCompositionStart: () => void;
	onCompositionEnd: () => void;
	modeSwitcher?: React.ReactNode;
	onAtClick?: () => void;
	linkedTodos?: React.ReactNode;
};

export function InputBox({
	inputValue,
	placeholder,
	isStreaming,
	onChange,
	onSend,
	onKeyDown,
	onCompositionStart,
	onCompositionEnd,
	modeSwitcher,
	onAtClick,
	linkedTodos,
}: InputBoxProps) {
	const t = useTranslations("chat");
	const isSendDisabled = !inputValue.trim() || isStreaming;

	return (
		<div
			className={cn(
				"relative flex flex-col gap-2 rounded-xl border border-border",
				"bg-background/60 px-3 py-2 min-h-[80px]",
			)}
		>
			{/* 关联待办区域 */}
			{linkedTodos}

			<textarea
				value={inputValue}
				onChange={(e) => onChange(e.target.value)}
				onCompositionStart={onCompositionStart}
				onCompositionEnd={onCompositionEnd}
				onKeyDown={onKeyDown}
				placeholder={placeholder}
				rows={2}
				className={cn(
					"flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground",
					"focus-visible:outline-none pb-8",
				)}
			/>

			<div className="flex items-center justify-between">
				{/* 左下角：mode switcher */}
				<div className="flex items-center">{modeSwitcher}</div>

				{/* 右下角：@ 按钮和发送按钮 */}
				<div className="flex items-center gap-1">
					<button
						type="button"
						onClick={onAtClick}
						className={cn(
							"flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground",
							"hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						)}
						aria-label={t("mentionFileOrTodo")}
					>
						<AtSign className="h-4 w-4" />
					</button>

					<button
						type="button"
						onClick={onSend}
						disabled={isSendDisabled}
						className={cn(
							"flex h-8 w-8 items-center justify-center rounded-lg",
							"bg-primary text-primary-foreground transition-colors",
							"hover:bg-primary/90",
							"disabled:cursor-not-allowed disabled:opacity-50",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						)}
						aria-label={t("send")}
					>
						{isStreaming ? (
							<Loader2 className="h-4 w-4 animate-spin" />
						) : (
							<Send className="h-4 w-4" />
						)}
					</button>
				</div>
			</div>
		</div>
	);
}
