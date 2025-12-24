"use client";

import { ListTodo, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { PanelHeader } from "@/components/common/PanelHeader";

interface TodoToolbarProps {
	searchQuery: string;
	onSearch: (value: string) => void;
}

export function TodoToolbar({ searchQuery, onSearch }: TodoToolbarProps) {
	const t = useTranslations("page");
	const tTodoList = useTranslations("todoList");
	const [isSearchOpen, setIsSearchOpen] = useState(false);
	const searchInputRef = useRef<HTMLInputElement>(null);
	const searchContainerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (isSearchOpen && searchInputRef.current) {
			searchInputRef.current.focus();
		}
	}, [isSearchOpen]);

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (
				searchContainerRef.current &&
				!searchContainerRef.current.contains(event.target as Node) &&
				!searchQuery
			) {
				setIsSearchOpen(false);
			}
		};

		if (isSearchOpen) {
			document.addEventListener("mousedown", handleClickOutside);
			return () => {
				document.removeEventListener("mousedown", handleClickOutside);
			};
		}
	}, [isSearchOpen, searchQuery]);

	return (
		<PanelHeader
			icon={ListTodo}
			title={t("todoListTitle")}
			actions={
				<div ref={searchContainerRef} className="relative">
					{isSearchOpen ? (
						<div className="relative">
							<Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
							<input
								ref={searchInputRef}
								type="text"
								value={searchQuery}
								onChange={(e) => onSearch(e.target.value)}
								placeholder={tTodoList("searchPlaceholder")}
								className="h-7 w-48 rounded-md border border-primary/20 px-8 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
							/>
						</div>
					) : (
						<button
							type="button"
							onClick={() => setIsSearchOpen(true)}
							className="flex items-center justify-center h-7 w-7 rounded-md hover:bg-muted/50 transition-colors"
							aria-label={tTodoList("searchPlaceholder")}
						>
							<Search className="h-4 w-4 text-muted-foreground hover:text-foreground" />
						</button>
					)}
				</div>
			}
		/>
	);
}
