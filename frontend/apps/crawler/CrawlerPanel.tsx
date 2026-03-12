"use client";

import { Bug, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { PanelHeader } from "@/components/common/layout/PanelHeader";
import { PluginInstallGuide, ResultList, SearchInput, StartButton, StatusBar } from "./components";
import { useCrawlerStore } from "./store";

/**
 * 爬虫面板组件 - 媒体爬虫主界面
 *
 * 启动流程：
 * 1. 首先检查插件状态（checkPluginStatus / fetchCrawlerStatus）
 * 2. 如果插件不可用 → 显示 PluginInstallGuide 安装引导
 * 3. 如果插件可用 → 显示正常爬虫界面
 */
export function CrawlerPanel() {
	const t = useTranslations("page");
	const {
		pluginAvailable,
		pluginChecked,
		checkPluginStatus,
		fetchDailySummary,
		fetchCrawlerStatus,
		loadConfigFromBackend,
		startCrawler,
	} = useCrawlerStore();

	const hasAutoStarted = useRef(false);

	// 组件挂载时先检查插件状态
	useEffect(() => {
		checkPluginStatus();
	}, [checkPluginStatus]);

	// 插件可用后，自动启动爬虫并显示热点速递
	useEffect(() => {
		if (!pluginAvailable) return;

		const initAndAutoStart = async () => {
			// 先加载后端配置
			await loadConfigFromBackend();
			// 获取爬虫状态
			await fetchCrawlerStatus();

			// 获取最新状态
			const currentState = useCrawlerStore.getState();

			// 如果爬虫没有在运行，且有关键词，则自动启动
			if (!hasAutoStarted.current && currentState.status !== "running" && currentState.keywords.trim()) {
				hasAutoStarted.current = true;
				console.log("[Crawler] 自动启动爬虫...");
				startCrawler();
			}

			// 自动显示热点速递界面并加载数据和 AI 摘要
			console.log("[Crawler] 自动显示热点速递...");
			fetchDailySummary();
		};

		initAndAutoStart();

		// 每 5 秒轮询一次状态
		const intervalId = setInterval(() => {
			fetchCrawlerStatus();
		}, 5000);

		return () => clearInterval(intervalId);
	}, [pluginAvailable, loadConfigFromBackend, fetchCrawlerStatus, startCrawler, fetchDailySummary]);

	// ----------- 渲染 -----------

	// 1. 插件状态检查中 → 加载骨架
	if (!pluginChecked) {
		return (
			<div className="relative flex h-full flex-col overflow-hidden bg-background">
				<PanelHeader icon={Bug} title={t("crawlerLabel")} />
				<div className="flex flex-1 items-center justify-center">
					<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
				</div>
			</div>
		);
	}

	// 2. 插件不可用 → 安装引导
	if (!pluginAvailable) {
		return (
			<div className="relative flex h-full flex-col overflow-hidden bg-background">
				<PanelHeader icon={Bug} title={t("crawlerLabel")} />
				<PluginInstallGuide />
			</div>
		);
	}

	// 3. 插件可用 → 正常爬虫界面
	return (
		<div className="relative flex h-full flex-col overflow-hidden bg-background">
			{/* 顶部标题栏 */}
			<PanelHeader
				icon={Bug}
				title={t("crawlerLabel")}
			/>

			{/* 爬虫控制区域 - 整体可滚动 */}
			<div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
				{/* 状态栏 */}
				<div>
					<StatusBar />
				</div>

				{/* 搜索输入 */}
				<div className="mt-4">
					<SearchInput />
				</div>

				{/* 启动按钮 */}
				<div className="mt-4">
					<StartButton />
				</div>

				{/* 结果列表 */}
				<div className="mt-4">
					<ResultList />
				</div>
			</div>
		</div>
	);
}
