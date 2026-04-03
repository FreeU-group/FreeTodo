import { create } from "zustand";
import type { ParsedTodoTree } from "@/apps/chat/types";
import { unwrapApiData } from "@/lib/api/fetcher";
import {
	createTodoApiTodosPost,
	updateTodoApiTodosTodoIdPut,
} from "@/lib/generated/todos/todos";
import { getQueryClient, queryKeys } from "@/lib/query";

export interface Question {
	id: string;
	question: string;
	options: string[];
	type?: "single" | "multiple"; // 可选，默认多选
}

type BreakdownStage = "idle" | "questionnaire" | "summary" | "completed";

interface BreakdownStoreState {
	activeBreakdownTodoId: number | null;
	stage: BreakdownStage;
	questions: Question[];
	answers: Record<string, string[]>;
	summary: string | null;
	subtasks: ParsedTodoTree[] | null;
	isLoading: boolean;
	isGeneratingSummary: boolean; // 正在生成总结（流式）
	summaryStreamingText: string | null; // 流式生成的文本（用于显示）
	isGeneratingQuestions: boolean; // 正在生成问题（流式）
	questionStreamingCount: number; // 当前已生成的问题数量
	questionStreamingTitle: string | null; // 当前正在生成的问题标题
	error: string | null;

	startBreakdown: (todoId: number) => void;
	setQuestions: (questions: Question[]) => void;
	setAnswer: (questionId: string, options: string[]) => void;
	setSummary: (summary: string, subtasks: ParsedTodoTree[]) => void;
	setSummaryStreaming: (text: string | null) => void; // 设置流式文本
	setIsGeneratingSummary: (isGenerating: boolean) => void; // 设置生成状态
	setQuestionStreaming: (count: number, title: string | null) => void; // 设置问题流式状态
	setIsGeneratingQuestions: (isGenerating: boolean) => void; // 设置问题生成状态
	resetBreakdown: () => void;
	applyBreakdown: () => Promise<void>;
}

export const useBreakdownStore = create<BreakdownStoreState>()((set, get) => ({
	activeBreakdownTodoId: null,
	stage: "idle",
	questions: [],
	answers: {},
	summary: null,
	subtasks: null,
	isLoading: false,
	isGeneratingSummary: false,
	summaryStreamingText: null,
	isGeneratingQuestions: false,
	questionStreamingCount: 0,
	questionStreamingTitle: null,
	error: null,

	startBreakdown: (todoId: number) => {
		set({
			activeBreakdownTodoId: todoId,
			stage: "questionnaire",
			questions: [],
			answers: {},
			summary: null,
			subtasks: null,
			isLoading: true,
			error: null,
		});
	},

	setQuestions: (questions: Question[]) => {
		set({
			questions,
			isLoading: false,
			error: null,
		});
	},

	setAnswer: (questionId: string, options: string[]) => {
		set((state) => ({
			answers: {
				...state.answers,
				[questionId]: options,
			},
		}));
	},

	setSummary: (summary: string, subtasks: ParsedTodoTree[]) => {
		set({
			summary,
			subtasks,
			stage: "summary",
			isLoading: false,
			isGeneratingSummary: false,
			summaryStreamingText: null,
			error: null,
		});
	},

	setSummaryStreaming: (text: string | null) => {
		set({ summaryStreamingText: text });
	},

	setIsGeneratingSummary: (isGenerating: boolean) => {
		set({ isGeneratingSummary: isGenerating });
	},

	setQuestionStreaming: (count: number, title: string | null) => {
		set({ questionStreamingCount: count, questionStreamingTitle: title });
	},

	setIsGeneratingQuestions: (isGenerating: boolean) => {
		set({
			isGeneratingQuestions: isGenerating,
			...(isGenerating
				? {}
				: { questionStreamingCount: 0, questionStreamingTitle: null }),
		});
	},

	resetBreakdown: () => {
		set({
			activeBreakdownTodoId: null,
			stage: "idle",
			questions: [],
			answers: {},
			summary: null,
			subtasks: null,
			isLoading: false,
			isGeneratingSummary: false,
			summaryStreamingText: null,
			isGeneratingQuestions: false,
			questionStreamingCount: 0,
			questionStreamingTitle: null,
			error: null,
		});
	},

	applyBreakdown: async () => {
		const state = get();
		if (!state.activeBreakdownTodoId || !state.summary || !state.subtasks) {
			return;
		}

		set({ isLoading: true, error: null });

		try {
			// 更新任务描述
			await updateTodoApiTodosTodoIdPut(state.activeBreakdownTodoId, {
				description: state.summary,
			});

			// 添加子任务 - 递归创建，处理层级关系
			const createSubtasks = async (
				trees: ParsedTodoTree[],
				parentId: number | null,
			): Promise<void> => {
				for (const node of trees) {
					// 创建当前子任务
					const apiTodo = await createTodoApiTodosPost({
						name: node.name,
						description: node.description,
						order: node.order,
						parent_todo_id: parentId,
					});
					const created = unwrapApiData<{ id: number }>(apiTodo);
					const createdId = created?.id;

					// 如果有嵌套子任务，递归创建
					if (createdId && node.subtasks && node.subtasks.length > 0) {
						await createSubtasks(node.subtasks, createdId);
					}
				}
			};

			await createSubtasks(state.subtasks, state.activeBreakdownTodoId);

			// 使 todos 缓存失效，触发重新获取
			const queryClient = getQueryClient();
			await queryClient.invalidateQueries({ queryKey: queryKeys.todos.all });

			// 标记为完成
			set({
				stage: "completed",
				isLoading: false,
			});

			// 延迟重置，让用户看到完成状态
			setTimeout(() => {
				get().resetBreakdown();
			}, 2000);
		} catch (error) {
			console.error("Failed to apply breakdown:", error);
			set({
				error: error instanceof Error ? error.message : "应用拆分失败，请重试",
				isLoading: false,
			});
		}
	},
}));
