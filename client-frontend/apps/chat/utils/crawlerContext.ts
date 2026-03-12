import type { CrawlResultItem } from "@/apps/crawler/types";

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
	if (!url) return "unknown";
	if (url.includes("douyin.com")) return "douyin";
	if (url.includes("xiaohongshu.com")) return "xhs";
	if (url.includes("bilibili.com")) return "bilibili";
	if (url.includes("weibo.com") || url.includes("weibo.cn")) return "weibo";
	if (url.includes("kuaishou.com")) return "kuaishou";
	if (url.includes("zhihu.com")) return "zhihu";
	if (url.includes("tieba.baidu.com")) return "tieba";
	return "unknown";
}

/**
 * 构建爬取内容的上下文，供 AI 聊天使用
 */
export function buildCrawlerContext(result: CrawlResultItem): string {
	const platform = getPlatformFromUrl(result.noteUrl);
	const platformName = PLATFORM_NAMES[platform] || "社交媒体";

	const lines: string[] = [];

	// 标题区域
	lines.push(`【${platformName}内容详情】`);
	lines.push("");

	// 基本信息
	lines.push(`📝 标题: ${result.title || "无标题"}`);
	lines.push(`👤 作者: ${result.nickname || "未知作者"}`);
	lines.push(`📅 类型: ${result.hasVideo ? "视频笔记" : "图文笔记"}`);

	// 内容描述
	if (result.desc) {
		lines.push("");
		lines.push(`📖 内容描述:`);
		lines.push(result.desc);
	}

	// 标签
	if (result.tags && result.tags.length > 0) {
		const cleanTags = result.tags.map(tag =>
			tag.replace(/\[话题\]#?/g, '').replace(/#/g, '').trim()
		).filter(Boolean);
		if (cleanTags.length > 0) {
			lines.push("");
			lines.push(`🏷️ 标签: ${cleanTags.join(", ")}`);
		}
	}

	// 互动数据
	lines.push("");
	lines.push(`📊 互动数据:`);
	lines.push(`   - 点赞: ${formatCount(result.likedCount)}`);
	lines.push(`   - 评论: ${formatCount(result.commentCount)}`);
	lines.push(`   - 收藏: ${formatCount(result.collectedCount)}`);
	lines.push(`   - 分享: ${formatCount(result.shareCount)}`);

	// 评论区
	if (result.comments && result.comments.length > 0) {
		lines.push("");
		lines.push(`💬 热门评论 (共 ${result.comments.length} 条):`);

		// 只取前 10 条评论，避免上下文过长
		const topComments = result.comments.slice(0, 10);
		for (const comment of topComments) {
			const likeInfo = comment.likeCount > 0 ? ` [👍${formatCount(comment.likeCount)}]` : "";
			const location = comment.ipLocation ? ` (${comment.ipLocation})` : "";
			lines.push(`   - ${comment.nickname}${location}: ${comment.content}${likeInfo}`);
		}

		if (result.comments.length > 10) {
			lines.push(`   ... 还有 ${result.comments.length - 10} 条评论`);
		}
	}

	// 原文链接
	if (result.noteUrl) {
		lines.push("");
		lines.push(`🔗 原文链接: ${result.noteUrl}`);
	}

	return lines.join("\n");
}

/**
 * 格式化数量显示
 */
function formatCount(count: number | undefined): string {
	if (!count) return "0";
	if (count >= 10000) {
		return `${(count / 10000).toFixed(1)}万`;
	}
	return count.toString();
}

/**
 * 构建简短的爬取内容摘要（用于显示）
 */
export function buildCrawlerSummary(result: CrawlResultItem): string {
	const platform = getPlatformFromUrl(result.noteUrl);
	const platformName = PLATFORM_NAMES[platform] || "内容";
	return `[${platformName}] ${result.title || result.desc?.slice(0, 30) || "爬取内容"}`;
}
