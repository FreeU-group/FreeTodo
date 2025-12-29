import { Calendar, Paperclip, Tag } from "lucide-react";
import type { Todo } from "@/lib/types";
import { formatDate } from "../utils/todoCardUtils";

interface TodoCardMetadataProps {
	todo: Todo;
}

export function TodoCardMetadata({ todo }: TodoCardMetadataProps) {
	const hasMetadata =
		todo.deadline ||
		(todo.attachments && todo.attachments.length > 0) ||
		(todo.tags && todo.tags.length > 0);

	if (!hasMetadata) {
		return null;
	}

	return (
		<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mt-1">
			{todo.deadline && (
				<div className="flex items-center gap-1 rounded-md bg-muted/40 px-2 py-1">
					<Calendar className="h-3 w-3" />
					<span>{formatDate(todo.deadline)}</span>
				</div>
			)}

			{todo.attachments && todo.attachments.length > 0 && (
				<div className="flex items-center gap-1 rounded-md bg-muted/40 px-2 py-1">
					<Paperclip className="h-3 w-3" />
					<span>{todo.attachments.length}</span>
				</div>
			)}

			{todo.tags && todo.tags.length > 0 && (
				<div className="flex flex-wrap items-center gap-1">
					<Tag className="h-3 w-3" />
					{todo.tags.slice(0, 3).map((tag) => (
						<span
							key={tag}
							className="px-2 py-0.5 rounded-full bg-muted text-[11px] font-medium text-foreground"
						>
							{tag}
						</span>
					))}
					{todo.tags.length > 3 && (
						<span className="text-[11px] text-muted-foreground">
							+{todo.tags.length - 3}
						</span>
					)}
				</div>
			)}
		</div>
	);
}
