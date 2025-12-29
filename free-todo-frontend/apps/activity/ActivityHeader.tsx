"use client";

import { Activity, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import {
	PanelActionButton,
	PanelHeader,
	usePanelIconStyle,
} from "@/components/common/layout/PanelHeader";
import { cn } from "@/lib/utils";

interface ActivityHeaderProps {
	searchValue: string;
	onSearchChange: (value: string) => void;
}

export function ActivityHeader({
	searchValue,
	onSearchChange,
}: ActivityHeaderProps) {
	const t = useTranslations("page");
	const [isSearchOpen, setIsSearchOpen] = useState(false);
	const searchInputRef = useRef<HTMLInputElement>(null);
	const searchContainerRef = useRef<HTMLDivElement>(null);
	const actionIconStyle = usePanelIconStyle("action");

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
				!searchValue
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
	}, [isSearchOpen, searchValue]);

	return (
		<PanelHeader
			icon={Activity}
			title={t("activityLabel")}
			actions={
				<div ref={searchContainerRef} className="relative">
					{isSearchOpen ? (
						<div className="relative">
							<Search
								className={cn(
									"absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground",
									actionIconStyle,
								)}
							/>
							<input
								ref={searchInputRef}
								value={searchValue}
								onChange={(e) => onSearchChange(e.target.value)}
								placeholder="Find activities..."
								className="h-7 w-48 rounded-md border border-primary/20 px-8 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
							/>
						</div>
					) : (
						<PanelActionButton
							variant="default"
							icon={Search}
							onClick={() => setIsSearchOpen(true)}
							iconOverrides={{ color: "text-muted-foreground" }}
							buttonOverrides={{ hoverTextColor: "hover:text-foreground" }}
							aria-label="Find activities..."
						/>
					)}
				</div>
			}
		/>
	);
}
