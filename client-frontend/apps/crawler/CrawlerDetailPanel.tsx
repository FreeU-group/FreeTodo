"use client";

import {
	Bookmark,
	ChevronUp,
	ExternalLink,
	Heart,
	Image as ImageIcon,
	Loader2,
	MessageCircle,
	Newspaper,
	Play,
	RefreshCw,Search,
	Share2,
	Sparkles,
	ThumbsUp,
	X
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PanelHeader } from "@/components/common/layout/PanelHeader";
import { cn } from "@/lib/utils";
import { useCrawlerStore } from "./store";
import type { CrawlResultItem } from "./types";

/**
 * 处理高亮标记的组件
 * 将 ==text== 格式转换为高亮显示，并支持点击跳转
 * 只高亮较短的关键词（<=10个字符），避免过多高亮影响阅读
 */
interface HighlightedTextProps {
	children: React.ReactNode;
	onHighlightClick?: (text: string) => void;
}

// 高亮关键词的最大长度
const MAX_HIGHLIGHT_LENGTH = 10;

function HighlightedText({ children, onHighlightClick }: HighlightedTextProps) {
	if (typeof children !== "string") {
		return <>{children}</>;
	}

	// 使用正则匹配 ==text== 格式
	const parts = children.split(/(==.*?==)/g);

	return (
		<>
			{parts.map((part, index) => {
				if (part.startsWith("==") && part.endsWith("==")) {
					// 提取高亮内容
					const highlightedText = part.slice(2, -2);

					// 只高亮短文本（关键词），长文本直接显示为普通加粗文本
					if (highlightedText.length <= MAX_HIGHLIGHT_LENGTH) {
						return (
							<span
								key={index}
								className={cn(
									"bg-indigo-600/40 text-indigo-100 border border-indigo-400/30 px-2 py-0.5 rounded-md mx-0.5 text-[0.95em] font-semibold inline-block leading-snug",
									onHighlightClick && "cursor-pointer hover:bg-indigo-500/50 hover:border-indigo-400/50 transition-all"
								)}
								onClick={() => onHighlightClick?.(highlightedText)}
								onKeyDown={(e) => {
									if (e.key === "Enter" || e.key === " ") {
										onHighlightClick?.(highlightedText);
									}
								}}
								role={onHighlightClick ? "button" : undefined}
								tabIndex={onHighlightClick ? 0 : undefined}
								title={onHighlightClick ? `点击查看相关内容: ${highlightedText}` : undefined}
							>
								{highlightedText}
							</span>
						);
					}
					// 长文本显示为白色粗体
					return <strong key={index} className="text-white font-semibold tracking-wide">{highlightedText}</strong>;
				}
				return <span key={index} className="opacity-90">{part}</span>;
			})}
		</>
	);
}


/**
 * 平台 Logo 组件
 */
function PlatformLogo({ platform, size = "normal" }: { platform: string; size?: "small" | "normal" | "large" }) {
	const sizeClasses = {
		small: "w-5 h-5",
		normal: "w-7 h-7",
		large: "w-9 h-9",
	};

	// 使用图片的平台
	const platformImages: Record<string, string> = {
		xhs: "/platform-logos/xhs.png",
		douyin: "/platform-logos/douyin.png",
		kuaishou: "/platform-logos/kuaishou.png",
		tieba: "/platform-logos/tieba.png",
		bilibili: "/platform-logos/bilibili.png",
		zhihu: "/platform-logos/zhihu.png",
		weibo: "/platform-logos/weibo.png",
	};

	// 其他平台使用文字（没有图片logo的平台）- 目前所有平台都有图片logo
	const platformConfig: Record<string, { bg: string; text: string; label: string }> = {};

	// 平台名称映射
	const platformNames: Record<string, string> = {
		xhs: "小红书",
		douyin: "抖音",
		kuaishou: "快手",
		tieba: "贴吧",
		bilibili: "哔哩哔哩",
		zhihu: "知乎",
		weibo: "微博",
	};

	// 如果有图片logo，使用图片
	if (platformImages[platform]) {
		return (
			<div
				className={cn(
					"absolute top-2 right-2",
					sizeClasses[size]
				)}
				title={platformNames[platform] || platform}
			>
				<img
					src={platformImages[platform]}
					alt={platform}
					className="w-full h-full object-contain"
				/>
			</div>
		);
	}

	// 其他平台使用文字
	const config = platformConfig[platform];
	if (!config) return null;

	return (
		<div
			className={cn(
				"absolute top-2 right-2 rounded-lg flex items-center justify-center font-bold shadow-md text-[10px]",
				sizeClasses[size],
				config.bg,
				config.text
			)}
			title={config.label}
		>
			{config.label.slice(0, 1)}
		</div>
	);
}

/**
 * 从 URL 获取平台类型
 */
function getPlatformFromNoteUrl(url: string): string {
	if (!url) return "";
	if (url.includes("douyin.com")) return "douyin";
	if (url.includes("xiaohongshu.com")) return "xhs";
	if (url.includes("bilibili.com")) return "bilibili";
	if (url.includes("weibo.com") || url.includes("weibo.cn")) return "weibo";
	if (url.includes("kuaishou.com")) return "kuaishou";
	if (url.includes("zhihu.com")) return "zhihu";
	if (url.includes("tieba.baidu.com")) return "tieba";
	return "";
}

/**
 * 报纸风格的文章卡片组件
 */
interface ArticleCardProps {
	item: CrawlResultItem;
	size: "hero" | "large" | "medium" | "small" | "mini";
	onClick: () => void;
}

export function ArticleCard({ item, size, onClick }: ArticleCardProps) {
	const formatCount = (count: number): string => {
		if (count >= 10000) return `${(count / 10000).toFixed(1)}万`;
		if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
		return count.toString();
	};

	// 获取平台类型
	const platform = getPlatformFromNoteUrl(item.noteUrl);

	// Hero 样式 - 最大的头条文章
	if (size === "hero") {
		return (
			<article
				className="group cursor-pointer border-b-2 border-foreground pb-6"
				onClick={onClick}
			>
				{item.imageUrl && (
					<div className="relative mb-4 overflow-hidden rounded-xl">
						<img
							src={item.imageUrl}
							alt={item.title}
							className="w-full h-64 object-cover transition-transform group-hover:scale-105 rounded-xl"
							referrerPolicy="no-referrer"
						/>
						{item.hasVideo && (
							<div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-xl">
								<Play className="h-16 w-16 text-white/90" fill="white" />
							</div>
						)}
						<PlatformLogo platform={platform} size="large" />
					</div>
				)}
				<h2 className="font-serif text-3xl font-bold leading-tight text-foreground group-hover:text-primary transition-colors mb-3">
					{item.title || item.desc?.slice(0, 50)}
				</h2>
				<p className="text-base text-muted-foreground leading-relaxed line-clamp-3 mb-3">
					{item.desc}
				</p>
				<div className="flex items-center gap-4 text-xs text-muted-foreground">
					<span className="font-medium">{item.nickname}</span>
					<span>♡ {formatCount(item.likedCount)}</span>
					<span>💬 {formatCount(item.commentCount)}</span>
				</div>
			</article>
		);
	}

	// Large 样式 - 带大图的文章
	if (size === "large") {
		return (
			<article
				className="group cursor-pointer border-b border-border pb-4"
				onClick={onClick}
			>
				<div className="flex gap-4">
					<div className="flex-1">
						<h3 className="font-serif text-xl font-bold leading-tight text-foreground group-hover:text-primary transition-colors mb-2">
							{item.title || item.desc?.slice(0, 40)}
						</h3>
						<p className="text-sm text-muted-foreground leading-relaxed line-clamp-3 mb-2">
							{item.desc}
						</p>
						<div className="flex items-center gap-3 text-xs text-muted-foreground">
							<span className="font-medium">{item.nickname}</span>
							<span>♡ {formatCount(item.likedCount)}</span>
						</div>
					</div>
					{item.imageUrl && (
						<div className="relative w-32 h-24 shrink-0 overflow-hidden rounded-lg">
							<img
								src={item.imageUrl}
								alt={item.title}
								className="w-full h-full object-cover transition-transform group-hover:scale-105 rounded-lg"
								referrerPolicy="no-referrer"
							/>
							{item.hasVideo && (
								<div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-lg">
									<Play className="h-8 w-8 text-white/90" fill="white" />
								</div>
							)}
							<PlatformLogo platform={platform} size="small" />
						</div>
					)}
				</div>
			</article>
		);
	}

	// Medium 样式 - 中等大小
	if (size === "medium") {
		return (
			<article
				className="group cursor-pointer border-b border-border pb-3"
				onClick={onClick}
			>
				{item.imageUrl && (
					<div className="relative mb-2 overflow-hidden rounded-lg">
						<img
							src={item.imageUrl}
							alt={item.title}
							className="w-full h-32 object-cover transition-transform group-hover:scale-105 rounded-lg"
							referrerPolicy="no-referrer"
						/>
						{item.hasVideo && (
							<div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-lg">
								<Play className="h-10 w-10 text-white/90" fill="white" />
							</div>
						)}
						<PlatformLogo platform={platform} size="normal" />
					</div>
				)}
				<h4 className="font-serif text-base font-bold leading-tight text-foreground group-hover:text-primary transition-colors mb-1">
					{item.title || item.desc?.slice(0, 30)}
				</h4>
				<p className="text-xs text-muted-foreground line-clamp-2 mb-1">
					{item.desc}
				</p>
				<div className="flex items-center gap-2 text-xs text-muted-foreground">
					<span>{item.nickname}</span>
					<span>♡ {formatCount(item.likedCount)}</span>
				</div>
			</article>
		);
	}

	// Small 样式 - 小型文章
	if (size === "small") {
		return (
			<article
				className="group cursor-pointer border-b border-border/50 pb-2"
				onClick={onClick}
			>
				<div className="flex gap-2">
					{item.imageUrl && (
						<div className="relative w-16 h-16 shrink-0 overflow-hidden rounded-lg">
							<img
								src={item.imageUrl}
								alt={item.title}
								className="w-full h-full object-cover rounded-lg"
								referrerPolicy="no-referrer"
							/>
							{item.hasVideo && (
								<div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-lg">
									<Play className="h-4 w-4 text-white/90" fill="white" />
								</div>
							)}
							<PlatformLogo platform={platform} size="small" />
						</div>
					)}
					<div className="flex-1 min-w-0">
						<h5 className="font-medium text-sm leading-tight text-foreground group-hover:text-primary transition-colors line-clamp-2">
							{item.title || item.desc?.slice(0, 25)}
						</h5>
						<span className="text-xs text-muted-foreground">{item.nickname}</span>
					</div>
				</div>
			</article>
		);
	}

	// Mini 样式 - 最小的列表项
	return (
		<article
			className="group cursor-pointer py-1 border-b border-border/30"
			onClick={onClick}
		>
			<h6 className="text-sm text-foreground group-hover:text-primary transition-colors line-clamp-1">
				• {item.title || item.desc?.slice(0, 30)}
			</h6>
		</article>
	);
}

/**
 * 爬取详情面板组件 - 显示选中的爬取结果详情
 */
// 平台名称映射
const PLATFORM_NAMES: Record<string, string> = {
	xhs: "小红书",
	douyin: "抖音",
	bilibili: "哔哩哔哩",
	weibo: "微博",
	kuaishou: "快手",
	zhihu: "知乎",
	tieba: "贴吧",
};

// 根据 URL 判断平台
function getPlatformFromUrl(url: string): string {
	if (!url) return "xhs";
	if (url.includes("douyin.com")) return "douyin";
	if (url.includes("xiaohongshu.com")) return "xhs";
	if (url.includes("bilibili.com")) return "bilibili";
	if (url.includes("weibo.com") || url.includes("weibo.cn")) return "weibo";
	if (url.includes("kuaishou.com")) return "kuaishou";
	if (url.includes("zhihu.com")) return "zhihu";
	if (url.includes("tieba.baidu.com")) return "tieba";
	return "xhs";
}

// API 基础 URL
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8100";

// 需要使用代理的平台列表（这些平台的视频有防盗链，需要通过后端代理加载）
const PLATFORMS_NEED_PROXY = ["douyin", "kuaishou", "xhs"];

// 需要使用 iframe 嵌入播放的平台
const PLATFORMS_USE_IFRAME = ["bilibili"];

// 生成视频代理 URL
function getProxyVideoUrl(videoUrl: string, platform: string): string {
	if (!videoUrl) return "";
	// 对于需要代理的平台，使用后端代理 API
	if (PLATFORMS_NEED_PROXY.includes(platform)) {
		const encodedUrl = encodeURIComponent(videoUrl);
		return `${API_BASE_URL}/api/crawler/video/proxy?url=${encodedUrl}&platform=${platform}`;
	}
	// 其他平台直接返回原 URL
	return videoUrl;
}

// 从B站URL或noteId中提取BV号
function extractBvid(noteUrl: string, noteId: string): string {
	// 先尝试从 noteId 获取（如果 noteId 就是 BV 号）
	if (noteId && noteId.startsWith("BV")) {
		return noteId;
	}
	// 从 URL 中提取 BV 号
	const bvMatch = noteUrl?.match(/BV[a-zA-Z0-9]+/);
	return bvMatch ? bvMatch[0] : "";
}

// 生成B站嵌入播放器URL
function getBilibiliEmbedUrl(bvid: string): string {
	if (!bvid) return "";
	return `//player.bilibili.com/player.html?bvid=${bvid}&autoplay=0&danmaku=0`;
}

export function CrawlerDetailPanel() {
	const t = useTranslations("page");
	const {
		selectedResult,
		setSelectedResult,
		platforms,
		showDailySummary,
		setShowDailySummary,
		dailySummary,
		dailySummaryLoading,
		closeDailySummary,
		refreshDailySummary,
		fetchDailySummary,
		results,
	} = useCrawlerStore();
	const [showComments, setShowComments] = useState(true);
	const [videoError, setVideoError] = useState(false);
	const [showAiSummary, setShowAiSummary] = useState(false);  // AI摘要折叠状态

	/**
	 * 处理高亮内容点击事件
	 * 根据点击的文本查找匹配的爬取结果并跳转到详情
	 */
	const handleHighlightClick = (text: string) => {
		if (!results || results.length === 0) {
			console.log("[Crawler] 没有可搜索的结果");
			return;
		}

		// 清理搜索文本
		const searchText = text.trim().toLowerCase();

		// 在结果中查找匹配的内容
		// 优先匹配标题，其次匹配描述、作者昵称、标签
		const matchedResult = results.find((item) => {
			const title = (item.title || "").toLowerCase();
			const desc = (item.desc || "").toLowerCase();
			const nickname = (item.nickname || "").toLowerCase();
			const tags = (item.tags || []).map(t => t.toLowerCase());

			// 检查是否匹配
			return (
				title.includes(searchText) ||
				searchText.includes(title.substring(0, 10)) ||  // 标题前10个字符匹配
				desc.includes(searchText) ||
				nickname.includes(searchText) ||
				searchText.includes(nickname) ||
				tags.some(tag => tag.includes(searchText) || searchText.includes(tag))
			);
		});

		if (matchedResult) {
			console.log("[Crawler] 找到匹配的结果:", matchedResult.title);
			// 关闭今日总结面板，显示详情
			closeDailySummary();
			setSelectedResult(matchedResult);
		} else {
			console.log("[Crawler] 未找到匹配的结果:", text);
		}
	};

	// 切换选中内容时重置视频错误状态
	useEffect(() => {
		setVideoError(false);
	}, [selectedResult?.id]);

	// 使用真实评论数据，如果没有则为空数组
	const comments = selectedResult?.comments || [];

	// 获取当前内容的平台（优先从 URL 判断，其次使用 store 中的 platforms[0]）
	const contentPlatform = selectedResult?.noteUrl
		? getPlatformFromUrl(selectedResult.noteUrl)
		: platforms[0];
	const platformName = PLATFORM_NAMES[contentPlatform] || "平台";

	const formatCount = (count: number): string => {
		if (count >= 10000) {
			return `${(count / 10000).toFixed(1)}万`;
		}
		return count.toString();
	};

	// 格式化时间戳为可读时间
	const formatTime = (timestamp: string | number): string => {
		if (!timestamp) return "";
		const ts = typeof timestamp === "string" ? Number.parseInt(timestamp, 10) : timestamp;
		if (Number.isNaN(ts)) return String(timestamp);

		// 如果时间戳是毫秒级的（大于10位数），转换为秒
		const date = new Date(ts > 9999999999 ? ts : ts * 1000);

		// 格式化为 YYYY-MM-DD HH:mm
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, "0");
		const day = String(date.getDate()).padStart(2, "0");
		const hours = String(date.getHours()).padStart(2, "0");
		const minutes = String(date.getMinutes()).padStart(2, "0");

		return `${year}-${month}-${day} ${hours}:${minutes}`;
	};

	// 按互动量排序的文章列表
	const sortedResults = useMemo(() => {
		if (!results || results.length === 0) return [];
		return [...results].sort((a, b) => {
			const scoreA = (a.likedCount || 0) + (a.commentCount || 0) * 2 + (a.collectedCount || 0) * 1.5;
			const scoreB = (b.likedCount || 0) + (b.commentCount || 0) * 2 + (b.collectedCount || 0) * 1.5;
			return scoreB - scoreA;
		});
	}, [results]);

	// 格式化今日日期
	const todayDate = useMemo(() => {
		const now = new Date();
		const year = now.getFullYear();
		const month = now.getMonth() + 1;
		const day = now.getDate();
		const weekDays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
		const weekDay = weekDays[now.getDay()];
		return { year, month, day, weekDay, full: `${year}年${month}月${day}日 ${weekDay}` };
	}, []);

	// 处理文章点击
	const handleArticleClick = (item: CrawlResultItem) => {
		closeDailySummary();
		setSelectedResult(item);
	};

	// 显示今日总结 - 专业新闻网站风格（参考 daily-insight-press 设计）
	if (showDailySummary) {
		// 过滤掉没有标题和描述的文章
		const validResults = sortedResults.filter(item => item.title || item.desc);

		const heroArticle = validResults[0];
		const briefArticles = validResults.slice(1, 7);  // IN BRIEF 简讯列表
		const featuredArticles = validResults.slice(7, 10);  // 底部三栏特色文章
		const moreArticles = validResults.slice(10);  // 更多文章

		// 格式化数字
		const formatNumber = (num: number): string => {
			if (num >= 10000) return `${(num / 10000).toFixed(1)}万`;
			if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
			return num.toString();
		};

		// 获取分类标签（基于标签或内容）
		const getCategoryLabel = (item: CrawlResultItem): string => {
			const tags = item.tags || [];
			if (tags.some(t => t.includes("科技") || t.includes("AI") || t.includes("人工智能"))) return "科技";
			if (tags.some(t => t.includes("商业") || t.includes("创业") || t.includes("企业"))) return "商业";
			if (tags.some(t => t.includes("教育") || t.includes("学习") || t.includes("大学"))) return "教育";
			if (tags.some(t => t.includes("生活") || t.includes("心灵") || t.includes("成长"))) return "生活";
			if (tags.some(t => t.includes("娱乐") || t.includes("明星"))) return "娱乐";
			return "热点";
		};

		return (
			<div className="relative flex h-full flex-col overflow-hidden bg-black text-white selection:bg-indigo-500/30 selection:text-white">
				{/* 主容器 - 带阴影和边框 */}
				<div className="flex h-full flex-col bg-[#09090b] shadow-2xl ring-1 ring-white/5">
					{/* 固定的顶部操作栏 - 返回详情按钮 */}
					<div className="shrink-0 flex items-center justify-end px-4 py-2 border-b border-zinc-800/50">
						<button
							type="button"
							onClick={closeDailySummary}
							className="flex items-center gap-1.5 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
							title="返回详情"
						>
							<Newspaper className="h-3.5 w-3.5" />
							返回详情
						</button>
					</div>

					{/* 主内容区 - 包含报头和所有内容，全部可滚动 */}
					<div className="min-h-0 flex-1 overflow-y-auto">
						{/* 顶部报头 - 现在在可滚动区域内 */}
						<header className="border-b-4 border-zinc-700 px-4 md:px-6 pb-2">
							{/* 第一行：日期 */}
							<div className="flex items-center text-xs text-zinc-400 tracking-widest border-b border-zinc-800 pb-1 mb-4 pt-3 uppercase">
								<div className="flex items-center gap-2">
									<span className="text-zinc-500">📅</span>
									<span>{todayDate.full}</span>
								</div>
							</div>

							{/* 主标题区 - 带装饰线条 */}
							<div className="text-center relative py-4">
								<h1 className="font-serif text-4xl md:text-5xl font-bold tracking-tight text-white mb-2">
									热点速递
								</h1>
								<p className="font-serif italic text-zinc-400 text-base md:text-lg">
									Daily Social Insights & Media Digest
								</p>

								{/* 装饰性线条 - 仿报纸排版 */}
								<div className="absolute top-1/2 left-0 w-4 md:w-16 lg:w-24 h-[1px] bg-zinc-700 hidden md:block" />
								<div className="absolute top-1/2 right-0 w-4 md:w-16 lg:w-24 h-[1px] bg-zinc-700 hidden md:block" />
							</div>

							{/* 版本信息栏 */}
							<div className="flex items-center justify-between mt-4 border-t border-zinc-800 pt-2 text-xs text-zinc-500">
								<span className="font-mono">Vol. {todayDate.year}-{String(todayDate.month).padStart(2, '0')}-{String(todayDate.day).padStart(2, '0')} · No. {results.length} Edition</span>
								<button
									type="button"
									onClick={() => refreshDailySummary()}
									disabled={dailySummaryLoading}
									className="flex items-center gap-2 text-xs font-bold text-zinc-300 hover:text-white transition-colors uppercase tracking-wider disabled:opacity-50"
								>
									<RefreshCw className={cn("h-3 w-3", dailySummaryLoading && "animate-spin")} />
									更新AI摘要
								</button>
							</div>
						</header>
						{results.length === 0 ? (
							<div className="flex flex-col items-center justify-center py-20">
								<Newspaper className="h-16 w-16 text-zinc-700 mb-4" />
								<p className="text-zinc-400 font-serif text-lg">暂无今日内容</p>
								<p className="text-zinc-600 text-sm mt-1">请先启动爬虫获取数据</p>
							</div>
						) : (
							<div className="px-4 md:px-6 py-6 md:py-8">
								{/* AI总结摘要 - 加载状态，参照 elegant-ai-summary-redesign 样式 */}
								{dailySummaryLoading && (
									<div className="mb-10 relative overflow-hidden rounded-2xl bg-slate-900/40 backdrop-blur-xl border border-white/10 shadow-2xl">
										{/* Subtle Ambient Glow */}
										<div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/10 rounded-full blur-[100px] -z-10 pointer-events-none" />
										<div className="px-6 py-5 flex items-center gap-3 bg-white/5 border-b border-white/5">
											<img
												src="/platform-logos/leida.png"
												alt="AI Logo"
												className="w-10 h-10 rounded-lg shadow-lg shadow-indigo-500/20 animate-pulse"
											/>
											<div>
												<h2 className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-200 to-slate-400">
													AI总结摘要
												</h2>
												<p className="text-xs text-slate-400 font-medium tracking-wider uppercase opacity-70">
													AI Generated Digest
												</p>
											</div>
										</div>
										<div className="px-6 py-6 flex items-center gap-3 text-slate-300">
											<Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
											<span className="text-base font-light tracking-wide">AI 摘要正在生成，请稍候...</span>
										</div>
									</div>
								)}
								{/* AI总结摘要 - 可折叠，参照 elegant-ai-summary-redesign 样式 */}
								{dailySummary && !dailySummaryLoading && (
									<div className="mb-10 group relative overflow-hidden rounded-2xl bg-slate-900/40 backdrop-blur-xl border border-white/10 shadow-2xl">
										<button
											type="button"
											onClick={() => setShowAiSummary(!showAiSummary)}
											className="w-full flex items-center justify-between px-6 py-5 cursor-pointer bg-white/5 border-b border-white/5 hover:bg-white/10 transition-colors duration-300"
										>
											<div className="flex items-center gap-3">
												<img
													src="/platform-logos/leida.png"
													alt="AI Logo"
													className="w-10 h-10 rounded-lg shadow-lg shadow-indigo-500/20"
												/>
												<div>
													<h2 className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-200 to-slate-400">
														AI总结摘要
													</h2>
													<p className="text-xs text-slate-400 font-medium tracking-wider uppercase opacity-70">
														AI Generated Digest
													</p>
												</div>
											</div>
											<ChevronUp
												className={cn(
													"h-5 w-5 text-slate-400 hover:text-white transition-all",
													!showAiSummary && "rotate-180"
												)}
											/>
										</button>

										{showAiSummary && (
											<div className="p-6 sm:p-8 pt-8">
												{/* Subtle Ambient Glow Background */}
												<div className="absolute top-20 right-0 w-64 h-64 bg-indigo-600/10 rounded-full blur-[100px] -z-10 pointer-events-none" />
												<div className="absolute bottom-0 left-0 w-64 h-64 bg-violet-600/5 rounded-full blur-[80px] -z-10 pointer-events-none" />

												<div className="relative pl-2">
													{/* AI 摘要内容 - 参照 elegant-ai-summary-redesign 样式 */}
													<div className="text-sm sm:text-base text-slate-300 leading-7 font-light tracking-wide">
														<ReactMarkdown
															remarkPlugins={[remarkGfm]}
															components={{
																p: ({ children }) => {
																	const processChildren = (child: React.ReactNode): React.ReactNode => {
																		if (typeof child === "string") {
																			return <HighlightedText onHighlightClick={handleHighlightClick}>{child}</HighlightedText>;
																		}
																		return child;
																	};
																	const processedChildren = Array.isArray(children)
																		? children.map((child, i) => <span key={i}>{processChildren(child)}</span>)
																		: processChildren(children);
																	return <p className="mb-5 text-slate-200 leading-relaxed">{processedChildren}</p>;
																},
																h1: ({ children }) => <h1 className="text-xl font-bold text-white mb-4 mt-8 pb-2 border-b border-indigo-500/20">{children}</h1>,
																h2: ({ children }) => <h2 className="text-lg font-bold text-white mb-3 mt-6 flex items-center gap-2">{children}</h2>,
																h3: ({ children }) => <h3 className="text-base font-semibold text-slate-100 mb-2 mt-5">{children}</h3>,
																strong: ({ children }) => <strong className="text-white font-bold"><HighlightedText onHighlightClick={handleHighlightClick}>{children}</HighlightedText></strong>,
																ul: ({ children }) => <ul className="flex flex-col gap-4 my-5">{children}</ul>,
																ol: ({ children }) => <ol className="flex flex-col gap-4 my-5 list-decimal list-inside marker:text-indigo-400 marker:font-bold">{children}</ol>,
																li: ({ children }) => {
																	const processChildren = (child: React.ReactNode): React.ReactNode => {
																		if (typeof child === "string") {
																			return <HighlightedText onHighlightClick={handleHighlightClick}>{child}</HighlightedText>;
																		}
																		return child;
																	};
																	const processedChildren = Array.isArray(children)
																		? children.map((child, i) => <span key={i}>{processChildren(child)}</span>)
																		: processChildren(children);
																	return (
																		<li className="relative pl-0 group">
																			<div className="flex gap-3 items-start">
																				<span className="mt-2 w-2 h-2 min-w-[8px] rounded-full bg-indigo-500" />
																				<span className="flex-1 text-slate-200 leading-relaxed">{processedChildren}</span>
																			</div>
																		</li>
																	);
																},
																// 表格样式美化
																table: ({ children }) => (
																	<div className="my-6 overflow-x-auto rounded-lg border border-white/10">
																		<table className="w-full text-sm">{children}</table>
																	</div>
																),
																thead: ({ children }) => (
																	<thead className="bg-white/5 border-b border-white/5">{children}</thead>
																),
																tbody: ({ children }) => (
																	<tbody className="divide-y divide-white/5">{children}</tbody>
																),
																tr: ({ children }) => (
																	<tr className="hover:bg-white/5 transition-colors">{children}</tr>
																),
																th: ({ children }) => (
																	<th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider whitespace-nowrap">
																		{children}
																	</th>
																),
																td: ({ children }) => {
																	const processChildren = (child: React.ReactNode): React.ReactNode => {
																		if (typeof child === "string") {
																			return <HighlightedText onHighlightClick={handleHighlightClick}>{child}</HighlightedText>;
																		}
																		return child;
																	};
																	const processedChildren = Array.isArray(children)
																		? children.map((child, i) => <span key={i}>{processChildren(child)}</span>)
																		: processChildren(children);
																	return (
																		<td className="px-4 py-3 text-slate-300 text-sm">{processedChildren}</td>
																	);
																},
																// 代码块样式
																code: ({ children }) => (
																	<code className="bg-white/10 text-indigo-200 px-1.5 py-0.5 rounded text-sm font-mono">{children}</code>
																),
																// 引用块样式
																blockquote: ({ children }) => (
																	<blockquote className="border-l-2 border-indigo-500/30 pl-4 my-4 text-slate-400 italic">{children}</blockquote>
																),
															}}
														>
															{dailySummary}
														</ReactMarkdown>
													</div>

													{/* Footer */}
													<div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-between text-xs text-slate-500">
														<span>AI 智能分析生成</span>
													</div>
												</div>
											</div>
										)}
									</div>
								)}

								{/* 主要内容区 - 自适应布局 */}
								<div className="flex flex-col gap-8 mb-12">
									{/* 主文章区 */}
									<main className="w-full">
										{heroArticle && (
											<article
												className="group cursor-pointer"
												onClick={() => handleArticleClick(heroArticle)}
											>
												{/* 头条大图 - 带播放按钮和时长标签 */}
												{heroArticle.imageUrl && (
													<div className="relative w-full aspect-video overflow-hidden rounded-sm mb-4 border border-zinc-800">
														<img
															src={heroArticle.imageUrl}
															alt={heroArticle.title}
															className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 opacity-90 group-hover:opacity-100"
															referrerPolicy="no-referrer"
														/>
														{heroArticle.hasVideo && (
															<>
																<div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/10 transition-colors">
																	<div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30 transition-transform group-hover:scale-110">
																		<Play className="fill-white text-white ml-1" size={32} />
																	</div>
																</div>
																<div className="absolute bottom-3 right-3 bg-black/70 text-white text-xs px-2 py-1 font-mono rounded-sm">
																	视频
																</div>
															</>
														)}
														<PlatformLogo platform={getPlatformFromNoteUrl(heroArticle.noteUrl)} size="large" />
													</div>
												)}

												<div className="space-y-3">
													{/* 分类和作者 */}
													<div className="flex items-center gap-3">
														<span className="bg-zinc-800 text-zinc-300 text-[10px] font-bold px-2 py-0.5 uppercase tracking-wider">
															{getCategoryLabel(heroArticle)}
														</span>
														<span className="text-zinc-500 text-xs font-serif italic">
															By {heroArticle.nickname}
														</span>
													</div>

													{/* 标题 */}
													<h2 className="font-serif text-2xl md:text-3xl lg:text-4xl font-bold leading-tight text-white group-hover:text-zinc-200 transition-colors">
														{heroArticle.title || heroArticle.desc?.slice(0, 60)}
													</h2>

													{/* 描述 */}
													<p className="font-sans text-zinc-400 text-base leading-relaxed line-clamp-3 md:line-clamp-none">
														{heroArticle.desc}
													</p>

													{/* 互动数据 */}
													<div className="flex items-center gap-6 pt-2 text-zinc-500 text-sm font-medium border-t border-zinc-900 mt-4">
														<div className="flex items-center gap-1.5 hover:text-zinc-300 transition-colors">
															<Heart size={16} />
															<span>{formatNumber(heroArticle.likedCount)}</span>
														</div>
														<div className="flex items-center gap-1.5 hover:text-zinc-300 transition-colors">
															<MessageCircle size={16} />
															<span>{formatNumber(heroArticle.commentCount)}</span>
														</div>
														<div className="flex items-center gap-1.5 hover:text-zinc-300 transition-colors ml-auto">
															<Share2 size={16} />
															<span>分享</span>
														</div>
													</div>
												</div>
											</article>
										)}
									</main>

									{/* 简讯栏 - 自适应网格布局 */}
									<aside className="w-full border-t border-zinc-800 pt-8">
										<div className="flex items-center gap-2 mb-6 border-b border-zinc-800 pb-2">
											<span className="text-indigo-400">📈</span>
											<h3 className="font-sans text-xs font-bold uppercase tracking-[0.2em] text-zinc-400">
												In Brief
											</h3>
										</div>

										<div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
											{briefArticles.map((item, index) => {
												const platform = getPlatformFromNoteUrl(item.noteUrl);
												return (
													<div
														key={item.id}
														className="group cursor-pointer border-b border-zinc-800/50 pb-4 relative"
														onClick={() => handleArticleClick(item)}
													>
														<div className="flex items-start gap-3 pr-8">
															<span className="font-serif text-2xl text-zinc-700 font-bold leading-none -mt-1 group-hover:text-zinc-500 transition-colors">
																{index + 1}
															</span>
															<div>
																<p className="font-serif text-base leading-snug text-zinc-200 mb-2 group-hover:text-white transition-colors line-clamp-2">
																	{item.title || item.desc?.slice(0, 40)}
																</p>
																<div className="flex flex-wrap gap-2">
																	{item.tags.slice(0, 2).map((tag, i) => (
																		<span
																			key={i}
																			className="inline-flex items-center text-[10px] text-zinc-500 font-mono border border-zinc-800 px-1.5 py-0.5 rounded hover:border-zinc-600 hover:text-zinc-400 transition-colors"
																		>
																			#{tag.replace(/\[话题\]#?/g, '').slice(0, 6)}
																		</span>
																	))}
																</div>
															</div>
														</div>
														<PlatformLogo platform={platform} size="small" />
													</div>
												);
											})}
										</div>
									</aside>
								</div>

								{/* 底部三栏特色文章 - 带双线分隔 */}
								{featuredArticles.length > 0 && (
									<div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12 pt-8 border-t-4 border-double border-zinc-800">
										{featuredArticles.map((item) => (
											<article
												key={item.id}
												className="group flex flex-col h-full cursor-pointer relative"
												onClick={() => handleArticleClick(item)}
											>
												{/* 图片 */}
												{item.imageUrl ? (
													<div className="relative aspect-[3/2] mb-4 overflow-hidden rounded-sm bg-zinc-900 border border-zinc-800">
														<img
															src={item.imageUrl}
															alt={item.title}
															className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-all duration-500 group-hover:scale-105"
															referrerPolicy="no-referrer"
														/>
														<div className="absolute top-2 left-2 bg-black/60 backdrop-blur-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white border border-white/10">
															{getCategoryLabel(item)}
														</div>
														<PlatformLogo platform={getPlatformFromNoteUrl(item.noteUrl)} size="small" />
													</div>
												) : (
													/* 无图片时，在卡片右上角显示平台logo */
													<PlatformLogo platform={getPlatformFromNoteUrl(item.noteUrl)} size="small" />
												)}

												<div className="flex-1 flex flex-col">
													{/* 标题 */}
													<h3 className="font-serif text-lg lg:text-xl font-bold text-zinc-100 mb-3 group-hover:text-indigo-300 transition-colors leading-tight pr-8">
														{item.title || item.desc?.slice(0, 40)}
													</h3>

													{/* 描述 */}
													<p className="font-sans text-sm text-zinc-400 line-clamp-3 leading-relaxed mb-4 flex-1">
														{item.desc}
													</p>

													{/* 底部信息 */}
													<div className="flex items-center justify-between pt-3 border-t border-zinc-800/50 text-xs text-zinc-500 font-mono">
														<span>{item.nickname}</span>
														<span className="flex items-center gap-1">
															{formatNumber(item.likedCount)} 阅读
														</span>
													</div>
												</div>
											</article>
										))}
									</div>
								)}

								{/* 更多文章列表 */}
								{moreArticles.length > 0 && (
									<section className="mt-12">
										<div className="border-t border-zinc-800 pt-6 mb-6">
											<h3 className="font-sans text-xs font-bold uppercase tracking-[0.2em] text-zinc-400">
												More Stories
											</h3>
										</div>
										<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
											{moreArticles.map((item) => (
												<article
													key={item.id}
													className="group cursor-pointer flex gap-4 p-3 rounded-sm hover:bg-zinc-900/50 transition-colors border border-transparent hover:border-zinc-800 relative"
													onClick={() => handleArticleClick(item)}
												>
													{/* 平台logo始终在卡片右上角 */}
													<PlatformLogo platform={getPlatformFromNoteUrl(item.noteUrl)} size="small" />
													{item.imageUrl && (
														<div className="relative w-20 h-20 shrink-0 overflow-hidden rounded-sm bg-zinc-900 border border-zinc-800">
															<img
																src={item.imageUrl}
																alt={item.title}
																className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
																referrerPolicy="no-referrer"
															/>
														</div>
													)}
													<div className="flex-1 min-w-0 flex flex-col justify-center pr-8">
														<h4 className="font-serif text-sm font-bold text-zinc-100 leading-snug mb-1 group-hover:text-indigo-300 transition-colors line-clamp-2">
															{item.title || item.desc?.slice(0, 35)}
														</h4>
														<p className="text-xs text-zinc-500 font-mono">{item.nickname}</p>
													</div>
												</article>
											))}
										</div>
									</section>
								)}

								{/* 页脚 */}
								<footer className="mt-16 pt-8 border-t border-zinc-800 flex flex-col md:flex-row justify-between items-center text-zinc-500 text-sm font-serif">
									<p>© 2026 Daily Insight Press. AI 智能分析生成</p>
									<div className="flex gap-6 mt-4 md:mt-0 font-sans text-xs tracking-widest uppercase">
										<span className="hover:text-zinc-300 cursor-pointer transition-colors">隐私</span>
										<span className="hover:text-zinc-300 cursor-pointer transition-colors">条款</span>
										<span className="hover:text-zinc-300 cursor-pointer transition-colors">关于</span>
										<span className="hover:text-zinc-300 cursor-pointer transition-colors">联系</span>
									</div>
								</footer>
							</div>
						)}
					</div>
				</div>
			</div>
		);
	}

	// 如果没有选中的结果，显示空状态
	if (!selectedResult) {
		return (
			<div className="relative flex h-full flex-col overflow-hidden bg-background">
				<PanelHeader
					icon={Search}
					title={t("crawlerDetailLabel")}
					actions={
						<button
							type="button"
							onClick={() => fetchDailySummary()}
							disabled={dailySummaryLoading}
							className="flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
						>
							<Sparkles className={cn("h-3.5 w-3.5", dailySummaryLoading && "animate-pulse")} />
							今日热点
						</button>
					}
				/>
				<div className="flex flex-1 items-center justify-center">
					<div className="text-center">
						<Search className="mx-auto h-12 w-12 text-muted-foreground/50" />
						<p className="mt-4 text-sm text-muted-foreground">
							{t("crawlerDetailPlaceholder")}
						</p>
						<p className="mt-2 text-xs text-muted-foreground/70">
							在爬虫面板中点击"查看详情"来查看内容
						</p>
					</div>
				</div>
			</div>
		);
	}

	// 返回热点速递
	const handleBackToSummary = () => {
		setSelectedResult(null);
		setShowDailySummary(true);
	};

	return (
		<div className="relative flex h-full flex-col overflow-hidden bg-background">
			<PanelHeader
				icon={Search}
				title={t("crawlerDetailLabel")}
				actions={
					<button
						type="button"
						onClick={handleBackToSummary}
						className="flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
						title="返回热点速递"
					>
						<Newspaper className="h-3.5 w-3.5" />
						今日热点
					</button>
				}
			/>

			{/* 顶部操作栏 */}
			<div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
				<span className="text-sm text-muted-foreground">正在查看详情</span>
				<div className="flex items-center gap-3">
					<a
						href={selectedResult.noteUrl}
						target="_blank"
						rel="noopener noreferrer"
						className="flex items-center gap-1 text-sm text-primary hover:underline"
					>
						<ExternalLink className="h-4 w-4" />
						在浏览器中打开
					</a>
					<button
						type="button"
						onClick={() => setSelectedResult(null)}
						className="text-muted-foreground hover:text-foreground"
					>
						<X className="h-5 w-5" />
					</button>
				</div>
			</div>

			{/* 可滚动内容区域 */}
			<div className="min-h-0 flex-1 overflow-y-auto">
				<div className="px-4 py-4">
					{/* 用户信息 */}
					<div className="flex items-center gap-3">
						{selectedResult.avatar ? (
							<img
								src={selectedResult.avatar}
								alt={selectedResult.nickname}
								className="h-12 w-12 rounded-full bg-muted object-cover"
								referrerPolicy="no-referrer"
							/>
						) : (
							<div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-lg font-medium text-primary">
								{selectedResult.nickname?.charAt(0) || "?"}
							</div>
						)}
						<div>
							<h3 className="font-medium text-foreground">{selectedResult.nickname}</h3>
							<p className="flex items-center gap-1 text-xs text-muted-foreground">
								<ImageIcon className="h-3 w-3" />
								{selectedResult.hasVideo ? "视频笔记" : "图文笔记"}
							</p>
						</div>
					</div>

					{/* 标题 */}
					<h2 className="mt-4 text-lg font-semibold text-foreground">
						{selectedResult.title}
					</h2>

					{/* 描述 */}
					<p className="mt-2 text-sm text-muted-foreground">
						{selectedResult.desc}
					</p>

					{/* 标签 */}
					<div className="mt-3 flex flex-wrap gap-2">
						{selectedResult.tags.slice(0, 5).map((tag, index) => (
							<span
								key={index}
								className="rounded-full bg-primary/10 px-3 py-1 text-xs text-primary"
							>
								{tag.replace(/\[话题\]#?/g, '').replace(/#/g, '')}
							</span>
						))}
					</div>

					{/* 视频/图片预览 - 仅在有视频或图片时显示 */}
					{(selectedResult.hasVideo || selectedResult.imageUrl) && (
						<div className="mt-4 overflow-hidden rounded-lg border border-border">
							{selectedResult.hasVideo ? (
								<div className="relative">
									{/* B站使用 iframe 嵌入播放器 */}
									{PLATFORMS_USE_IFRAME.includes(contentPlatform) ? (
										<>
											<iframe
												src={getBilibiliEmbedUrl(extractBvid(selectedResult.noteUrl, selectedResult.noteId))}
												className="w-full aspect-video bg-black"
												allowFullScreen
												sandbox="allow-scripts allow-same-origin allow-popups"
												title={selectedResult.title}
											/>
											{/* 打开原文链接按钮 */}
											<div className="absolute bottom-2 right-2 flex gap-2">
												<a
													href={selectedResult.noteUrl}
													target="_blank"
													rel="noopener noreferrer"
													className="flex items-center gap-1 rounded bg-black/70 px-2 py-1 text-xs text-white hover:bg-black/90"
												>
													<ExternalLink className="h-3 w-3" />
													在{platformName}中观看
												</a>
											</div>
										</>
									) : videoError ? (
										/* 视频加载失败时显示封面图和跳转按钮 */
										<div className="relative aspect-[9/16] max-h-[500px] bg-black">
											{selectedResult.imageUrl && (
												<img
													src={selectedResult.imageUrl}
													alt={selectedResult.title}
													className="h-full w-full object-contain"
												/>
											)}
											<div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50">
												<p className="mb-3 text-sm text-white/80">视频加载失败</p>
												<a
													href={selectedResult.noteUrl}
													target="_blank"
													rel="noopener noreferrer"
													className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
												>
													<ExternalLink className="h-4 w-4" />
													在{platformName}中观看
												</a>
											</div>
										</div>
									) : (selectedResult.videoUrl || selectedResult.videoDownloadUrl) ? (
										/* 使用代理播放视频（抖音/快手等）或直接播放 */
										<>
											<video
												src={getProxyVideoUrl(
													selectedResult.videoDownloadUrl || selectedResult.videoUrl || "",
													contentPlatform
												)}
												controls
												className={cn(
													"w-full bg-black object-contain",
													PLATFORMS_NEED_PROXY.includes(contentPlatform)
														? "aspect-[9/16] max-h-[500px]"
														: "aspect-[4/3]"
												)}
												poster={selectedResult.imageUrl}
												onError={() => setVideoError(true)}
											>
												您的浏览器不支持视频播放
											</video>
											{/* 打开原文链接按钮 */}
											<div className="absolute bottom-2 right-2 flex gap-2">
												<a
													href={selectedResult.noteUrl}
													target="_blank"
													rel="noopener noreferrer"
													className="flex items-center gap-1 rounded bg-black/70 px-2 py-1 text-xs text-white hover:bg-black/90"
												>
													<ExternalLink className="h-3 w-3" />
													查看原文
												</a>
											</div>
										</>
									) : (
										/* 没有视频URL，显示封面图 */
										<div className="relative aspect-video bg-black">
											{selectedResult.imageUrl && (
												<img
													src={selectedResult.imageUrl}
													alt={selectedResult.title}
													className="h-full w-full object-contain"
												/>
											)}
											<div className="absolute bottom-2 right-2">
												<a
													href={selectedResult.noteUrl}
													target="_blank"
													rel="noopener noreferrer"
													className="flex items-center gap-1 rounded bg-black/70 px-2 py-1 text-xs text-white hover:bg-black/90"
												>
													<ExternalLink className="h-3 w-3" />
													在{platformName}中观看
												</a>
											</div>
										</div>
									)}
								</div>
							) : (
								<img
									src={selectedResult.imageUrl}
									alt={selectedResult.title}
									className="w-full aspect-[4/3] bg-muted object-contain"
								/>
							)}
						</div>
					)}

					{/* 统计数据 */}
					<div className="mt-4 grid grid-cols-4 gap-2 rounded-lg border border-border p-3">
						<div className="text-center">
							<Heart className="mx-auto h-5 w-5 text-red-400" />
							<p className="mt-1 text-sm font-semibold text-foreground">
								{formatCount(selectedResult.likedCount)}
							</p>
							<p className="text-xs text-muted-foreground">点赞</p>
						</div>
						<div className="text-center">
							<MessageCircle className="mx-auto h-5 w-5 text-blue-400" />
							<p className="mt-1 text-sm font-semibold text-foreground">
								{formatCount(selectedResult.commentCount)}
							</p>
							<p className="text-xs text-muted-foreground">评论</p>
						</div>
						<div className="text-center">
							<Bookmark className="mx-auto h-5 w-5 text-yellow-400" />
							<p className="mt-1 text-sm font-semibold text-foreground">
								{formatCount(selectedResult.collectedCount)}
							</p>
							<p className="text-xs text-muted-foreground">收藏</p>
						</div>
						<div className="text-center">
							<Share2 className="mx-auto h-5 w-5 text-green-400" />
							<p className="mt-1 text-sm font-semibold text-foreground">
								{formatCount(selectedResult.shareCount)}
							</p>
							<p className="text-xs text-muted-foreground">分享</p>
						</div>
					</div>

					{/* 评论区 */}
					<div className="mt-4 rounded-lg border border-border">
						{/* 评论标题栏 */}
						<button
							type="button"
							onClick={() => setShowComments(!showComments)}
							className="flex w-full items-center justify-between px-4 py-3 hover:bg-muted/50"
						>
							<div className="flex items-center gap-2">
								<MessageCircle className="h-4 w-4 text-muted-foreground" />
								<span className="text-sm font-medium text-foreground">
									评论 ({comments.length})
								</span>
							</div>
							<ChevronUp
								className={cn(
									"h-4 w-4 text-muted-foreground transition-transform",
									!showComments && "rotate-180"
								)}
							/>
						</button>

						{/* 评论列表 */}
						{showComments && (
							<div className="border-t border-border">
								{comments.length === 0 ? (
									<div className="flex h-20 items-center justify-center text-sm text-muted-foreground">
										暂无评论数据
									</div>
								) : (
								comments.map((comment, index) => (
									<div
										key={`${comment.id}-${index}`}
											className="border-b border-border px-4 py-3 last:border-b-0"
										>
											<div className="flex gap-3">
												<img
													src={comment.avatar || "https://via.placeholder.com/40"}
													alt={comment.nickname}
													className="h-10 w-10 shrink-0 rounded-full bg-muted"
													referrerPolicy="no-referrer"
												/>
												<div className="min-w-0 flex-1">
													<div className="flex items-center gap-2">
														<span className="font-medium text-foreground">
															{comment.nickname}
														</span>
														<span className="text-xs text-muted-foreground">
															{comment.ipLocation}
														</span>
													</div>
													<p className="mt-1 text-sm text-foreground">
														{comment.content}
													</p>
												<div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
													<span>{formatTime(comment.createTime)}</span>
													<div className="flex items-center gap-1">
														<ThumbsUp className="h-3 w-3" />
														<span>{formatCount(comment.likeCount)}</span>
													</div>
													<div className="flex items-center gap-1">
														<MessageCircle className="h-3 w-3" />
														<span>{comment.subCommentCount} 回复</span>
													</div>
												</div>
												</div>
											</div>
										</div>
									))
								)}
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
