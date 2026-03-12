import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Todo UI 状态管理
 * 仅管理选中状态和折叠状态等 UI 状态
 * 数据获取和变更操作已迁移到 TanStack Query (lib/query/todos.ts)
 */

interface TodoUIState {
	/** 当前选中的 todo ID（主选中） */
	selectedTodoId: number | null;
	/** 所有选中的 todo IDs（多选） */
	selectedTodoIds: number[];
	/** 已折叠的 todo IDs */
	collapsedTodoIds: Set<number>;
	/** 范围选择的锚点 todo ID（用于 Shift 键范围选择） */
	anchorTodoId: number | null;

	// UI 操作
	setSelectedTodoId: (id: number | null) => void;
	setSelectedTodoIds: (ids: number[]) => void;
	toggleTodoSelection: (id: number) => void;
	clearTodoSelection: () => void;
	toggleTodoExpanded: (id: number) => void;
	isTodoExpanded: (id: number) => boolean;
	setAnchorTodoId: (id: number | null) => void;

	/** 当 todo 被删除时清理相关的 UI 状态 */
	onTodoDeleted: (deletedIds: number[]) => void;
}

// 验证和修复存储的数据
function validateTodoSelectionState(state: {
	selectedTodoId: number | null;
	selectedTodoIds: number[];
	collapsedTodoIds: number[] | Set<number>;
}): {
	selectedTodoId: number | null;
	selectedTodoIds: number[];
	collapsedTodoIds: Set<number>;
} {
	// 验证 selectedTodoId
	let selectedTodoId: number | null = null;
	if (state.selectedTodoId && typeof state.selectedTodoId === "number") {
		selectedTodoId = state.selectedTodoId;
	}

	// 验证 selectedTodoIds
	let selectedTodoIds: number[] = [];
	if (Array.isArray(state.selectedTodoIds)) {
		selectedTodoIds = state.selectedTodoIds.filter(
			(id): id is number => typeof id === "number",
		);
	}

	// 验证 collapsedTodoIds
	let collapsedTodoIds: Set<number>;
	if (state.collapsedTodoIds instanceof Set) {
		collapsedTodoIds = state.collapsedTodoIds;
	} else if (Array.isArray(state.collapsedTodoIds)) {
		collapsedTodoIds = new Set(
			state.collapsedTodoIds.filter(
				(id): id is number => typeof id === "number",
			),
		);
	} else {
		collapsedTodoIds = new Set<number>();
	}

	// 确保 selectedTodoId 在 selectedTodoIds 中
	if (selectedTodoId && !selectedTodoIds.includes(selectedTodoId)) {
		selectedTodoIds = [selectedTodoId];
	}

	return {
		selectedTodoId,
		selectedTodoIds,
		collapsedTodoIds,
	};
}

export const useTodoStore = create<TodoUIState>()(
	persist(
		(set, get) => ({
			selectedTodoId: null,
			selectedTodoIds: [],
			collapsedTodoIds: new Set<number>(),
			anchorTodoId: null,

			setSelectedTodoId: (id) =>
				set({
					selectedTodoId: id,
					selectedTodoIds: id ? [id] : [],
					anchorTodoId: id, // 单独选择时更新锚点
				}),

			setSelectedTodoIds: (ids) =>
				set({
					selectedTodoIds: ids,
					selectedTodoId: ids[0] ?? null,
				}),

			toggleTodoSelection: (id) =>
				set((state) => {
					const exists = state.selectedTodoIds.includes(id);
					const nextIds = exists
						? state.selectedTodoIds.filter((item) => item !== id)
						: [...state.selectedTodoIds, id];
					return {
						selectedTodoIds: nextIds,
						selectedTodoId: nextIds[0] ?? null,
					};
				}),

			clearTodoSelection: () =>
				set({ selectedTodoId: null, selectedTodoIds: [], anchorTodoId: null }),

			setAnchorTodoId: (id) => set({ anchorTodoId: id }),

			toggleTodoExpanded: (id) =>
				set((state) => {
					const newCollapsed = new Set(state.collapsedTodoIds);
					if (newCollapsed.has(id)) {
						// 如果已折叠，则展开（从 Set 中移除）
						newCollapsed.delete(id);
					} else {
						// 如果已展开，则折叠（添加到 Set 中）
						newCollapsed.add(id);
					}
					return { collapsedTodoIds: newCollapsed };
				}),

			isTodoExpanded: (id) => {
				// 如果 id 不在 collapsedTodoIds 中，说明是展开的
				return !get().collapsedTodoIds.has(id);
			},

			onTodoDeleted: (deletedIds) => {
				const deletedSet = new Set(deletedIds);
				set((state) => ({
					selectedTodoId: deletedSet.has(state.selectedTodoId ?? -1)
						? null
						: state.selectedTodoId,
					selectedTodoIds: state.selectedTodoIds.filter(
						(x) => !deletedSet.has(x),
					),
					anchorTodoId: deletedSet.has(state.anchorTodoId ?? -1)
						? null
						: state.anchorTodoId,
				}));
			},
		}),
		{
			name: "todo-selection-config",
			storage: createJSONStorage(() => {
				return {
					getItem: (name: string): string | null => {
						if (typeof window === "undefined") return null;

						try {
							const stored = localStorage.getItem(name);
							if (!stored) return null;

							const parsed = JSON.parse(stored);
							const state = parsed.state || parsed;

							// 只持久化选中和折叠状态
							const validated = validateTodoSelectionState({
								selectedTodoId: state.selectedTodoId ?? null,
								selectedTodoIds: state.selectedTodoIds ?? [],
								collapsedTodoIds: state.collapsedTodoIds ?? [],
							});

							// 将 Set 转换为数组以便 JSON 序列化
							return JSON.stringify({
								state: {
									selectedTodoId: validated.selectedTodoId,
									selectedTodoIds: validated.selectedTodoIds,
									collapsedTodoIds: Array.from(validated.collapsedTodoIds),
								},
							});
						} catch (e) {
							console.error("Error loading todo selection config:", e);
							return null;
						}
					},
					setItem: (name: string, value: string): void => {
						if (typeof window === "undefined") return;

						try {
							const data = JSON.parse(value);
							const state = data.state || data;

							// 只保存选中和折叠状态
							const toSave = {
								state: {
									selectedTodoId: state.selectedTodoId ?? null,
									selectedTodoIds: state.selectedTodoIds ?? [],
									collapsedTodoIds: Array.isArray(state.collapsedTodoIds)
										? state.collapsedTodoIds
										: state.collapsedTodoIds instanceof Set
											? Array.from(state.collapsedTodoIds)
											: [],
								},
							};

							localStorage.setItem(name, JSON.stringify(toSave));
						} catch (e) {
							console.error("Error saving todo selection config:", e);
						}
					},
					removeItem: (name: string): void => {
						if (typeof window === "undefined") return;
						localStorage.removeItem(name);
					},
				};
			}),
			// 只持久化选中和折叠状态
			partialize: (state) => ({
				selectedTodoId: state.selectedTodoId,
				selectedTodoIds: state.selectedTodoIds,
				collapsedTodoIds: Array.from(state.collapsedTodoIds),
			}),
			// 恢复状态时，将数组转换回 Set
			merge: (persistedState, currentState) => {
				const persisted = persistedState as {
					selectedTodoId?: number | null;
					selectedTodoIds?: number[];
					collapsedTodoIds?: number[];
				};

				const validated = validateTodoSelectionState({
					selectedTodoId: persisted.selectedTodoId ?? null,
					selectedTodoIds: persisted.selectedTodoIds ?? [],
					collapsedTodoIds: persisted.collapsedTodoIds ?? [],
				});

				return {
					...currentState,
					selectedTodoId: validated.selectedTodoId,
					selectedTodoIds: validated.selectedTodoIds,
					collapsedTodoIds: validated.collapsedTodoIds,
				};
			},
		},
	),
);
