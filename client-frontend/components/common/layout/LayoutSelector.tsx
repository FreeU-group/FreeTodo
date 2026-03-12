"use client";

import {
	Check,
	ChevronDown,
	LayoutGrid,
	MoreHorizontal,
	Pencil,
	Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { PanelFeature } from "@/lib/config/panel-config";
import { LAYOUT_PRESETS, useUiStore } from "@/lib/store/ui-store";
import { cn } from "@/lib/utils";
import {
	type LayoutFormState,
	LayoutSelectorDialogs,
	type OverwriteConfirmState,
} from "./LayoutSelectorDialogs";

interface LayoutSelectorProps {
	/**
	 * 是否显示下拉箭头
	 * 顶部工具栏等紧凑区域可以关闭箭头，只保留图标入口
	 * @default true
	 */
	showChevron?: boolean;
	/**
	 * 是否显示当前布局名称
	 * @default true
	 */
	showLabel?: boolean;
}

export function LayoutSelector({
	showChevron = true,
	showLabel = true,
}: LayoutSelectorProps) {
	const {
		applyLayout,
		panelFeatureMap,
		isFeatureEnabled,
		isPanelAOpen,
		isPanelBOpen,
		isPanelCOpen,
		panelAWidth,
		panelCWidth,
		customLayouts,
		saveCustomLayout,
		renameCustomLayout,
		deleteCustomLayout,
	} = useUiStore();
	const [mounted, setMounted] = useState(false);
	const [isOpen, setIsOpen] = useState(false);
	const [openMenuId, setOpenMenuId] = useState<string | null>(null);
	const [layoutForm, setLayoutForm] = useState<LayoutFormState | null>(null);
	const [formError, setFormError] = useState<string | null>(null);
	const [overwriteConfirm, setOverwriteConfirm] =
		useState<OverwriteConfirmState | null>(null);
	const overwriteActionRef = useRef<"confirm" | "cancel" | null>(null);
	const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
	const _menuContentRef = useRef<HTMLDivElement | null>(null);
	const _nameInputRef = useRef<HTMLInputElement | null>(null);
	const dropdownRef = useRef<HTMLDivElement>(null);
	const t = useTranslations("layoutSelector");
	const tDock = useTranslations("bottomDock");

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
				if (
					_menuContentRef.current?.contains(event.target as Node)
				) {
					return;
				}
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

	useEffect(() => {
		if (!layoutForm) return;
		if (layoutForm.mode !== "rename") return;
		const id = requestAnimationFrame(() => {
			_nameInputRef.current?.focus();
			_nameInputRef.current?.select();
		});
		return () => cancelAnimationFrame(id);
	}, [layoutForm]);

	useEffect(() => {
		if (!isOpen) {
			setOpenMenuId(null);
		}
	}, [isOpen]);

	if (!mounted) {
		return <div className="h-9 w-9" />;
	}

	const layoutMatches = (layout: (typeof LAYOUT_PRESETS)[number]) => {
		const featureMatch =
			layout.panelFeatureMap.panelA === panelFeatureMap.panelA &&
			layout.panelFeatureMap.panelB === panelFeatureMap.panelB &&
			layout.panelFeatureMap.panelC === panelFeatureMap.panelC;
		if (!featureMatch) return false;

		if (
			layout.isPanelAOpen !== isPanelAOpen ||
			layout.isPanelBOpen !== isPanelBOpen ||
			layout.isPanelCOpen !== isPanelCOpen
		) {
			return false;
		}

		const aWidthMatch =
			layout.panelAWidth === undefined ||
			Math.abs(layout.panelAWidth - panelAWidth) < 0.001;
		const cWidthMatch =
			layout.panelCWidth === undefined ||
			Math.abs(layout.panelCWidth - panelCWidth) < 0.001;

		return aWidthMatch && cWidthMatch;
	};

	const currentLayout =
		LAYOUT_PRESETS.find(layoutMatches) ||
		customLayouts.find(layoutMatches) ||
		null;
	const currentLayoutId = currentLayout?.id ?? null;
	const currentLayoutName = currentLayout
		? customLayouts.some((layout) => layout.id === currentLayout.id)
			? currentLayout.name
			: t(`layouts.${currentLayout.id}`)
		: t("customLayout");

	// 过滤掉包含已禁用面板功能的预设布局
	const availableBaseLayouts = LAYOUT_PRESETS.filter((preset) => {
		const features = Object.values(preset.panelFeatureMap).filter(
			(feature): feature is PanelFeature => feature !== null,
		);
		return features.every((feature) => isFeatureEnabled(feature));
	});
	const availableCustomLayouts = customLayouts.filter((preset) => {
		const features = Object.values(preset.panelFeatureMap).filter(
			(feature): feature is PanelFeature => feature !== null,
		);
		return features.every((feature) => isFeatureEnabled(feature));
	});
	const availableLayouts = [...availableBaseLayouts, ...availableCustomLayouts];
	const customLayoutIds = new Set(customLayouts.map((layout) => layout.id));

	const getLayoutName = (layoutId: string) => {
		const customLayout = customLayouts.find((layout) => layout.id === layoutId);
		if (customLayout) return customLayout.name;
		return t(`layouts.${layoutId}`);
	};

	const formatFeatureLabel = (feature: PanelFeature | null) =>
		feature ? tDock(feature) : tDock("unassigned");

	const getAutoName = () => {
		const featureA = formatFeatureLabel(panelFeatureMap.panelA);
		const featureB = formatFeatureLabel(panelFeatureMap.panelB);
		const featureC = formatFeatureLabel(panelFeatureMap.panelC);

		const showA = isPanelAOpen;
		const showB = isPanelBOpen;
		const showC = isPanelCOpen;

		let a = 0;
		let b = 0;
		let c = 0;

		if (showA && showB && showC) {
			const baseWidth = Math.max(0, 1 - panelCWidth);
			a = baseWidth * panelAWidth;
			b = Math.max(0, baseWidth - a);
			c = Math.max(0, panelCWidth);
		} else if (showA && showC && !showB) {
			a = panelAWidth;
			c = Math.max(0, 1 - panelAWidth);
		} else if (showA && showB && !showC) {
			a = panelAWidth;
			b = Math.max(0, 1 - panelAWidth);
		} else if (showB && showC && !showA) {
			b = Math.max(0, 1 - panelCWidth);
			c = Math.max(0, panelCWidth);
		} else if (showA) {
			a = 1;
		} else if (showB) {
			b = 1;
		} else if (showC) {
			c = 1;
		}

		const parts: string[] = [];
		if (showA) parts.push(`A:${featureA} ${Math.round(a * 100)}%`);
		if (showB) parts.push(`B:${featureB} ${Math.round(b * 100)}%`);
		if (showC) parts.push(`C:${featureC} ${Math.round(c * 100)}%`);

		return parts.join(" · ");
	};

	const openSaveDialog = () => {
		setLayoutForm({ mode: "save", name: getAutoName() });
		setFormError(null);
		setIsOpen(false);
		setOpenMenuId(null);
	};

	const openRenameDialog = (layoutId: string) => {
		const target = customLayouts.find((layout) => layout.id === layoutId);
		if (!target) return;
		setLayoutForm({ mode: "rename", name: target.name, targetId: layoutId });
		setFormError(null);
		setIsOpen(false);
		setOpenMenuId(null);
	};

	const openDeleteDialog = (layoutId: string) => {
		setDeleteTargetId(layoutId);
		setIsOpen(false);
		setOpenMenuId(null);
	};

	const handleLayoutFormSubmit = () => {
		if (!layoutForm) return;
		const trimmed = layoutForm.name.trim();
		if (!trimmed) {
			setFormError(t("layoutNameRequired"));
			return;
		}

		const nameKey = trimmed.toLocaleLowerCase();
		const duplicate = customLayouts.find(
			(layout) => layout.name.toLocaleLowerCase() === nameKey,
		);
		const isDuplicate =
			duplicate &&
			(layoutForm.mode === "save" || duplicate.id !== layoutForm.targetId);
		if (isDuplicate) {
			setOverwriteConfirm({
				mode: layoutForm.mode,
				name: trimmed,
				targetId: layoutForm.targetId,
			});
			setLayoutForm(null);
			setFormError(null);
			return;
		}

		const success =
			layoutForm.mode === "save"
				? saveCustomLayout(trimmed)
				: renameCustomLayout(layoutForm.targetId ?? "", trimmed);
		if (success) {
			setLayoutForm(null);
		}
	};

	const handleOverwriteConfirm = () => {
		if (!overwriteConfirm) return;
		overwriteActionRef.current = "confirm";
		if (overwriteConfirm.mode === "save") {
			saveCustomLayout(overwriteConfirm.name, { overwrite: true });
		} else {
			renameCustomLayout(overwriteConfirm.targetId ?? "", overwriteConfirm.name, {
				overwrite: true,
			});
		}
		setOverwriteConfirm(null);
		setLayoutForm(null);
	};

	const handleOverwriteCancel = () => {
		if (!overwriteConfirm) return;
		overwriteActionRef.current = "cancel";
		setLayoutForm({
			mode: overwriteConfirm.mode,
			name: overwriteConfirm.name,
			targetId: overwriteConfirm.targetId,
		});
		setOverwriteConfirm(null);
		setFormError(null);
	};

	const handleDeleteConfirm = () => {
		if (!deleteTargetId) return;
		deleteCustomLayout(deleteTargetId);
		setDeleteTargetId(null);
	};

	const deleteTarget = deleteTargetId
		? customLayouts.find((layout) => layout.id === deleteTargetId)
		: null;

	return (
		<div ref={dropdownRef} className="relative">
			<button
				type="button"
				onClick={() => setIsOpen(!isOpen)}
				className={cn(
					"flex items-center gap-2 rounded-md border border-border bg-background/70 px-2.5 py-1.5 text-sm text-foreground shadow-sm transition-all duration-200",
					"hover:bg-accent/40 hover:shadow-md active:scale-[0.98] active:shadow-sm",
					"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				)}
				title={currentLayoutName}
				aria-label={`${t("selectLayout")}：${currentLayoutName}`}
				aria-expanded={isOpen}
				aria-haspopup="listbox"
			>
				<LayoutGrid className="h-4 w-4 shrink-0 text-muted-foreground" />
				{showLabel && (
					<span className="max-w-[160px] truncate font-medium">
						{currentLayoutName}
					</span>
				)}
				{showChevron && (
					<ChevronDown
						className={cn(
							"h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
							isOpen && "rotate-180",
						)}
					/>
				)}
			</button>

			{isOpen && (
				<div
					className="absolute right-0 top-full z-50 mt-1 w-full min-w-[180px] rounded-md border border-border bg-popover p-1 shadow-md animate-in fade-in-0 zoom-in-95"
					role="listbox"
					aria-label={t("selectLayout")}
				>
					{availableLayouts.map((layout) => {
						const isCustom = customLayoutIds.has(layout.id);
						const isActive = currentLayoutId === layout.id;
						return (
							<div
								key={layout.id}
								role="option"
								aria-selected={isActive}
								tabIndex={0}
								onClick={() => {
									applyLayout(layout.id);
									setOpenMenuId(null);
									setIsOpen(false);
								}}
								onKeyDown={(event) => {
									if (event.key === "Enter" || event.key === " ") {
										event.preventDefault();
										applyLayout(layout.id);
										setOpenMenuId(null);
										setIsOpen(false);
									}
								}}
								className={cn(
									"group flex w-full cursor-pointer items-center justify-between gap-2 rounded-sm px-3 py-2 text-sm transition-colors",
									"hover:bg-accent hover:text-accent-foreground",
									"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
									isActive && "bg-accent/50",
								)}
							>
								<span className="flex-1 truncate">
									{getLayoutName(layout.id)}
								</span>
								<div className="flex items-center gap-1">
									{isActive && <Check className="h-4 w-4 text-primary" />}
									{isCustom && (
										<DropdownMenu
											open={openMenuId === layout.id}
											onOpenChange={(open) =>
												setOpenMenuId(open ? layout.id : null)
											}
										>
											<DropdownMenuTrigger asChild>
												<button
													type="button"
													onPointerDown={(event) => event.stopPropagation()}
													onClick={(event) => event.stopPropagation()}
													onKeyDown={(event) => event.stopPropagation()}
													className={cn(
														"rounded-sm p-1 text-muted-foreground transition-opacity",
														"opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
														"hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
													)}
													aria-label={t("layoutActions")}
												>
													<MoreHorizontal className="h-4 w-4" />
												</button>
											</DropdownMenuTrigger>
											<DropdownMenuContent
												align="end"
												sideOffset={6}
												ref={_menuContentRef}
												onClick={(event) => event.stopPropagation()}
											>
												<DropdownMenuItem
													onSelect={() => {
														setOpenMenuId(null);
														openRenameDialog(layout.id);
													}}
												>
													<Pencil className="mr-2 h-3.5 w-3.5" />
													{t("renameLayout")}
												</DropdownMenuItem>
												<DropdownMenuItem
													onSelect={() => {
														setOpenMenuId(null);
														openDeleteDialog(layout.id);
													}}
													className="text-destructive focus:text-destructive"
												>
													<Trash2 className="mr-2 h-3.5 w-3.5" />
													{t("deleteLayout")}
												</DropdownMenuItem>
											</DropdownMenuContent>
										</DropdownMenu>
									)}
								</div>
							</div>
						);
					})}
					<div className="my-1 border-t border-border" />
					<button
						type="button"
						onClick={openSaveDialog}
						className={cn(
							"flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm transition-colors",
							"hover:bg-accent hover:text-accent-foreground",
							"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
						)}
					>
						<span className="text-muted-foreground">
							{t("saveCurrentLayout")}
						</span>
					</button>
				</div>
			)}
			<LayoutSelectorDialogs
				layoutForm={layoutForm}
				setLayoutForm={setLayoutForm}
				formError={formError}
				setFormError={setFormError}
				onLayoutFormSubmit={handleLayoutFormSubmit}
				nameInputRef={_nameInputRef}
				overwriteConfirm={overwriteConfirm}
				onOverwriteConfirm={handleOverwriteConfirm}
				onOverwriteCancel={handleOverwriteCancel}
				overwriteActionRef={overwriteActionRef}
				deleteTargetName={deleteTarget?.name ?? null}
				onDeleteConfirm={handleDeleteConfirm}
				onDeleteCancel={() => setDeleteTargetId(null)}
				t={t}
			/>
		</div>
	);
}
