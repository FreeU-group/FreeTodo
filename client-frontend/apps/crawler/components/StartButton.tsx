"use client";

import { Play, Square } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useCrawlerStore } from "../store";

/**
 * 启动/停止爬虫按钮
 */
export function StartButton() {
	const { status, keywords, startCrawler, stopCrawler } = useCrawlerStore();
	const [isStopping, setIsStopping] = useState(false);
	const isRunning = status === "running";
	const canStart = keywords.trim().length > 0 && !isRunning;

	const handleClick = async () => {
		if (isRunning) {
			setIsStopping(true);
			await stopCrawler();
			setIsStopping(false);
		} else if (canStart) {
			await startCrawler();
		}
	};

	return (
		<button
			type="button"
			onClick={handleClick}
			disabled={!canStart && !isRunning}
			className={cn(
				"flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-medium transition-all",
				isRunning
					? "bg-red-500 text-white hover:bg-red-600"
					: canStart
						? "bg-primary text-primary-foreground hover:bg-primary/90"
						: "cursor-not-allowed bg-muted text-muted-foreground",
			)}
		>
			{isRunning ? (
				<>
					<Square className="h-4 w-4" />
					{isStopping ? "正在停止..." : "停止爬取"}
				</>
			) : (
				<>
					<Play className="h-4 w-4" />
					启动爬虫
				</>
			)}
		</button>
	);
}
