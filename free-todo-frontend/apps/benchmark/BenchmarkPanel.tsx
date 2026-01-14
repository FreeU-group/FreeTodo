"use client";

import { Beaker, Play } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type {
	BenchmarkTestCase,
	BenchmarkTestCaseCategory,
	BenchmarkTestResult,
	BenchmarkTestRun,
	BenchmarkTestRunStatus,
} from "@/apps/benchmark/types";
import { PanelHeader } from "@/components/common/layout/PanelHeader";
import {
	getBenchmarkTestRun,
	runBenchmarkTestCase,
} from "@/lib/api";
import { BatchTestResults } from "./components/BatchTestResults";
import { TestCaseManager } from "./components/TestCaseManager";
import { TestResults } from "./components/TestResults";
import { TestRunner } from "./components/TestRunner";

export function BenchmarkPanel() {
	const tPage = useTranslations("page");

	const [selectedCategory, setSelectedCategory] =
		useState<BenchmarkTestCaseCategory | null>(null);
	const [selectedTestCase, setSelectedTestCase] =
		useState<BenchmarkTestCase | null>(null);
	const [selectedTestRun, setSelectedTestRun] =
		useState<BenchmarkTestRun | null>(null);
	const [testResults, setTestResults] = useState<BenchmarkTestResult[]>([]);
	const [selectedTestCaseIds, setSelectedTestCaseIds] = useState<Set<number>>(
		new Set(),
	);
	const [batchRunning, setBatchRunning] = useState(false);
	const [batchTestRuns, setBatchTestRuns] = useState<
		Map<number, BenchmarkTestRun>
	>(new Map());
	const [showBatchResults, setShowBatchResults] = useState(false);

	const handleBatchRun = async () => {
		if (selectedTestCaseIds.size === 0) return;

		setBatchRunning(true);
		setShowBatchResults(true);
		setBatchTestRuns(new Map());

		const testCaseIds = Array.from(selectedTestCaseIds);
		const testRunIds = new Map<number, number>();

		// 启动所有测试用例，并立即创建占位记录显示
		const initialRuns = new Map<number, BenchmarkTestRun>();
		const now = new Date().toISOString();

		for (const testCaseId of testCaseIds) {
			try {
				const result = await runBenchmarkTestCase(testCaseId);
				testRunIds.set(testCaseId, result.test_run_id);

				// 创建初始占位运行记录，立即显示
				const placeholderRun: BenchmarkTestRun = {
					id: result.test_run_id,
					test_case_id: testCaseId,
					session_id: "",
					status: (result.status as BenchmarkTestRunStatus) || "pending",
					started_at: now,
					completed_at: null,
					agent_response: null,
					execution_log: null,
					created_at: now,
					updated_at: now,
				};
				initialRuns.set(testCaseId, placeholderRun);
			} catch (error) {
				console.error(`Failed to run test case ${testCaseId}:`, error);
				// 即使启动失败，也创建一个失败的占位记录，确保能显示
				const failedRun: BenchmarkTestRun = {
					id: 0, // 临时ID，后续会被替换
					test_case_id: testCaseId,
					session_id: "",
					status: "failed",
					started_at: now,
					completed_at: now,
					agent_response: null,
					execution_log: null,
					created_at: now,
					updated_at: now,
				};
				initialRuns.set(testCaseId, failedRun);
			}
		}

		// 立即显示所有已启动的测试用例（创建新Map确保React检测到变化）
		if (initialRuns.size > 0) {
			setBatchTestRuns(new Map(initialRuns));
		}

		// 等待一小段时间后，进行一次查询，更新为实际状态
		setTimeout(async () => {
			const updatedRuns = new Map<number, BenchmarkTestRun>();
			for (const [testCaseId, testRunId] of testRunIds.entries()) {
				try {
					const testRun = await getBenchmarkTestRun(testRunId);
					updatedRuns.set(testCaseId, testRun);
				} catch (error) {
					console.error(
						`Failed to get test run ${testRunId}:`,
						error,
					);
					// 查询失败时保留占位记录
					if (initialRuns.has(testCaseId)) {
						updatedRuns.set(
							testCaseId,
							initialRuns.get(testCaseId)!,
						);
					}
				}
			}
			if (updatedRuns.size > 0) {
				setBatchTestRuns(new Map(updatedRuns));
			}
		}, 500);

		// 轮询获取运行结果，使用test_run_id直接获取每个运行记录
		const pollInterval = setInterval(async () => {
			const runs = new Map<number, BenchmarkTestRun>();
			let allCompleted = true;

			for (const [testCaseId, testRunId] of testRunIds.entries()) {
				try {
					const testRun = await getBenchmarkTestRun(testRunId);
					runs.set(testCaseId, testRun);
					if (
						testRun.status !== "completed" &&
						testRun.status !== "failed"
					) {
						allCompleted = false;
					}
				} catch (error) {
					console.error(
						`Failed to get test run ${testRunId}:`,
						error,
					);
					// 查询失败时使用占位记录，确保UI能显示
					if (initialRuns.has(testCaseId)) {
						runs.set(testCaseId, initialRuns.get(testCaseId)!);
					}
					allCompleted = false;
				}
			}

			// 实时更新运行结果，不需要等到所有都完成（创建新Map确保React检测到变化）
			if (runs.size > 0) {
				setBatchTestRuns(new Map(runs));
			}

			if (allCompleted) {
				clearInterval(pollInterval);
				setBatchRunning(false);
			}
		}, 2000);

		// 设置超时，60秒后停止轮询（给测试更多时间）
		setTimeout(() => {
			clearInterval(pollInterval);
			setBatchRunning(false);
		}, 60000);
	};

	return (
		<div className="flex h-full flex-col bg-background">
			<PanelHeader icon={Beaker} title={tPage("benchmarkLabel") || "Benchmark"} />

			<div className="flex flex-1 overflow-hidden">
				{/* 左侧：测试用例管理 */}
				<div className="flex w-1/3 max-h-screen flex-col border-r border-border">
					<div className="flex-1 overflow-y-auto">
						<TestCaseManager
							category={selectedCategory}
							onCategoryChange={setSelectedCategory}
							onTestCaseSelect={setSelectedTestCase}
							selectedTestCase={selectedTestCase}
							selectedTestCaseIds={selectedTestCaseIds}
							onSelectedTestCaseIdsChange={setSelectedTestCaseIds}
						/>
					</div>
					{selectedTestCaseIds.size > 0 && (
						<div className="border-t border-border p-4">
							<button
								type="button"
								onClick={handleBatchRun}
								disabled={batchRunning}
								className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
							>
								<Play className="h-4 w-4" />
								{batchRunning
									? `运行中... (${selectedTestCaseIds.size} 个测试)`
									: `运行选中测试 (${selectedTestCaseIds.size} 个)`}
							</button>
						</div>
					)}
				</div>

				{/* 中间：测试运行 */}
				<div className="w-1/3 border-r border-border overflow-y-auto">
					{selectedTestCase && (
						<TestRunner
							testCase={selectedTestCase}
							onTestRunComplete={(testRun) => {
								setSelectedTestRun(testRun);
							}}
						/>
					)}
				</div>

				{/* 右侧：测试结果 */}
				<div className="flex-1 overflow-y-auto">
					{showBatchResults ? (
						batchTestRuns.size > 0 ? (
							<BatchTestResults testRuns={batchTestRuns} />
						) : (
							<div className="p-4 text-center text-muted-foreground">
								正在启动测试用例...
							</div>
						)
					) : selectedTestRun ? (
						<TestResults
							testRun={selectedTestRun}
							testResults={testResults}
							onTestResultsChange={setTestResults}
						/>
					) : null}
				</div>
			</div>
		</div>
	);
}
