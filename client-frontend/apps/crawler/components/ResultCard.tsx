"use client";

import { Bookmark, Check, ExternalLink, Heart, MessageCircle, Video } from "lucide-react";
import { useCrawlerStore } from "../store";
import type { CrawlResultItem } from "../types";

interface ResultCardProps {
	item: CrawlResultItem;
}

/**
 * 爬取结果卡片组件
 */
export function ResultCard({ item }: ResultCardProps) {
	const { setSelectedResult, markAsViewed, isViewed } = useCrawlerStore();
	const viewed = isViewed(item.id);

	const handleViewDetail = () => {
		setSelectedResult(item);
		markAsViewed(item.id);
	};

	const formatCount = (count: number): string => {
		if (count >= 10000) {
			return `${(count / 10000).toFixed(1)}万`;
		}
		return count.toString();
	};

	return (
		<div className="rounded-lg border border-border bg-card p-4 transition-all hover:border-primary/50 hover:shadow-md">
			{/* 用户信息 */}
			<div className="flex items-center gap-3">
				{item.avatar ? (
					<img
						src={item.avatar}
						alt={item.nickname}
						className="h-10 w-10 rounded-full bg-muted object-cover"
						referrerPolicy="no-referrer"
					/>
				) : (
					<div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
						{item.nickname?.charAt(0) || "?"}
					</div>
				)}
				<span className="text-sm font-medium text-foreground">{item.nickname}</span>
			</div>

			{/* 标题 */}
			<h3 className="mt-3 text-base font-semibold text-foreground line-clamp-2">
				{item.title}
			</h3>

			{/* 标签 */}
			<div className="mt-2 flex flex-wrap gap-1">
				{item.tags.slice(0, 5).map((tag, index) => (
					<span
						key={index}
						className="text-xs text-primary/80 hover:text-primary cursor-pointer"
					>
						{tag}
					</span>
				))}
				{item.tags.length > 5 && (
					<span className="text-xs text-muted-foreground">+{item.tags.length - 5}</span>
				)}
			</div>

			{/* 视频标识 */}
			{item.hasVideo && (
				<div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
					<Video className="h-3 w-3" />
					<span>包含视频</span>
				</div>
			)}

			{/* 统计数据 */}
			<div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
				<div className="flex items-center gap-1">
					<Heart className="h-3.5 w-3.5" />
					<span>{formatCount(item.likedCount)}</span>
				</div>
				<div className="flex items-center gap-1">
					<MessageCircle className="h-3.5 w-3.5" />
					<span>{formatCount(item.commentCount)}</span>
				</div>
				<div className="flex items-center gap-1">
					<Bookmark className="h-3.5 w-3.5" />
					<span>{formatCount(item.collectedCount)}</span>
				</div>
			</div>

			{/* 查看详情 */}
			<button
				type="button"
				onClick={handleViewDetail}
				className="mt-3 flex items-center gap-1 text-xs text-primary hover:underline"
			>
				<ExternalLink className="h-3 w-3" />
				查看详情
				{viewed && <Check className="h-3 w-3 text-green-500" />}
			</button>
		</div>
	);
}
