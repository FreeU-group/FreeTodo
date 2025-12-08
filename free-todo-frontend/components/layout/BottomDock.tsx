"use client";

import {
	CalendarDays,
	LayoutPanelLeft,
	type LucideIcon,
	MessageSquare,
} from "lucide-react";
import { useTranslations } from "@/lib/i18n";
import { useLocaleStore } from "@/lib/store/locale";
import { useUiStore } from "@/lib/store/ui-store";
import { cn } from "@/lib/utils";

interface BottomDockProps {
	className?: string;
}

interface DockItem {
	id: string;
	icon: LucideIcon;
	label: string;
	isActive: boolean;
	onClick: () => void;
	group?: string;
}

export function BottomDock({ className }: BottomDockProps) {
	const {
		isCalendarOpen,
		isTodosOpen,
		isChatOpen,
		toggleCalendar,
		toggleTodos,
		toggleChat,
	} = useUiStore();
	const { locale } = useLocaleStore();
	const t = useTranslations(locale);

	const DOCK_ITEMS: DockItem[] = [
		{
			id: "calendar",
			icon: CalendarDays,
			label: t.bottomDock.calendar,
			isActive: isCalendarOpen,
			onClick: toggleCalendar,
			group: "views",
		},
		{
			id: "todos",
			icon: LayoutPanelLeft,
			label: t.bottomDock.todos,
			isActive: isTodosOpen,
			onClick: toggleTodos,
			group: "views",
		},
		{
			id: "chat",
			icon: MessageSquare,
			label: t.bottomDock.chat,
			isActive: isChatOpen,
			onClick: toggleChat,
			group: "views",
		},
	];

	// 按组分组，用于添加分隔符
	const groupedItems = DOCK_ITEMS.reduce(
		(acc, item) => {
			const group = item.group || "default";
			if (!acc[group]) {
				acc[group] = [];
			}
			acc[group].push(item);
			return acc;
		},
		{} as Record<string, DockItem[]>,
	);

	const groupEntries = Object.entries(groupedItems);
	const hasMultipleGroups = groupEntries.length > 1;

	return (
		<div
			className={cn(
				"pointer-events-auto fixed bottom-6 left-1/2 z-50 -translate-x-1/2",
				className,
			)}
		>
			<div
				className={cn(
					"flex items-center gap-2",
					"bg-white/80 dark:bg-zinc-900/80",
					"backdrop-blur-md",
					"border border-zinc-200 dark:border-zinc-800",
					"shadow-lg",
					"px-2 py-1.5",
					"rounded-[var(--radius-panel)]",
				)}
			>
				{groupEntries.map(([groupName, groupItems], groupIndex) => (
					<div key={groupName} className="flex items-center gap-2">
						{groupIndex > 0 && hasMultipleGroups && (
							<div className="h-6 w-[1px] bg-zinc-300 dark:bg-zinc-700 mx-1" />
						)}
						{groupItems.map((item) => {
							const Icon = item.icon;
							return (
								<button
									key={item.id}
									type="button"
									onClick={item.onClick}
									className={cn(
										"relative flex items-center gap-2",
										"px-3 py-2 rounded-lg",
										"transition-all duration-200",
										"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
										item.isActive
											? "bg-[#e9f2fe] dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 shadow-md shadow-blue-400/10 hover:bg-[#d4e7fd] dark:hover:bg-blue-900/40"
											: "text-black dark:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800",
									)}
									aria-label={item.label}
									aria-pressed={item.isActive}
								>
									<Icon
										className={cn(
											"h-5 w-5",
											item.isActive
												? "text-blue-600 dark:text-blue-400"
												: "text-black dark:text-white",
										)}
									/>
									<span
										className={cn(
											"text-sm font-medium",
											item.isActive
												? "text-blue-600 dark:text-blue-400"
												: "text-black dark:text-white",
										)}
									>
										{item.label}
									</span>
									{item.isActive && (
										<span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3 h-0.5 bg-blue-600 dark:bg-blue-400" />
									)}
								</button>
							);
						})}
					</div>
				))}
			</div>
		</div>
	);
}
