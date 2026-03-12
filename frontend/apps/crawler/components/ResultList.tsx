"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useCrawlerStore } from "../store";
import { ResultCard } from "./ResultCard";

/**
 * 爬取结果列表组件
 */
export function ResultList() {
	const { results, totalCount, status, refreshResults, loadConfigFromBackend, showDailySummary } = useCrawlerStore();
	const [isInitialLoading, setIsInitialLoading] = useState(true);
	const isRefreshing = status === "running";

	// 组件挂载时：先加载配置，再加载已有的爬取结果
	// 注意：如果热点速递面板正在显示，不要刷新结果（因为热点速递需要显示所有平台的数据）
	useEffect(() => {
		const loadInitialResults = async () => {
			// 如果热点速递面板正在显示，跳过自动刷新（避免覆盖所有平台的数据）
			if (showDailySummary) {
				setIsInitialLoading(false);
				return;
			}

			setIsInitialLoading(true);
			// 先加载后端配置（确保 platform 是正确的）
			await loadConfigFromBackend();
			// 再刷新结果
			await refreshResults();
			setIsInitialLoading(false);
		};
		loadInitialResults();
	}, [showDailySummary]);

	const handleRefresh = async () => {
		await refreshResults();
	};

	return (
		<div className="flex flex-col">
			{/* 标题栏 */}
			<div className="flex items-center justify-between py-3">
				<div className="flex items-center gap-2">
					<span className="text-sm font-medium text-foreground">爬取结果</span>
					<span className="text-sm text-muted-foreground">({totalCount})</span>
				</div>
				<button
					type="button"
					onClick={handleRefresh}
					disabled={isRefreshing}
					className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
				>
					<RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
					刷新
				</button>
			</div>

			{/* 结果列表 */}
			<div>
				{isInitialLoading ? (
					<div className="flex h-32 flex-col items-center justify-center gap-3">
						<div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
						<span className="text-sm text-muted-foreground">正在加载数据...</span>
					</div>
				) : results.length === 0 ? (
					<div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
						{isRefreshing ? "正在爬取中..." : "暂无数据，请输入关键词并启动爬虫"}
					</div>
				) : (
					<div className="space-y-3 pb-4">
						{results.map((item, index) => (
							<ResultCard key={item.id || item.noteId || `item-${index}`} item={item} />
						))}
					</div>
				)}
			</div>
		</div>
	);
}
