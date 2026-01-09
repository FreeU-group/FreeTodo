"use client";

import {
	Bookmark,
	ChevronDown,
	ChevronUp,
	ExternalLink,
	Heart,
	Loader2,
	MessageCircle,
	Search,
	Share2,
	ThumbsUp,
	Video,
	Image as ImageIcon,
	X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { PanelHeader } from "@/components/common/layout/PanelHeader";
import { useCrawlerDetailStore } from "@/lib/store/crawler-detail-store";

// 爬虫 API 基础 URL
const CRAWLER_API_URL =
	process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// 将视频URL转换为代理URL
function getProxyVideoUrl(videoUrl: string): string {
	if (!videoUrl) return "";
	// 通过后端代理访问视频，绕过CDN防盗链
	return `${CRAWLER_API_URL}/api/crawler/proxy/video?url=${encodeURIComponent(videoUrl)}`;
}

// 评论类型
interface Comment {
	comment_id: string;
	note_id: string;
	content: string;
	nickname: string;
	avatar: string;
	like_count: string;
	sub_comment_count: string;
	create_time: number;
	ip_location: string | null;
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

// 格式化时间
function formatTime(timestamp: number): string {
	const date = new Date(timestamp);
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	const hours = String(date.getHours()).padStart(2, "0");
	const minutes = String(date.getMinutes()).padStart(2, "0");
	return `${year}-${month}-${day} ${hours}:${minutes}`;
}

// 评论卡片组件
function CommentCard({ comment }: { comment: Comment }) {
	const t = useTranslations("crawlerDetail");
	
	return (
		<div className="py-4 border-b border-border last:border-b-0">
			<div className="flex gap-3">
				{/* 头像 */}
				{comment.avatar ? (
					<img
						src={comment.avatar}
						alt={comment.nickname}
						className="h-10 w-10 rounded-full object-cover shrink-0"
						onError={(e) => {
							(e.target as HTMLImageElement).style.display = "none";
						}}
					/>
				) : (
					<div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium shrink-0">
						{comment.nickname?.charAt(0) || "?"}
					</div>
				)}
				
				<div className="flex-1 min-w-0">
					{/* 用户名和位置 */}
					<div className="flex items-center gap-2 mb-1">
						<span className="font-medium text-sm">{comment.nickname}</span>
						{comment.ip_location && (
							<span className="text-xs text-muted-foreground">
								{comment.ip_location}
							</span>
						)}
					</div>
					
					{/* 评论内容 */}
					<p className="text-sm mb-2">{comment.content}</p>
					
					{/* 时间和互动 */}
					<div className="flex items-center gap-4 text-xs text-muted-foreground">
						<span>{formatTime(comment.create_time)}</span>
						<span className="flex items-center gap-1">
							<ThumbsUp className="h-3 w-3" />
							{formatCount(comment.like_count)}
						</span>
						<span className="flex items-center gap-1">
							<MessageCircle className="h-3 w-3" />
							{comment.sub_comment_count} {t("replies")}
						</span>
					</div>
				</div>
			</div>
		</div>
	);
}

export function CrawlerDetailPanel() {
	const t = useTranslations("crawlerDetail");
	const { selectedItem, clearSelectedItem } = useCrawlerDetailStore();
	
	// 评论状态
	const [comments, setComments] = useState<Comment[]>([]);
	const [commentsLoading, setCommentsLoading] = useState(false);
	const [commentsExpanded, setCommentsExpanded] = useState(true);

	// 解析话题标签
	const tags = selectedItem?.tag_list?.split(",").filter(Boolean) || [];

	// 获取评论
	const fetchComments = useCallback(async (noteId: string) => {
		setCommentsLoading(true);
		try {
			// 获取文件列表
			const filesRes = await fetch(`${CRAWLER_API_URL}/api/crawler/data/files`);
			if (!filesRes.ok) {
				setComments([]);
				return;
			}
			
			const filesData = await filesRes.json();
			const files = filesData.files || [];
			
			// 筛选评论文件，按修改时间排序获取最新的
			const commentsFiles = files
				.filter((f: { name: string }) => f.name.includes("comments") && f.name.endsWith(".json"))
				.sort((a: { modified_at: number }, b: { modified_at: number }) => b.modified_at - a.modified_at);
			
			const commentsFile = commentsFiles[0];
			
			if (!commentsFile) {
				setComments([]);
				return;
			}
			
			// 获取评论预览（获取更多数据，添加时间戳避免缓存）
			const previewRes = await fetch(
				`${CRAWLER_API_URL}/api/crawler/data/preview/${commentsFile.path}?limit=2000&t=${Date.now()}`
			);
			
			if (previewRes.ok) {
				const previewData = await previewRes.json();
				// 筛选当前笔记的评论，按点赞数排序
				const noteComments = (previewData.data || [])
					.filter((c: Comment) => c.note_id === noteId)
					.sort((a: Comment, b: Comment) => {
						const likeA = Number.parseInt(a.like_count) || 0;
						const likeB = Number.parseInt(b.like_count) || 0;
						return likeB - likeA;
					});
				setComments(noteComments);
			} else {
				setComments([]);
			}
		} catch {
			setComments([]);
		} finally {
			setCommentsLoading(false);
		}
	}, []);

	// 选中内容变化时获取评论
	useEffect(() => {
		if (selectedItem?.note_id) {
			fetchComments(selectedItem.note_id);
		} else {
			setComments([]);
		}
	}, [selectedItem?.note_id, fetchComments]);

	// 没有选中内容时显示空状态
	if (!selectedItem) {
		return (
			<div className="flex h-full flex-col overflow-hidden bg-background">
				<PanelHeader icon={Search} title={t("title")} />
				<div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
					<Search className="h-16 w-16 mb-4 opacity-30" />
					<p className="text-sm">{t("noSelection")}</p>
					<p className="text-xs mt-1">{t("selectHint")}</p>
				</div>
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col overflow-hidden bg-background">
			<PanelHeader icon={Search} title={t("title")} />

			<div className="flex-1 overflow-y-auto">
				{/* 头部操作栏 */}
				<div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/95 backdrop-blur px-4 py-2">
					<span className="text-xs text-muted-foreground">
						{t("viewingDetail")}
					</span>
					<div className="flex items-center gap-2">
						<a
							href={selectedItem.note_url}
							target="_blank"
							rel="noopener noreferrer"
							className="flex items-center gap-1 text-xs text-primary hover:underline"
						>
							<ExternalLink className="h-3 w-3" />
							{t("openInBrowser")}
						</a>
						<button
							type="button"
							onClick={clearSelectedItem}
							className="rounded p-1 hover:bg-muted"
						>
							<X className="h-4 w-4" />
						</button>
					</div>
				</div>

				<div className="p-4">
					{/* 用户信息 */}
					<div className="flex items-center gap-3 mb-4">
						{selectedItem.avatar ? (
							<img
								src={selectedItem.avatar}
								alt={selectedItem.nickname}
								className="h-12 w-12 rounded-full object-cover"
								onError={(e) => {
									(e.target as HTMLImageElement).style.display = "none";
								}}
							/>
						) : (
							<div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-lg">
								{selectedItem.nickname?.charAt(0) || "?"}
							</div>
						)}
						<div>
							<div className="font-medium">{selectedItem.nickname}</div>
							<div className="text-xs text-muted-foreground flex items-center gap-1">
								{selectedItem.type === "video" ? (
									<>
										<Video className="h-3 w-3" />
										{t("videoNote")}
									</>
								) : (
									<>
										<ImageIcon className="h-3 w-3" />
										{t("imageNote")}
									</>
								)}
							</div>
						</div>
					</div>

					{/* 标题 */}
					<h2 className="text-lg font-semibold mb-3">{selectedItem.title}</h2>

					{/* 描述内容 */}
					{selectedItem.desc && (
						<div className="mb-4 text-sm text-foreground/80 whitespace-pre-wrap">
							{selectedItem.desc}
						</div>
					)}

					{/* 话题标签 */}
					{tags.length > 0 && (
						<div className="flex flex-wrap gap-2 mb-4">
							{tags.map((tag, index) => (
								<span
									key={`${tag}-${index}`}
									className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs text-primary"
								>
									#{tag}
								</span>
							))}
						</div>
					)}

					{/* 视频播放 */}
					{selectedItem.type === "video" && selectedItem.video_url && (
						<div className="mb-4">
							<video
								src={getProxyVideoUrl(selectedItem.video_url)}
								controls
								className="w-full rounded-lg max-h-96"
								poster={selectedItem.image_list}
								preload="metadata"
							>
								<track kind="captions" />
								{t("videoNotSupported")}
							</video>
						</div>
					)}

					{/* 图片预览（仅图文笔记或视频无法播放时显示） */}
					{selectedItem.type !== "video" && selectedItem.image_list && (
						<div className="mb-4">
							<img
								src={selectedItem.image_list}
								alt={t("coverImage")}
								className="w-full rounded-lg object-cover max-h-80"
								onError={(e) => {
									(e.target as HTMLImageElement).style.display = "none";
								}}
							/>
						</div>
					)}

					{/* 统计数据 */}
					<div className="grid grid-cols-4 gap-4 p-4 rounded-lg bg-muted/30 mb-4">
						<div className="flex flex-col items-center">
							<Heart className="h-5 w-5 text-red-500 mb-1" />
							<span className="text-sm font-medium">
								{formatCount(selectedItem.liked_count)}
							</span>
							<span className="text-xs text-muted-foreground">{t("likes")}</span>
						</div>
						<div className="flex flex-col items-center">
							<MessageCircle className="h-5 w-5 text-blue-500 mb-1" />
							<span className="text-sm font-medium">
								{formatCount(selectedItem.comment_count)}
							</span>
							<span className="text-xs text-muted-foreground">{t("comments")}</span>
						</div>
						<div className="flex flex-col items-center">
							<Bookmark className="h-5 w-5 text-yellow-500 mb-1" />
							<span className="text-sm font-medium">
								{formatCount(selectedItem.collected_count)}
							</span>
							<span className="text-xs text-muted-foreground">{t("collects")}</span>
						</div>
						{selectedItem.share_count && (
							<div className="flex flex-col items-center">
								<Share2 className="h-5 w-5 text-green-500 mb-1" />
								<span className="text-sm font-medium">
									{formatCount(selectedItem.share_count)}
								</span>
								<span className="text-xs text-muted-foreground">{t("shares")}</span>
							</div>
						)}
					</div>

					{/* 评论区 */}
					<div className="rounded-lg border border-border">
						{/* 评论区头部 */}
						<button
							type="button"
							onClick={() => setCommentsExpanded(!commentsExpanded)}
							className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30"
						>
							<div className="flex items-center gap-2">
								<MessageCircle className="h-4 w-4" />
								<span className="font-medium">
									{t("commentsSection")} ({comments.length})
								</span>
							</div>
							{commentsExpanded ? (
								<ChevronUp className="h-4 w-4" />
							) : (
								<ChevronDown className="h-4 w-4" />
							)}
						</button>

						{/* 评论列表 */}
						{commentsExpanded && (
							<div className="px-4 border-t border-border">
								{commentsLoading ? (
									<div className="flex items-center justify-center py-8">
										<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
									</div>
								) : comments.length > 0 ? (
									<div>
										{comments.map((comment) => (
											<CommentCard key={comment.comment_id} comment={comment} />
										))}
									</div>
								) : (
									<div className="py-8 text-center text-sm text-muted-foreground">
										{t("noComments")}
									</div>
								)}
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
