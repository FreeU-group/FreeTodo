import type React from "react";
import { useTodoMutations } from "@/lib/query";
import { useBreakdownStore } from "@/lib/store/breakdown-store";
import { useUiStore } from "@/lib/store/ui-store";
import type { Todo } from "@/lib/types";

interface UseTodoCardHandlersParams {
	todo: Todo;
	setIsAddingChild: (value: boolean) => void;
	childName: string;
	setChildName: (value: string) => void;
	setIsEditingName: (value: boolean) => void;
	editingName: string;
	setEditingName: (value: string) => void;
}

export function useTodoCardHandlers({
	todo,
	setIsAddingChild,
	childName,
	setChildName,
	setIsEditingName,
	editingName,
	setEditingName,
}: UseTodoCardHandlersParams) {
	const { createTodo, updateTodo, toggleTodoStatus } = useTodoMutations();
	const { startBreakdown } = useBreakdownStore();
	const { setPanelFeature, getFeatureByPosition } = useUiStore();

	const handleCreateChild = async (e?: React.FormEvent) => {
		if (e) e.preventDefault();
		const name = childName.trim();
		if (!name) return;

		try {
			await createTodo({ name, parentTodoId: todo.id });
			setChildName("");
			setIsAddingChild(false);
		} catch (err) {
			console.error("Failed to create child todo:", err);
		}
	};

	const handleStartBreakdown = () => {
		// 确保聊天Panel打开并切换到聊天功能
		const chatPosition = getFeatureByPosition("panelA");
		if (chatPosition !== "chat") {
			// 找到聊天功能所在的位置，或分配到第一个可用位置
			const positions: Array<"panelA" | "panelB" | "panelC"> = [
				"panelA",
				"panelB",
				"panelC",
			];
			for (const pos of positions) {
				if (getFeatureByPosition(pos) === "chat") {
					// 如果聊天功能已经在某个位置，确保该位置打开
					if (pos === "panelA" && !useUiStore.getState().isPanelAOpen) {
						useUiStore.getState().togglePanelA();
					} else if (pos === "panelB" && !useUiStore.getState().isPanelBOpen) {
						useUiStore.getState().togglePanelB();
					} else if (pos === "panelC" && !useUiStore.getState().isPanelCOpen) {
						useUiStore.getState().togglePanelC();
					}
					break;
				}
			}
			// 如果聊天功能不在任何位置，分配到panelB
			if (!positions.some((pos) => getFeatureByPosition(pos) === "chat")) {
				setPanelFeature("panelB", "chat");
				if (!useUiStore.getState().isPanelBOpen) {
					useUiStore.getState().togglePanelB();
				}
			}
		} else {
			// 如果聊天功能在panelA，确保panelA打开
			if (!useUiStore.getState().isPanelAOpen) {
				useUiStore.getState().togglePanelA();
			}
		}

		// 开始Breakdown流程
		startBreakdown(todo.id);
	};

	const handleToggleStatus = async (e: React.MouseEvent) => {
		e.stopPropagation();
		try {
			if (todo.status === "canceled") {
				// 如果是 canceled 状态，点击复选框回到 active 状态
				await updateTodo(todo.id, { status: "active" });
			} else {
				// 其他状态使用通用的切换逻辑
				await toggleTodoStatus(todo.id);
			}
		} catch (err) {
			console.error("Failed to toggle todo status:", err);
		}
	};

	const handleAddChildFromMenu = () => {
		setIsAddingChild(true);
	};

	const handleStartEditName = (e: React.MouseEvent) => {
		e.stopPropagation();
		setEditingName(todo.name);
		setIsEditingName(true);
	};

	const handleSaveName = async () => {
		const trimmedName = editingName.trim();
		if (!trimmedName) {
			// 如果名称为空，恢复原值
			setEditingName(todo.name);
			setIsEditingName(false);
			return;
		}

		if (trimmedName === todo.name) {
			// 如果没有变化，直接退出编辑模式
			setIsEditingName(false);
			return;
		}

		try {
			await updateTodo(todo.id, { name: trimmedName });
			setIsEditingName(false);
		} catch (err) {
			console.error("Failed to update todo name:", err);
			// 保存失败时恢复原值
			setEditingName(todo.name);
			setIsEditingName(false);
		}
	};

	const handleCancelEditName = () => {
		setEditingName(todo.name);
		setIsEditingName(false);
	};

	return {
		handleCreateChild,
		handleStartBreakdown,
		handleToggleStatus,
		handleAddChildFromMenu,
		handleStartEditName,
		handleSaveName,
		handleCancelEditName,
	};
}
