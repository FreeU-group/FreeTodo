"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import type { PanelFeature, PanelPosition } from "@/lib/config/panel-config";
import { FEATURE_ICON_MAP } from "@/lib/config/panel-config";
import { useUiStore } from "@/lib/store/ui-store";
import { cn } from "@/lib/utils";

interface PanelSelectorMenuProps {
	position: PanelPosition;
	isOpen: boolean;
	onClose: () => void;
	onSelect: (feature: PanelFeature) => void;
	anchorElement: HTMLElement | null;
}

// 功能到翻译键的映射
function getFeatureLabelKey(feature: PanelFeature): string {
	return feature;
}

export function PanelSelectorMenu({
	position: _position,
	isOpen,
	onClose,
	onSelect,
	anchorElement,
}: PanelSelectorMenuProps) {
	const menuRef = useRef<HTMLDivElement>(null);
	const { getAvailableFeatures } = useUiStore();
	const t = useTranslations("bottomDock");

	// ✅ 修复：订阅 disabledFeatures 状态，确保与设置页面同步
	// 使用 useMemo 确保当 disabledFeatures 变化时，可用功能列表会重新计算
	const availableFeatures = useMemo(() => {
		// 使用 getAvailableFeatures 来同步设置界面的开启/关闭状态
		// 但是要确保settings始终包含（设置功能一定被包含的）
		const baseAvailableFeatures = getAvailableFeatures();
		const allAvailableFeatures: PanelFeature[] = baseAvailableFeatures.includes("settings")
			? baseAvailableFeatures
			: [...baseAvailableFeatures, "settings" as PanelFeature];
		return allAvailableFeatures;
	}, [getAvailableFeatures]);

	// 点击外部关闭菜单
	useEffect(() => {
		if (!isOpen) return;

		const handleClickOutside = (event: MouseEvent) => {
			if (
				menuRef.current &&
				!menuRef.current.contains(event.target as Node) &&
				anchorElement &&
				!anchorElement.contains(event.target as Node)
			) {
				onClose();
			}
		};

		const handleEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				onClose();
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		document.addEventListener("keydown", handleEscape);

		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
			document.removeEventListener("keydown", handleEscape);
		};
	}, [isOpen, onClose, anchorElement]);

	// 计算菜单位置：使用 bottom 锚定，让菜单「底部」紧贴按钮「顶部」
	const getMenuPosition = () => {
		if (!anchorElement) {
			return { top: 0, left: 0 } as const;
		}

		const rect = anchorElement.getBoundingClientRect();
		const windowHeight = window.innerHeight;

		return {
			bottom: windowHeight - rect.top, // 菜单底部贴在按钮顶部
			left: rect.left,
		} as const;
	};

	if (availableFeatures.length === 0) {
		return null;
	}

	const menuPosition = getMenuPosition();

	// 使用 Portal 将菜单渲染到 body，避免被父元素样式影响
	const menuContent = (
		<AnimatePresence>
			{isOpen && (
				<>
					{/* 背景遮罩 */}
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						className="fixed inset-0 z-[100]"
						onClick={onClose}
					/>
					{/* 菜单 */}
					<motion.div
						ref={menuRef}
						data-tour="panel-selector-menu"
						initial={{ opacity: 0, y: 10, scale: 0.95 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={{ opacity: 0, y: 10, scale: 0.95 }}
						transition={{ duration: 0.15 }}
						className={cn(
							"fixed z-[101]",
							"bg-[oklch(var(--card))]/95",
							"border border-[oklch(var(--border))]",
							"rounded-lg",
							"shadow-lg",
							"py-1",
							"min-w-[110px]",
							"backdrop-blur-sm",
						)}
						style={{
							// 仅设置其中一个：我们现在通过 bottom 来对齐
							...(Object.hasOwn(menuPosition, "top")
								? { top: `${(menuPosition as { top: number }).top}px` }
								: {}),
							...(Object.hasOwn(menuPosition, "bottom")
								? {
										bottom: `${(menuPosition as { bottom: number }).bottom}px`,
									}
								: {}),
							left: `${menuPosition.left}px`,
						}}
					>
						{availableFeatures.map((feature) => {
							const Icon = FEATURE_ICON_MAP[feature];
							const labelKey = getFeatureLabelKey(feature);
							return (
								<button
									key={feature}
									type="button"
									onClick={() => {
										onSelect(feature);
										onClose();
										// 派发事件通知引导流程面板已选择
										window.dispatchEvent(
											new CustomEvent("onboarding:panel-selected", {
												detail: { feature },
											}),
										);
									}}
									className={cn(
										"w-full flex items-center gap-2",
										"px-3 py-2",
										"text-sm font-medium",
										"text-[oklch(var(--foreground))]",
										"hover:bg-[oklch(var(--muted))] dark:hover:bg-[oklch(var(--primary-weak-hover))]",
										"hover:text-[oklch(var(--foreground))]",
										"transition-colors",
										"first:rounded-t-lg last:rounded-b-lg",
									)}
								>
									<Icon className="h-4 w-4 shrink-0 text-[oklch(var(--primary))]" />
									<span>{t(labelKey)}</span>
								</button>
							);
						})}
					</motion.div>
				</>
			)}
		</AnimatePresence>
	);

	// 在客户端渲染时使用 Portal
	if (typeof window !== "undefined") {
		return createPortal(menuContent, document.body);
	}

	return null;
}
