import type { Todo } from "@/lib/types/todo";

type LinkedTodosProps = {
	effectiveTodos: Todo[];
	hasSelection: boolean;
	locale: string;
	showTodosExpanded: boolean;
	onToggleExpand: () => void;
	onClearSelection: () => void;
};

export function LinkedTodos({
	effectiveTodos,
	hasSelection,
	locale,
	showTodosExpanded,
	onToggleExpand,
	onClearSelection,
}: LinkedTodosProps) {
	const previewTodos = showTodosExpanded
		? effectiveTodos
		: effectiveTodos.slice(0, 3);
	const hiddenCount = Math.max(0, effectiveTodos.length - previewTodos.length);

	return (
		<div className="mb-3 rounded-[var(--radius)] border border-border bg-muted/40 px-3 py-2">
			<div className="flex items-center justify-between gap-2">
				<span className="text-xs font-semibold text-foreground">
					{locale === "zh" ? "关联待办" : "Linked todos"}
				</span>
				<div className="flex items-center gap-2">
					{effectiveTodos.length > 3 && (
						<button
							type="button"
							onClick={onToggleExpand}
							className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
						>
							{showTodosExpanded
								? locale === "zh"
									? "收起"
									: "Collapse"
								: locale === "zh"
									? "展开"
									: "Expand"}
						</button>
					)}
					{hasSelection && (
						<button
							type="button"
							onClick={onClearSelection}
							className="text-[11px] text-[oklch(var(--primary))] transition-colors hover:text-[oklch(var(--primary-border))]"
						>
							{locale === "zh" ? "清空选择" : "Clear selection"}
						</button>
					)}
				</div>
			</div>
			<div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-foreground">
				{effectiveTodos.length === 0 ? (
					<span className="text-muted-foreground">
						{locale === "zh"
							? "暂无待办，上下文为空"
							: "No todos; context is empty"}
					</span>
				) : (
					<>
						<span className="text-muted-foreground">
							{hasSelection
								? locale === "zh"
									? `使用已选待办（${effectiveTodos.length}）`
									: `Using selected todos (${effectiveTodos.length})`
								: locale === "zh"
									? `将使用全部待办（共 ${effectiveTodos.length} 条）`
									: `Using all todos (${effectiveTodos.length})`}
						</span>
						{previewTodos.map((todo) => (
							<span
								key={todo.id}
								className="rounded-full border border-border bg-background px-2 py-1 text-foreground"
							>
								{todo.name}
							</span>
						))}
						{hiddenCount > 0 && (
							<span className="text-muted-foreground">+{hiddenCount}</span>
						)}
					</>
				)}
			</div>
		</div>
	);
}
