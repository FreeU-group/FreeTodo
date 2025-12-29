import { useEffect, useRef, useState } from "react";
import type { Todo } from "@/lib/types";

export function useTodoCardState(todo: Todo) {
	const [isAddingChild, setIsAddingChild] = useState(false);
	const [childName, setChildName] = useState("");
	const childInputRef = useRef<HTMLInputElement | null>(null);

	// 就地编辑 todo name 的状态
	const [isEditingName, setIsEditingName] = useState(false);
	const [editingName, setEditingName] = useState("");
	const nameInputRef = useRef<HTMLInputElement | null>(null);

	// 当开始添加子任务时，聚焦输入框
	useEffect(() => {
		if (isAddingChild) {
			childInputRef.current?.focus();
		}
	}, [isAddingChild]);

	// 当开始编辑名称时，聚焦并选中输入框
	useEffect(() => {
		if (isEditingName) {
			nameInputRef.current?.focus();
			nameInputRef.current?.select();
		}
	}, [isEditingName]);

	// 当 todo.name 变化时，如果不在编辑模式，同步 editingName
	useEffect(() => {
		if (!isEditingName) {
			setEditingName(todo.name);
		}
	}, [todo.name, isEditingName]);

	return {
		isAddingChild,
		setIsAddingChild,
		childName,
		setChildName,
		childInputRef,
		isEditingName,
		setIsEditingName,
		editingName,
		setEditingName,
		nameInputRef,
	};
}
