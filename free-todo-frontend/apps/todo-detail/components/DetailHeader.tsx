"use client";

import { CheckCircle2, FileText, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { PanelHeader } from "@/components/common/PanelHeader";

interface DetailHeaderProps {
	onToggleComplete: () => void;
	onDelete: () => void;
}

export function DetailHeader({
	onToggleComplete,
	onDelete,
}: DetailHeaderProps) {
	const t = useTranslations("page");
	const tTodoDetail = useTranslations("todoDetail");

	return (
		<PanelHeader
			icon={FileText}
			title={t("todoDetailLabel")}
			actions={
				<>
					<button
						type="button"
						onClick={onToggleComplete}
						className="flex items-center justify-center h-7 w-7 rounded-md hover:bg-muted/50 transition-colors"
						aria-label={tTodoDetail("markAsComplete")}
					>
						<CheckCircle2 className="h-4 w-4 text-muted-foreground hover:text-foreground" />
					</button>
					<button
						type="button"
						onClick={onDelete}
						className="flex items-center justify-center h-7 w-7 rounded-md hover:bg-destructive/10 transition-colors"
						aria-label={tTodoDetail("delete")}
					>
						<Trash2 className="h-4 w-4 text-destructive" />
					</button>
				</>
			}
		/>
	);
}
