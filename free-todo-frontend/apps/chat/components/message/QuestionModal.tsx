"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export type QuestionData = {
	question_text: string;
	question_id: string;
	step_id: number;
	suggested_answers: string[];
	allow_custom: boolean;
	context?: string;
};

type QuestionModalProps = {
	question: QuestionData;
	onAnswer: (answer: string) => void;
	onCancel: () => void;
};

export function QuestionModal({
	question,
	onAnswer,
	onCancel,
}: QuestionModalProps) {
	const [customAnswer, setCustomAnswer] = useState("");
	const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);

	const handleSubmit = () => {
		const answer = selectedAnswer || customAnswer;
		if (answer.trim()) {
			onAnswer(answer.trim());
		}
	};

	return (
		<div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
			<div className="mb-3 text-sm font-medium text-foreground">
				需要您的输入
			</div>
			<div className="mb-4 whitespace-pre-wrap text-sm text-muted-foreground">
				{question.question_text}
			</div>
			{question.context && (
				<div className="mb-4 text-xs text-muted-foreground/70">
					{question.context}
				</div>
			)}

			{/* Suggested answer buttons */}
			{question.suggested_answers.length > 0 && (
				<div className="mb-4 space-y-2">
					{question.suggested_answers.map((answer) => (
						<button
							key={answer}
							type="button"
							onClick={() => setSelectedAnswer(answer)}
							className={cn(
								"w-full rounded-md border p-3 text-left text-sm transition-colors",
								selectedAnswer === answer
									? "border-primary bg-primary/10"
									: "border-border hover:bg-muted",
							)}
						>
							{answer}
						</button>
					))}
				</div>
			)}

			{/* Custom answer input */}
			{question.allow_custom && (
				<div className="mb-4">
					<textarea
						value={customAnswer}
						onChange={(e) => setCustomAnswer(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
								handleSubmit();
							}
						}}
						placeholder="或输入自定义答案..."
						className="w-full rounded-md border border-border bg-background p-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
						rows={3}
					/>
				</div>
			)}

			{/* Action buttons */}
			<div className="flex gap-2">
				<button
					type="button"
					onClick={handleSubmit}
					disabled={!selectedAnswer && !customAnswer.trim()}
					className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
				>
					提交
				</button>
				<button
					type="button"
					onClick={onCancel}
					className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
				>
					跳过
				</button>
			</div>
		</div>
	);
}
