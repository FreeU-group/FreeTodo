"use client";

import { Check, ClipboardList, Square } from "lucide-react";
import { useTranslations } from "next-intl";
import { getScreenshotImage } from "@/lib/api";
import type { Event, Screenshot } from "@/lib/types";
import {
	calculateDuration,
	cn,
	formatDateTime,
	formatDuration,
} from "@/lib/utils";
import { isWhitelistApp } from "../utils";

interface EventCardProps {
	event: Event;
	screenshots: Screenshot[];
	isSelected: boolean;
	isExtracting: boolean;
	isMobile: boolean;
	onToggleSelection: (eventId: number, e?: React.MouseEvent) => void;
	onExtractTodos: (eventId: number, appName: string) => void;
	onScreenshotClick: (screenshot: Screenshot) => void;
}

/**
 * 事件卡片组件
 * 显示单个事件的详情，包括截图缩略图、时间、应用信息等
 */
export function EventCard({
	event,
	screenshots,
	isSelected,
	isExtracting,
	isMobile,
	onToggleSelection,
	onExtractTodos,
	onScreenshotClick,
}: EventCardProps) {
	const t = useTranslations("todoExtraction");
	const tDebug = useTranslations("debugCapture");

	const duration = event.endTime
		? calculateDuration(event.startTime, event.endTime)
		: null;

	// 合并所有截图的 OCR 文本
	const allOcrText = screenshots
		.map((s: Screenshot) => s.ocrResult?.textContent)
		.filter(Boolean)
		.join("\n\n");

	return (
		<div className="relative">
			<div
				role="button"
				tabIndex={0}
				className={cn(
					"ml-0 border rounded-lg hover:border-primary/50 transition-colors p-3 sm:p-4 bg-card cursor-pointer relative group",
					isSelected ? "border-primary bg-primary/5" : "border-border",
				)}
				onClick={() => onToggleSelection(event.id)}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						onToggleSelection(event.id);
					}
				}}
			>
				{/* 选择按钮 */}
				<button
					type="button"
					onClick={(e) => onToggleSelection(event.id, e)}
					className={cn(
						"absolute left-2 bottom-2 z-10 rounded p-0.5 transition-all",
						isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
						"hover:bg-muted",
					)}
					aria-label={isSelected ? tDebug("deselect") : tDebug("select")}
				>
					{isSelected ? (
						<Check className="h-5 w-5 text-primary" />
					) : (
						<Square className="h-5 w-5 text-primary/60 transition-colors" />
					)}
				</button>

				{/* 提取待办按钮（仅白名单应用显示） */}
				{isWhitelistApp(event.appName) && (
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onExtractTodos(event.id, event.appName);
						}}
						disabled={isExtracting}
						className={cn(
							"absolute right-2 top-2 z-50",
							"flex items-center gap-1.5",
							"rounded-md px-2 py-1.5",
							"text-xs font-medium",
							"bg-background/95 backdrop-blur-sm text-primary border border-primary/30 shadow-lg",
							"hover:bg-background hover:border-primary/50",
							"transition-all",
							"opacity-0 group-hover:opacity-100",
							"disabled:opacity-50 disabled:cursor-not-allowed",
						)}
						aria-label={t("extractButton")}
					>
						{isExtracting ? (
							<>
								<div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
								<span className="hidden sm:inline">{t("extracting")}</span>
							</>
						) : (
							<>
								<ClipboardList className="h-3.5 w-3.5" />
								<span className="hidden sm:inline">{t("extractButton")}</span>
							</>
						)}
					</button>
				)}

				<div className="flex flex-col sm:flex-row gap-4">
					{/* 事件信息 */}
					<div className="flex-1 min-w-0 space-y-2">
						<div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 flex-wrap">
							<h3 className="text-sm sm:text-base font-semibold text-foreground wrap-break-word">
								{event.windowTitle || tDebug("unknownWindow")}
							</h3>
							<span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
								{event.appName}
							</span>
						</div>

						<div className="text-xs sm:text-sm text-muted-foreground">
							{formatDateTime(event.startTime, "MM/DD HH:mm")}
							{event.endTime && (
								<>
									{" - "}
									{formatDateTime(event.endTime, "MM/DD HH:mm")}
								</>
							)}
							{duration !== null ? (
								<span>
									{" "}
									({tDebug("duration", { duration: formatDuration(duration) })})
								</span>
							) : (
								<span className="text-green-600 dark:text-green-400">
									{" "}
									({tDebug("inProgress")})
								</span>
							)}
						</div>

						<div className="text-xs sm:text-sm text-foreground/80 leading-relaxed line-clamp-2 sm:line-clamp-none">
							{event.aiSummary ||
								allOcrText?.slice(0, 100) +
									(allOcrText?.length > 100 ? "..." : "") ||
								tDebug("noDescription")}
						</div>
					</div>

					{/* 截图缩略图 */}
					{screenshots.length > 0 && (
						<ScreenshotThumbnails
							eventId={event.id}
							screenshots={screenshots}
							isMobile={isMobile}
							onScreenshotClick={onScreenshotClick}
						/>
					)}
				</div>
			</div>
		</div>
	);
}

interface ScreenshotThumbnailsProps {
	eventId: number;
	screenshots: Screenshot[];
	isMobile: boolean;
	onScreenshotClick: (screenshot: Screenshot) => void;
}

/**
 * 截图缩略图组件
 * 显示堆叠的截图缩略图，支持点击查看大图
 */
function ScreenshotThumbnails({
	eventId,
	screenshots,
	isMobile,
	onScreenshotClick,
}: ScreenshotThumbnailsProps) {
	const tDebug = useTranslations("debugCapture");

	return (
		<div className="shrink-0 flex justify-start sm:justify-end w-full sm:w-auto">
			<div
				className="relative h-24 sm:h-32"
				style={{
					width: `calc(${Math.min(screenshots.length, 10)} * 16px + 96px)`,
				}}
			>
				{screenshots.slice(0, 10).map((screenshot: Screenshot, index: number) => {
					const zIndex = 10 - index;
					const isLast = index === screenshots.length - 1 || index === 9;

					return (
						<button
							type="button"
							key={`${eventId}-${screenshot.id}`}
							className="absolute cursor-pointer transition-all duration-200 hover:scale-105 hover:z-50 border-0 bg-transparent p-0 top-0"
							style={{
								left: isMobile ? `${index * 16}px` : `${index * 20}px`,
								zIndex: zIndex,
							}}
							onClick={(e) => {
								e.stopPropagation();
								onScreenshotClick(screenshot);
							}}
						>
							<div className="relative rounded-md overflow-hidden border border-border bg-muted w-24 h-24 sm:w-32 sm:h-32 shadow-sm">
								{/* biome-ignore lint/performance/noImgElement: 使用动态URL，Next.js Image需要已知域名 */}
								<img
									src={getScreenshotImage(screenshot.id)}
									alt={`${tDebug("screenshot")} ${index + 1}`}
									className="w-full h-full object-cover"
									loading="lazy"
									onError={(e) => {
										const target = e.currentTarget;
										target.style.display = "none";
										const errorDiv = document.createElement("div");
										errorDiv.className =
											"flex h-full w-full items-center justify-center text-muted-foreground text-xs bg-destructive/10";
										errorDiv.textContent = tDebug("loadFailed");
										if (target.parentElement) {
											target.parentElement.appendChild(errorDiv);
										}
									}}
								/>
								{isLast && screenshots.length > 10 && (
									<div className="absolute inset-0 bg-[oklch(var(--overlay))] flex items-center justify-center">
										<span className="text-[oklch(var(--foreground))] font-semibold text-xs">
											+{screenshots.length - 10}
										</span>
									</div>
								)}
							</div>
						</button>
					);
				})}
				<div className="absolute bottom-0 right-0 rounded-md bg-[oklch(var(--overlay))] px-1.5 sm:px-2 py-0.5 sm:py-1 text-[10px] sm:text-xs font-semibold text-[oklch(var(--foreground))] z-60 pointer-events-none">
					{tDebug("screenshotCount", { count: screenshots.length })}
				</div>
			</div>
		</div>
	);
}
