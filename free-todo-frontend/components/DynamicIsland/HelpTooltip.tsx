"use client";

import { AnimatePresence, motion } from "framer-motion";
import { HelpCircle, X } from "lucide-react";
import { useState } from "react";

export function HelpTooltip() {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<>
			<button
				type="button"
				onClick={() => setIsOpen(true)}
				className="absolute top-4 left-4 z-[10000] w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/60 hover:text-white transition-colors backdrop-blur-md border border-white/10"
				title="操作说明"
			>
				<HelpCircle size={16} />
			</button>

			<AnimatePresence>
				{isOpen && (
					<>
						<motion.div
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[10001]"
							onClick={() => setIsOpen(false)}
						/>
						<motion.div
							initial={{ opacity: 0, scale: 0.9, y: 20 }}
							animate={{ opacity: 1, scale: 1, y: 0 }}
							exit={{ opacity: 0, scale: 0.9, y: 20 }}
							className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[10002] w-[90%] max-w-md bg-[#0a0a0a] border border-white/20 rounded-2xl p-6 shadow-2xl"
						>
							<div className="flex items-center justify-between mb-4">
								<h3 className="text-lg font-semibold text-white">
									灵动岛操作说明
								</h3>
								<button
									type="button"
									onClick={() => setIsOpen(false)}
									className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/60 hover:text-white transition-colors"
								>
									<X size={16} />
								</button>
							</div>

							<div className="space-y-4 text-sm text-white/80">
								<div>
									<h4 className="text-white font-medium mb-2">📱 模式切换</h4>
									<ul className="space-y-1 text-white/60 ml-4">
										<li>
											• 按{" "}
											<kbd className="px-1.5 py-0.5 bg-white/10 rounded text-xs">
												1
											</kbd>{" "}
											- 悬浮窗模式
										</li>
										<li>
											• 按{" "}
											<kbd className="px-1.5 py-0.5 bg-white/10 rounded text-xs">
												2
											</kbd>{" "}
											- 弹窗模式
										</li>
										<li>
											• 按{" "}
											<kbd className="px-1.5 py-0.5 bg-white/10 rounded text-xs">
												3
											</kbd>{" "}
											- 侧边栏模式
										</li>
										<li>
											• 按{" "}
											<kbd className="px-1.5 py-0.5 bg-white/10 rounded text-xs">
												4
											</kbd>{" "}
											- 全屏模式
										</li>
										<li>
											• 按{" "}
											<kbd className="px-1.5 py-0.5 bg-white/10 rounded text-xs">
												Esc
											</kbd>{" "}
											- 退出当前模式
										</li>
									</ul>
								</div>

								<div>
									<h4 className="text-white font-medium mb-2">🎤 录音控制</h4>
									<ul className="space-y-1 text-white/60 ml-4">
										<li>
											• <strong>点击</strong> - 开始/暂停/恢复录音
										</li>
										<li>
											• <strong>右键</strong> - 停止录音并保存
										</li>
										<li>• 录音状态与页面完全同步</li>
										<li>• 支持实时转录和智能提取</li>
									</ul>
								</div>

								<div>
									<h4 className="text-white font-medium mb-2">💡 提示</h4>
									<ul className="space-y-1 text-white/60 ml-4">
										<li>• 悬浮窗模式下，鼠标移入可交互</li>
										<li>• 全屏模式显示完整应用界面</li>
										<li>• 所有操作与页面功能完全同步</li>
									</ul>
								</div>
							</div>
						</motion.div>
					</>
				)}
			</AnimatePresence>
		</>
	);
}
