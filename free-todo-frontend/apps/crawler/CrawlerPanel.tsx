"use client";

import {
	AlertCircle,
	Bug,
	ExternalLink,
	Heart,
	Loader2,
	MessageCircle,
	Play,
	RefreshCw,
	Square,
	Video,
	Image as ImageIcon,
	Bookmark,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { PanelHeader } from "@/components/common/layout/PanelHeader";
import { useCrawlerDetailStore } from "@/lib/store/crawler-detail-store";
import { useCrawlerStore } from "@/lib/store/crawler-store";

// 爬虫 API 基础 URL（使用 LifeTrace 主后端）
const CRAWLER_API_URL =
	process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// 类型定义
interface Platform {
	value: string;
	label: string;
	icon: string;
}

interface CrawlerStatus {
	status: "idle" | "running" | "stopping" | "error";
	platform?: string;
	crawler_type?: string;
	started_at?: string;
	error_message?: string;
}

// 爬取结果类型
interface CrawlResult {
	note_id: string;
	type: string;
	title: string;
	desc: string;
	nickname: string;
	avatar: string;
	liked_count: string;
	collected_count: string;
	comment_count: string;
	share_count?: string;
	note_url: string;
	tag_list: string;
	image_list?: string;
}

// 平台图标组件
function PlatformIcon({
	platform,
	className,
}: { platform: string; className?: string }) {
	const iconMap: Record<string, string> = {
		xhs: "📕",
		dy: "🎵",
		ks: "📹",
		bili: "📺",
		wb: "💬",
		tieba: "📝",
		zhihu: "❓",
	};
	return <span className={className}>{iconMap[platform] || "🔍"}</span>;
}

// 格式化数字
function formatCount(count: string | number): string {
	if (typeof count === "number") {
		if (count >= 10000) {
			return `${(count / 10000).toFixed(1)}万`;
		}
		return count.toString();
	}
	return count;
}

// 结果卡片组件
function ResultCard({ result }: { result: CrawlResult }) {
	const t = useTranslations("crawler");
	const { setSelectedItem } = useCrawlerDetailStore();
	
	// 解析话题标签
	const tags = result.tag_list?.split(",").filter(Boolean) || [];
	
	// 查看详情
	const handleViewDetail = () => {
		setSelectedItem(result);
	};
	
	return (
		<div className="rounded-lg border border-border bg-card p-4 hover:bg-muted/30 transition-colors">
			{/* 用户信息 */}
			<div className="flex items-center gap-3 mb-3">
				{result.avatar ? (
					<img
						src={result.avatar}
						alt={result.nickname}
						className="h-10 w-10 rounded-full object-cover"
						onError={(e) => {
							(e.target as HTMLImageElement).src = "";
							(e.target as HTMLImageElement).style.display = "none";
						}}
					/>
				) : (
					<div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
						{result.nickname?.charAt(0) || "?"}
					</div>
				)}
				<span className="font-medium text-sm">{result.nickname}</span>
			</div>

			{/* 标题 */}
			<h3 className="font-medium text-base mb-2 line-clamp-2">
				{result.title}
			</h3>

			{/* 话题标签 */}
			{tags.length > 0 && (
				<div className="flex flex-wrap gap-1 mb-3">
					{tags.slice(0, 5).map((tag, index) => (
						<span
							key={`${tag}-${index}`}
							className="text-xs text-primary/80 hover:text-primary"
						>
							#{tag}[话题]#
						</span>
					))}
					{tags.length > 5 && (
						<span className="text-xs text-muted-foreground">
							+{tags.length - 5}
						</span>
					)}
				</div>
			)}

			{/* 内容类型标记 */}
			<div className="flex items-center gap-1 text-xs text-primary mb-3">
				{result.type === "video" ? (
					<>
						<Video className="h-3.5 w-3.5" />
						<span>{t("containsVideo")}</span>
					</>
				) : (
					<>
						<ImageIcon className="h-3.5 w-3.5" />
						<span>{t("containsImage")}</span>
					</>
				)}
			</div>

			{/* 统计数据 */}
			<div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
				<span className="flex items-center gap-1">
					<Heart className="h-4 w-4" />
					{formatCount(result.liked_count)}
				</span>
				<span className="flex items-center gap-1">
					<MessageCircle className="h-4 w-4" />
					{formatCount(result.comment_count)}
				</span>
				<span className="flex items-center gap-1">
					<Bookmark className="h-4 w-4" />
					{formatCount(result.collected_count)}
				</span>
			</div>

			{/* 查看详情 */}
			<button
				type="button"
				onClick={handleViewDetail}
				className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
			>
				<ExternalLink className="h-3.5 w-3.5" />
				{t("viewDetail")}
			</button>
		</div>
	);
}

export function CrawlerPanel() {
	const t = useTranslations("crawler");

	// 从 store 获取配置
	const {
		platform,
		crawlerType,
		loginType,
		saveOption,
		headless,
		enableComments,
	} = useCrawlerStore();

	// 状态
	const [platforms, setPlatforms] = useState<Platform[]>([]);
	const [status, setStatus] = useState<CrawlerStatus>({ status: "idle" });
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [connected, setConnected] = useState(false);
	const [keywords, setKeywords] = useState("");
	
	// 爬取结果
	const [results, setResults] = useState<CrawlResult[]>([]);
	const [resultsLoading, setResultsLoading] = useState(false);

	// 获取平台列表
	const fetchPlatforms = useCallback(async () => {
		try {
			const res = await fetch(`${CRAWLER_API_URL}/api/crawler/config/platforms`);
			if (res.ok) {
				const data = await res.json();
				setPlatforms(data.platforms);
				setConnected(true);
			}
		} catch {
			setConnected(false);
		}
	}, []);

	// 获取爬虫状态
	const fetchStatus = useCallback(async () => {
		try {
			const res = await fetch(`${CRAWLER_API_URL}/api/crawler/status`);
			if (res.ok) {
				const data = await res.json();
				setStatus(data);
			}
		} catch {
			// 静默失败
		}
	}, []);

	// 获取爬取结果
	const fetchResults = useCallback(async () => {
		setResultsLoading(true);
		try {
			// 获取文件列表
			const filesRes = await fetch(`${CRAWLER_API_URL}/api/crawler/data/files`);
			if (!filesRes.ok) {
				setResults([]);
				return;
			}
			
			const filesData = await filesRes.json();
			const files = filesData.files || [];
			
			// 筛选 contents 文件（不是 comments），按修改时间排序获取最新的
			const contentsFiles = files
				.filter((f: { name: string }) => f.name.includes("contents") && f.name.endsWith(".json"))
				.sort((a: { modified_at: number }, b: { modified_at: number }) => b.modified_at - a.modified_at);
			
			const contentsFile = contentsFiles[0];
			
			if (!contentsFile) {
				setResults([]);
				return;
			}
			
			// 获取文件内容预览，添加时间戳避免缓存，获取更多数据
			const previewRes = await fetch(
				`${CRAWLER_API_URL}/api/crawler/data/preview/${contentsFile.path}?limit=200&t=${Date.now()}`
			);
			
			if (previewRes.ok) {
				const previewData = await previewRes.json();
				const data = previewData.data || [];
				// 按 last_modify_ts 或 time 倒序排列，最新的在前
				const sortedData = [...data].sort((a, b) => {
					const timeA = a.last_modify_ts || a.time || 0;
					const timeB = b.last_modify_ts || b.time || 0;
					return timeB - timeA;
				});
				setResults(sortedData.slice(0, 50));
			} else {
				setResults([]);
			}
		} catch {
			setResults([]);
		} finally {
			setResultsLoading(false);
		}
	}, []);

	// 启动爬虫
	const startCrawler = async () => {
		setError(null);
		setLoading(true);

		try {
			const res = await fetch(`${CRAWLER_API_URL}/api/crawler/start`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					platform: platform,
					crawler_type: crawlerType,
					login_type: loginType,
					keywords: keywords,
					save_option: saveOption,
					headless: headless,
					enable_comments: enableComments,
				}),
			});

			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.detail || t("startFailed"));
			}

			await fetchStatus();
		} catch (err) {
			setError(err instanceof Error ? err.message : t("startFailed"));
		} finally {
			setLoading(false);
		}
	};

	// 停止爬虫
	const stopCrawler = async () => {
		setLoading(true);
		try {
			const res = await fetch(`${CRAWLER_API_URL}/api/crawler/stop`, {
				method: "POST",
			});

			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.detail || t("stopFailed"));
			}

			await fetchStatus();
			// 停止后刷新结果
			await fetchResults();
		} catch (err) {
			setError(err instanceof Error ? err.message : t("stopFailed"));
		} finally {
			setLoading(false);
		}
	};

	// 初始化
	useEffect(() => {
		fetchPlatforms();
		fetchStatus();
		fetchResults();

		const statusInterval = setInterval(() => {
			fetchStatus();
		}, 5000);

		return () => {
			clearInterval(statusInterval);
		};
	}, [fetchPlatforms, fetchStatus, fetchResults]);

	// 爬虫运行时定期刷新结果
	useEffect(() => {
		if (status.status === "running") {
			// 运行时每 10 秒刷新一次结果
			const resultsInterval = setInterval(() => {
				fetchResults();
			}, 10000);
			return () => clearInterval(resultsInterval);
		}
		// 状态变为 idle 时立即刷新
		if (status.status === "idle") {
			fetchResults();
		}
	}, [status.status, fetchResults]);

	// 获取当前平台名称
	const currentPlatformLabel =
		platforms.find((p) => p.value === platform)?.label || platform;

	return (
		<div className="flex h-full flex-col overflow-hidden bg-background">
			<PanelHeader icon={Bug} title={t("title")} />

			{/* 连接状态 */}
			{!connected && (
				<div className="flex items-center gap-2 border-b border-border bg-yellow-500/10 px-4 py-2 text-sm text-yellow-600 dark:text-yellow-400">
					<AlertCircle className="h-4 w-4" />
					<span>{t("notConnected")}</span>
					<button
						type="button"
						onClick={fetchPlatforms}
						className="ml-auto flex items-center gap-1 rounded px-2 py-1 hover:bg-yellow-500/20"
					>
						<RefreshCw className="h-3 w-3" />
						{t("retry")}
					</button>
				</div>
			)}

			{/* 错误提示 */}
			{error && (
				<div className="flex items-center gap-2 border-b border-border bg-red-500/10 px-4 py-2 text-sm text-red-600 dark:text-red-400">
					<AlertCircle className="h-4 w-4" />
					<span>{error}</span>
					<button
						type="button"
						onClick={() => setError(null)}
						className="ml-auto hover:text-red-800 dark:hover:text-red-200"
					>
						×
					</button>
				</div>
			)}

			<div className="flex-1 overflow-y-auto p-4">
				<div className="mx-auto max-w-2xl">
					{/* 状态卡片 */}
					<div className="mb-4 rounded-lg border border-border bg-card p-3">
						<div className="flex items-center justify-between">
							<span className="text-sm text-muted-foreground">
								{t("status")}
							</span>
							<span
								className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
									status.status === "running"
										? "bg-green-500/10 text-green-600 dark:text-green-400"
										: status.status === "stopping"
											? "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400"
											: status.status === "error"
												? "bg-red-500/10 text-red-600 dark:text-red-400"
												: "bg-gray-500/10 text-gray-600 dark:text-gray-400"
								}`}
							>
								{status.status === "running" && (
									<span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
								)}
								{t(`statusLabel.${status.status}`)}
							</span>
						</div>
						{/* 显示当前配置的平台 */}
						<div className="mt-2 text-xs text-muted-foreground">
							<PlatformIcon platform={platform} className="mr-1" />
							{currentPlatformLabel}
						</div>
					</div>

					{/* 搜索关键词 */}
					{crawlerType === "search" && (
						<div className="mb-4">
							<label className="mb-1.5 block text-sm font-medium">
								{t("keywords")}
							</label>
							<input
								type="text"
								value={keywords}
								onChange={(e) => setKeywords(e.target.value)}
								disabled={status.status === "running"}
								placeholder={t("keywordsPlaceholder")}
								className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
							/>
						</div>
					)}

					{/* 操作按钮 */}
					<div className="mb-6">
						{status.status === "running" ? (
							<button
								type="button"
								onClick={stopCrawler}
								disabled={loading}
								className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-50"
							>
								{loading ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : (
									<Square className="h-4 w-4" />
								)}
								{t("stop")}
							</button>
						) : (
							<button
								type="button"
								onClick={startCrawler}
								disabled={loading || !connected}
								className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
							>
								{loading ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : (
									<Play className="h-4 w-4" />
								)}
								{t("start")}
							</button>
						)}
					</div>

					{/* 爬取结果 */}
					<div className="border-t border-border pt-4">
						<div className="flex items-center justify-between mb-4">
							<h3 className="text-sm font-medium">
								{t("results")}
								{results.length > 0 && (
									<span className="ml-2 text-muted-foreground">
										({results.length})
									</span>
								)}
							</h3>
							<button
								type="button"
								onClick={fetchResults}
								disabled={resultsLoading}
								className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
							>
								<RefreshCw className={`h-3 w-3 ${resultsLoading ? "animate-spin" : ""}`} />
								{t("refresh")}
							</button>
						</div>

						{resultsLoading ? (
							<div className="flex items-center justify-center py-12">
								<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
							</div>
						) : results.length > 0 ? (
							<div className="space-y-4">
								{results.map((result, index) => (
									<ResultCard key={`${result.note_id}-${index}`} result={result} />
								))}
							</div>
						) : (
							<div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
								<Bug className="h-12 w-12 mb-3 opacity-30" />
								<p className="text-sm">{t("noResults")}</p>
								<p className="text-xs mt-1">{t("startCrawlerHint")}</p>
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
