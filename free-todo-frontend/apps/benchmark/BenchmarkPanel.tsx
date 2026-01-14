"use client";

import { Beaker } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type {
	BenchmarkTestCase,
	BenchmarkTestCaseCategory,
	BenchmarkTestResult,
	BenchmarkTestRun,
} from "@/apps/benchmark/types";
import { PanelHeader } from "@/components/common/layout/PanelHeader";
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

	return (
		<div className="flex h-full flex-col bg-background">
			<PanelHeader icon={Beaker} title={tPage("benchmarkLabel") || "Benchmark"} />

			<div className="flex flex-1 overflow-hidden">
				{/* 左侧：测试用例管理 */}
				<div className="w-1/3 border-r border-border overflow-y-auto">
					<TestCaseManager
						category={selectedCategory}
						onCategoryChange={setSelectedCategory}
						onTestCaseSelect={setSelectedTestCase}
						selectedTestCase={selectedTestCase}
					/>
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
					{selectedTestRun && (
						<TestResults
							testRun={selectedTestRun}
							testResults={testResults}
							onTestResultsChange={setTestResults}
						/>
					)}
				</div>
			</div>
		</div>
	);
}
