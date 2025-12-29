import type { useDroppable } from "@dnd-kit/core";
import { CornerDownRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface TodoCardDropZoneProps {
	droppable: ReturnType<typeof useDroppable>;
}

export function TodoCardDropZone({ droppable }: TodoCardDropZoneProps) {
	const tTodoDetail = useTranslations("todoDetail");

	return (
		<div
			ref={droppable.setNodeRef}
			className={cn(
				"absolute inset-0 z-10 flex items-center justify-center rounded-xl border-2 border-dashed transition-all duration-200",
				droppable.isOver
					? "border-primary bg-primary/10"
					: "border-muted-foreground/30 bg-muted/20",
			)}
		>
			<div
				className={cn(
					"flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
					droppable.isOver
						? "bg-primary text-primary-foreground"
						: "bg-muted text-muted-foreground",
				)}
			>
				<CornerDownRight className="h-4 w-4" />
				<span>{tTodoDetail("setAsChild")}</span>
			</div>
		</div>
	);
}
