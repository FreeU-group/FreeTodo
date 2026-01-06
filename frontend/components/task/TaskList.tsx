"use client";

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
			const taskWithChildren = taskMap.get(task.id);
			if (!taskWithChildren) {
				return;
			}

			if (task.parent_task_id) {
				const parent = taskMap.get(task.parent_task_id);
				if (parent) {
					// 如果有父任务且存在于映射中，添加到父任务的 children 中
					parent.children.push(taskWithChildren);
					return;
				}
			}

			// 如果没有父任务或父任务不存在，作为根任务
			rootTasks.push(taskWithChildren);
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
