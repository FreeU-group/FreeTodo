"use client";

import { useEffect, useState } from "react";
import type {
	BenchmarkTestCase,
	BenchmarkTestResult,
	BenchmarkTestRun,
} from "@/apps/benchmark/types";
import {
	getBenchmarkTestCases,
	getBenchmarkTestResults,
} from "@/lib/api";

interface BatchTestResultsProps {
	testRuns: Map<number, BenchmarkTestRun>;
}

export function BatchTestResults({ testRuns }: BatchTestResultsProps) {
	const [testCases, setTestCases] = useState<Map<number, BenchmarkTestCase>>(
		new Map(),
	);
	const [testResultsMap, setTestResultsMap] = useState<
		Map<number, BenchmarkTestResult[]>
	>(new Map());

	useEffect(() => {
		const loadTestCases = async () => {
			try {
				const allTestCases = await getBenchmarkTestCases();
				const testCasesMap = new Map(
					allTestCases.map((tc) => [tc.id, tc]),
				);
				setTestCases(testCasesMap);
			} catch (error) {
				console.error("Failed to load test cases:", error);
			}
		};
		void loadTestCases();
	}, []);

	useEffect(() => {
		const loadResults = async () => {
			// 只加载已完成的测试用例的结果
			const resultsMap = new Map<number, BenchmarkTestResult[]>();
			for (const [testCaseId, testRun] of testRuns.entries()) {
				// 如果测试已完成，加载结果
				if (
					testRun.status === "completed" ||
					testRun.status === "failed"
				) {
					try {
						const results = await getBenchmarkTestResults(testRun.id);
						resultsMap.set(testCaseId, results);
					} catch (error) {
						console.error(
							`Failed to load results for test case ${testCaseId}:`,
							error,
						);
					}
				}
			}
			setTestResultsMap((prev) => {
				// 合并新结果，保留之前的
				const merged = new Map(prev);
				for (const [testCaseId, results] of resultsMap.entries()) {
					merged.set(testCaseId, results);
				}
				return merged;
			});
		};
		void loadResults();
	}, [testRuns]);

	const evaluationPointLabels: Record<string, string> = {
		misuse_web_search: "是否乱用web search",
		force_todo_creation: "是否强行写todo",
		task_type_misjudge: "是否误判任务类型",
		over_planning: "是否过度plan",
		redundant_search: "是否错误再次search",
		context_reuse: "是否能复用已有上下文",
	};

	const getResultStatus = (
		testRun: BenchmarkTestRun,
		results: BenchmarkTestResult[],
	) => {
		if (
			testRun.status === "pending" ||
			testRun.status === "running"
		) {
			return "运行中";
		}
		if (testRun.status === "failed") {
			return "失败";
		}
		if (results.length === 0) return "未评估";
		const allPassed = results.every(
			(r) => r.final_result === false || r.final_result === null,
		);
		const allFailed = results.every((r) => r.final_result === true);
		if (allPassed) return "通过";
		if (allFailed) return "失败";
		return "部分通过";
	};

	const completedCount = Array.from(testRuns.values()).filter(
		(run) => run.status === "completed" || run.status === "failed",
	).length;

	return (
		<div className="flex h-full flex-col p-4">
			<div className="mb-4">
				<h2 className="text-lg font-semibold">批量测试结果</h2>
				<div className="mt-2 text-sm text-muted-foreground">
					共 {testRuns.size} 个测试用例，已完成 {completedCount} 个
				</div>
			</div>

			<div className="flex-1 overflow-y-auto">
				<div className="space-y-4">
					{Array.from(testRuns.entries()).map(([testCaseId, testRun]) => {
						const testCase = testCases.get(testCaseId);
						const results = testResultsMap.get(testCaseId) || [];
						const status = getResultStatus(testRun, results);

						return (
							<div
								key={testCaseId}
								className="rounded-md border border-border p-4"
							>
								<div className="mb-3">
									<div className="font-medium">
										{testCase?.query || `测试用例 #${testCaseId}`}
									</div>
									{testCase?.description && (
										<div className="mt-1 text-sm text-muted-foreground">
											{testCase.description}
										</div>
									)}
									<div className="mt-2 flex items-center gap-4 text-sm">
										<div>
											状态:{" "}
											<span
												className={
													testRun.status === "completed"
														? "text-green-600"
														: testRun.status === "failed"
															? "text-red-600"
															: "text-yellow-600"
												}
											>
												{testRun.status === "completed"
													? "已完成"
													: testRun.status === "failed"
														? "失败"
														: testRun.status === "running"
															? "运行中"
															: "待运行"}
											</span>
										</div>
										<div>
											结果:{" "}
											<span
												className={
													status === "通过"
														? "text-green-600"
														: status === "失败"
															? "text-red-600"
															: "text-yellow-600"
												}
											>
												{status}
											</span>
										</div>
									</div>
								</div>

								{testRun.agent_response && (
									<div className="mb-3 rounded-md border border-border bg-muted/50 p-3">
										<h4 className="mb-2 text-sm font-medium">Agent响应</h4>
										<div className="max-h-40 overflow-y-auto whitespace-pre-wrap text-sm">
											{testRun.agent_response}
										</div>
									</div>
								)}

								{results.length > 0 && (
									<div className="mt-3 space-y-2 border-t border-border pt-3">
										<div className="text-sm font-medium">评估结果:</div>
										{results.map((result) => (
											<div
												key={result.id}
												className="rounded-md border border-border bg-muted/50 p-2 text-sm"
											>
												<div className="font-medium">
													{evaluationPointLabels[result.evaluation_point] ||
														result.evaluation_point}
												</div>
												<div className="mt-1">
													最终结果:{" "}
													{result.final_result === null
														? "未评估"
														: result.final_result
															? "是"
															: "否"}
												</div>
											</div>
										))}
									</div>
								)}
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
}
