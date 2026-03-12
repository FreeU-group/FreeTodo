"use client";

import { Check, ChevronDown, Loader2, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { EditContentBlock } from "@/apps/chat/types";
import {
	getCleanBlockContent,
	parseEditBlocks,
} from "@/apps/chat/utils/parseEditBlocks";
import type { Todo, UpdateTodoInput } from "@/lib/types";
import { cn } from "@/lib/utils";

type EditModeMessageProps = {
	content: string;
	effectiveTodos: Todo[];
	locale: string;
	onUpdateTodo: (params: {
		id: number;
		input: UpdateTodoInput;
	}) => Promise<Todo>;
	isUpdating?: boolean;
};

type BlockAppendState = {
	[blockId: string]: {
		selectedTodoId: number | null;
		isDropdownOpen: boolean;
		status: "idle" | "appending" | "success" | "error";
	};
};

// Helper to get default state for a block
const getDefaultBlockState = (
	block: EditContentBlock,
	effectiveTodos: Todo[],
): BlockAppendState[string] => {
	// Pre-select the AI-recommended todo if it exists in effectiveTodos
	const recommendedExists = effectiveTodos.some(
		(t) => t.id === block.recommendedTodoId,
	);
	// If no AI recommendation, default to first linked todo
	const defaultTodoId = recommendedExists
		? block.recommendedTodoId
		: effectiveTodos.length > 0
			? effectiveTodos[0].id
			: null;

	return {
		selectedTodoId: defaultTodoId,
		isDropdownOpen: false,
		status: "idle",
	};
};

export function EditModeMessage({
	content,
	effectiveTodos,
	onUpdateTodo,
	isUpdating = false,
}: EditModeMessageProps) {
	const t = useTranslations("chat.editMode");
	const blocks = useMemo(() => parseEditBlocks(content), [content]);

	// Track state for each block
	const [blockStates, setBlockStates] = useState<BlockAppendState>({});

	// Sync blockStates when blocks change (e.g., during streaming)
	useEffect(() => {
		setBlockStates((prev) => {
			const next: BlockAppendState = {};
			for (const block of blocks) {
				// Keep existing state if it exists, otherwise create default
				if (prev[block.id]) {
					next[block.id] = prev[block.id];
				} else {
					next[block.id] = getDefaultBlockState(block, effectiveTodos);
				}
			}
			return next;
		});
	}, [blocks, effectiveTodos]);

	const handleToggleDropdown = useCallback((blockId: string) => {
		setBlockStates((prev) => {
			const currentState = prev[blockId];
			if (!currentState) return prev;
			return {
				...prev,
				[blockId]: {
					...currentState,
					isDropdownOpen: !currentState.isDropdownOpen,
				},
			};
		});
	}, []);

	const handleSelectTodo = useCallback((blockId: string, todoId: number) => {
		setBlockStates((prev) => {
			const currentState = prev[blockId];
			if (!currentState) return prev;
			return {
				...prev,
				[blockId]: {
					...currentState,
					selectedTodoId: todoId,
					isDropdownOpen: false,
				},
			};
		});
	}, []);

	const handleAppend = useCallback(
		async (block: EditContentBlock) => {
			const state = blockStates[block.id];
			if (!state?.selectedTodoId) return;

			const todo = effectiveTodos.find((t) => t.id === state.selectedTodoId);
			if (!todo) return;

			// Set appending state
			setBlockStates((prev) => {
				const currentState = prev[block.id];
				if (!currentState) return prev;
				return {
					...prev,
					[block.id]: { ...currentState, status: "appending" },
				};
			});

			try {
				const cleanContent = getCleanBlockContent(block);
				const existingNotes = todo.userNotes || "";
				const newNotes = existingNotes
					? `${existingNotes}\n\n${cleanContent}`
					: cleanContent;

				await onUpdateTodo({
					id: todo.id,
					input: { userNotes: newNotes },
				});

				// Set success state
				setBlockStates((prev) => {
					const currentState = prev[block.id];
					if (!currentState) return prev;
					return {
						...prev,
						[block.id]: { ...currentState, status: "success" },
					};
				});

				// Reset to idle after a delay
				setTimeout(() => {
					setBlockStates((prev) => {
						const currentState = prev[block.id];
						if (!currentState) return prev;
						return {
							...prev,
							[block.id]: { ...currentState, status: "idle" },
						};
					});
				}, 2000);
			} catch (error) {
				console.error("Failed to append to todo:", error);
				setBlockStates((prev) => {
					const currentState = prev[block.id];
					if (!currentState) return prev;
					return {
						...prev,
						[block.id]: { ...currentState, status: "error" },
					};
				});

				// Reset to idle after a delay
				setTimeout(() => {
					setBlockStates((prev) => {
						const currentState = prev[block.id];
						if (!currentState) return prev;
						return {
							...prev,
							[block.id]: { ...currentState, status: "idle" },
						};
					});
				}, 3000);
			}
		},
		[blockStates, effectiveTodos, onUpdateTodo],
	);

	// Close dropdowns when clicking outside
	const handleCloseDropdowns = useCallback(() => {
		setBlockStates((prev) => {
			const next = { ...prev };
			for (const blockId of Object.keys(next)) {
				next[blockId] = { ...next[blockId], isDropdownOpen: false };
			}
			return next;
		});
	}, []);

	if (blocks.length === 0) {
		return (
			<div className="rounded-2xl bg-muted px-4 py-3 text-sm text-foreground">
				<ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
			</div>
		);
	}

	const noTodosMessage = t("noLinkedTodos");

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: Click-away behavior for dropdown
		// biome-ignore lint/a11y/noStaticElementInteractions: Container for dropdown close
		<div className="space-y-4" onClick={handleCloseDropdowns}>
			{blocks.map((block) => {
				const state = blockStates[block.id] || {
					selectedTodoId: null,
					isDropdownOpen: false,
					status: "idle",
				};
				const selectedTodo = effectiveTodos.find(
					(t) => t.id === state.selectedTodoId,
				);

				return (
					<div
						key={block.id}
						className={cn(
							"rounded-2xl border bg-muted px-4 py-3 text-sm shadow-sm transition-all",
							state.status === "success" &&
								"border-green-500/50 bg-green-50/10",
							state.status === "error" && "border-destructive/50",
						)}
					>
						{/* Block content */}
						<div className="text-foreground">
							{block.title && (
								<h3 className="mb-2 font-semibold text-base">{block.title}</h3>
							)}
							<div className="prose prose-sm max-w-none dark:prose-invert">
								<ReactMarkdown remarkPlugins={[remarkGfm]}>
									{block.content}
								</ReactMarkdown>
							</div>
						</div>

						{/* Append controls */}
						<div className="mt-3 flex items-center justify-end gap-2 border-t border-border/50 pt-3">
							{effectiveTodos.length === 0 ? (
								<span className="text-xs text-muted-foreground">
									{noTodosMessage}
								</span>
							) : (
								<>
									{/* Todo selector dropdown */}
									{/* biome-ignore lint/a11y/useKeyWithClickEvents: Stop propagation for dropdown */}
									{/* biome-ignore lint/a11y/noStaticElementInteractions: Dropdown container */}
									<div
										className="relative"
										onClick={(e) => e.stopPropagation()}
									>
										<button
											type="button"
											onClick={() => handleToggleDropdown(block.id)}
											className={cn(
												"flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors",
												"hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
												selectedTodo
													? "border-border bg-background text-foreground"
													: "border-dashed border-muted-foreground/50 text-muted-foreground",
											)}
											disabled={state.status === "appending"}
										>
											<span className="max-w-[150px] truncate">
												{selectedTodo ? selectedTodo.name : t("selectTodo")}
											</span>
											<ChevronDown className="h-3 w-3 flex-shrink-0" />
										</button>

										{/* Dropdown menu */}
										{state.isDropdownOpen && (
											<div className="absolute bottom-full right-0 z-30 mb-1 w-56 max-h-48 overflow-y-auto rounded-lg border border-border bg-background shadow-lg">
												{effectiveTodos.map((todo) => (
													<button
														key={todo.id}
														type="button"
														onClick={() => handleSelectTodo(block.id, todo.id)}
														className={cn(
															"flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors",
															todo.id === state.selectedTodoId
																? "bg-primary/10 text-primary"
																: "text-foreground hover:bg-foreground/5",
														)}
													>
														{todo.id === state.selectedTodoId && (
															<Check className="h-3 w-3 flex-shrink-0" />
														)}
														<span
															className={cn(
																"truncate",
																todo.id !== state.selectedTodoId && "ml-5",
															)}
														>
															{todo.name}
														</span>
														{todo.id === block.recommendedTodoId && (
															<span className="ml-auto text-[10px] text-muted-foreground">
																{t("aiRecommended")}
															</span>
														)}
													</button>
												))}
											</div>
										)}
									</div>

									{/* Append button */}
									<button
										type="button"
										onClick={() => handleAppend(block)}
										disabled={
											!state.selectedTodoId ||
											state.status === "appending" ||
											state.status === "success" ||
											isUpdating
										}
										className={cn(
											"flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
											"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
											state.status === "success"
												? "bg-green-500 text-white"
												: state.status === "error"
													? "bg-destructive text-destructive-foreground"
													: state.selectedTodoId
														? "bg-primary text-primary-foreground hover:bg-primary/90"
														: "bg-muted-foreground/20 text-muted-foreground cursor-not-allowed",
										)}
									>
										{state.status === "appending" ? (
											<>
												<Loader2 className="h-3 w-3 animate-spin" />
												<span>{t("appending")}</span>
											</>
										) : state.status === "success" ? (
											<>
												<Check className="h-3 w-3" />
												<span>{t("appended")}</span>
											</>
										) : state.status === "error" ? (
											<span>{t("failed")}</span>
										) : (
											<>
												<Plus className="h-3 w-3" />
												<span>{t("append")}</span>
											</>
										)}
									</button>
								</>
							)}
						</div>
					</div>
				);
			})}
		</div>
	);
}
