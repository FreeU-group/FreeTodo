import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo } from "react";
import { useBreakdownService } from "@/apps/chat/hooks/useBreakdownService";
import { useTodos } from "@/lib/query";
import { useBreakdownStore } from "@/lib/store/breakdown-store";
import type { Todo } from "@/lib/types";

export const useBreakdownQuestionnaire = () => {
	const tChat = useTranslations("chat");

	// 从 TanStack Query 获取 todos 数据（用于 Breakdown 功能）
	const { data: todos = [] } = useTodos();

	// Breakdown功能相关状态
	const {
		activeBreakdownTodoId,
		stage,
		questions,
		answers,
		summary,
		subtasks,
		isLoading: breakdownLoading,
		isGeneratingSummary,
		summaryStreamingText,
		isGeneratingQuestions,
		questionStreamingCount,
		questionStreamingTitle,
		error: breakdownError,
		setQuestions,
		setAnswer,
		setSummary,
		setSummaryStreaming,
		setIsGeneratingSummary,
		setQuestionStreaming,
		setIsGeneratingQuestions,
		applyBreakdown,
	} = useBreakdownStore();

	const { generateQuestions, generateSummary } = useBreakdownService();

	// 获取当前正在拆分的待办
	const activeBreakdownTodo = useMemo(() => {
		if (!activeBreakdownTodoId) return null;
		return (
			todos.find((todo: Todo) => todo.id === activeBreakdownTodoId) || null
		);
	}, [activeBreakdownTodoId, todos]);

	// 当进入questionnaire阶段时，生成选择题
	useEffect(() => {
		if (
			stage === "questionnaire" &&
			activeBreakdownTodo &&
			questions.length === 0 &&
			breakdownLoading
		) {
			let cancelled = false;
			const generate = async () => {
				try {
					console.log(
						"开始生成选择题，任务名称:",
						activeBreakdownTodo.name,
						"任务ID:",
						activeBreakdownTodo.id,
					);
					setIsGeneratingQuestions(true);
					const generatedQuestions = await generateQuestions(
						activeBreakdownTodo.name,
						activeBreakdownTodo.id,
						(count, title) => {
							// 流式更新问题生成进度
							if (!cancelled) {
								setQuestionStreaming(count, title);
							}
						},
					);
					if (!cancelled) {
						console.log("生成的选择题:", generatedQuestions);
						setQuestions(generatedQuestions);
						setIsGeneratingQuestions(false);
					}
				} catch (error) {
					if (!cancelled) {
						console.error("Failed to generate questions:", error);
						// 错误处理：设置错误状态
						useBreakdownStore.setState({
							error:
								error instanceof Error
									? error.message
									: tChat("generateQuestionsFailed"),
							isLoading: false,
							isGeneratingQuestions: false,
						});
					}
				}
			};
			void generate();
			return () => {
				cancelled = true;
			};
		}
	}, [
		stage,
		activeBreakdownTodo,
		questions.length,
		breakdownLoading,
		generateQuestions,
		setQuestions,
		setQuestionStreaming,
		setIsGeneratingQuestions,
		tChat,
	]);

	// 处理提交回答
	const handleSubmitAnswers = useCallback(async () => {
		if (!activeBreakdownTodo) return;

		try {
			// 设置生成状态
			setIsGeneratingSummary(true);
			setSummaryStreaming("");

			// 流式生成总结
			const result = await generateSummary(
				activeBreakdownTodo.name,
				answers,
				(streamingText) => {
					// 实时更新流式文本
					setSummaryStreaming(streamingText);
				},
			);

			// 生成完成，设置最终结果
			setSummary(result.summary, result.subtasks);
		} catch (error) {
			console.error("Failed to generate summary:", error);
			setIsGeneratingSummary(false);
			setSummaryStreaming(null);
			// 设置错误状态
			useBreakdownStore.setState({
				error:
					error instanceof Error
						? error.message
						: tChat("generateSummaryFailed"),
			});
		}
	}, [
		activeBreakdownTodo,
		answers,
		generateSummary,
		setSummary,
		setIsGeneratingSummary,
		setSummaryStreaming,
		tChat,
	]);

	// 处理接收拆分
	const handleAcceptBreakdown = useCallback(async () => {
		await applyBreakdown();
	}, [applyBreakdown]);

	return {
		activeBreakdownTodo,
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
		setAnswer,
		handleSubmitAnswers,
		handleAcceptBreakdown,
	};
};
