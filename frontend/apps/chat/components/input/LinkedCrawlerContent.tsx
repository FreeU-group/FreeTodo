import { FileText, X } from "lucide-react";
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

type LinkedCrawlerContentProps = {
	crawlerResult: CrawlResultItem | null;
	onClear: () => void;
};

export function LinkedCrawlerContent({
	crawlerResult,
	onClear,
}: LinkedCrawlerContentProps) {
	// 没有关联爬取内容时，不显示任何内容
	if (!crawlerResult) {
		return null;
	}

	const platform = getPlatformFromUrl(crawlerResult.noteUrl);
	const platformName = PLATFORM_NAMES[platform] || "内容";
	const title = crawlerResult.title || crawlerResult.desc?.slice(0, 30) || "爬取内容";
	const commentCount = crawlerResult.comments?.length || 0;

	return (
		<div className="flex items-center gap-2 pb-2 mb-2 border-b border-border">
			<FileText className="h-4 w-4 text-primary shrink-0" />
			<span className="text-xs font-semibold text-foreground shrink-0">
				关联内容:
			</span>
			<div className="flex items-center gap-1 min-w-0 flex-1">
				<span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary shrink-0">
					{platformName}
				</span>
				<span className="text-xs text-foreground truncate" title={title}>
					{title}
				</span>
				{commentCount > 0 && (
					<span className="text-xs text-muted-foreground shrink-0">
						({commentCount} 条评论)
					</span>
				)}
			</div>
			<button
				type="button"
				onClick={onClear}
				className="p-1 rounded hover:bg-muted/60 transition-colors shrink-0"
				title="取消关联"
			>
				<X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
			</button>
		</div>
	);
}
