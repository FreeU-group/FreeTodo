"use client";

import { Play } from "lucide-react";
import { useState } from "react";
import type { BenchmarkTestCase, BenchmarkTestRun } from "@/apps/benchmark/types";
import { getBenchmarkTestRuns, runBenchmarkTestCase } from "@/lib/api";

interface TestRunnerProps {
	testCase: BenchmarkTestCase;
	onTestRunComplete: (testRun: BenchmarkTestRun) => void;
}

export function TestRunner({ testCase, onTestRunComplete }: TestRunnerProps) {
	const [running, setRunning] = useState(false);
	const [testRuns, setTestRuns] = useState<BenchmarkTestRun[]>([]);

	const handleRun = async () => {
		setRunning(true);
		try {
			await runBenchmarkTestCase(testCase.id);
			// 等待测试完成（简化处理，实际应该轮询状态）
			setTimeout(async () => {
				const runs = await getBenchmarkTestRuns(testCase.id);
				if (runs.length > 0) {
					onTestRunComplete(runs[0]);
					setTestRuns(runs);
				}
				setRunning(false);
			}, 3000);
		} catch (error) {
			console.error("Failed to run test case:", error);
			setRunning(false);
		}
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

			{testRuns.length > 0 && (
				<div className="mt-4">
					<h3 className="mb-2 font-medium">运行历史</h3>
					<div className="space-y-2">
						{testRuns.map((run) => (
							<div
								key={run.id}
								role="button"
								tabIndex={0}
								className="cursor-pointer rounded-md border border-border p-3 hover:bg-muted/50"
								onClick={() => onTestRunComplete(run)}
								onKeyDown={(e) => {
									if (e.key === "Enter" || e.key === " ") {
										e.preventDefault();
										onTestRunComplete(run);
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
