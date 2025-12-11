"use client";

import { Plus } from "lucide-react";
import type React from "react";
import { useEffect, useRef } from "react";

interface NewTodoInlineFormProps {
	value: string;
	onChange: (value: string) => void;
	onSubmit: (e?: React.FormEvent) => void;
	onCancel: () => void;
}

export function NewTodoInlineForm({
	value,
	onChange,
	onSubmit,
	onCancel,
}: NewTodoInlineFormProps) {
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	useEffect(() => {
		if (value === "") {
			inputRef.current?.focus();
		}
	}, [value]);

	return (
		<form
			onSubmit={onSubmit}
			onReset={onCancel}
			className="group flex items-center gap-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 transition-colors focus-within:border-primary focus-within:bg-background focus-within:ring-2 focus-within:ring-primary/40"
			onClick={() => inputRef.current?.focus()}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					inputRef.current?.focus();
				}
			}}
		>
			<Plus className="h-4 w-4 text-muted-foreground group-focus-within:text-primary" />
			<input
				ref={inputRef}
				type="text"
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder="添加任务"
				className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
				required
			/>
			<button type="submit" className="sr-only">
				提交
			</button>
			<button type="reset" className="sr-only">
				重置
			</button>
		</form>
	);
}
