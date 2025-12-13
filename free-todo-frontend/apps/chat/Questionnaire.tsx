"use client";

import { Check, Edit2, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { Question } from "@/lib/store/plan-store";
import { cn } from "@/lib/utils";

interface QuestionnaireProps {
	questions: Question[];
	answers: Record<string, string[]>;
	onAnswerChange: (questionId: string, options: string[]) => void;
	onSubmit: () => void;
	isSubmitting: boolean;
	locale: string;
	disabled?: boolean; // 提交后禁用整个组件
}

export function Questionnaire({
	questions,
	answers,
	onAnswerChange,
	onSubmit,
	isSubmitting,
	locale,
	disabled = false,
}: QuestionnaireProps) {
	// 管理每个问题的自定义答案和编辑状态
	const [customAnswers, setCustomAnswers] = useState<Record<string, string>>(
		{},
	);
	const [editingQuestionId, setEditingQuestionId] = useState<string | null>(
		null,
	);

	const allAnswered = useMemo(() => {
		return questions.every((q) => {
			const answer = answers[q.id];
			const customAnswer = customAnswers[q.id];
			// 有标准答案或自定义答案都算已回答
			return (
				(answer && answer.length > 0) ||
				(customAnswer && customAnswer.trim().length > 0)
			);
		});
	}, [questions, answers, customAnswers]);

	const SKIP_OPTION = "不知道/不重要";
	const CUSTOM_PREFIX = "custom:";

	const handleOptionToggle = (questionId: string, option: string) => {
		const currentAnswers = answers[questionId] || [];
		const question = questions.find((q) => q.id === questionId);
		if (!question) return;

		// 如果选择的是"不知道/不重要"，清除自定义答案
		if (option === SKIP_OPTION) {
			// 如果已经选中，则取消选择；否则选择它并清除其他选项和自定义答案
			if (currentAnswers.includes(SKIP_OPTION)) {
				onAnswerChange(questionId, []);
			} else {
				onAnswerChange(questionId, [SKIP_OPTION]);
				// 清除自定义答案
				setCustomAnswers((prev) => {
					const next = { ...prev };
					delete next[questionId];
					return next;
				});
				setEditingQuestionId(null);
			}
			return;
		}

		// 如果当前已选择"不知道/不重要"或自定义答案，选择其他选项时先清除它们
		const hasSkipOption = currentAnswers.includes(SKIP_OPTION);
		const hasCustomAnswer = customAnswers[questionId];
		const filteredAnswers = hasSkipOption
			? currentAnswers.filter((a) => a !== SKIP_OPTION)
			: currentAnswers;

		// 清除自定义答案
		if (hasCustomAnswer) {
			setCustomAnswers((prev) => {
				const next = { ...prev };
				delete next[questionId];
				return next;
			});
			setEditingQuestionId(null);
		}

		// 默认多选：切换选项
		if (filteredAnswers.includes(option)) {
			onAnswerChange(
				questionId,
				filteredAnswers.filter((a) => a !== option),
			);
		} else {
			onAnswerChange(questionId, [...filteredAnswers, option]);
		}
	};

	const handleCustomAnswerChange = (questionId: string, value: string) => {
		setCustomAnswers((prev) => ({
			...prev,
			[questionId]: value,
		}));
		// 如果有自定义答案，清除标准答案和"不知道/不重要"
		if (value.trim().length > 0) {
			onAnswerChange(questionId, []);
		}
	};

	const handleCustomAnswerSubmit = (questionId: string) => {
		const customAnswer = customAnswers[questionId]?.trim();
		if (customAnswer && customAnswer.length > 0) {
			// 将自定义答案作为答案提交
			onAnswerChange(questionId, [`${CUSTOM_PREFIX}${customAnswer}`]);
			setEditingQuestionId(null);
		}
	};

	const hasCustomAnswer = (questionId: string): boolean => {
		const answer = answers[questionId] || [];
		return answer.some((a) => a.startsWith(CUSTOM_PREFIX));
	};

	const getCustomAnswerText = (questionId: string): string => {
		const answer = answers[questionId] || [];
		const customAnswer = answer.find((a) => a.startsWith(CUSTOM_PREFIX));
		if (customAnswer) {
			return customAnswer.substring(CUSTOM_PREFIX.length);
		}
		return customAnswers[questionId] || "";
	};

	const isSelected = (questionId: string, option: string): boolean => {
		return (answers[questionId] || []).includes(option);
	};

	return (
		<div className="flex-1 overflow-y-auto px-4 py-4">
			<div className="mx-auto max-w-2xl space-y-6">
				<div className="rounded-lg bg-muted/50 p-4">
					<h3 className="mb-2 text-lg font-semibold">
						{locale === "zh"
							? "请回答以下问题以完善任务详情"
							: "Please answer the following questions to complete task details"}
					</h3>
					<p className="text-sm text-muted-foreground">
						{locale === "zh"
							? "您的回答将帮助AI更好地理解任务需求并生成详细的计划"
							: "Your answers will help AI better understand task requirements and generate a detailed plan"}
					</p>
				</div>

				{questions.map((question, index) => (
					<div
						key={question.id}
						className="rounded-lg border bg-card p-4 shadow-sm"
					>
						<div className="mb-4">
							<div className="mb-2 flex items-center gap-2">
								<span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
									{index + 1}
								</span>
								<h4 className="text-base font-medium">{question.question}</h4>
							</div>
							<p className="ml-8 text-xs text-muted-foreground">
								{locale === "zh" ? "（可多选）" : "(Multiple choice)"}
							</p>
						</div>

						<div className="ml-8 space-y-2">
							{question.options.map((option) => {
								const selected = isSelected(question.id, option);
								const isSkipOption = option === SKIP_OPTION;
								return (
									<button
										key={option}
										type="button"
										onClick={() =>
											!disabled && handleOptionToggle(question.id, option)
										}
										disabled={disabled}
										className={cn(
											"flex w-full items-center gap-3 rounded-md border p-3 text-left transition-colors",
											selected
												? "border-primary bg-primary/10 text-foreground"
												: "border-border bg-background hover:bg-muted",
											disabled && "cursor-not-allowed opacity-50",
											isSkipOption && "border-dashed",
										)}
									>
										<div
											className={cn(
												"flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border-2",
												selected
													? "border-primary bg-primary"
													: "border-muted-foreground/50",
											)}
										>
											{selected && (
												<Check className="h-3 w-3 text-primary-foreground" />
											)}
										</div>
										<span
											className={cn(
												"flex-1 text-sm",
												isSkipOption && "text-muted-foreground italic",
											)}
										>
											{option}
										</span>
									</button>
								);
							})}
							{/* 添加"不知道/不重要"选项，支持内联编辑 */}
							{editingQuestionId === question.id ? (
								// 编辑模式：显示输入框
								<div className="flex items-center gap-2 rounded-md border border-dashed border-primary bg-primary/5 p-3">
									<div className="flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 border-primary bg-primary">
										<Edit2 className="h-3 w-3 text-primary-foreground" />
									</div>
									<input
										type="text"
										value={getCustomAnswerText(question.id)}
										onChange={(e) =>
											handleCustomAnswerChange(question.id, e.target.value)
										}
										onBlur={() => {
											const customAnswer = customAnswers[question.id]?.trim();
											if (customAnswer && customAnswer.length > 0) {
												handleCustomAnswerSubmit(question.id);
											} else {
												setEditingQuestionId(null);
												if (!hasCustomAnswer(question.id)) {
													setCustomAnswers((prev) => {
														const next = { ...prev };
														delete next[question.id];
														return next;
													});
												}
											}
										}}
										onKeyDown={(e) => {
											if (e.key === "Enter") {
												e.preventDefault();
												const customAnswer = customAnswers[question.id]?.trim();
												if (customAnswer && customAnswer.length > 0) {
													handleCustomAnswerSubmit(question.id);
												} else {
													setEditingQuestionId(null);
												}
											}
											if (e.key === "Escape") {
												setEditingQuestionId(null);
												if (!hasCustomAnswer(question.id)) {
													setCustomAnswers((prev) => {
														const next = { ...prev };
														delete next[question.id];
														return next;
													});
												}
											}
										}}
										placeholder={
											locale === "zh"
												? "请输入您的自定义回答..."
												: "Enter your custom answer..."
										}
										disabled={disabled}
										// biome-ignore lint/a11y/noAutofocus: 自定义输入框需要自动聚焦以提升用户体验
										autoFocus
										className={cn(
											"flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none",
											disabled && "cursor-not-allowed opacity-50",
										)}
									/>
								</div>
							) : (
								// 显示模式：显示"不知道/不重要"选项和编辑按钮
								<div className="flex items-center gap-2">
									<button
										type="button"
										onClick={() =>
											!disabled && handleOptionToggle(question.id, SKIP_OPTION)
										}
										disabled={disabled}
										className={cn(
											"flex flex-1 items-center gap-3 rounded-md border border-dashed p-3 text-left transition-colors",
											isSelected(question.id, SKIP_OPTION)
												? "border-primary bg-primary/10 text-foreground"
												: "border-muted-foreground/50 bg-background hover:bg-muted",
											disabled && "cursor-not-allowed opacity-50",
											hasCustomAnswer(question.id) && "border-primary/50",
										)}
									>
										<div
											className={cn(
												"flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border-2",
												isSelected(question.id, SKIP_OPTION)
													? "border-primary bg-primary"
													: hasCustomAnswer(question.id)
														? "border-primary/50 bg-primary/5"
														: "border-muted-foreground/50",
											)}
										>
											{isSelected(question.id, SKIP_OPTION) && (
												<Check className="h-3 w-3 text-primary-foreground" />
											)}
											{hasCustomAnswer(question.id) &&
												!isSelected(question.id, SKIP_OPTION) && (
													<Edit2 className="h-3 w-3 text-primary" />
												)}
										</div>
										<span
											className={cn(
												"flex-1 text-sm",
												isSelected(question.id, SKIP_OPTION)
													? "text-muted-foreground italic"
													: hasCustomAnswer(question.id)
														? "text-foreground"
														: "text-muted-foreground italic",
											)}
										>
											{hasCustomAnswer(question.id)
												? getCustomAnswerText(question.id)
												: SKIP_OPTION}
										</span>
									</button>
									{/* 编辑按钮 */}
									<button
										type="button"
										onClick={() => {
											if (!disabled) {
												setEditingQuestionId(question.id);
												// 如果当前有标准答案，清除它们
												if (
													answers[question.id] &&
													answers[question.id].length > 0 &&
													!hasCustomAnswer(question.id)
												) {
													onAnswerChange(question.id, []);
												}
												// 如果没有自定义答案，初始化一个空字符串
												if (!customAnswers[question.id]) {
													setCustomAnswers((prev) => ({
														...prev,
														[question.id]: "",
													}));
												}
											}
										}}
										disabled={disabled}
										className={cn(
											"flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-background transition-colors hover:bg-muted",
											disabled && "cursor-not-allowed opacity-50",
											hasCustomAnswer(question.id) &&
												"border-primary bg-primary/10",
										)}
										title={locale === "zh" ? "自定义回答" : "Custom answer"}
									>
										<Edit2 className="h-4 w-4 text-muted-foreground" />
									</button>
								</div>
							)}
						</div>
					</div>
				))}

				<div className="flex justify-end pt-4">
					<button
						type="button"
						onClick={onSubmit}
						disabled={!allAnswered || isSubmitting}
						className={cn(
							"flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors",
							!allAnswered || isSubmitting
								? "cursor-not-allowed opacity-50"
								: "hover:bg-primary/90",
						)}
					>
						{isSubmitting ? (
							<>
								<Loader2 className="h-4 w-4 animate-spin" />
								{locale === "zh" ? "提交中..." : "Submitting..."}
							</>
						) : locale === "zh" ? (
							"提交回答"
						) : (
							"Submit Answers"
						)}
					</button>
				</div>
			</div>
		</div>
	);
}
