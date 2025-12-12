import { AtSign, Loader2, Send } from "lucide-react";
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
};

export function InputBox({
	inputValue,
	placeholder,
	isStreaming,
	locale,
	onChange,
	onSend,
	onKeyDown,
	onCompositionStart,
	onCompositionEnd,
	modeSwitcher,
	onAtClick,
}: InputBoxProps) {
	const isSendDisabled = !inputValue.trim() || isStreaming;

	return (
		<div
			className={cn(
				"flex items-center gap-2 rounded-(--radius) border border-border",
				"bg-muted/60 px-3 py-2",
			)}
		>
			{modeSwitcher && <div className="flex items-center">{modeSwitcher}</div>}

			<div
				className={cn(
					"flex min-h-[52px] flex-1 items-center gap-3 rounded-xl",
					"bg-background/60 px-3 py-2",
				)}
			>
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
						"focus-visible:outline-none",
					)}
				/>

				<div className="flex items-center gap-1">
					<button
						type="button"
						onClick={onAtClick}
						className={cn(
							"flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground",
							"hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						)}
						aria-label={
							locale === "zh" ? "提及文件或任务" : "Mention a file or todo"
						}
					>
						<AtSign className="h-5 w-5" />
					</button>

					<button
						type="button"
						onClick={onSend}
						disabled={isSendDisabled}
						className={cn(
							"flex h-10 w-10 items-center justify-center rounded-lg",
							"bg-primary text-primary-foreground transition-colors",
							"hover:bg-primary/90",
							"disabled:cursor-not-allowed disabled:opacity-50",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						)}
						aria-label={locale === "zh" ? "发送" : "Send"}
					>
						{isStreaming ? (
							<Loader2 className="h-5 w-5 animate-spin" />
						) : (
							<Send className="h-5 w-5" />
						)}
					</button>
				</div>
			</div>
		</div>
	);
}
