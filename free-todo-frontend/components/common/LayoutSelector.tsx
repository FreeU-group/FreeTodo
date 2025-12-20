"use client";

import { Check, ChevronDown, LayoutGrid } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { LAYOUT_PRESETS, useUiStore } from "@/lib/store/ui-store";
import { cn } from "@/lib/utils";

export function LayoutSelector() {
	const { applyLayout, panelFeatureMap } = useUiStore();
	const [mounted, setMounted] = useState(false);
	const [isOpen, setIsOpen] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);
	const t = useTranslations("layoutSelector");

	useEffect(() => {
		setMounted(true);
	}, []);

	// 点击外部关闭下拉框
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (
				dropdownRef.current &&
				!dropdownRef.current.contains(event.target as Node)
			) {
				setIsOpen(false);
			}
		};

		if (isOpen) {
			document.addEventListener("mousedown", handleClickOutside);
		}

		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, [isOpen]);

	if (!mounted) {
		return <div className="h-9 w-9" />;
	}

	// 检测当前选中的布局
	const getCurrentLayoutId = () => {
		for (const preset of LAYOUT_PRESETS) {
			const match =
				preset.panelFeatureMap.panelA === panelFeatureMap.panelA &&
				preset.panelFeatureMap.panelB === panelFeatureMap.panelB &&
				preset.panelFeatureMap.panelC === panelFeatureMap.panelC;
			if (match) return preset.id;
		}
		return null;
	};

	const currentLayoutId = getCurrentLayoutId();

	const getLayoutName = (layoutId: string) => {
		return t(`layouts.${layoutId}`);
	};

	return (
		<div ref={dropdownRef} className="relative">
			<button
				type="button"
				onClick={() => setIsOpen(!isOpen)}
				className="flex items-center gap-1 rounded-md p-2 text-muted-foreground transition-all duration-200 hover:bg-muted hover:text-foreground hover:shadow-md active:scale-95 active:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				title={t("selectLayout")}
				aria-label={t("selectLayout")}
				aria-expanded={isOpen}
				aria-haspopup="listbox"
			>
				<LayoutGrid className="h-5 w-5" />
				<ChevronDown
					className={cn(
						"h-3 w-3 transition-transform duration-200",
						isOpen && "rotate-180",
					)}
				/>
			</button>

			{isOpen && (
				<div
					className="absolute right-0 top-full z-50 mt-1 min-w-[160px] rounded-md border border-border bg-popover p-1 shadow-md animate-in fade-in-0 zoom-in-95"
					role="listbox"
					aria-label={t("selectLayout")}
				>
					{LAYOUT_PRESETS.map((layout) => (
						<button
							key={layout.id}
							type="button"
							role="option"
							aria-selected={currentLayoutId === layout.id}
							onClick={() => {
								applyLayout(layout.id);
								setIsOpen(false);
							}}
							className={cn(
								"flex w-full items-center justify-between gap-2 rounded-sm px-3 py-2 text-sm transition-colors",
								"hover:bg-accent hover:text-accent-foreground",
								"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
								currentLayoutId === layout.id && "bg-accent/50",
							)}
						>
							<span>{getLayoutName(layout.id)}</span>
							{currentLayoutId === layout.id && (
								<Check className="h-4 w-4 text-primary" />
							)}
						</button>
					))}
				</div>
			)}
		</div>
	);
}
