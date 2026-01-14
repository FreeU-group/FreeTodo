"use client";

import { useState } from "react";
import type {
	BenchmarkTestCase,
	BenchmarkTestCaseCategory,
	BenchmarkTestCaseCreate,
} from "@/apps/benchmark/types";

interface TestCaseFormProps {
	testCase?: BenchmarkTestCase;
	onSubmit: (data: BenchmarkTestCaseCreate) => void;
	onCancel: () => void;
}

export function TestCaseForm({ testCase, onSubmit, onCancel }: TestCaseFormProps) {
	const [category, setCategory] = useState<BenchmarkTestCaseCategory>(
		testCase?.category || "intent_ambiguous",
	);
	const [query, setQuery] = useState(testCase?.query || "");
	const [description, setDescription] = useState(testCase?.description || "");

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		onSubmit({
			category,
			query,
			description: description || null,
		});
	};

	return (
		<form onSubmit={handleSubmit} className="mb-4 rounded-md border border-border p-4">
			<div className="space-y-4">
				<div>
					<label htmlFor="category" className="block text-sm font-medium">
						类别
					</label>
					<select
						id="category"
						value={category}
						onChange={(e) => setCategory(e.target.value as BenchmarkTestCaseCategory)}
						className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2"
					>
						<option value="intent_ambiguous">Intent模糊样例</option>
						<option value="short_long_boundary">Short/Long临界点</option>
						<option value="tool_conflict">Tool冲突样例</option>
					</select>
				</div>

				<div>
					<label htmlFor="query" className="block text-sm font-medium">
						查询
					</label>
					<textarea
						id="query"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2"
						rows={3}
						required
					/>
				</div>

				<div>
					<label htmlFor="description" className="block text-sm font-medium">
						描述（可选）
					</label>
					<textarea
						id="description"
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2"
						rows={2}
					/>
				</div>

				<div className="flex justify-end gap-2">
					<button
						type="button"
						onClick={onCancel}
						className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
					>
						取消
					</button>
					<button
						type="submit"
						className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
					>
						保存
					</button>
				</div>
			</div>
		</form>
	);
}
