"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

/**
 * 底部 Dock 触发区域高亮组件
 * 用于引导用户将鼠标移至底部以触发 Dock 出现
 *
 * 注意：元素始终存在于 DOM 中（用于 driver.js 定位），
 * 只有 isVisible 为 true 时才显示视觉效果
 */
export function DockTriggerZone() {
	const [isVisible, setIsVisible] = useState(false);

	useEffect(() => {
		const handleShow = () => setIsVisible(true);
		const handleHide = () => setIsVisible(false);

		window.addEventListener("onboarding:show-dock-trigger-zone", handleShow);
		window.addEventListener("onboarding:hide-dock-trigger-zone", handleHide);

		return () => {
			window.removeEventListener("onboarding:show-dock-trigger-zone", handleShow);
			window.removeEventListener("onboarding:hide-dock-trigger-zone", handleHide);
		};
	}, []);

	// 元素始终存在，但只在 isVisible 时显示视觉效果
	return (
		<motion.div
			data-tour="dock-trigger-zone"
			initial={{ opacity: 0 }}
			animate={{ opacity: isVisible ? 1 : 0 }}
			transition={{ duration: 0.3 }}
			className="fixed bottom-0 left-0 right-0 h-20 z-40 pointer-events-none"
			style={{
				background: isVisible
					? "linear-gradient(to top, rgba(var(--primary-rgb), 0.3), transparent)"
					: "transparent",
				borderTop: isVisible ? "2px dashed rgba(var(--primary-rgb), 0.5)" : "none",
			}}
		>
			{/* 向下箭头动画指示 */}
			{isVisible && (
				<motion.div
					className="absolute left-1/2 -top-2 -translate-x-1/2"
					animate={{ y: [0, 8, 0] }}
					transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
				>
					<svg
						width="32"
						height="32"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
						className="text-primary"
						aria-hidden="true"
					>
						<path d="M12 5v14M19 12l-7 7-7-7" />
					</svg>
				</motion.div>
			)}
		</motion.div>
	);
}
