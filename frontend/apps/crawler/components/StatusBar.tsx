"use client";

import { cn } from "@/lib/utils";
import { useCrawlerStore } from "../store";
import type { CrawlerPlatform } from "../types";
import { PLATFORMS } from "../types";

/**
 * 状态栏组件 - 显示当前爬虫状态和平台选择（多选）
 */
export function StatusBar() {
	const { status, platforms, togglePlatform, setPlatforms } = useCrawlerStore();

	const statusText = {
		idle: "空闲",
		running: "运行中",
		paused: "已暂停",
		error: "错误",
	};

	const statusColor = {
		idle: "text-green-400",
		running: "text-blue-400",
		paused: "text-yellow-400",
		error: "text-red-400",
	};

	const handlePlatformClick = (platformId: CrawlerPlatform) => {
		// 爬虫运行中不允许修改平台
		if (status === "running") return;
		togglePlatform(platformId);
	};

	// 检查是否已全选
	const isAllSelected = platforms.length === PLATFORMS.length;

	// 全选/取消全选按钮处理
	const handleSelectAll = () => {
		if (status === "running") return;
		if (isAllSelected) {
			// 如果已全选，取消全选（保留第一个平台，因为至少需要一个）
			setPlatforms(["xhs"]);
		} else {
			// 全选所有平台
			setPlatforms(PLATFORMS.map(p => p.id));
		}
	};

	return (
		<div className="rounded-lg border border-border bg-card/50 p-4">
			<div className="flex items-center justify-between">
				<span className="text-sm text-muted-foreground">状态</span>
				<span className={cn("text-sm font-medium", statusColor[status])}>
					{statusText[status]}
				</span>
			</div>

			{/* 平台多选 */}
			<div className="mt-3">
				<div className="flex items-center justify-between">
					<span className="text-sm text-muted-foreground">爬取平台</span>
					<button
						type="button"
						onClick={handleSelectAll}
						disabled={status === "running"}
						className={cn(
							"rounded px-2 py-0.5 text-xs transition-all",
							isAllSelected
								? "bg-primary/20 text-primary hover:bg-primary/30"
								: "bg-muted/50 text-muted-foreground hover:bg-muted/80",
							status === "running" && "cursor-not-allowed opacity-50"
						)}
					>
						{isAllSelected ? "取消全选" : "全选"}
					</button>
				</div>
				<div className="mt-2 grid grid-cols-4 gap-2">
					{PLATFORMS.map((platform) => {
						const isSelected = platforms.includes(platform.id);
						return (
							<button
								key={platform.id}
								type="button"
								onClick={() => handlePlatformClick(platform.id)}
								disabled={status === "running"}
								className={cn(
									"flex items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-xs transition-all",
									isSelected
										? "border-primary/50 bg-primary/10 text-foreground"
										: "border-border bg-card/30 text-muted-foreground hover:border-border/80 hover:bg-card/50",
									status === "running" && "cursor-not-allowed opacity-50"
								)}
							>
								<span
									className="inline-block h-2.5 w-2.5 rounded-full"
									style={{ backgroundColor: platform.color }}
								/>
								<span className="truncate">{platform.name}</span>
							</button>
						);
					})}
				</div>
				{/* 全选时显示爬取顺序提示 */}
				{isAllSelected && (
					<p className="mt-2 text-xs text-muted-foreground">
						全选模式：按固定顺序爬取（小红书 → 抖音 → 哔哩哔哩 → 微博 → 快手 → 知乎 → 贴吧），每个平台间隔 3-5 秒，每轮间隔 50-70 分钟
					</p>
				)}
			</div>
		</div>
	);
}
