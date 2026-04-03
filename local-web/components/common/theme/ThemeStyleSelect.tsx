"use client";

import { Check, Paintbrush } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { type ColorTheme, useColorThemeStore } from "@/lib/store/color-theme";
import { cn } from "@/lib/utils";

export function ThemeStyleSelect() {
	const { colorTheme, setColorTheme } = useColorThemeStore();
	const t = useTranslations("colorTheme");
	const [mounted, setMounted] = useState(false);
	const [open, setOpen] = useState(false);
	const wrapperRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		setMounted(true);
	}, []);

	useEffect(() => {
		if (!open) return;
		const handleClickOutside = (event: MouseEvent) => {
			if (!wrapperRef.current) return;
			if (wrapperRef.current.contains(event.target as Node)) return;
			setOpen(false);
		};
		const handleEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setOpen(false);
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		document.addEventListener("keydown", handleEscape);
		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
			document.removeEventListener("keydown", handleEscape);
		};
	}, [open]);

	if (!mounted) {
		return <div className="h-9 w-35" />;
	}

	const options: { value: ColorTheme; label: string }[] = [
		{ value: "catppuccin", label: t("catppuccin") },
		{ value: "blue", label: t("blue") },
		{ value: "neutral", label: t("neutral") },
	];

	return (
		<div className="relative" ref={wrapperRef}>
			<span className="sr-only">{t("label")}</span>
			<button
				type="button"
				onClick={() => setOpen((prev) => !prev)}
				className={cn(
					"flex items-center justify-center rounded-md p-2",
					"text-muted-foreground transition-all duration-200",
					"hover:bg-muted hover:text-foreground hover:shadow-md",
					"active:scale-95 active:shadow-sm",
					"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				)}
				aria-haspopup="listbox"
				aria-expanded={open}
				title={t("label")}
				aria-label={t("label")}
			>
				<Paintbrush className="h-5 w-5" />
			</button>
			{open && (
				<div
					className="absolute right-0 z-30 mt-1 w-40 overflow-hidden rounded-lg border border-border bg-background shadow-lg"
					role="listbox"
				>
					{options.map((option) => {
						const isActive = option.value === colorTheme;
						return (
							<button
								key={option.value}
								type="button"
								role="option"
								aria-selected={isActive}
								onClick={() => {
									setColorTheme(option.value);
									setOpen(false);
								}}
								className={cn(
									"flex w-full items-center justify-between px-3 py-2 text-sm transition-colors",
									isActive
										? "bg-foreground/5 text-foreground"
										: "text-foreground hover:bg-foreground/5",
								)}
							>
								<span>{option.label}</span>
								{isActive && <Check className="h-4 w-4 text-primary" />}
							</button>
						);
					})}
				</div>
			)}
		</div>
	);
}
