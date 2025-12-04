// 截图类型
export interface Screenshot {
  id: number;
  file_path: string;
  app_name: string;
  window_title: string;
  created_at: string;
  text_content?: string;
  width: number;
  height: number;
  ocr_result?: {
    text_content: string;
  };
  // 搜索结果特有字段
  semantic_score?: number;
  is_semantic_result?: boolean;
  combined_score?: number;
  text_score?: number;
  image_score?: number;
  text_weight?: number;
  image_weight?: number;
  is_multimodal_result?: boolean;
}

// 事件类型
export interface Event {
  id: number;
  app_name: string;
  window_title: string;
  start_time: string;
  end_time?: string;
  screenshot_count: number;
  first_screenshot_id?: number;
  screenshots?: Screenshot[];
  ai_summary?: string;
}

// 统计信息类型
export interface Statistics {
  total_screenshots: number;
  processed_screenshots: number;
  pending_tasks: number;
  today_screenshots: number;
  processing_rate: number;
}

// 向量数据库状态
export interface VectorStats {
  enabled: boolean;
  document_count?: number;
  collection_name?: string;
  error?: string;
}

// 聊天消息类型
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
  sources?: any[];
}

// 会话类型
export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages: ChatMessage[];
}

// 搜索类型
export type SearchType = 'traditional' | 'semantic' | 'multimodal' | 'event';

// 搜索参数
export interface SearchParams {
  query?: string;
  startDate?: string;
  endDate?: string;
  appName?: string;
  searchType: SearchType;
  // 语义搜索参数
  topK?: number;
  useRerank?: boolean;
  retrieveK?: number;
  // 多模态搜索参数
  textWeight?: number;
  imageWeight?: number;
}

// 项目管理类型
export type ProjectStatus = 'active' | 'archived' | 'completed';

export interface Project {
  id: number;
  name: string;
  description?: string;
  /**
   * 对应后端字段 definition_of_done，表示项目“完成”的标准或最终交付物
   */
  definition_of_done?: string;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
}

export interface ProjectCreate {
  name: string;
  description?: string;
  definition_of_done?: string;
  status?: ProjectStatus;
}

export interface ProjectUpdate {
  name?: string;
  description?: string;
  definition_of_done?: string;
  status?: ProjectStatus;
}

export interface ProjectListResponse {
  total: number;
  projects: Project[];
}

// 任务管理类型
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export interface Task {
  id: number;
  project_id: number;
  name: string;
  description?: string;
  status: TaskStatus;
  parent_task_id?: number;
  created_at: string;
  updated_at: string;
}

export interface TaskWithChildren extends Task {
  children: TaskWithChildren[];
}

export interface TaskCreate {
  name: string;
  description?: string;
  status?: TaskStatus;
  parent_task_id?: number;
}

export interface TaskUpdate {
  name?: string;
  description?: string;
  status?: TaskStatus;
  parent_task_id?: number;
}

export interface TaskListResponse {
  total: number;
  tasks: Task[];
}

// 任务进展类型
export interface TaskProgress {
  id: number;
  task_id: number;
  summary: string;
  context_count: number;
  generated_at: string;
  created_at: string;
}

export interface TaskProgressListResponse {
  total: number;
  progress_list: TaskProgress[];
}

// 上下文管理类型
export interface Context {
  id: number;
  app_name?: string;
  window_title?: string;
  start_time?: string;
  end_time?: string;
  ai_title?: string;
  ai_summary?: string;
  task_id?: number;
  created_at?: string;
}

export interface ContextListResponse {
  total: number;
  contexts: Context[];
}

export interface ContextUpdateRequest {
  task_id?: number | null;
}
