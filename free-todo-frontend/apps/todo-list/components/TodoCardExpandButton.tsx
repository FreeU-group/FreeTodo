import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface TodoCardExpandButtonProps {
	hasChildren: boolean;
	isExpanded: boolean;
	onToggle: () => void;
}

export function TodoCardExpandButton({
	hasChildren,
	isExpanded,
	onToggle,
}: TodoCardExpandButtonProps) {
	const tTodoDetail = useTranslations("todoDetail");

	if (!hasChildren) {
		return <div className="w-4 shrink-0" />;
	}

	return (
		<button
			type="button"
			onClick={(e) => {
				e.stopPropagation();
				onToggle();
			}}
			className="shrink-0 flex h-4 w-4 items-center justify-center rounded-md hover:bg-muted/50 transition-colors self-start mt-1"
			aria-label={
				isExpanded
					? tTodoDetail("collapseSubTasks")
					: tTodoDetail("expandSubTasks")
			}
		>
			<ChevronRight
				className={cn(
					"h-3 w-3 text-muted-foreground transition-transform duration-200",
					isExpanded && "rotate-90",
				)}
			/>
		</button>
	);
}
