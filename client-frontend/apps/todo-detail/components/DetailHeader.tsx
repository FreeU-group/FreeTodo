"use client";

import { CheckCircle2, FileText, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import {
	PanelActionButton,
	PanelHeader,
} from "@/components/common/layout/PanelHeader";
import { cn } from "@/lib/utils";

interface DetailHeaderProps {
	onToggleComplete: () => void;
	onDelete: () => void;
	activeView: "detail" | "artifacts";
	onViewChange: (view: "detail" | "artifacts") => void;
}

export function DetailHeader({
	onToggleComplete,
	onDelete,
	activeView,
	onViewChange,
}: DetailHeaderProps) {
	const t = useTranslations("page");
	const tTodoDetail = useTranslations("todoDetail");

	return (
		<PanelHeader
			icon={FileText}
			title={t("todoDetailLabel")}
			actions={
				<>
					<div className="flex items-center rounded-full border border-border bg-muted/40 p-0.5 text-xs">
						<button
							type="button"
							onClick={() => onViewChange("detail")}
							className={cn(
								"rounded-full px-2.5 py-1 font-medium transition-colors",
								activeView === "detail"
									? "bg-foreground text-background"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							{tTodoDetail("detailViewLabel")}
						</button>
						<button
							type="button"
							onClick={() => onViewChange("artifacts")}
							className={cn(
								"rounded-full px-2.5 py-1 font-medium transition-colors",
								activeView === "artifacts"
									? "bg-foreground text-background"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							{tTodoDetail("artifactsViewLabel")}
						</button>
					</div>
					<PanelActionButton
						variant="default"
						icon={CheckCircle2}
						onClick={onToggleComplete}
						aria-label={tTodoDetail("markAsComplete")}
					/>
					<PanelActionButton
						variant="destructive"
						icon={Trash2}
						onClick={onDelete}
						aria-label={tTodoDetail("delete")}
					/>
				</>
			}
		/>
	);
}
