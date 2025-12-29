import { useTranslations } from "next-intl";
import type { Todo } from "@/lib/types";

type LinkedTodosProps = {
	effectiveTodos: Todo[];
	hasSelection: boolean;
	locale: string;
	showTodosExpanded: boolean;
	onToggleExpand: () => void;
	onClearSelection: () => void;
	onToggleTodo: (id: number) => void;
};

export function LinkedTodos({
	effectiveTodos,
	hasSelection,
	showTodosExpanded,
	onToggleExpand,
	onClearSelection,
	onToggleTodo,
}: LinkedTodosProps) {
	const t = useTranslations("chat");
	// 没有关联待办时，不显示任何内容
	if (effectiveTodos.length === 0) {
		return null;
	}

	const previewTodos = showTodosExpanded
		? effectiveTodos
		: effectiveTodos.slice(0, 3);
	const hiddenCount = Math.max(0, effectiveTodos.length - previewTodos.length);

	return (
		<div className="flex flex-wrap items-center gap-2 pb-2 mb-2 border-b border-border">
			<span className="text-xs font-semibold text-foreground">
				{t("linkedTodos", { count: effectiveTodos.length })}
			</span>
			{previewTodos.map((todo) => (
				<button
					key={todo.id}
					type="button"
					onClick={() => onToggleTodo(todo.id)}
					className="rounded-full border border-border bg-muted/40 px-2 py-1 text-xs text-foreground hover:bg-muted/60 hover:border-primary/50 transition-colors cursor-pointer"
				>
					{todo.name}
				</button>
			))}
			{hiddenCount > 0 && (
				<span className="text-xs text-muted-foreground">+{hiddenCount}</span>
			)}
			{effectiveTodos.length > 3 && (
				<button
					type="button"
					onClick={onToggleExpand}
					className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
				>
					{showTodosExpanded ? t("collapse") : t("expand")}
				</button>
			)}
			{hasSelection && (
				<button
					type="button"
					onClick={onClearSelection}
					className="text-[11px] text-[oklch(var(--primary))] transition-colors hover:text-[oklch(var(--primary-border))]"
				>
					{t("clearSelection")}
				</button>
			)}
		</div>
	);
}
