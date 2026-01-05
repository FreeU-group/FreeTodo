/**
 * 智能纪要视图组件
 * 显示段落总结
 */

import type { TranscriptSegment } from "../types";

interface SummaryViewProps {
	segments: TranscriptSegment[];
	summary?: string; // 如果有总结文本
	onSegmentClick?: (segment: TranscriptSegment) => void;
}

export function SummaryView({
	segments,
	summary,
	onSegmentClick,
}: SummaryViewProps) {
	// 当前未使用的回调，保留以兼容未来扩展
	void onSegmentClick;
	// 如果没有提供总结，则使用优化后的文本合并
	const displaySummary =
		summary ||
		segments
			.map((s) => s.optimizedText || s.rawText)
			.filter(Boolean)
			.join("\n\n");

	return (
		<div className="flex-1 overflow-y-auto p-6">
			{!displaySummary ? (
				<div className="flex items-center justify-center h-full text-muted-foreground">
					<p>暂无纪要内容</p>
				</div>
			) : (
				<div className="prose prose-sm max-w-none dark:prose-invert">
					<div className="whitespace-pre-wrap text-foreground leading-relaxed">
						{displaySummary}
					</div>
				</div>
			)}
		</div>
	);
}
