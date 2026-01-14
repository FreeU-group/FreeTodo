"use client";

import { useEffect, useState } from "react";
import type { BenchmarkTestResult, BenchmarkTestRun } from "@/apps/benchmark/types";
import {
	getBenchmarkTestResults,
	updateBenchmarkTestResult,
} from "@/lib/api";

interface TestResultsProps {
	testRun: BenchmarkTestRun;
	testResults: BenchmarkTestResult[];
	onTestResultsChange: (results: BenchmarkTestResult[]) => void;
}

export function TestResults({
	testRun,
	testResults,
	onTestResultsChange,
}: TestResultsProps) {
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		const loadResults = async () => {
			setLoading(true);
			try {
				const results = await getBenchmarkTestResults(testRun.id);
				onTestResultsChange(results);
			} catch (error) {
				console.error("Failed to load test results:", error);
			} finally {
				setLoading(false);
			}
		};
		void loadResults();
	}, [testRun.id, onTestResultsChange]);

	const handleManualOverride = async (resultId: number, value: boolean | null) => {
		try {
			await updateBenchmarkTestResult(resultId, { manual_override: value });
			const results = await getBenchmarkTestResults(testRun.id);
			onTestResultsChange(results);
		} catch (error) {
			console.error("Failed to update test result:", error);
		}
	};

	const evaluationPointLabels: Record<string, string> = {
		misuse_web_search: "是否乱用web search",
		force_todo_creation: "是否强行写todo",
		task_type_misjudge: "是否误判任务类型",
		over_planning: "是否过度plan",
		redundant_search: "是否错误再次search",
		context_reuse: "是否能复用已有上下文",
	};

	if (loading) {
		return <div className="p-4">加载中...</div>;
	}

	return (
		<div className="flex h-full flex-col p-4">
			<div className="mb-4">
				<h2 className="text-lg font-semibold">测试结果</h2>
				<div className="mt-2 text-sm text-muted-foreground">
					状态: {testRun.status}
				</div>
			</div>

			{testRun.agent_response && (
				<div className="mb-4 rounded-md border border-border bg-muted/50 p-3">
					<h3 className="mb-2 font-medium">Agent响应</h3>
					<div className="whitespace-pre-wrap text-sm">{testRun.agent_response}</div>
				</div>
			)}

			<div className="flex-1 overflow-y-auto">
				<h3 className="mb-2 font-medium">评估结果</h3>
				<div className="space-y-3">
					{testResults.map((result) => (
						<div
							key={result.id}
							className="rounded-md border border-border p-3"
						>
							<div className="mb-2 font-medium">
								{evaluationPointLabels[result.evaluation_point] ||
									result.evaluation_point}
							</div>
							<div className="mb-2 text-sm">
								自动评估:{" "}
								{result.auto_evaluated === null
									? "未评估"
									: result.auto_evaluated
										? "是"
										: "否"}
							</div>
							<div className="mb-2 text-sm">
								最终结果:{" "}
								{result.final_result === null
									? "未评估"
									: result.final_result
										? "是"
										: "否"}
							</div>
							<div className="flex gap-2">
								<button
									type="button"
									onClick={() => handleManualOverride(result.id, true)}
									className={`rounded-md px-3 py-1 text-xs ${
										result.manual_override === true
											? "bg-primary text-primary-foreground"
											: "bg-muted text-muted-foreground"
									}`}
								>
									是
								</button>
								<button
									type="button"
									onClick={() => handleManualOverride(result.id, false)}
									className={`rounded-md px-3 py-1 text-xs ${
										result.manual_override === false
											? "bg-primary text-primary-foreground"
											: "bg-muted text-muted-foreground"
									}`}
								>
									否
								</button>
								<button
									type="button"
									onClick={() => handleManualOverride(result.id, null)}
									className="rounded-md px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
								>
									清除
								</button>
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
