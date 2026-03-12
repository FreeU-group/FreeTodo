/**
 * TanStack Query Keys 常量定义
 * 统一管理所有查询的缓存键，确保类型安全和一致性
 */

export const queryKeys = {
	/**
	 * Todo 相关查询键
	 */
	todos: {
		/** 所有 todo 相关查询的根键 */
		all: ["todos"] as const,
		/** todo 列表查询 */
		list: (params?: { status?: string; limit?: number; offset?: number }) =>
			["todos", "list", params] as const,
		/** 单个 todo 详情 */
		detail: (id: string) => ["todos", "detail", id] as const,
	},

	/**
	 * Activity 相关查询键
	 */
	activities: {
		/** 所有 activity 相关查询的根键 */
		all: ["activities"] as const,
		/** activity 列表查询 */
		list: (params?: {
			limit?: number;
			offset?: number;
			start_date?: string;
			end_date?: string;
		}) => ["activities", "list", params] as const,
		/** 单个 activity 的事件列表 */
		events: (activityId: number) =>
			["activities", activityId, "events"] as const,
	},

	/**
	 * Event 相关查询键
	 */
	events: {
		/** 所有 event 相关查询的根键 */
		all: ["events"] as const,
		/** 单个 event 详情 */
		detail: (id: number) => ["events", id] as const,
		/** event 列表查询 */
		list: (params?: {
			limit?: number;
			offset?: number;
			start_date?: string;
			end_date?: string;
			app_name?: string;
		}) => ["events", "list", params] as const,
	},

	/**
	 * Cost 统计查询键
	 */
	costStats: (days: number) => ["costStats", days] as const,

	/**
	 * Journal 相关查询键
	 */
	journals: {
		/** 所有 journal 相关查询的根键 */
		all: ["journals"] as const,
		/** journal 列表查询 */
		list: (params?: {
			limit?: number;
			offset?: number;
			startDate?: string;
			endDate?: string;
		}) => ["journals", "list", params] as const,
		/** 单个 journal 详情 */
		detail: (id: number) => ["journals", "detail", id] as const,
	},

	/**
	 * 配置相关查询键
	 */
	config: ["config"] as const,

	/**
	 * Chat 历史记录查询键
	 */
	chatHistory: {
		/** 所有 chat 相关查询的根键 */
		all: ["chatHistory"] as const,
		/** 会话列表 */
		sessions: (chatType?: string) =>
			["chatHistory", "sessions", chatType] as const,
		/** 单个会话的消息历史 */
		session: (sessionId: string) =>
			["chatHistory", "session", sessionId] as const,
	},

	/**
	 * 自动化任务查询键
	 */
	automationTasks: {
		all: ["automationTasks"] as const,
		list: () => ["automationTasks", "list"] as const,
	},
} as const;

/**
 * 类型导出：用于类型推断
 */
export type QueryKeys = typeof queryKeys;
