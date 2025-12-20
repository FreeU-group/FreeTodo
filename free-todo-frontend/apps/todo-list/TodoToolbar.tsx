"use client";

import { ListTodo, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { PanelHeader } from "@/components/common/PanelHeader";

interface TodoToolbarProps {
	searchQuery: string;
	onSearch: (value: string) => void;
}

export function TodoToolbar({ searchQuery, onSearch }: TodoToolbarProps) {
	const t = useTranslations("page");

	return (
		<PanelHeader
			icon={ListTodo}
			title={t("todoListTitle")}
			actions={
				<div className="relative">
					<Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<input
						type="text"
						value={searchQuery}
						onChange={(e) => onSearch(e.target.value)}
						placeholder="Search tasks..."
						className="h-7 w-48 rounded-md border border-primary/20 px-8 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
					/>
				</div>
			}
		/>
	);
}
