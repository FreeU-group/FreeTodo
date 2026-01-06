"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Power } from "lucide-react";
import type React from "react";
import { useEffect, useRef } from "react";

interface ContextMenuProps {
	open: boolean;
	position: { x: number; y: number };
	onClose: () => void;
	onQuit: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
	open,
	position,
	onClose,
	onQuit,
}) => {
	const menuRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;

		// 像系统 tooltip 一样：短暂显示后自动消失
		const autoHideTimer = window.setTimeout(() => {
			onClose();
		}, 2000);

		const handleClickOutside = (event: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
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
			window.clearTimeout(autoHideTimer);
			document.removeEventListener("mousedown", handleClickOutside);
			document.removeEventListener("keydown", handleEscape);
		};
	}, [open, onClose]);

	return (
		<AnimatePresence>
			{open && (
				<motion.div
					ref={menuRef}
					initial={{ opacity: 0, scale: 0.8, y: -4 }}
					animate={{ opacity: 1, scale: 1, y: 0 }}
					exit={{ opacity: 0, scale: 0.8, y: -4 }}
					transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
					className="fixed z-[50] pointer-events-auto"
					style={{
						top: position.y,
						left: position.x,
					}}
					onMouseLeave={() => {
						onClose();
					}}
				>
					<button
				type="button"
						onClick={() => {
							onQuit();
							onClose();
						}}
						className="flex items-center justify-center w-8 h-8 rounded-full bg-[#0a0a0a]/95 border border-white/15 text-red-300 hover:text-red-200 hover:bg-red-500/20 shadow-lg transition-all duration-150"
						aria-label="退出应用"
					>
						<Power className="w-4 h-4" aria-hidden="true" />
					</button>
				</motion.div>
			)}
		</AnimatePresence>
	);
};
