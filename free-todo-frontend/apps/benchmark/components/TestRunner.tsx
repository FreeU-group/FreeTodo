"use client";

import { Play } from "lucide-react";
import { useEffect, useState } from "react";
import type {
	BenchmarkTestCase,
	BenchmarkTestResult,
	BenchmarkTestRun,
} from "@/apps/benchmark/types";
import {
	getBenchmarkTestResults,
	getBenchmarkTestRun,
	getBenchmarkTestRuns,
	runBenchmarkTestCase,
	updateBenchmarkTestResult,
} from "@/lib/api";

interface TestRunnerProps {
	testCase: BenchmarkTestCase;
	onTestRunComplete: (testRun: BenchmarkTestRun) => void;
}

export function TestRunner({ testCase, onTestRunComplete }: TestRunnerProps) {
	const [running, setRunning] = useState(false);
	const [testRuns, setTestRuns] = useState<BenchmarkTestRun[]>([]);
	const [selectedTestRun, setSelectedTestRun] =
		useState<BenchmarkTestRun | null>(null);
	const [testResults, setTestResults] = useState<BenchmarkTestResult[]>([]);

	const handleRun = async () => {
		setRunning(true);
		setSelectedTestRun(null);
		setTestResults([]);
		try {
			const result = await runBenchmarkTestCase(testCase.id);

			// 轮询获取运行结果
			const pollInterval = setInterval(async () => {
				try {
					const testRun = await getBenchmarkTestRun(result.test_run_id);
					setSelectedTestRun(testRun);

					// 如果测试完成，加载结果并停止轮询
					if (
						testRun.status === "completed" ||
						testRun.status === "failed"
					) {
						clearInterval(pollInterval);
						setRunning(false);
						onTestRunComplete(testRun);

						// 加载测试结果
						const results = await getBenchmarkTestResults(testRun.id);
						setTestResults(results);

						// 刷新运行历史
						const runs = await getBenchmarkTestRuns(testCase.id);
						setTestRuns(runs);
					}
				} catch (error) {
					console.error("Failed to get test run:", error);
					clearInterval(pollInterval);
					setRunning(false);
				}
			}, 2000);

			// 设置超时，60秒后停止轮询
			setTimeout(() => {
				clearInterval(pollInterval);
				setRunning(false);
			}, 60000);
		} catch (error) {
			console.error("Failed to run test case:", error);
			setRunning(false);
		}
	};

	const handleSelectTestRun = async (testRun: BenchmarkTestRun) => {
		setSelectedTestRun(testRun);
		onTestRunComplete(testRun);
		try {
			const results = await getBenchmarkTestResults(testRun.id);
			setTestResults(results);
		} catch (error) {
			console.error("Failed to load test results:", error);
		}
	};

	const handleManualOverride = async (
		resultId: number,
		value: boolean | null,
	) => {
		try {
			await updateBenchmarkTestResult(resultId, { manual_override: value });
			if (selectedTestRun) {
				const results = await getBenchmarkTestResults(selectedTestRun.id);
				setTestResults(results);
			}
		} catch (error) {
			console.error("Failed to update test result:", error);
		}
	};

	// 加载运行历史
	useEffect(() => {
		const loadTestRuns = async () => {
			try {
				const runs = await getBenchmarkTestRuns(testCase.id);
				setTestRuns(runs);
			} catch (error) {
				console.error("Failed to load test runs:", error);
			}
		};
		void loadTestRuns();
	}, [testCase.id]);

	const evaluationPointLabels: Record<string, string> = {
		misuse_web_search: "是否乱用web search",
		force_todo_creation: "是否强行写todo",
		task_type_misjudge: "是否误判任务类型",
		over_planning: "是否过度plan",
		redundant_search: "是否错误再次search",
		context_reuse: "是否能复用已有上下文",
	};

	return (
		<div className="flex h-full flex-col p-4">
			<div className="mb-4">
				<h2 className="text-lg font-semibold">运行测试</h2>
				<div className="mt-2 rounded-md border border-border bg-muted/50 p-3">
					<div className="font-medium">{testCase.query}</div>
					{testCase.description && (
						<div className="mt-1 text-sm text-muted-foreground">
							{testCase.description}
						</div>
					)}
				</div>
			</div>

			<button
				type="button"
				onClick={handleRun}
				disabled={running}
				className="flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
			>
				<Play className="h-4 w-4" />
				{running ? "运行中..." : "运行测试"}
			</button>

			{/* 显示当前运行的测试结果 */}
			{selectedTestRun && (
				<div className="mt-4 flex-1 overflow-y-auto">
					<div className="mb-3 rounded-md border border-border bg-muted/50 p-3">
						<div className="mb-2 flex items-center justify-between">
							<h3 className="font-medium">测试结果</h3>
							<div className="text-sm text-muted-foreground">
								状态:{" "}
								<span
									className={
										selectedTestRun.status === "completed"
											? "text-green-600"
											: selectedTestRun.status === "failed"
												? "text-red-600"
												: "text-yellow-600"
									}
								>
									{selectedTestRun.status === "completed"
										? "已完成"
										: selectedTestRun.status === "failed"
											? "失败"
											: selectedTestRun.status === "running"
												? "运行中"
												: "待运行"}
								</span>
							</div>
						</div>
						{selectedTestRun.completed_at && (
							<div className="text-xs text-muted-foreground">
								完成时间:{" "}
								{new Date(selectedTestRun.completed_at).toLocaleString()}
							</div>
						)}
					</div>

					{selectedTestRun.agent_response && (
						<div className="mb-4 rounded-md border border-border bg-muted/50 p-3">
							<h4 className="mb-2 text-sm font-medium">Agent响应</h4>
							<div className="max-h-40 overflow-y-auto whitespace-pre-wrap text-sm">
								{selectedTestRun.agent_response}
							</div>
						</div>
					)}

					{testResults.length > 0 && (
						<div className="mb-4">
							<h4 className="mb-2 text-sm font-medium">评估结果</h4>
							<div className="space-y-2">
								{testResults.map((result) => (
									<div
										key={result.id}
										className="rounded-md border border-border p-3"
									>
										<div className="mb-2 font-medium text-sm">
											{evaluationPointLabels[result.evaluation_point] ||
												result.evaluation_point}
										</div>
										<div className="mb-2 text-xs text-muted-foreground">
											自动评估:{" "}
											{result.auto_evaluated === null
												? "未评估"
												: result.auto_evaluated
													? "是"
													: "否"}
										</div>
										<div className="mb-2 text-xs text-muted-foreground">
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
												className={`rounded-md px-2 py-1 text-xs ${
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
												className={`rounded-md px-2 py-1 text-xs ${
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
												className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
											>
												清除
											</button>
										</div>
									</div>
								))}
							</div>
						</div>
					)}
				</div>
			)}

			{/* 运行历史 */}
			{testRuns.length > 0 && (
				<div className="mt-4">
					<h3 className="mb-2 font-medium">运行历史</h3>
					<div className="space-y-2">
						{testRuns.map((run) => (
							<div
								key={run.id}
								role="button"
								tabIndex={0}
								className={`cursor-pointer rounded-md border p-3 ${
									selectedTestRun?.id === run.id
										? "border-primary bg-primary/10"
										: "border-border hover:bg-muted/50"
								}`}
								onClick={() => handleSelectTestRun(run)}
								onKeyDown={(e) => {
									if (e.key === "Enter" || e.key === " ") {
										e.preventDefault();
										handleSelectTestRun(run);
									}
								}}
							>
								<div className="text-sm">
									<div>状态: {run.status}</div>
									{run.completed_at && (
										<div className="text-xs text-muted-foreground">
											{new Date(run.completed_at).toLocaleString()}
										</div>
									)}
								</div>
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
