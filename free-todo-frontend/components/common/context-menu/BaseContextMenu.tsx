"use client";

import { motion } from "framer-motion";
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
}: BaseContextMenuProps) {
	const menuRef = useRef<HTMLDivElement | null>(null);

	// 点击外部、滚动、按下 ESC 或鼠标移出菜单区域时关闭
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

		const handleMouseLeave = (event: MouseEvent) => {
			if (!menuRef.current) return;
			const rect = menuRef.current.getBoundingClientRect();
			const { clientX, clientY } = event;

			// 如果鼠标移出菜单区域，关闭菜单
			if (
				clientX < rect.left ||
				clientX > rect.right ||
				clientY < rect.top ||
				clientY > rect.bottom
			) {
				onClose();
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		document.addEventListener("keydown", handleEscape);
		document.addEventListener("scroll", onClose, true);
		document.addEventListener("mousemove", handleMouseLeave);

		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
			document.removeEventListener("keydown", handleEscape);
			document.removeEventListener("scroll", onClose, true);
			document.removeEventListener("mousemove", handleMouseLeave);
		};
	}, [open, onClose]);

	if (!open || typeof document === "undefined") {
		return null;
	}

	return createPortal(
		<div className="fixed inset-0 z-120 pointer-events-none">
			<motion.div
				ref={menuRef}
				initial={{ opacity: 0, scale: 0.8, y: -10 }}
				animate={{ opacity: 1, scale: 1, y: 0 }}
				exit={{ opacity: 0, scale: 0.8, y: -10 }}
				transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
				className="pointer-events-auto rounded-2xl border border-cyan-400/20 bg-[#0a0a0a]/95 backdrop-blur-[80px] shadow-2xl"
				style={{
					top: position.y,
					left: position.x,
					position: "absolute",
					boxShadow:
						"0px 20px 50px -10px rgba(0, 0, 0, 0.5), 0px 10px 20px -10px rgba(0,0,0,0.3), 0 0 20px rgba(34,211,238,0.1), inset 0 0 20px rgba(255,255,255,0.03)",
				}}
			>
				{header && (
					<div className="px-3 py-2 text-xs text-white/50 border-b border-white/10">
						{header}
					</div>
				)}
				<div className="flex items-center gap-2 p-2">
					{items.map((item) => {
						const Icon = item.icon;
						return (
							<button
								key={item.label}
								type="button"
								className={cn(
									"relative flex items-center justify-center w-10 h-10",
									"bg-[#0a0a0a]/80 hover:bg-[#0a0a0a]",
									"border border-cyan-400/20 hover:border-cyan-400/60",
									"transition-all duration-300 hover:scale-110",
									"text-cyan-400/70 hover:text-cyan-400",
									"shadow-[0_0_8px_rgba(34,211,238,0.2)] hover:shadow-[0_0_12px_rgba(34,211,238,0.4)]",
									"before:absolute before:inset-0 before:rounded-lg before:bg-gradient-to-br before:from-cyan-400/10 before:to-transparent before:opacity-0 hover:before:opacity-100 before:transition-opacity before:duration-300",
								)}
								style={{
									clipPath:
										"polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)",
								}}
								onClick={() => {
									item.onClick();
									onClose(); // 点击后自动关闭
								}}
								title={item.label}
							>
								{Icon && <Icon className="h-4.5 w-4.5 relative z-10" />}
							</button>
						);
					})}
				</div>
			</motion.div>
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
