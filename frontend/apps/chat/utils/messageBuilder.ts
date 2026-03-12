import type { CrawlResultItem } from "@/apps/crawler/types";

/**
 * 消息构建参数
 */
export interface BuildPayloadMessageParams {
	trimmedText: string;
	userLabel: string;
	todoContext: string;
	crawlerResult?: CrawlResultItem | null;
}

/**
 * 消息构建结果
 */
export interface PayloadMessageResult {
	/** 发送给后端的完整消息 */
	payloadMessage: string;
	/** 系统提示词（可选，用于后端保存） */
	systemPromptForBackend?: string;
	/** 上下文（可选，用于后端保存） */
	contextForBackend?: string;
}

// 根据 URL 判断平台名称
function getPlatformName(url: string): string {
	if (!url) return "未知平台";
	if (url.includes("douyin.com")) return "抖音";
	if (url.includes("xiaohongshu.com")) return "小红书";
	if (url.includes("bilibili.com")) return "哔哩哔哩";
	if (url.includes("weibo.com") || url.includes("weibo.cn")) return "微博";
	if (url.includes("kuaishou.com")) return "快手";
	if (url.includes("zhihu.com")) return "知乎";
	if (url.includes("tieba.baidu.com")) return "贴吧";
	return "未知平台";
}

/**
 * 将爬取结果构建为上下文文本块，供 AI 阅读
 */
export function buildCrawlerContext(result: CrawlResultItem): string {
	const platform = getPlatformName(result.noteUrl);
	const parts: string[] = [];

	parts.push(`[关联的${platform}帖子内容]`);
	parts.push(`平台: ${platform}`);
	parts.push(`作者: ${result.nickname}`);
	if (result.title) parts.push(`标题: ${result.title}`);
	if (result.desc) parts.push(`正文: ${result.desc}`);
	if (result.tags && result.tags.length > 0) {
		parts.push(`标签: ${result.tags.join(", ")}`);
	}
	parts.push(`点赞: ${result.likedCount} | 评论: ${result.commentCount} | 收藏: ${result.collectedCount} | 分享: ${result.shareCount}`);
	if (result.time) parts.push(`发布时间: ${result.time}`);
	if (result.noteUrl) parts.push(`原文链接: ${result.noteUrl}`);

	// 附带评论
	if (result.comments && result.comments.length > 0) {
		parts.push("");
		parts.push(`[评论区 (共${result.comments.length}条)]`);
		for (const comment of result.comments.slice(0, 20)) {
			const likeInfo = comment.likeCount > 0 ? ` (${comment.likeCount}赞)` : "";
			parts.push(`- ${comment.nickname}: ${comment.content}${likeInfo}`);
		}
		if (result.comments.length > 20) {
			parts.push(`... 还有 ${result.comments.length - 20} 条评论`);
		}
	}

	return parts.join("\n");
}

/**
 * 构建发送给后端的 payload 消息
 */
export const buildPayloadMessage = (
	params: BuildPayloadMessageParams,
): PayloadMessageResult => {
	const { trimmedText, userLabel, todoContext, crawlerResult } = params;

	// 构建爬虫内容上下文
	const crawlerContext = crawlerResult ? buildCrawlerContext(crawlerResult) : "";

	const allContext = [todoContext, crawlerContext].filter(Boolean).join("\n\n");

	return {
		payloadMessage: `${allContext}

${userLabel}: ${trimmedText}`,
		contextForBackend: allContext,
	};
};

/**
 * 将前端聊天模式映射为后端模式
 */
export const getModeForBackend = (): string => "agno";
