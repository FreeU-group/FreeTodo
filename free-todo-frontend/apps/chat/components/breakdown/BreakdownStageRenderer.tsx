"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { BreakdownSummary } from "@/apps/chat/components/breakdown/BreakdownSummary";
import { Questionnaire } from "@/apps/chat/components/breakdown/Questionnaire";
import { SummaryStreaming } from "@/apps/chat/components/message/SummaryStreaming";
import type { ParsedTodoTree } from "@/apps/chat/types";
import type { Question } from "@/lib/store/breakdown-store";
import type { Locale } from "@/lib/store/locale";

type BreakdownStageRendererProps = {
	stage: string;
	questions: Question[];
	answers: Record<string, string[]>;
	summary: string | null;
	subtasks: ParsedTodoTree[] | null;
	breakdownLoading: boolean;
	isGeneratingSummary: boolean;
	summaryStreamingText: string | null;
	isGeneratingQuestions: boolean;
	questionStreamingCount: number;
	questionStreamingTitle: string | null;
	breakdownError: string | null;
	locale: Locale;
	onAnswerChange: (questionId: string, options: string[]) => void;
	onSubmit: () => void;
	onAccept: () => void;
};

export function BreakdownStageRenderer({
	stage,
	questions,
	answers,
	summary,
	subtasks,
	breakdownLoading,
	isGeneratingSummary,
	summaryStreamingText,
	isGeneratingQuestions,
	questionStreamingCount,
	questionStreamingTitle,
	breakdownError,
	locale,
	onAnswerChange,
	onSubmit,
	onAccept,
}: BreakdownStageRendererProps) {
	const tChat = useTranslations("chat");

	// Breakdown功能：根据阶段显示不同内容
	if (stage === "questionnaire") {
		if (questions.length > 0) {
			return (
				<Questionnaire
					questions={questions}
					answers={answers}
					onAnswerChange={onAnswerChange}
					onSubmit={onSubmit}
					isSubmitting={isGeneratingSummary}
					disabled={isGeneratingSummary}
				/>
			);
		}

		return (
			<div className="flex-1 flex items-center justify-center">
				<div className="text-center space-y-3">
					{isGeneratingQuestions && questionStreamingCount > 0 ? (
						<div className="flex flex-col items-center gap-2">
							<div className="flex items-center gap-2 rounded-full bg-muted px-4 py-2 text-sm text-muted-foreground">
								<Loader2 className="h-4 w-4 animate-spin" />
								<span>
									{tChat("generatingQuestion", {
										count: questionStreamingCount,
									})}
								</span>
							</div>
							{questionStreamingTitle && (
								<p className="text-sm text-foreground max-w-md">
									{questionStreamingTitle}
								</p>
							)}
						</div>
					) : (
						<p className="text-muted-foreground">
							{tChat("generatingQuestions")}
						</p>
					)}
					{breakdownError && (
						<p className="mt-2 text-sm text-destructive">{breakdownError}</p>
					)}
				</div>
			</div>
		);
	}

	// 流式生成总结阶段
	if (isGeneratingSummary) {
		return <SummaryStreaming streamingText={summaryStreamingText || ""} />;
	}

	// 总结展示阶段（生成完成后）
	if (stage === "summary" && summary && subtasks && !isGeneratingSummary) {
		return (
			<BreakdownSummary
				summary={summary}
				subtasks={subtasks}
				onAccept={onAccept}
				isApplying={breakdownLoading}
				locale={locale}
			/>
		);
	}

	return null;
}
