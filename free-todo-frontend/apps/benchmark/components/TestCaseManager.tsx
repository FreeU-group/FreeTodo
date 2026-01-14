"use client";

import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type {
	BenchmarkTestCase,
	BenchmarkTestCaseCategory,
	BenchmarkTestCaseCreate,
} from "@/apps/benchmark/types";
import {
	createBenchmarkTestCase,
	deleteBenchmarkTestCase,
	getBenchmarkTestCases,
	updateBenchmarkTestCase,
} from "@/lib/api";
import { TestCaseForm } from "./TestCaseForm";

interface TestCaseManagerProps {
	category: BenchmarkTestCaseCategory | null;
	onCategoryChange: (category: BenchmarkTestCaseCategory | null) => void;
	onTestCaseSelect: (testCase: BenchmarkTestCase | null) => void;
	selectedTestCase: BenchmarkTestCase | null;
}

export function TestCaseManager({
	category,
	onCategoryChange,
	onTestCaseSelect,
	selectedTestCase,
}: TestCaseManagerProps) {
	const [testCases, setTestCases] = useState<BenchmarkTestCase[]>([]);
	const [showForm, setShowForm] = useState(false);
	const [editingTestCase, setEditingTestCase] =
		useState<BenchmarkTestCase | null>(null);

	const loadTestCases = async () => {
		try {
			const cases = await getBenchmarkTestCases(category || undefined);
			setTestCases(cases);
		} catch (error) {
			console.error("Failed to load test cases:", error);
		}
	};

	useEffect(() => {
		const load = async () => {
			try {
				const cases = await getBenchmarkTestCases(category || undefined);
				setTestCases(cases);
			} catch (error) {
				console.error("Failed to load test cases:", error);
			}
		};
		void load();
	}, [category]);

	const handleCreate = async (data: BenchmarkTestCaseCreate) => {
		try {
			await createBenchmarkTestCase(data);
			setShowForm(false);
			void loadTestCases();
		} catch (error) {
			console.error("Failed to create test case:", error);
		}
	};

	const handleUpdate = async (id: number, data: BenchmarkTestCaseCreate) => {
		try {
			await updateBenchmarkTestCase(id, data);
			setEditingTestCase(null);
			void loadTestCases();
		} catch (error) {
			console.error("Failed to update test case:", error);
		}
	};

	const handleDelete = async (id: number) => {
		if (!confirm("确定要删除这个测试用例吗？")) return;
		try {
			await deleteBenchmarkTestCase(id);
			void loadTestCases();
			if (selectedTestCase?.id === id) {
				onTestCaseSelect(null);
			}
		} catch (error) {
			console.error("Failed to delete test case:", error);
		}
	};

	const categories: BenchmarkTestCaseCategory[] = [
		"intent_ambiguous",
		"short_long_boundary",
		"tool_conflict",
	];

	const categoryLabels: Record<BenchmarkTestCaseCategory, string> = {
		intent_ambiguous: "Intent模糊样例",
		short_long_boundary: "Short/Long临界点",
		tool_conflict: "Tool冲突样例",
	};

	return (
		<div className="flex h-full flex-col">
			<div className="border-b border-border p-4">
				<div className="mb-4 flex items-center justify-between">
					<h2 className="text-lg font-semibold">测试用例</h2>
					<button
						type="button"
						onClick={() => setShowForm(true)}
						className="flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
					>
						<Plus className="h-4 w-4" />
						添加
					</button>
				</div>

				<div className="flex gap-2">
					<button
						type="button"
						onClick={() => onCategoryChange(null)}
						className={`rounded-md px-3 py-1.5 text-sm ${
							category === null
								? "bg-primary text-primary-foreground"
								: "bg-muted text-muted-foreground"
						}`}
					>
						全部
					</button>
					{categories.map((cat) => (
						<button
							key={cat}
							type="button"
							onClick={() => onCategoryChange(cat)}
							className={`rounded-md px-3 py-1.5 text-sm ${
								category === cat
									? "bg-primary text-primary-foreground"
									: "bg-muted text-muted-foreground"
							}`}
						>
							{categoryLabels[cat]}
						</button>
					))}
				</div>
			</div>

			<div className="flex-1 overflow-y-auto p-4">
				{showForm && (
					<TestCaseForm
						onSubmit={(data) => {
							void handleCreate(data);
						}}
						onCancel={() => setShowForm(false)}
					/>
				)}

				{editingTestCase && (
					<TestCaseForm
						testCase={editingTestCase}
						onSubmit={(data) => {
							void handleUpdate(editingTestCase.id, data);
						}}
						onCancel={() => setEditingTestCase(null)}
					/>
				)}

				<div className="space-y-2">
					{testCases.map((testCase) => (
						<div
							key={testCase.id}
							role="button"
							tabIndex={0}
							className={`cursor-pointer rounded-md border p-3 ${
								selectedTestCase?.id === testCase.id
									? "border-primary bg-primary/10"
									: "border-border"
							}`}
							onClick={() => onTestCaseSelect(testCase)}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									onTestCaseSelect(testCase);
								}
							}}
						>
							<div className="flex items-start justify-between">
								<div className="flex-1">
									<div className="font-medium">{testCase.query}</div>
									{testCase.description && (
										<div className="mt-1 text-sm text-muted-foreground">
											{testCase.description}
										</div>
									)}
									<div className="mt-1 text-xs text-muted-foreground">
										{categoryLabels[testCase.category]}
									</div>
								</div>
								<div className="flex gap-2">
									<button
										type="button"
										onClick={(e) => {
											e.stopPropagation();
											setEditingTestCase(testCase);
										}}
										className="text-muted-foreground hover:text-foreground"
									>
										编辑
									</button>
									<button
										type="button"
										onClick={(e) => {
											e.stopPropagation();
											void handleDelete(testCase.id);
										}}
										className="text-muted-foreground hover:text-destructive"
									>
										<Trash2 className="h-4 w-4" />
									</button>
								</div>
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
