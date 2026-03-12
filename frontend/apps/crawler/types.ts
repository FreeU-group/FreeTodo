/**
 * 爬虫相关类型定义
 */

// 支持的平台
export type CrawlerPlatform = "xhs" | "douyin" | "bilibili" | "weibo" | "kuaishou" | "zhihu" | "tieba";

// 爬虫状态
export type CrawlerStatus = "idle" | "running" | "paused" | "error";

// 爬虫类型
export type CrawlerType = "search" | "detail" | "creator" | "homefeed";

// 平台配置
export interface PlatformConfig {
	id: CrawlerPlatform;
	name: string;
	color: string;
	icon: string;
}

// 评论项
export interface CrawlCommentItem {
	id: string;
	content: string;
	createTime: string;
	ipLocation: string;
	likeCount: number;
	subCommentCount: number;
	userId: string;
	nickname: string;
	avatar: string;
}

// 爬取结果项
export interface CrawlResultItem {
	id: string;
	noteId: string;
	type: "normal" | "video";
	title: string;
	desc: string;
	tags: string[];
	hasVideo: boolean;
	videoUrl?: string;
	videoDownloadUrl?: string;  // 真实的视频下载地址（用于代理播放）
	imageUrl?: string;
	noteUrl: string;
	likedCount: number;
	collectedCount: number;
	commentCount: number;
	shareCount: number;
	userId: string;
	nickname: string;
	avatar: string;
	sourceKeyword: string;
	time: string;
	comments?: CrawlCommentItem[];
}

// 爬虫任务
export interface CrawlerTask {
	id: string;
	platform: CrawlerPlatform;
	type: CrawlerType;
	keywords: string;
	status: CrawlerStatus;
	progress: number;
	totalCount: number;
	crawledCount: number;
	startTime?: string;
	endTime?: string;
	error?: string;
}

// 爬虫配置
export interface CrawlerConfig {
	platform: CrawlerPlatform;
	platforms: CrawlerPlatform[];  // 多平台支持
	crawlerType: CrawlerType;
	keywords: string;
	maxNotesCount: number;
	enableComments: boolean;
	sortType: string;
}

// 平台列表
export const PLATFORMS: PlatformConfig[] = [
	{ id: "xhs", name: "小红书", color: "#FF2442", icon: "📕" },
	{ id: "douyin", name: "抖音", color: "#000000", icon: "🎵" },
	{ id: "bilibili", name: "哔哩哔哩", color: "#00A1D6", icon: "📺" },
	{ id: "weibo", name: "微博", color: "#FF8200", icon: "📰" },
	{ id: "kuaishou", name: "快手", color: "#FF5000", icon: "📹" },
	{ id: "zhihu", name: "知乎", color: "#0084FF", icon: "💬" },
	{ id: "tieba", name: "贴吧", color: "#4879BD", icon: "📋" },
];
