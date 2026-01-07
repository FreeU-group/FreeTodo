"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { getScreenshotImage } from "@/lib/api";
import type { Screenshot } from "@/lib/types";
import { cn, formatDateTime } from "@/lib/utils";

interface ScreenshotModalProps {
	screenshot: Screenshot;
	screenshots?: Screenshot[];
	onClose: () => void;
}

/**
 * 截图模态框组件
 * 支持预览截图、左右切换浏览、显示截图详情和 OCR 结果
 */
export function ScreenshotModal({
	screenshot,
	screenshots,
	onClose,
}: ScreenshotModalProps) {
	const t = useTranslations("debugCapture");
	const allScreenshots = screenshots || [screenshot];
	const initialIndex = allScreenshots.findIndex((s) => s.id === screenshot.id);
	const [currentIndex, setCurrentIndex] = useState(
		initialIndex >= 0 ? initialIndex : 0,
	);
	const [isOpen, setIsOpen] = useState(false);
	const [imageError, setImageError] = useState(false);
	const [imageLoading, setImageLoading] = useState(true);
	const currentScreenshot = allScreenshots[currentIndex];

	// 上一张
	const goToPrevious = useCallback(() => {
		setCurrentIndex((prev) =>
			prev > 0 ? prev - 1 : allScreenshots.length - 1,
		);
		setImageError(false);
		setImageLoading(true);
	}, [allScreenshots.length]);

	// 下一张
	const goToNext = useCallback(() => {
		setCurrentIndex((prev) =>
			prev < allScreenshots.length - 1 ? prev + 1 : 0,
		);
		setImageError(false);
		setImageLoading(true);
	}, [allScreenshots.length]);

	useEffect(() => {
		setIsOpen(true);
		document.body.style.overflow = "hidden";

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onClose();
			} else if (e.key === "ArrowLeft") {
				goToPrevious();
			} else if (e.key === "ArrowRight") {
				goToNext();
			}
		};
		document.addEventListener("keydown", handleKeyDown);

		return () => {
			document.body.style.overflow = "unset";
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [onClose, goToPrevious, goToNext]);

	useEffect(() => {
		const newIndex = allScreenshots.findIndex((s) => s.id === screenshot.id);
		if (newIndex >= 0) {
			setCurrentIndex(newIndex);
			setImageError(false);
			setImageLoading(true);
		}
	}, [screenshot.id, allScreenshots]);

	return (
		<div
			role="button"
			tabIndex={0}
			className={cn(
				"fixed inset-0 z-200 flex items-center justify-center p-4",
				"bg-black/80 backdrop-blur-sm",
				"transition-opacity duration-200",
				isOpen ? "opacity-100" : "opacity-0",
			)}
			onClick={onClose}
			onKeyDown={(e) => {
				if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
					onClose();
				}
			}}
		>
			<div
				role="dialog"
				className={cn(
					"relative w-full max-w-5xl max-h-[90vh]",
					"bg-background border border-border",
					"rounded-lg shadow-lg",
					"overflow-hidden",
					"transition-all duration-200",
					isOpen ? "scale-100 opacity-100" : "scale-95 opacity-0",
				)}
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => {
					// 阻止键盘事件冒泡，但不处理任何键盘操作
					e.stopPropagation();
				}}
			>
				{/* 头部 */}
				<div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/95 backdrop-blur-sm px-4 py-3">
					<h2 className="text-xl font-semibold">{t("screenshotDetail")}</h2>
					<button
						type="button"
						onClick={onClose}
						className={cn(
							"rounded-md p-1.5",
							"text-muted-foreground hover:text-foreground",
							"hover:bg-muted",
							"transition-colors",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
						)}
						aria-label={t("close")}
					>
						<X className="h-5 w-5" />
					</button>
				</div>

				<div className="overflow-y-auto max-h-[calc(90vh-65px)]">
					<div className="space-y-0">
						{/* 图片预览区域 */}
						<div className="relative overflow-hidden bg-muted/30 min-h-[400px] flex items-center justify-center">
							{imageLoading && !imageError && (
								<div className="absolute inset-0 flex items-center justify-center bg-muted/50">
									<div className="text-center">
										<div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent" />
										<p className="mt-2 text-sm text-muted-foreground">
											{t("loading")}
										</p>
									</div>
								</div>
							)}
							{imageError ? (
								<div className="flex h-full w-full items-center justify-center text-muted-foreground">
									<div className="text-center">
										<svg
											className="mx-auto h-12 w-12"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											role="img"
											aria-label={t("loadFailed")}
										>
											<title>{t("loadFailed")}</title>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth={2}
												d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
											/>
										</svg>
										<p className="mt-2 text-sm font-medium">
											{t("imageLoadFailed")}
										</p>
										<p className="mt-1 text-xs text-muted-foreground">
											{t("screenshotId")}: {currentScreenshot.id}
										</p>
									</div>
								</div>
							) : (
								// biome-ignore lint/performance/noImgElement: 使用动态URL，Next.js Image需要已知域名
								<img
									key={currentScreenshot.id}
									src={getScreenshotImage(currentScreenshot.id)}
									alt={t("screenshot")}
									className={`w-full h-auto object-contain ${imageLoading ? "opacity-0" : "opacity-100"} transition-opacity`}
									onLoad={() => {
										setImageLoading(false);
										setImageError(false);
									}}
									onError={() => {
										setImageError(true);
										setImageLoading(false);
									}}
								/>
							)}

							{/* 图片计数器 */}
							{allScreenshots.length > 1 && (
								<div className="absolute bottom-3 right-3 rounded-md bg-black/80 backdrop-blur-sm px-3 py-1.5 text-sm font-medium text-white shadow-lg">
									{currentIndex + 1} / {allScreenshots.length}
								</div>
							)}

							{/* 导航按钮 */}
							{allScreenshots.length > 1 && (
								<>
									<button
										type="button"
										onClick={(e) => {
											e.stopPropagation();
											goToPrevious();
										}}
										className={cn(
											"absolute left-3 top-1/2 -translate-y-1/2",
											"rounded-md bg-background/90 backdrop-blur-sm border border-border",
											"p-2 text-foreground",
											"shadow-lg",
											"transition-all",
											"hover:bg-background hover:scale-105",
											"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
										)}
										aria-label={t("previous")}
									>
										<ChevronLeft className="h-5 w-5" />
									</button>
									<button
										type="button"
										onClick={(e) => {
											e.stopPropagation();
											goToNext();
										}}
										className={cn(
											"absolute right-3 top-1/2 -translate-y-1/2",
											"rounded-md bg-background/90 backdrop-blur-sm border border-border",
											"p-2 text-foreground",
											"shadow-lg",
											"transition-all",
											"hover:bg-background hover:scale-105",
											"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
										)}
										aria-label={t("next")}
									>
										<ChevronRight className="h-5 w-5" />
									</button>
								</>
							)}
						</div>

						{/* 详情信息 */}
						<div className="border-t border-border p-4 space-y-4">
							<h3 className="text-base font-semibold">{t("details")}</h3>
							<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
								<div className="space-y-1">
									<div className="text-sm font-medium text-muted-foreground">
										{t("time")}
									</div>
									<div className="text-sm text-foreground">
										{formatDateTime(
											currentScreenshot.createdAt,
											"YYYY-MM-DD HH:mm:ss",
										)}
									</div>
								</div>
								<div className="space-y-1">
									<div className="text-sm font-medium text-muted-foreground">
										{t("app")}
									</div>
									<div className="text-sm text-foreground">
										{currentScreenshot.appName || t("unknown")}
									</div>
								</div>
								<div className="space-y-1 sm:col-span-2">
									<div className="text-sm font-medium text-muted-foreground">
										{t("windowTitle")}
									</div>
									<div className="text-sm text-foreground">
										{currentScreenshot.windowTitle || t("none")}
									</div>
								</div>
								<div className="space-y-1">
									<div className="text-sm font-medium text-muted-foreground">
										{t("size")}
									</div>
									<div className="text-sm text-foreground">
										{currentScreenshot.width} × {currentScreenshot.height}
									</div>
								</div>
							</div>

							{/* OCR 结果 */}
							{currentScreenshot.ocrResult?.textContent && (
								<div className="space-y-2 pt-4 border-t border-border">
									<div className="text-sm font-medium text-muted-foreground">
										{t("ocrResult")}
									</div>
									<div className="rounded-md border border-border bg-muted/50 p-4 max-h-64 overflow-y-auto">
										<pre className="whitespace-pre-wrap text-sm text-foreground leading-relaxed font-mono">
											{currentScreenshot.ocrResult.textContent}
										</pre>
									</div>
								</div>
							)}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
