"use client";

import { CheckCircle2, FileText, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import {
	PanelActionButton,
	PanelHeader,
} from "@/components/common/layout/PanelHeader";

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
