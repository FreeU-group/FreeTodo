"use client";

import { Camera, Check, Loader2, X } from "lucide-react";
import { useState, useCallback, useEffect } from "react";

/** 提取状态类型 */
type ExtractStatus = "idle" | "capturing" | "processing" | "success" | "error";

/**
 * 悬浮窗截图按钮页面
 * 这是一个独立的页面，用于在 Electron 悬浮窗中显示
 */
export default function FloatingPage() {
	const [status, setStatus] = useState<ExtractStatus>("idle");
	const [message, setMessage] = useState<string>("");
	const [createdCount, setCreatedCount] = useState<number>(0);

	// 处理截图和待办提取
	const handleCapture = useCallback(async () => {
		// 检查是否在 Electron 环境中
		if (!window.electronAPI?.captureAndExtractTodos) {
			setStatus("error");
			setMessage("请在桌面应用中使用此功能");
			return;
		}

		try {
			setStatus("capturing");
			setMessage("正在截图...");

			// 调用 Electron API 截图并提取待办
			const result = await window.electronAPI.captureAndExtractTodos();

			if (result.success) {
				setStatus("success");
				setCreatedCount(result.createdCount);
				setMessage(
					result.createdCount > 0
						? `已提取 ${result.createdCount} 个待办`
						: "未检测到待办事项"
				);

				// 3 秒后恢复到初始状态
				setTimeout(() => {
					setStatus("idle");
					setMessage("");
					setCreatedCount(0);
				}, 3000);
			} else {
				setStatus("error");
				setMessage(result.message || "提取失败");

				// 3 秒后恢复到初始状态
				setTimeout(() => {
					setStatus("idle");
					setMessage("");
				}, 3000);
			}
		} catch (error) {
			setStatus("error");
			setMessage(error instanceof Error ? error.message : "未知错误");

			// 3 秒后恢复到初始状态
			setTimeout(() => {
				setStatus("idle");
				setMessage("");
			}, 3000);
		}
	}, []);

	// 获取按钮样式
	const getButtonStyles = useCallback(() => {
		const baseStyles =
			"w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 cursor-pointer select-none";

		switch (status) {
			case "capturing":
			case "processing":
				return `${baseStyles} bg-amber-500 hover:bg-amber-600 shadow-lg shadow-amber-500/30`;
			case "success":
				return `${baseStyles} bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-500/30`;
			case "error":
				return `${baseStyles} bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/30`;
			default:
				return `${baseStyles} bg-violet-600 hover:bg-violet-700 shadow-lg shadow-violet-600/30 hover:scale-105 active:scale-95`;
		}
	}, [status]);

	// 获取图标
	const getIcon = useCallback(() => {
		const iconProps = { className: "w-10 h-10 text-white" };

		switch (status) {
			case "capturing":
			case "processing":
				return <Loader2 {...iconProps} className={`${iconProps.className} animate-spin`} />;
			case "success":
				return <Check {...iconProps} />;
			case "error":
				return <X {...iconProps} />;
			default:
				return <Camera {...iconProps} />;
		}
	}, [status]);

	// 使整个窗口可拖动
	useEffect(() => {
		// 设置窗口可拖动区域
		document.body.style.setProperty("-webkit-app-region", "drag");
		// 按钮本身不拖动，可以点击
		const button = document.getElementById("capture-button");
		if (button) {
			button.style.setProperty("-webkit-app-region", "no-drag");
		}
	}, []);

	return (
		<div className="w-[120px] h-[120px] flex items-center justify-center bg-transparent">
			{/* 背景装饰 - 呼吸动画光晕 */}
			{status === "idle" && (
				<div className="absolute inset-0 flex items-center justify-center pointer-events-none">
					<div className="w-28 h-28 rounded-full bg-violet-500/20 animate-pulse" />
				</div>
			)}

			{/* 主按钮 */}
			<button
				id="capture-button"
				type="button"
				onClick={handleCapture}
				disabled={status === "capturing" || status === "processing"}
				className={getButtonStyles()}
				title={
					status === "idle"
						? "点击截图并提取待办"
						: status === "capturing"
							? "正在截图..."
							: status === "processing"
								? "正在分析..."
								: status === "success"
									? message
									: message
				}
			>
				{getIcon()}
			</button>

			{/* 成功时显示提取数量徽章 */}
			{status === "success" && createdCount > 0 && (
				<div className="absolute -top-1 -right-1 w-8 h-8 rounded-full bg-emerald-400 text-sm font-bold text-white flex items-center justify-center shadow-md animate-bounce">
					{createdCount}
				</div>
			)}
		</div>
	);
}
