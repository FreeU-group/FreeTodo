import type React from "react";
import type { Todo } from "@/lib/types";
import { cn } from "@/lib/utils";

interface TodoCardNameProps {
	todo: Todo;
	isEditing: boolean;
	editingName: string;
	nameInputRef: React.RefObject<HTMLInputElement | null>;
	onStartEdit: (e: React.MouseEvent) => void;
	onSave: () => void;
	onCancel: () => void;
	onChange: (value: string) => void;
}

export function TodoCardName({
	todo,
	isEditing,
	editingName,
	nameInputRef,
	onStartEdit,
	onSave,
	onCancel,
	onChange,
}: TodoCardNameProps) {
	if (isEditing) {
		return (
			<input
				ref={nameInputRef}
				type="text"
				value={editingName}
				onChange={(e) => onChange(e.target.value)}
				onBlur={onSave}
				onKeyDown={(e) => {
					e.stopPropagation();
					if (e.key === "Enter" && !e.nativeEvent.isComposing) {
						e.preventDefault();
						onSave();
					} else if (e.key === "Escape") {
						onCancel();
					}
				}}
				onMouseDown={(e) => e.stopPropagation()}
				className={cn(
					"w-full text-sm text-foreground leading-5 m-0 px-1 py-0.5 rounded-md",
					"bg-background border border-primary focus:outline-none focus:ring-2 focus:ring-primary",
					"wrap-break-word",
				)}
			/>
		);
	}

	return (
		<div
			className={cn(
				"text-sm text-foreground leading-5 m-0 wrap-break-word line-clamp-3",
				"rounded-md px-1 py-0.5",
				todo.status === "completed" && "line-through text-muted-foreground",
				todo.status === "canceled" && "line-through text-muted-foreground",
			)}
		>
			<span
				role="button"
				tabIndex={0}
				onClick={onStartEdit}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						onStartEdit(e as unknown as React.MouseEvent);
					}
				}}
				className="cursor-text hover:bg-muted/30 rounded transition-colors"
			>
				{todo.name}
			</span>
		</div>
	);
}
