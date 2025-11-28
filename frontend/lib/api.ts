import axios from 'axios';

// API 基础地址
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 响应拦截器
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error);
    return Promise.reject(error);
  }
);

export default apiClient;
export { API_BASE_URL };

// API 接口函数
export const api = {
  // 统计信息
  getStatistics: () => apiClient.get('/api/statistics'),

  // 截图相关
  getScreenshots: (params?: {
    limit?: number;
    offset?: number;
    startDate?: string;
    endDate?: string;
    appName?: string;
  }) => apiClient.get('/api/screenshots', { params }),

  getScreenshot: (id: number) => apiClient.get(`/api/screenshots/${id}`),

  getScreenshotImage: (id: number) => `${API_BASE_URL}/api/screenshots/${id}/image`,

  // 搜索相关
  search: (params: {
    query?: string;
    start_date?: string;
    end_date?: string;
    app_name?: string;
  }) => apiClient.post('/api/search', params),

  semanticSearch: (params: {
    query: string;
    top_k?: number;
    use_rerank?: boolean;
    retrieve_k?: number;
    filters?: any;
  }) => apiClient.post('/api/semantic-search', params),

  eventSearch: (params: {
    query?: string;
    limit?: number;
  }) => apiClient.post('/api/event-search', params),

  eventSemanticSearch: (params: {
    query: string;
    top_k?: number;
  }) => apiClient.post('/api/event-semantic-search', params),

  // 事件相关
  getEvents: (params?: {
    limit?: number;
    offset?: number;
    start_date?: string;
    end_date?: string;
    app_name?: string;
  }) => apiClient.get('/api/events', { params }),

  getEventCount: (params?: {
    start_date?: string;
    end_date?: string;
    app_name?: string;
  }) => apiClient.get('/api/events/count', { params }),

  getEvent: (id: number) => apiClient.get(`/api/events/${id}`),

  // 向量数据库
  getVectorStats: () => apiClient.get('/api/vector-stats'),

  syncVectorDatabase: (forceReset = false) =>
    apiClient.post(`/api/vector-sync${forceReset ? '?force_reset=true' : ''}`),

  // 聊天相关
  sendChatMessage: (params: {
    message: string;
    conversation_id?: string;
    use_rag?: boolean;
  }) => apiClient.post('/api/chat', params),

  sendChatMessageWithContext: (params: {
    message: string;
    conversation_id?: string;
    event_context?: Array<{ event_id: number; text: string }>;
  }) => apiClient.post('/api/chat/stream-with-context', params, {
    responseType: 'stream',
  }),

  // 流式聊天（使用 fetch 处理流式响应）
  sendChatMessageStream: async (params: {
    message: string;
    conversation_id?: string;
    use_rag?: boolean;
    project_id?: number;
    task_ids?: number[];
  }, onChunk: (chunk: string) => void, onSessionId?: (sessionId: string) => void): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/api/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error('Request failed');
    }

    // 从响应头中获取 session_id
    const sessionId = response.headers.get('X-Session-Id');
    if (sessionId && onSessionId) {
      onSessionId(sessionId);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        onChunk(chunk);
      }
    }
  },

  // 流式聊天（带事件上下文）
  sendChatMessageWithContextStream: async (params: {
    message: string;
    conversation_id?: string;
    event_context?: Array<{ event_id: number; text: string }>;
  }, onChunk: (chunk: string) => void, onSessionId?: (sessionId: string) => void): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/api/chat/stream-with-context`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error('Request failed');
    }

    // 从响应头中获取 session_id
    const sessionId = response.headers.get('X-Session-Id');
    if (sessionId && onSessionId) {
      onSessionId(sessionId);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        onChunk(chunk);
      }
    }
  },

  getConversations: () => apiClient.get('/api/conversations'),

  deleteConversation: (id: string) => apiClient.delete(`/api/conversations/${id}`),

  // 聊天历史记录
  getChatHistory: (sessionId?: string, chatType?: string, limit?: number) =>
    apiClient.get('/api/chat/history', {
      params: {
        ...(sessionId ? { session_id: sessionId } : {}),
        ...(chatType ? { chat_type: chatType } : {}),
        ...(limit ? { limit } : {}),
      }
    }),

  // 创建新会话
  createNewChat: (chatType?: string, contextId?: number) =>
    apiClient.post('/api/chat/new', {
      session_id: undefined,
    }),

  // 添加消息到会话
  addMessageToSession: (sessionId: string, role: string, content: string) =>
    apiClient.post(`/api/chat/session/${sessionId}/message`, {
      role,
      content,
    }),

  // 应用使用分析
  getAppUsage: (params?: {
    start_date?: string;
    end_date?: string;
  }) => apiClient.get('/api/app-usage', { params }),

  // 时间分配
  getTimeAllocation: (params?: {
    start_date?: string;
    end_date?: string;
  }) => apiClient.get('/api/time-allocation', { params }),

  // 行为分析
  getAnalytics: (params?: {
    start_date?: string;
    end_date?: string;
  }) => apiClient.get('/api/analytics', { params }),

  // 配置相关
  getConfig: () => apiClient.get('/api/get-config'),

  saveConfig: (config: any) => apiClient.post('/api/save-config', config),

  testLlmConfig: (config: { llmApiKey: string; llmBaseUrl: string; llmModel?: string }) =>
    apiClient.post('/api/test-llm-config', config),

  saveAndInitLlm: (config: { llmApiKey: string; llmBaseUrl: string; llmModel: string }) =>
    apiClient.post('/api/save-and-init-llm', config),

  // 健康检查
  healthCheck: () => apiClient.get('/health'),

  llmHealthCheck: () => apiClient.get('/health/llm'),

  // 项目管理
  createProject: (data: { name: string; goal?: string }) =>
    apiClient.post('/api/projects', data),

  getProjects: (params?: { limit?: number; offset?: number }) =>
    apiClient.get('/api/projects', { params }),

  getProject: (id: number) =>
    apiClient.get(`/api/projects/${id}`),

  updateProject: (id: number, data: { name?: string; goal?: string }) =>
    apiClient.put(`/api/projects/${id}`, data),

  deleteProject: (id: number) =>
    apiClient.delete(`/api/projects/${id}`),

  // 任务管理
  createTask: (projectId: number, data: { name: string; description?: string; status?: string; parent_task_id?: number }) =>
    apiClient.post(`/api/projects/${projectId}/tasks`, data),

  getProjectTasks: (projectId: number, params?: { limit?: number; offset?: number; parent_task_id?: number; include_subtasks?: boolean }) =>
    apiClient.get(`/api/projects/${projectId}/tasks`, { params }),

  getTask: (projectId: number, taskId: number) =>
    apiClient.get(`/api/projects/${projectId}/tasks/${taskId}`),

  updateTask: (projectId: number, taskId: number, data: { name?: string; description?: string; status?: string; parent_task_id?: number }) =>
    apiClient.put(`/api/projects/${projectId}/tasks/${taskId}`, data),

  deleteTask: (projectId: number, taskId: number) =>
    apiClient.delete(`/api/projects/${projectId}/tasks/${taskId}`),

  getTaskChildren: (projectId: number, taskId: number) =>
    apiClient.get(`/api/projects/${projectId}/tasks/${taskId}/children`),

  // 任务进展管理
  getTaskProgress: (projectId: number, taskId: number, params?: { limit?: number; offset?: number }) =>
    apiClient.get(`/api/projects/${projectId}/tasks/${taskId}/progress`, { params }),

  getTaskProgressLatest: (projectId: number, taskId: number) =>
    apiClient.get(`/api/projects/${projectId}/tasks/${taskId}/progress/latest`),

  generateTaskSummary: (projectId: number, taskId: number) =>
    apiClient.post(`/api/projects/${projectId}/tasks/${taskId}/generate-summary`),

  // 上下文管理
  getContexts: (params?: { associated?: boolean; task_id?: number; limit?: number; offset?: number }) =>
    apiClient.get('/api/contexts', { params }),

  getContext: (contextId: number) =>
    apiClient.get(`/api/contexts/${contextId}`),

  updateContext: (contextId: number, data: { task_id?: number | null }) =>
    apiClient.put(`/api/contexts/${contextId}`, data),

  // 调度器相关
  getSchedulerJobs: () => apiClient.get('/api/scheduler/jobs'),

  getSchedulerStatus: () => apiClient.get('/api/scheduler/status'),

  pauseSchedulerJob: (jobId: string) =>
    apiClient.post(`/api/scheduler/jobs/${jobId}/pause`),

  resumeSchedulerJob: (jobId: string) =>
    apiClient.post(`/api/scheduler/jobs/${jobId}/resume`),

  deleteSchedulerJob: (jobId: string) =>
    apiClient.delete(`/api/scheduler/jobs/${jobId}`),

  updateSchedulerJobInterval: (jobId: string, data: {
    job_id: string;
    seconds?: number;
    minutes?: number;
    hours?: number;
  }) => apiClient.put(`/api/scheduler/jobs/${jobId}/interval`, data),

  pauseAllSchedulerJobs: () =>
    apiClient.post('/api/scheduler/jobs/pause-all'),

  resumeAllSchedulerJobs: () =>
    apiClient.post('/api/scheduler/jobs/resume-all'),

  // 费用统计
  getCostStats: (days?: number) =>
    apiClient.get('/api/cost-tracking/stats', { params: { days } }),

  getCostConfig: () =>
    apiClient.get('/api/cost-tracking/config'),
};
