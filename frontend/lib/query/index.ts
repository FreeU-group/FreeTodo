/**
 * TanStack Query Hooks 统一导出
 */

// Activity Hooks
export {
	useActivities,
	useActivityEvents,
	useActivityWithEvents,
	useEvent,
	useEvents,
	useEventsList,
} from "./activities";
// Automation Hooks
export {
	useAutomationTasks,
	useCreateAutomationTask,
	useDeleteAutomationTask,
	useRunAutomationTask,
	useToggleAutomationTask,
	useUpdateAutomationTask,
} from "./automation";
// Chat Hooks
export { useChatHistory, useChatSessions } from "./chat";
// Config Hooks
export {
	type AppConfig,
	useConfig,
	useConfigMutations,
	useLlmStatus,
	useSaveConfig,
} from "./config";
// Cost Hooks
export { useCostConfig, useCostStats } from "./cost";
// Journal Hooks
export {
	type JournalAutoLinkResult,
	type JournalView,
	useJournalMutations,
	useJournals,
} from "./journals";
// Query Keys
export { type QueryKeys, queryKeys } from "./keys";
// Provider
export { getQueryClient, QueryProvider } from "./provider";
// Todo Hooks
export {
	type ReorderTodoItem,
	useCreateTodo,
	useDeleteTodo,
	useReorderTodos,
	useTodoMutations,
	useTodos,
	useToggleTodoStatus,
	useUpdateTodo,
} from "./todos";
