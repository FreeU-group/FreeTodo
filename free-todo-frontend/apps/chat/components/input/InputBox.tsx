import { AtSign, Send, Square } from "lucide-react";
import { useTranslations } from "next-intl";
import type React from "react";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type InputBoxProps = {
	inputValue: string;
	placeholder: string;
	isStreaming: boolean;
	locale: string;
	onChange: (value: string) => void;
	onSend: () => void;
	onStop?: () => void;
	onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
	onCompositionStart: () => void;
	onCompositionEnd: () => void;
	modeSwitcher?: React.ReactNode;
	onAtClick?: () => void;
	linkedTodos?: React.ReactNode;
	/** 最大高度，默认为 "40vh"（视口高度的40%） */
	maxHeight?: string;
};

/** textarea 的最小行高（像素） */
const MIN_TEXTAREA_HEIGHT = 85;

export function InputBox({
	inputValue,
	placeholder,
	isStreaming,
	onChange,
	onSend,
	onStop,
	onKeyDown,
	onCompositionStart,
	onCompositionEnd,
	modeSwitcher,
	onAtClick,
	linkedTodos,
	maxHeight = "40vh",
}: InputBoxProps) {
	const t = useTranslations("chat");
	const isSendDisabled = !inputValue.trim() || isStreaming;
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const prevInputValueRef = useRef<string>(inputValue);

	/** 自动调整 textarea 高度 */
	const adjustHeight = useCallback(() => {
		const textarea = textareaRef.current;
		if (!textarea) return;

		// 先重置高度以获取正确的 scrollHeight
		textarea.style.height = "auto";
		// 设置新高度，scrollHeight 会给出实际内容需要的高度
		const newHeight = Math.max(textarea.scrollHeight, MIN_TEXTAREA_HEIGHT);
		textarea.style.height = `${newHeight}px`;
	}, []);

	// 当 inputValue 从外部改变时（非用户输入）调整高度
	useLayoutEffect(() => {
		if (prevInputValueRef.current !== inputValue) {
			prevInputValueRef.current = inputValue;
			adjustHeight();
		}
	});

	// 组件挂载时调整高度
	useEffect(() => {
		adjustHeight();
	}, [adjustHeight]);

	// 处理输入变化
	const handleChange = useCallback(
		(e: React.ChangeEvent<HTMLTextAreaElement>) => {
			onChange(e.target.value);
			// 使用 requestAnimationFrame 确保 DOM 更新后再调整高度
			requestAnimationFrame(() => {
				adjustHeight();
			});
		},
		[onChange, adjustHeight],
	);

	return (
		<div
			className={cn(
				"relative flex flex-col rounded-xl border border-border",
				"bg-background/60 px-3 pt-2 pb-15",
			)}
		>
			{/* 关联待办区域 */}
			{linkedTodos}

			<textarea
				ref={textareaRef}
				value={inputValue}
				onChange={handleChange}
				onCompositionStart={onCompositionStart}
				onCompositionEnd={onCompositionEnd}
				onKeyDown={onKeyDown}
				placeholder={placeholder}
				rows={2}
				style={{ maxHeight, minHeight: `${MIN_TEXTAREA_HEIGHT}px` }}
				className={cn(
					"w-full resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground",
					"focus-visible:outline-none overflow-y-auto leading-relaxed",
				)}
			/>

			{/* 底部工具栏 - 绝对定位在底部 */}
			<div className="absolute bottom-2 left-3 right-3 flex items-center justify-between">
				{/* 左下角：mode switcher */}
				<div className="flex items-center">{modeSwitcher}</div>

				{/* 右下角：@ 按钮和发送/停止按钮 */}
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

					{isStreaming && onStop ? (
						<button
							type="button"
							onClick={onStop}
							className={cn(
								"flex h-8 w-8 items-center justify-center rounded-lg",
								"bg-primary text-primary-foreground transition-colors",
								"hover:bg-primary/90",
								"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
							)}
							aria-label={t("stop")}
						>
							<Square className="h-4 w-4 fill-current" />
						</button>
					) : (
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
							<Send className="h-4 w-4" />
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
