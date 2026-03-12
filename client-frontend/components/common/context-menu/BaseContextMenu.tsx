"use client";

import type React from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export interface MenuItem {
	icon?: React.ComponentType<{ className?: string }>;
	label: string;
	onClick: () => void;
	/** 是否为第一个菜单项（用于添加 first:rounded-t-md） */
	isFirst?: boolean;
	/** 是否为最后一个菜单项（用于添加 last:rounded-b-md） */
	isLast?: boolean;
}

interface BaseContextMenuProps {
	/** 菜单项列表 */
	items: MenuItem[];
	/** 菜单是否打开 */
	open: boolean;
	/** 菜单位置 */
	position: { x: number; y: number };
	/** 关闭菜单的回调 */
	onClose: () => void;
	/** 可选的头部内容（如选中数量显示） */
	header?: React.ReactNode;
	/** 菜单的最小宽度，默认 170px */
	minWidth?: number;
}

/**
 * 基础上下文菜单组件，提供通用的菜单功能：
 * - 点击外部关闭
 * - ESC 键关闭
 * - 滚动时关闭
 * - 统一的样式
 */
export function BaseContextMenu({
	items,
	open,
	position,
	onClose,
	header,
	minWidth = 170,
}: BaseContextMenuProps) {
	const menuRef = useRef<HTMLDivElement | null>(null);

	// 点击外部、滚动或按下 ESC 时关闭
	useEffect(() => {
		if (!open) return;

		const handleClickOutside = (event: MouseEvent) => {
			const target = event.target as Node;
			if (menuRef.current?.contains(target)) {
				return;
			}
			onClose();
		};

		const handleEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				onClose();
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		document.addEventListener("keydown", handleEscape);
		document.addEventListener("scroll", onClose, true);

		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
			document.removeEventListener("keydown", handleEscape);
			document.removeEventListener("scroll", onClose, true);
		};
	}, [open, onClose]);

	if (!open || typeof document === "undefined") {
		return null;
	}

	return createPortal(
		<div className="fixed inset-0 z-120 pointer-events-none">
			<div
				ref={menuRef}
				className="pointer-events-auto rounded-md border border-border bg-background shadow-lg"
				style={{
					top: position.y,
					left: position.x,
					position: "absolute",
					minWidth: `${minWidth}px`,
				}}
			>
				{header && (
					<div className="px-3 py-2 text-xs text-muted-foreground border-b border-border">
						{header}
					</div>
				)}
				{items.map((item) => {
					const Icon = item.icon;
					return (
						<button
							key={item.label}
							type="button"
							className={cn(
								"flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted/70 transition-colors",
								item.isFirst && "first:rounded-t-md",
								item.isLast && "last:rounded-b-md",
							)}
							onClick={() => {
								item.onClick();
								onClose();
							}}
						>
							{Icon && <Icon className="h-4 w-4" />}
							<span>{item.label}</span>
						</button>
					);
				})}
			</div>
		</div>,
		document.body,
	);
}

/**
 * Hook 用于管理上下文菜单的状态和位置计算
 */
export function useContextMenu() {
	const [contextMenu, setContextMenu] = useState({
		open: false,
		x: 0,
		y: 0,
	});

	const openContextMenu = (
		event: React.MouseEvent,
		options?: {
			menuWidth?: number;
			menuHeight?: number;
			/** 自定义位置计算函数 */
			calculatePosition?: (event: React.MouseEvent) => { x: number; y: number };
		},
	) => {
		event.preventDefault();
		event.stopPropagation();

		const menuWidth = options?.menuWidth ?? 180;
		const menuHeight = options?.menuHeight ?? 160;
		const viewportWidth =
			typeof window !== "undefined" ? window.innerWidth : menuWidth;
		const viewportHeight =
			typeof window !== "undefined" ? window.innerHeight : menuHeight;

		let x: number;
		let y: number;

		if (options?.calculatePosition) {
			const pos = options.calculatePosition(event);
			x = pos.x;
			y = pos.y;
		} else {
			// 默认位置计算：确保菜单不超出视口
			x = Math.min(Math.max(event.clientX, 8), viewportWidth - menuWidth);
			y = Math.min(Math.max(event.clientY, 8), viewportHeight - menuHeight);
		}

		setContextMenu({
			open: true,
			x,
			y,
		});
	};

	const closeContextMenu = () => {
		setContextMenu((state) => (state.open ? { ...state, open: false } : state));
	};

	return {
		contextMenu,
		openContextMenu,
		closeContextMenu,
	};
}
