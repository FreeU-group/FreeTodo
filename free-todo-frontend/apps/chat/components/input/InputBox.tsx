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
	/** Mode Switcher 菜单是否打开 */
	modeMenuOpen?: boolean;
	onAtClick?: () => void;
	linkedTodos?: React.ReactNode;
	/** 最大高度，默认为 "40vh"（视口高度的40%） */
	maxHeight?: string;
};

/** textarea 的最小行高（像素） */
const MIN_TEXTAREA_HEIGHT = 24;
/** 单行模式下 textarea 的行数 */
const SINGLE_LINE_ROWS = 1;
/** 多行模式下 textarea 的默认行数 */
const MULTI_LINE_ROWS = 1;

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
	modeMenuOpen = false,
	onAtClick,
	linkedTodos,
	maxHeight = "40vh",
}: InputBoxProps) {
	const t = useTranslations("chat");
	const isSendDisabled = !inputValue.trim() || isStreaming;
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const prevInputValueRef = useRef<string>(inputValue);

	// 判断是否使用单行紧凑布局：Mode Switcher 菜单没打开的时候使用它
	const isCompactLayout = !modeMenuOpen;
	// 判断是否需要显示 Mode Switcher（作为 modeSwitcher 存在）
	const hasModeSwitcher = !!modeSwitcher;
	// 展开模式：有 modeSwitcher 且菜单打开时
	const isExpandedLayout = hasModeSwitcher && modeMenuOpen;

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

	// 当布局模式改变时重新调整高度（使用 requestAnimationFrame 确保 DOM 更新后再调整）
	// biome-ignore lint/correctness/useExhaustiveDependencies: isCompactLayout 用于触发布局变化时的高度重新计算
	useEffect(() => {
		requestAnimationFrame(adjustHeight);
	}, [isCompactLayout, adjustHeight]);

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

	// 右侧按钮组（@ 按钮和发送/停止按钮）
	const actionButtons = (
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
	);

	// 紧凑布局：输入框和按钮在同一行
	if (isCompactLayout && !isExpandedLayout) {
		return (
			<div
				className={cn(
					"flex flex-col rounded-xl border border-border",
					"bg-background/60 px-3 py-2 mb-4",
				)}
			>
				{/* 关联待办区域 */}
				{linkedTodos}

				{/* 单行布局：输入框和按钮在同一行 */}
				<div className="flex items-center gap-2">
					{/* 左侧：mode switcher */}
					{modeSwitcher && (
						<div className="shrink-0">{modeSwitcher}</div>
					)}

					{/* 中间：输入框 */}
					<textarea
						ref={textareaRef}
						value={inputValue}
						onChange={handleChange}
						onCompositionStart={onCompositionStart}
						onCompositionEnd={onCompositionEnd}
						onKeyDown={onKeyDown}
						placeholder={placeholder}
						rows={SINGLE_LINE_ROWS}
						style={{ maxHeight, minHeight: `${MIN_TEXTAREA_HEIGHT}px` }}
						className={cn(
							"flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground",
							"focus-visible:outline-none overflow-y-auto leading-relaxed",
						)}
					/>

					{/* 右侧：按钮组 */}
					{actionButtons}
				</div>
			</div>
		);
	}

	// 展开布局：输入框在上方，工具栏在下方
	return (
		<div
			className={cn(
				"relative flex flex-col rounded-xl border border-border",
				"bg-background/60 px-3 pt-2 pb-14",
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
				rows={MULTI_LINE_ROWS}
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

				{/* 右下角：按钮组 */}
				{actionButtons}
			</div>
		</div>
	);
}
