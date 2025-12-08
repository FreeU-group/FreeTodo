"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import { LanguageToggle } from "@/components/common/LanguageToggle";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { UserAvatar } from "@/components/common/UserAvatar";
import { BottomDock } from "@/components/layout/BottomDock";
import { PanelContainer } from "@/components/layout/PanelContainer";
import { useTranslations } from "@/lib/i18n";
import { useLocaleStore } from "@/lib/store/locale";
import { useUiStore } from "@/lib/store/ui-store";

export default function HomePage() {
	const {
		isCalendarOpen,
		isTodosOpen,
		isChatOpen,
		calendarWidth,
		chatWidth,
		setCalendarWidth,
		setChatWidth,
	} = useUiStore();
	const [isDraggingCalendar, setIsDraggingCalendar] = useState(false);
	const [isDraggingChat, setIsDraggingChat] = useState(false);
	const { locale } = useLocaleStore();
	const t = useTranslations(locale);

	const containerRef = useRef<HTMLDivElement | null>(null);

	const layoutState = useMemo(() => {
		// 计算基础宽度（不包括聊天面板）
		const baseWidth = isChatOpen ? 1 - chatWidth : 1;
		const actualChatWidth = isChatOpen ? chatWidth : 0;

		if (isCalendarOpen && isTodosOpen && isChatOpen) {
			// 三个面板都打开
			return {
				showCalendar: true,
				showTodos: true,
				showChat: true,
				calendarWidth: calendarWidth * baseWidth,
				todosWidth: (1 - calendarWidth) * baseWidth,
				chatWidth: actualChatWidth,
				showCalendarResizeHandle: true,
				showChatResizeHandle: true,
			};
		}

		if (isCalendarOpen && isTodosOpen) {
			// 只有日历和待办打开
			return {
				showCalendar: true,
				showTodos: true,
				showChat: false,
				calendarWidth: calendarWidth,
				todosWidth: 1 - calendarWidth,
				chatWidth: 0,
				showCalendarResizeHandle: true,
				showChatResizeHandle: false,
			};
		}

		if (isTodosOpen && isChatOpen) {
			// 只有待办和聊天打开
			return {
				showCalendar: false,
				showTodos: true,
				showChat: true,
				calendarWidth: 0,
				todosWidth: baseWidth,
				chatWidth: actualChatWidth,
				showCalendarResizeHandle: false,
				showChatResizeHandle: true,
			};
		}

		if (isCalendarOpen && !isTodosOpen) {
			return {
				showCalendar: true,
				showTodos: false,
				showChat: isChatOpen,
				calendarWidth: baseWidth,
				todosWidth: 0,
				chatWidth: actualChatWidth,
				showCalendarResizeHandle: false,
				showChatResizeHandle: false,
			};
		}

		if (!isCalendarOpen && isTodosOpen) {
			return {
				showCalendar: false,
				showTodos: true,
				showChat: isChatOpen,
				calendarWidth: 0,
				todosWidth: baseWidth,
				chatWidth: actualChatWidth,
				showCalendarResizeHandle: false,
				showChatResizeHandle: isChatOpen,
			};
		}

		return {
			showCalendar: true,
			showTodos: false,
			showChat: isChatOpen,
			calendarWidth: baseWidth,
			todosWidth: 0,
			chatWidth: actualChatWidth,
			showCalendarResizeHandle: false,
			showChatResizeHandle: false,
		};
	}, [isCalendarOpen, isTodosOpen, isChatOpen, calendarWidth, chatWidth]);

	const handleCalendarDragAtClientX = useCallback(
		(clientX: number) => {
			const container = containerRef.current;
			if (!container) return;

			const rect = container.getBoundingClientRect();
			if (rect.width <= 0) return;

			const relativeX = clientX - rect.left;
			const ratio = relativeX / rect.width;
			setCalendarWidth(ratio);
		},
		[setCalendarWidth],
	);

	const handleChatDragAtClientX = useCallback(
		(clientX: number) => {
			const container = containerRef.current;
			if (!container) return;

			const rect = container.getBoundingClientRect();
			if (rect.width <= 0) return;

			const relativeX = clientX - rect.left;
			const ratio = relativeX / rect.width;
			// chatWidth 是从右侧开始计算的，所以是 1 - ratio
			setChatWidth(1 - ratio);
		},
		[setChatWidth],
	);

	const handleCalendarResizePointerDown = (
		event: ReactPointerEvent<HTMLDivElement>,
	) => {
		event.preventDefault();
		event.stopPropagation();

		setIsDraggingCalendar(true);
		handleCalendarDragAtClientX(event.clientX);

		const handlePointerMove = (moveEvent: PointerEvent) => {
			handleCalendarDragAtClientX(moveEvent.clientX);
		};

		const handlePointerUp = () => {
			setIsDraggingCalendar(false);
			window.removeEventListener("pointermove", handlePointerMove);
			window.removeEventListener("pointerup", handlePointerUp);
		};

		window.addEventListener("pointermove", handlePointerMove);
		window.addEventListener("pointerup", handlePointerUp);
	};

	const handleChatResizePointerDown = (
		event: ReactPointerEvent<HTMLDivElement>,
	) => {
		event.preventDefault();
		event.stopPropagation();

		setIsDraggingChat(true);
		handleChatDragAtClientX(event.clientX);

		const handlePointerMove = (moveEvent: PointerEvent) => {
			handleChatDragAtClientX(moveEvent.clientX);
		};

		const handlePointerUp = () => {
			setIsDraggingChat(false);
			window.removeEventListener("pointermove", handlePointerMove);
			window.removeEventListener("pointerup", handlePointerUp);
		};

		window.addEventListener("pointermove", handlePointerMove);
		window.addEventListener("pointerup", handlePointerUp);
	};

	return (
		<main className="relative flex h-screen flex-col overflow-hidden bg-background">
			<div className="relative z-10 flex h-full flex-col">
				<header className="flex h-12 shrink-0 items-center justify-between gap-3 bg-background px-4">
					<div className="flex items-center gap-2">
						<h1 className="text-sm font-semibold tracking-tight text-foreground">
							{t.page.title}
						</h1>
					</div>

					<div className="flex items-center gap-1">
						<ThemeToggle />
						<LanguageToggle />
						<UserAvatar />
					</div>
				</header>

				<div
					ref={containerRef}
					className="relative flex min-h-0 flex-1 gap-1.5 overflow-hidden p-3"
				>
					<AnimatePresence mode="sync" initial={false}>
						{layoutState.showCalendar && (
							<PanelContainer
								variant="calendar"
								isVisible={layoutState.showCalendar}
								width={layoutState.calendarWidth}
							>
								<div className="flex h-full flex-col">
									<div className="flex h-10 shrink-0 items-center border-b border-border bg-muted/30 px-4">
										<h2 className="text-sm font-medium text-foreground">
											{t.page.calendarLabel}
										</h2>
									</div>
									<div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
										{t.page.calendarPlaceholder}
									</div>
								</div>
							</PanelContainer>
						)}
					</AnimatePresence>

					<AnimatePresence mode="sync" initial={false}>
						{layoutState.showCalendarResizeHandle && (
							<motion.div
								key="calendar-resize-handle"
								role="separator"
								aria-orientation="vertical"
								onPointerDown={handleCalendarResizePointerDown}
								initial={{ opacity: 0, scaleX: 0 }}
								animate={{ opacity: 1, scaleX: 1 }}
								exit={{ opacity: 0, scaleX: 0 }}
								transition={{ type: "spring", stiffness: 300, damping: 30 }}
								className={`flex items-stretch justify-center ${
									isDraggingCalendar
										? "w-2 cursor-col-resize px-1"
										: "w-1 cursor-col-resize px-0.5"
								}`}
							>
								<div
									className={`h-full rounded-full transition-all duration-200 ${
										isDraggingCalendar
											? "w-1 bg-primary shadow-[0_0_8px_hsl(var(--primary))]"
											: "w-px bg-border"
									}`}
								/>
							</motion.div>
						)}
					</AnimatePresence>

					<AnimatePresence mode="sync" initial={false}>
						{layoutState.showTodos && (
							<PanelContainer
								variant="todos"
								isVisible={layoutState.showTodos}
								width={layoutState.todosWidth}
							>
								<div className="flex h-full flex-col">
									<div className="flex h-10 shrink-0 items-center border-b border-border bg-muted/30 px-4">
										<h2 className="text-sm font-medium text-foreground">
											{t.page.todosLabel}
										</h2>
									</div>
									<div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
										{t.page.todosPlaceholder}
									</div>
								</div>
							</PanelContainer>
						)}
					</AnimatePresence>

					<AnimatePresence mode="sync" initial={false}>
						{layoutState.showChatResizeHandle && (
							<motion.div
								key="chat-resize-handle"
								role="separator"
								aria-orientation="vertical"
								onPointerDown={handleChatResizePointerDown}
								initial={{ opacity: 0, scaleX: 0 }}
								animate={{ opacity: 1, scaleX: 1 }}
								exit={{ opacity: 0, scaleX: 0 }}
								transition={{ type: "spring", stiffness: 300, damping: 30 }}
								className={`flex items-stretch justify-center ${
									isDraggingChat
										? "w-2 cursor-col-resize px-1"
										: "w-1 cursor-col-resize px-0.5"
								}`}
							>
								<div
									className={`h-full rounded-full transition-all duration-200 ${
										isDraggingChat
											? "w-1 bg-primary shadow-[0_0_8px_hsl(var(--primary))]"
											: "w-px bg-border"
									}`}
								/>
							</motion.div>
						)}
					</AnimatePresence>

					<AnimatePresence mode="sync" initial={false}>
						{layoutState.showChat && (
							<PanelContainer
								variant="chat"
								isVisible={layoutState.showChat}
								width={layoutState.chatWidth}
							>
								<div className="flex h-full flex-col">
									<div className="flex h-10 shrink-0 items-center border-b border-border bg-muted/30 px-4">
										<h2 className="text-sm font-medium text-foreground">
											{t.page.chatLabel}
										</h2>
									</div>
									<div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
										{t.page.chatPlaceholder}
									</div>
								</div>
							</PanelContainer>
						)}
					</AnimatePresence>
				</div>
			</div>

			<BottomDock />
		</main>
	);
}
