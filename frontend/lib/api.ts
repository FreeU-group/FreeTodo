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

  testLlmConfig: (config: { llmKey: string; baseUrl: string; model?: string }) =>
    apiClient.post('/api/test-llm-config', config),

  saveAndInitLlm: (config: { llmKey: string; baseUrl: string; model: string }) =>
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

  // 工作区项目管理
  getWorkspaceProjects: () =>
    apiClient.get('/api/workspace/projects'),

  createWorkspaceProject: (name: string, projectType: string = 'other') =>
    apiClient.post('/api/workspace/projects', { name, project_type: projectType }),

  renameWorkspaceProject: (projectId: string, newName: string) =>
    apiClient.post('/api/workspace/projects/rename', { project_id: projectId, new_name: newName }),

  deleteWorkspaceProject: (projectId: string) =>
    apiClient.post('/api/workspace/projects/delete', { project_id: projectId }),

  getProjectFiles: (projectId: string) =>
    apiClient.get(`/api/workspace/projects/${encodeURIComponent(projectId)}/files`),

  // 流式生成项目大纲 URL
  getGenerateOutlineStreamUrl: (projectId: string, projectType: string) =>
    `${API_BASE_URL}/api/workspace/projects/${encodeURIComponent(projectId)}/outline/generate?project_type=${projectType}`,

  // 流式生成章节内容
  generateChaptersStream: async (
    projectId: string,
    onMessage: (message: {
      type: 'chapters' | 'chapter_start' | 'content' | 'chapter_done' | 'chapter_error' | 'done' | 'error';
      data?: { title: string; index: number }[];
      index?: number;
      title?: string;
      chunk?: string;
      filename?: string;
      file_id?: string;
      message?: string;
      error?: string;
    }) => void
  ): Promise<void> => {
    const response = await fetch(
      `${API_BASE_URL}/api/workspace/projects/${encodeURIComponent(projectId)}/chapters/generate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error('Request failed');
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (reader) {
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const message = JSON.parse(line);
              onMessage(message);
            } catch (e) {
              console.error('Failed to parse message:', line, e);
            }
          }
        }
      }

      // 处理最后的内容
      if (buffer.trim()) {
        try {
          const message = JSON.parse(buffer);
          onMessage(message);
        } catch (e) {
          console.error('Failed to parse final message:', buffer, e);
        }
      }
    }
  },

  // 预览幻灯片 prompts
  previewSlidesPrompts: async (projectId: string, customRequirements?: string) => {
    const url = new URL(
      `${API_BASE_URL}/api/workspace/projects/${encodeURIComponent(projectId)}/slides/preview`
    );
    // 确保 customRequirements 是字符串类型且不为空
    if (customRequirements && typeof customRequirements === 'string') {
      const trimmed = customRequirements.trim();
      if (trimmed) {
        url.searchParams.append('custom_requirements', trimmed);
      }
    }
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) {
      throw new Error('Request failed');
    }
    return response.json();
  },

  // 流式生成幻灯片
  generateSlidesStream: async (
    projectId: string,
    onMessage: (message: {
      type: 'slides' | 'slide_start' | 'slide_progress' | 'slide_done' | 'slide_error' | 'done' | 'error';
      data?: { title: string; index: number; prompt: string }[];
      index?: number;
      title?: string;
      prompt?: string;
      message?: string;
      filename?: string;
      url?: string;
      error?: string;
    }) => void,
    customRequirements?: string
  ): Promise<void> => {
    // 构建URL，添加自定义要求参数
    const url = new URL(
      `${API_BASE_URL}/api/workspace/projects/${encodeURIComponent(projectId)}/slides/generate`
    );
    // 确保 customRequirements 是字符串类型且不为空
    if (customRequirements && typeof customRequirements === 'string') {
      const trimmed = customRequirements.trim();
      if (trimmed) {
        url.searchParams.append('custom_requirements', trimmed);
      }
    }
    
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error('Request failed');
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (reader) {
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const message = JSON.parse(line);
              onMessage(message);
            } catch (e) {
              console.error('Failed to parse message:', line, e);
            }
          }
        }
      }

      // 处理最后的内容
      if (buffer.trim()) {
        try {
          const message = JSON.parse(buffer);
          onMessage(message);
        } catch (e) {
          console.error('Failed to parse final message:', buffer, e);
        }
      }
    }
  },

  // 工作区文件管理
  getWorkspaceFiles: () =>
    apiClient.get('/api/workspace/files'),

  getWorkspaceFile: (fileId: string) =>
    apiClient.get('/api/workspace/file', { params: { file_id: fileId } }),

  // 上传工作区文件
  uploadWorkspaceFile: (file: File, folder?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post('/api/workspace/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      params: folder ? { folder } : undefined,
    });
  },

  // 上传工作区图片
  uploadWorkspaceImage: (
    projectId: string,
    file: File,
    onProgress?: (progress: number) => void,
    signal?: AbortSignal
  ): Promise<{ success: boolean; url?: string; filename?: string; error?: string }> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append('file', file);

      // 设置进度回调
      if (onProgress) {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const progress = (e.loaded / e.total) * 100;
            onProgress(progress);
          }
        });
      }

      // 设置取消信号
      if (signal) {
        signal.addEventListener('abort', () => {
          xhr.abort();
          reject(new Error('Upload cancelled'));
        });
      }

      // 设置完成回调
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            resolve(response);
          } catch {
            reject(new Error('Invalid response format'));
          }
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      });

      // 设置错误回调
      xhr.addEventListener('error', () => {
        reject(new Error('Network error'));
      });

      // 发送请求
      xhr.open('POST', `${API_BASE_URL}/api/workspace/upload-image?project_id=${encodeURIComponent(projectId)}`);
      xhr.send(formData);
    });
  },

  // 创建工作区文件
  createWorkspaceFile: (fileName: string, folder?: string, content?: string) =>
    apiClient.post('/api/workspace/create', {
      file_name: fileName,
      folder: folder || '',
      content: content || '',
    }),

  // 创建工作区文件夹
  createWorkspaceFolder: (folderName: string, parentFolder?: string) =>
    apiClient.post('/api/workspace/create-folder', {
      folder_name: folderName,
      parent_folder: parentFolder || '',
    }),

  // 重命名工作区文件
  renameWorkspaceFile: (fileId: string, newName: string) =>
    apiClient.post('/api/workspace/rename', { file_id: fileId, new_name: newName }),

  // 保存工作区文件
  saveWorkspaceFile: (fileId: string, content: string) =>
    apiClient.post('/api/workspace/save', { file_id: fileId, content }),

  // 删除工作区文件或文件夹
  deleteWorkspaceFile: (fileId: string) =>
    apiClient.post('/api/workspace/delete', { file_id: fileId }),

  // 获取 slides 文件夹中的图片列表
  getSlidesImages: (projectId: string) =>
    apiClient.get(`/api/workspace/slides/${encodeURIComponent(projectId)}/images`),

  // 工作区文档 AI 操作
  processDocumentAI: (params: {
    action: 'summarize' | 'improve' | 'explain' | 'custom' | 'beautify' | 'expand' | 'condense' | 'correct' | 'translate';
    document_content: string;
    document_name?: string;
    custom_prompt?: string;
    conversation_id?: string;
  }) => apiClient.post('/api/workspace/ai/process', params),

  // 工作区文档 AI 操作（流式）
  processDocumentAIStream: async (
    params: {
      action: 'summarize' | 'improve' | 'explain' | 'custom' | 'beautify' | 'expand' | 'condense' | 'correct' | 'translate';
      document_content: string;
      document_name?: string;
      custom_prompt?: string;
      conversation_id?: string;
    },
    onChunk: (chunk: string) => void
  ): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/api/workspace/ai/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error('Request failed');
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
};
