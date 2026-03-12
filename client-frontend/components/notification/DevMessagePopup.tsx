"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

/** 通知间隔（毫秒）- 每 10 秒 */
const NOTIFICATION_INTERVAL_MS = 10_000;
/** 通知显示持续时间（毫秒）- 3 秒 */
const NOTIFICATION_DURATION_MS = 3_000;

/**
 * 开发消息弹窗组件
 * 每 10 秒从左下角弹出通知，停留 3 秒后自动消失
 * 纯 Web 实现，在 pnpm dev 下即可运行，无需 Electron
 */
export function DevMessagePopup() {
	const [visible, setVisible] = useState(false);

	// 每 10 秒触发一次显示
	useEffect(() => {
		const intervalId = setInterval(() => {
			setVisible(true);
		}, NOTIFICATION_INTERVAL_MS);
		return () => clearInterval(intervalId);
	}, []);

	// 显示后 3 秒自动隐藏
	useEffect(() => {
		if (!visible) return;
		const timer = setTimeout(() => {
			setVisible(false);
		}, NOTIFICATION_DURATION_MS);
		return () => clearTimeout(timer);
	}, [visible]);

	return (
		<AnimatePresence>
			{visible && (
				<motion.div
					initial={{ opacity: 0, y: 24, scale: 0.92 }}
					animate={{ opacity: 1, y: 0, scale: 1 }}
					exit={{ opacity: 0, y: 12, scale: 0.95 }}
					transition={{
						type: "spring",
						stiffness: 380,
						damping: 28,
						mass: 0.8,
					}}
					className="fixed bottom-5 left-5 z-[9999] w-[340px] pointer-events-none select-none"
				>
					<div className="relative overflow-hidden rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl shadow-[0_20px_44px_-8px_rgba(0,0,0,0.14),0_8px_18px_-4px_rgba(0,0,0,0.08)] border border-black/[0.04] dark:border-white/[0.06]">
						<div className="p-4">
							<div className="flex items-center gap-3.5">
								{/* 头像 + 渐变圆环 */}
								<div className="shrink-0 w-[50px] h-[50px] rounded-full p-[2.5px] bg-gradient-to-br from-amber-400 via-orange-500 to-red-500">
									<img
										src="/hi_dog2.png"
										alt="Cool Doge"
										className="w-full h-full rounded-full object-cover bg-white dark:bg-slate-800"
									/>
								</div>

								{/* 文字内容 */}
								<div className="flex-1 min-w-0">
									<p className="text-[14.5px] font-bold text-slate-900 dark:text-white leading-tight tracking-[-0.01em]">
										Cool Doge
									</p>
									<p className="text-[12.5px] text-slate-500 dark:text-slate-400 leading-snug mt-0.5">
										Hey! Don&apos;t forget to check your tasks 🐾
									</p>
								</div>
							</div>
						</div>

						{/* 底部进度条 */}
						<motion.div
							initial={{ width: "100%" }}
							animate={{ width: "0%" }}
							transition={{
								duration: NOTIFICATION_DURATION_MS / 1000,
								ease: "linear",
							}}
							className="absolute bottom-0 left-0 h-[2.5px] bg-gradient-to-r from-amber-400 to-orange-500 rounded-bl-2xl"
						/>
					</div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
