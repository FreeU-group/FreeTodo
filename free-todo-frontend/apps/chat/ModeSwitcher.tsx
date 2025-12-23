import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ChatMode } from "@/apps/chat/types";
import { cn } from "@/lib/utils";

type ModeSwitcherProps = {
	chatMode: ChatMode;
	locale: string;
	modeMenuOpen: boolean;
	onToggleMenu: () => void;
	onChangeMode: (mode: ChatMode) => void;
	variant?: "default" | "inline";
};

// Helper function to get mode label
const getModeLabel = (
	mode: ChatMode,
	t: ReturnType<typeof useTranslations>,
): string => {
	return t(`modes.${mode}.label`);
};

// Helper function to get mode description
const getModeDescription = (
	mode: ChatMode,
	t: ReturnType<typeof useTranslations>,
): string => {
	return t(`modes.${mode}.description`);
};

export function ModeSwitcher({
	chatMode,
	modeMenuOpen,
	onToggleMenu,
	onChangeMode,
	variant = "default",
}: ModeSwitcherProps) {
	const t = useTranslations("chat");
	return (
		<div className="relative">
			<label className="sr-only" htmlFor="chat-mode">
				{t("chatMode")}
			</label>
			<button
				type="button"
				id="chat-mode"
				onClick={onToggleMenu}
				className={cn(
					"flex items-center gap-2 rounded-(--radius) border border-border px-3 text-sm text-foreground",
					"hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
					variant === "inline" ? "h-10 bg-background/80" : "h-11 bg-muted/60",
				)}
				aria-label={t("toggleMode")}
			>
				<span>{getModeLabel(chatMode, t)}</span>
				<ChevronDown className="h-4 w-4 text-muted-foreground" />
			</button>
			{modeMenuOpen && (
				<div className="absolute z-20 mb-2 w-36 overflow-hidden rounded-lg border border-border bg-background shadow-lg bottom-full">
					{(["ask", "plan", "edit", "difyTest"] as const).map((mode) => (
						<button
							key={mode}
							type="button"
							onClick={() => onChangeMode(mode)}
							className={cn(
								"flex w-full items-center justify-between px-3 py-2 text-sm transition-colors",
								mode === chatMode
									? "bg-foreground/5 text-foreground"
									: "text-foreground hover:bg-foreground/5",
							)}
						>
							<span>{getModeLabel(mode, t)}</span>
							{mode === chatMode && (
								<span className="text-xs text-primary">
									{t("modes.active")}
								</span>
							)}
						</button>
					))}
				</div>
			)}
			{variant === "default" && (
				<p className="mt-1 text-[11px] text-muted-foreground">
					{getModeDescription(chatMode, t)}
				</p>
			)}
		</div>
	);
}
