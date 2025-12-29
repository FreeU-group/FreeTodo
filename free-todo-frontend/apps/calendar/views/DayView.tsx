/**
 * 日视图组件
 */

import { useTranslations } from "next-intl";
import { TodoContextMenu } from "@/components/common/context-menu/TodoContextMenu";
import { useTodoStore } from "@/lib/store/todo-store";
import { cn } from "@/lib/utils";
import type { CalendarTodo } from "../types";
import { getDeadlineSeverity, getStatusStyle } from "../types";
import { formatTimeLabel, toDateKey } from "../utils";

export function DayView({
	currentDate,
	todos,
}: {
	currentDate: Date;
	todos: CalendarTodo[];
}) {
	const t = useTranslations("calendar");
	const { setSelectedTodoId } = useTodoStore();
	const key = toDateKey(currentDate);
	const todaysTodos = todos.filter((item) => item.dateKey === key);

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-col gap-3">
				{todaysTodos.length === 0 ? (
					<div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
						{t("noTodosDue")}
					</div>
				) : (
					todaysTodos.map((item) => (
						<TodoContextMenu key={item.todo.id} todoId={item.todo.id}>
							<div
								className={cn(
									"group relative flex flex-col gap-1 rounded-lg border bg-card p-3 text-xs shadow-sm transition-all",
									getStatusStyle(item.todo.status),
								)}
								onClick={() => setSelectedTodoId(item.todo.id)}
								onKeyDown={(e) => {
									if (e.key === "Enter" || e.key === " ") {
										e.preventDefault();
										setSelectedTodoId(item.todo.id);
									}
								}}
								role="button"
								tabIndex={0}
							>
								<div className="flex items-center justify-between gap-2">
									<p className="truncate text-base font-semibold">
										{item.todo.name}
									</p>
									<span
										className={cn(
											"shrink-0 text-sm font-medium",
											getDeadlineSeverity(item.deadline) === "overdue"
												? "text-red-600"
												: getDeadlineSeverity(item.deadline) === "soon"
													? "text-amber-600"
													: "text-muted-foreground",
										)}
									>
										{formatTimeLabel(item.deadline, t("allDay"))}
									</span>
								</div>
								{item.todo.tags && item.todo.tags.length > 0 && (
									<div className="flex flex-wrap gap-1">
										{item.todo.tags.map((tag) => (
											<span
												key={tag}
												className="rounded-full bg-white/50 px-2 py-0.5 text-xs text-muted-foreground"
											>
												{tag}
											</span>
										))}
									</div>
								)}
							</div>
						</TodoContextMenu>
					))
				)}
			</div>
		</div>
	);
}
