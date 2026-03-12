"use client";

import { Check, Globe, Terminal, Wrench } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { useUiStore } from "@/lib/store/ui-store";
import { cn } from "@/lib/utils";

/**
 * FreeTodo 工具列表定义
 * 基于 FreeTodoToolkit 的 14 个工具
 */
const FREETODO_TOOLS = [
	// Todo 管理工具（6个）
	{ id: "create_todo", category: "todo" },
	{ id: "complete_todo", category: "todo" },
	{ id: "update_todo", category: "todo" },
	{ id: "list_todos", category: "todo" },
	{ id: "search_todos", category: "todo" },
	{ id: "delete_todo", category: "todo" },
	// 任务拆解工具（1个）
	{ id: "breakdown_task", category: "breakdown" },
	// 时间解析工具（1个）
	{ id: "parse_time", category: "time" },
	// 冲突检测工具（1个）
	{ id: "check_schedule_conflict", category: "conflict" },
	// 统计分析工具（2个）
	{ id: "get_todo_stats", category: "stats" },
	{ id: "get_overdue_todos", category: "stats" },
	// 标签管理工具（3个）
	{ id: "list_tags", category: "tags" },
	{ id: "get_todos_by_tag", category: "tags" },
	{ id: "suggest_tags", category: "tags" },
	// 记忆工具（4个）
	{ id: "recall_today", category: "memory" },
	{ id: "recall_date", category: "memory" },
	{ id: "search_memory", category: "memory" },
	{ id: "list_memory_dates", category: "memory" },
] as const;

/**
 * 外部工具列表定义
 * 分为搜索类和本地类两大类
 */
const EXTERNAL_TOOLS = [
	// 搜索类工具
	{ id: "websearch", category: "search" }, // 通用网页搜索（Auto 模式）
	{ id: "hackernews", category: "search" }, // Hacker News
	// 本地类工具
	{ id: "file", category: "local" }, // 文件操作（需要 workspace_path）
	{ id: "local_fs", category: "local" }, // 简化文件写入
	{ id: "shell", category: "local" }, // 命令行执行
	{ id: "sleep", category: "local" }, // 暂停执行
] as const;

interface ToolSelectorProps {
	/** 是否禁用 */
	disabled?: boolean;
}

/**
 * Agno 模式工具选择器组件
 * 显示为一个按钮，点击后展开多选下拉框
 * 支持 FreeTodo 工具和外部工具（如 DuckDuckGo 搜索）
 */
export function ToolSelector({ disabled = false }: ToolSelectorProps) {
	const tChat = useTranslations("chat");
	const tToolCall = useTranslations("chat.toolCall");
	const [isOpen, setIsOpen] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);

	// FreeTodo 工具状态
	const selectedAgnoTools = useUiStore((state) => state.selectedAgnoTools);
	const setSelectedAgnoTools = useUiStore(
		(state) => state.setSelectedAgnoTools,
	);

	// 外部工具状态
	const selectedExternalTools = useUiStore(
		(state) => state.selectedExternalTools,
	);
	const setSelectedExternalTools = useUiStore(
		(state) => state.setSelectedExternalTools,
	);

	// 点击外部关闭下拉框
	useEffect(() => {
		if (!isOpen) return;

		const handleClickOutside = (event: MouseEvent) => {
			if (
				dropdownRef.current &&
				!dropdownRef.current.contains(event.target as Node)
			) {
				setIsOpen(false);
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [isOpen]);

	// FreeTodo 工具切换
	const handleToggleFreetodoTool = (toolId: string) => {
		const newTools = selectedAgnoTools.includes(toolId)
			? selectedAgnoTools.filter((id) => id !== toolId)
			: [...selectedAgnoTools, toolId];
		console.log("[ToolSelector] Toggling FreeTodo tool:", toolId);
		console.log("[ToolSelector] New selectedAgnoTools:", newTools);
		setSelectedAgnoTools(newTools);
	};

	// 外部工具切换
	const handleToggleExternalTool = (toolId: string) => {
		const newTools = selectedExternalTools.includes(toolId)
			? selectedExternalTools.filter((id) => id !== toolId)
			: [...selectedExternalTools, toolId];
		console.log("[ToolSelector] Toggling external tool:", toolId);
		console.log("[ToolSelector] New selectedExternalTools:", newTools);
		setSelectedExternalTools(newTools);
	};

	const handleSelectAllFreetodo = () => {
		setSelectedAgnoTools(FREETODO_TOOLS.map((tool) => tool.id));
	};

	const handleDeselectAllFreetodo = () => {
		setSelectedAgnoTools([]);
	};

	const handleSelectAllExternal = () => {
		setSelectedExternalTools(EXTERNAL_TOOLS.map((tool) => tool.id));
	};

	const handleDeselectAllExternal = () => {
		setSelectedExternalTools([]);
	};

	// 计算选中数量
	const freetodoSelectedCount = selectedAgnoTools.length;
	const externalSelectedCount = selectedExternalTools.length;
	const totalSelectedCount = freetodoSelectedCount + externalSelectedCount;
	const totalToolsCount = FREETODO_TOOLS.length + EXTERNAL_TOOLS.length;
	const isAllSelected = totalSelectedCount === totalToolsCount;

	return (
		<div className="relative" ref={dropdownRef}>
			{/* 工具选择按钮 */}
			<button
				type="button"
				disabled={disabled}
				onClick={() => setIsOpen(!isOpen)}
				className={cn(
					"flex h-8 items-center gap-2 rounded px-3 text-xs",
					"border border-border bg-background text-foreground",
					"hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
					"disabled:pointer-events-none disabled:opacity-50",
				)}
				aria-label={tChat("toolSelector.label")}
			>
				<Wrench className="h-3.5 w-3.5" />
				<span>{tChat("toolSelector.label")}</span>
				{totalSelectedCount > 0 && (
					<span className="text-muted-foreground">({totalSelectedCount})</span>
				)}
			</button>

			{/* 下拉多选框 */}
			{isOpen && (
				<div className="absolute left-0 bottom-full z-50 mb-2 w-80 rounded-md border border-border bg-background shadow-lg">
					{/* 标题栏 */}
					<div className="flex items-center justify-between border-b border-border px-3 py-2">
						<span className="text-sm font-medium">
							{tChat("toolSelector.title")}
						</span>
					</div>

					{/* 工具列表 */}
					<div className="max-h-96 overflow-y-auto p-2">
						{/* 外部工具区域 */}
						<div className="mb-4">
							<div className="flex items-center justify-between mb-2 px-2">
								<div className="flex items-center gap-1.5">
									<Globe className="h-3.5 w-3.5 text-muted-foreground" />
									<span className="text-xs font-medium text-muted-foreground">
										{tChat("toolSelector.externalTools")}
									</span>
								</div>
								<div className="flex gap-2">
									<button
										type="button"
										onClick={handleSelectAllExternal}
										className="text-xs text-primary hover:underline"
									>
										{tChat("toolSelector.selectAll")}
									</button>
									<span className="text-xs text-muted-foreground">|</span>
									<button
										type="button"
										onClick={handleDeselectAllExternal}
										className="text-xs text-primary hover:underline"
									>
										{tChat("toolSelector.deselectAll")}
									</button>
								</div>
							</div>
							{/* 按分类显示外部工具 */}
							{Object.entries(
								EXTERNAL_TOOLS.reduce(
									(acc, tool) => {
										if (!acc[tool.category]) {
											acc[tool.category] = [];
										}
										acc[tool.category].push(tool);
										return acc;
									},
									{} as Record<string, Array<(typeof EXTERNAL_TOOLS)[number]>>,
								),
							).map(([category, tools]) => (
								<div key={category} className="mb-3 last:mb-0">
									{/* 分类标题 */}
									<div className="mb-1.5 px-2 text-xs font-medium text-muted-foreground flex items-center gap-1.5">
										{category === "search" ? (
											<Globe className="h-3 w-3" />
										) : (
											<Terminal className="h-3 w-3" />
										)}
										{tChat(`toolSelector.externalCategories.${category}`)}
									</div>
									{/* 工具选项 */}
									<div className="space-y-0.5">
										{tools.map((tool) => {
											const isSelected = selectedExternalTools.includes(
												tool.id,
											);
											return (
												<button
													key={tool.id}
													type="button"
													onClick={() => handleToggleExternalTool(tool.id)}
													className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
												>
													<div
														className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
															isSelected
																? "border-primary bg-primary text-primary-foreground"
																: "border-input"
														}`}
													>
														{isSelected && <Check className="h-3 w-3" />}
													</div>
													<span className="flex-1 text-left">
														{tToolCall(`tools.${tool.id}`)}
													</span>
												</button>
											);
										})}
									</div>
								</div>
							))}
						</div>

						{/* 分隔线 */}
						<div className="border-t border-border my-2" />

						{/* FreeTodo 工具区域 */}
						<div>
							<div className="flex items-center justify-between mb-2 px-2">
								<div className="flex items-center gap-1.5">
									<Wrench className="h-3.5 w-3.5 text-muted-foreground" />
									<span className="text-xs font-medium text-muted-foreground">
										{tChat("toolSelector.freetodoTools")}
									</span>
								</div>
								<div className="flex gap-2">
									<button
										type="button"
										onClick={handleSelectAllFreetodo}
										className="text-xs text-primary hover:underline"
									>
										{tChat("toolSelector.selectAll")}
									</button>
									<span className="text-xs text-muted-foreground">|</span>
									<button
										type="button"
										onClick={handleDeselectAllFreetodo}
										className="text-xs text-primary hover:underline"
									>
										{tChat("toolSelector.deselectAll")}
									</button>
								</div>
							</div>
							{Object.entries(
								FREETODO_TOOLS.reduce(
									(acc, tool) => {
										if (!acc[tool.category]) {
											acc[tool.category] = [];
										}
										acc[tool.category].push(tool);
										return acc;
									},
									{} as Record<
										string,
										Array<(typeof FREETODO_TOOLS)[number]>
									>,
								),
							).map(([category, tools]) => (
								<div key={category} className="mb-3 last:mb-0">
									{/* 分类标题 */}
									<div className="mb-1.5 px-2 text-xs font-medium text-muted-foreground">
										{tChat(`toolSelector.categories.${category}`)}
									</div>
									{/* 工具选项 */}
									<div className="space-y-0.5">
										{tools.map((tool) => {
											const isSelected = selectedAgnoTools.includes(tool.id);
											return (
												<button
													key={tool.id}
													type="button"
													onClick={() => handleToggleFreetodoTool(tool.id)}
													className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
												>
													<div
														className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
															isSelected
																? "border-primary bg-primary text-primary-foreground"
																: "border-input"
														}`}
													>
														{isSelected && <Check className="h-3 w-3" />}
													</div>
													<span className="flex-1 text-left">
														{tToolCall(`tools.${tool.id}`)}
													</span>
												</button>
											);
										})}
									</div>
								</div>
							))}
						</div>
					</div>

					{/* 底部状态栏 */}
					<div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
						{totalSelectedCount === 0
							? tChat("toolSelector.noneSelected")
							: isAllSelected
								? tChat("toolSelector.allSelected")
								: tChat("toolSelector.selectedCount", { count: totalSelectedCount })}
					</div>
				</div>
			)}
		</div>
	);
}
