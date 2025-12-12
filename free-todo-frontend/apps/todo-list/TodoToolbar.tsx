"use client";

import { ListTodo, Search } from "lucide-react";
import { useTranslations } from "@/lib/i18n";
import { useLocaleStore } from "@/lib/store/locale";

interface TodoToolbarProps {
	searchQuery: string;
	onSearch: (value: string) => void;
}

export function TodoToolbar({ searchQuery, onSearch }: TodoToolbarProps) {
	const { locale } = useLocaleStore();
	const t = useTranslations(locale);

	return (
		<div className="shrink-0 bg-background">
			<div className="flex items-center justify-between px-4 py-3">
				<h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
					<ListTodo className="h-5 w-5" />
					{t.page.todoListTitle}
				</h2>

				<div className="flex items-center gap-2">
					<div className="relative">
						<Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
						<input
							type="text"
							value={searchQuery}
							onChange={(e) => onSearch(e.target.value)}
							placeholder="Search tasks..."
							className="w-48 rounded-md border border-border bg-background px-8 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
						/>
					</div>
				</div>
			</div>
		</div>
	);
}
