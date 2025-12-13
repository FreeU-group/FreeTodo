"use client";

import { Loader2 } from "lucide-react";
import { useMemo } from "react";
import ReactMarkdown from "react-markdown";

interface SummaryStreamingProps {
	streamingText: string;
	locale: string;
}

// 尝试从流式文本中提取部分内容用于预览
const extractPreview = (
	text: string,
): { summary?: string; hasJson: boolean } => {
	// 检查是否包含JSON结构
	const jsonMatch = text.match(/\{[\s\S]*?"summary"[\s\S]*?:\s*"([^"]*)/);
	if (jsonMatch?.[1]) {
		return {
			summary: jsonMatch[1],
			hasJson: true,
		};
	}

	// 如果没有JSON，尝试提取可能的总结文本（在"summary"字段之后）
	const summaryStart = text.indexOf('"summary"');
	if (summaryStart !== -1) {
		const afterSummary = text.substring(summaryStart + 10); // 跳过 "summary":"
		const quoteEnd = afterSummary.indexOf('"');
		if (quoteEnd !== -1) {
			return {
				summary: afterSummary.substring(0, quoteEnd),
				hasJson: true,
			};
		}
	}

	return { hasJson: false };
};

export function SummaryStreaming({
	streamingText,
	locale,
}: SummaryStreamingProps) {
	const preview = useMemo(() => extractPreview(streamingText), [streamingText]);

	return (
		<div className="flex-1 overflow-y-auto px-4 py-4">
			<div className="mx-auto max-w-2xl space-y-6">
				<div className="rounded-lg bg-muted/50 p-4">
					<div className="mb-2 flex items-center gap-2">
						<Loader2 className="h-4 w-4 animate-spin text-primary" />
						<h3 className="text-lg font-semibold">
							{locale === "zh"
								? "AI正在生成总结..."
								: "AI is generating summary..."}
						</h3>
					</div>
					<p className="text-sm text-muted-foreground">
						{locale === "zh"
							? "请稍候，AI正在根据您的回答生成详细的任务总结和子任务列表"
							: "Please wait, AI is generating a detailed task summary and subtask list based on your answers"}
					</p>
				</div>

				{/* 流式显示区域 */}
				{streamingText && (
					<div className="rounded-lg border bg-card p-4 shadow-sm">
						<h4 className="mb-3 text-base font-semibold">
							{locale === "zh" ? "生成中..." : "Generating..."}
						</h4>
						{preview.summary ? (
							<div className="prose prose-sm max-w-none dark:prose-invert">
								<ReactMarkdown>{preview.summary}</ReactMarkdown>
								{preview.hasJson && (
									<div className="mt-2 text-xs text-muted-foreground">
										{locale === "zh"
											? "正在解析完整内容..."
											: "Parsing full content..."}
									</div>
								)}
							</div>
						) : (
							<div className="prose prose-sm max-w-none dark:prose-invert">
								<div className="whitespace-pre-wrap text-sm text-muted-foreground">
									{streamingText.substring(0, 500)}
									{streamingText.length > 500 && "..."}
								</div>
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
