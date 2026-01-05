"use client";

import { useState } from "react";
import type { Task } from "@/lib/types";
import TaskItem from "./TaskItem";

interface TaskListProps {
	tasks: Task[];
	onEdit: (task: Task) => void;
	onDelete: (taskId: number) => void;
	onStatusChange: (taskId: number, newStatus: string) => void;
	onCreateSubtask: (parentTaskId: number) => void;
	projectId?: number; // 添加项目ID参数
}

export default function TaskList({
	tasks,
	onEdit,
	onDelete,
	onStatusChange,
	onCreateSubtask,
	projectId,
}: TaskListProps) {
	// 构建任务树结构
	const buildTaskTree = (tasks: Task[]): Task[] => {
		const taskMap = new Map<number, Task & { children: Task[] }>();
		const rootTasks: (Task & { children: Task[] })[] = [];

		// 首先创建所有任务的映射
		tasks.forEach((task) => {
			taskMap.set(task.id, { ...task, children: [] });
		});

		// 构建树形结构
		tasks.forEach((task) => {
			const taskWithChildren = taskMap.get(task.id)!;
			if (task.parent_task_id && taskMap.has(task.parent_task_id)) {
				// 如果有父任务，添加到父任务的children中
				const parent = taskMap.get(task.parent_task_id)!;
				parent.children.push(taskWithChildren);
			} else {
				// 如果没有父任务或父任务不存在，作为根任务
				rootTasks.push(taskWithChildren);
			}
		});

		return rootTasks;
	};

	const taskTree = buildTaskTree(tasks);

	return (
		<div className="space-y-2">
			{taskTree.map((task) => (
				<TaskItem
					key={task.id}
					task={task}
					onEdit={onEdit}
					onDelete={onDelete}
					onStatusChange={onStatusChange}
					onCreateSubtask={onCreateSubtask}
					level={0}
					projectId={projectId}
				/>
			))}
		</div>
	);
}
