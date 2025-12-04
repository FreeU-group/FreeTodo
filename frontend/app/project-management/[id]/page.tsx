'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Plus, FolderOpen, ChevronRight, ChevronDown, ChevronUp, History, Send, User, Bot, X, Activity, TrendingUp, Search, Clock, Sparkles, Trash2 } from 'lucide-react';
import Button from '@/components/common/Button';
import Loading from '@/components/common/Loading';
import Input from '@/components/common/Input';
import EditableText from '@/components/common/EditableText';
import TaskBoard from '@/components/task/TaskBoard';
import TaskListView from '@/components/task/TaskListView';
import TaskDashboardView from '@/components/task/TaskDashboardView';
import CreateTaskModal from '@/components/task/CreateTaskModal';
import ViewModeSelect from '@/components/project/ViewModeSelect';
import { Project, Task } from '@/lib/types';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import MessageContent from '@/components/common/MessageContent';
import { useLocaleStore } from '@/lib/store/locale';
import { useTranslations } from '@/lib/i18n';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number;
}

interface SessionSummary {
  session_id: string;
  chat_type: string;
  title: string | null;
  context_id: number | null;
  created_at: string;
  last_active: string;
  message_count: number;
}

// 空状态组件
function TaskEmptyState({
  onCreateTask,
  onAIGenerate,
  isGenerating,
  hasProjectInfo,
}: {
  onCreateTask: () => void;
  onAIGenerate: () => void;
  isGenerating: boolean;
  hasProjectInfo: boolean;
}) {
  const locale = useLocaleStore((state) => state.locale);
  const t = useTranslations(locale);

  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center mb-6">
        <FolderOpen className="w-12 h-12 text-muted-foreground" />
      </div>
      <h3 className="text-xl font-semibold text-foreground mb-2">{t.projectDetail.noTasks}</h3>
      <p className="text-muted-foreground mb-8 text-center max-w-md">
        {t.projectDetail.noTasksDesc}
      </p>
      <div className="flex gap-3">
        <Button onClick={onCreateTask} className="gap-2">
          <Plus className="h-5 w-5" />
          {t.projectDetail.createTask}
        </Button>
        <Button
          variant="outline"
          onClick={onAIGenerate}
          disabled={isGenerating || !hasProjectInfo}
          className="gap-2"
          title={!hasProjectInfo ? t.projectDetail.noProjectInfo : t.projectDetail.aiTaskDecompositionDesc}
        >
          <Sparkles className={`h-5 w-5 ${isGenerating ? 'animate-pulse' : ''}`} />
          {isGenerating ? t.projectDetail.generating : t.projectDetail.aiTaskDecomposition}
        </Button>
      </div>
    </div>
  );
}

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const locale = useLocaleStore((state) => state.locale);
  const t = useTranslations(locale);
  const projectId = parseInt((params?.id as string) || '0');

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | undefined>(undefined);
  const [parentTaskId, setParentTaskId] = useState<number | undefined>(undefined);
  const [viewMode, setViewMode] = useState<'list' | 'board' | 'dashboard'>('list'); // 默认为列表视图
  const [showProjectInfo, setShowProjectInfo] = useState(false); // 项目描述/完成标准折叠状态
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [isEditingDefinition, setIsEditingDefinition] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [definitionDraft, setDefinitionDraft] = useState('');
  const [savingDescription, setSavingDescription] = useState(false);
  const [savingDefinition, setSavingDefinition] = useState(false);

  // 聊天相关状态
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [useRAG, setUseRAG] = useState(true);
  const [llmHealthy, setLlmHealthy] = useState(true);
  const [llmHealthChecked, setLlmHealthChecked] = useState(false);
  const [activeQuickAction, setActiveQuickAction] = useState<string | null>(null);
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
  const [sessionHistory, setSessionHistory] = useState<SessionSummary[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedTasks, setSelectedTasks] = useState<Set<number>>(new Set());
  const [isGeneratingTasks, setIsGeneratingTasks] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const descriptionEditRef = useRef<HTMLTextAreaElement | null>(null);
  const definitionEditRef = useRef<HTMLTextAreaElement | null>(null);

  const autoResizeTextarea = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    const maxHeight = typeof window !== 'undefined' ? window.innerHeight * 0.4 : 400;
    el.style.height = 'auto';
    const scrollHeight = el.scrollHeight;
    const newHeight = Math.min(maxHeight, scrollHeight);
    el.style.height = `${newHeight}px`;
    if (scrollHeight > maxHeight) {
      el.style.overflowY = 'auto';
    } else {
      el.style.overflowY = 'hidden';
    }
  };

  // 项目助手宽度与拖拽相关状态
  const [chatWidth, setChatWidth] = useState(400);
  const [isResizing, setIsResizing] = useState(false);

  // 滚动到聊天底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // 检查 LLM 健康状态
  const checkLlmHealth = async () => {
    try {
      const response = await api.llmHealthCheck();
      const status = response.data.status;
      setLlmHealthy(status === 'healthy');
      setLlmHealthChecked(true);
      return status === 'healthy';
    } catch (error) {
      console.error('LLM健康检查失败:', error);
      setLlmHealthy(false);
      setLlmHealthChecked(true);
      return false;
    }
  };

  // 加载聊天历史记录（只加载 project 类型，最多20条）
  const loadChatHistory = async () => {
    setHistoryLoading(true);
    try {
      const response = await api.getChatHistory(undefined, 'project', 20);
      const sessions = response.data.sessions || [];
      // 后端已按最后活跃时间排序，直接使用
      setSessionHistory(sessions);
    } catch (error) {
      console.error('加载聊天历史失败:', error);
    } finally {
      setHistoryLoading(false);
    }
  };

  // 加载指定会话的消息
  const loadSession = async (sessionId: string) => {
    try {
      setChatLoading(true);
      const response = await api.getChatHistory(sessionId);
      const history = response.data.history || [];

      const loadedMessages: ChatMessage[] = history.map((item: { role: 'user' | 'assistant'; content: string; timestamp: number }) => ({
        role: item.role,
        content: item.content,
        timestamp: item.timestamp,
      }));

      setMessages(loadedMessages);
      setCurrentConversationId(sessionId);
      setShowHistory(false);
      toast.success(t.projectDetail.sessionLoaded);
    } catch (error) {
      console.error('加载会话失败:', error);
      toast.error(t.projectDetail.sessionLoadFailed);
    } finally {
      setChatLoading(false);
    }
  };

  // 快捷选项处理
  const handleQuickAction = (action: string) => {
    let message = '';
    switch (action) {
      case 'summary':
        message = t.projectDetail.projectSummaryDesc;
        break;
      case 'next':
        message = t.projectDetail.nextStepDesc;
        break;
      case 'help':
        message = t.projectDetail.bottleneckAnalysisDesc;
        break;
    }
    setInputMessage(message);
    setActiveQuickAction(action);
  };

  // 发送消息（支持流式响应）
  const sendMessage = async () => {
    // 避免重复触发：正在发送或流式响应中时直接返回
    if (chatLoading || isStreaming) return;

    const trimmedMessage = inputMessage.trim();
    if (!trimmedMessage) return;

    // 一旦进入发送流程，立即设置为 loading，保证按钮和输入框立刻变为不可用
    setChatLoading(true);

    if (!llmHealthChecked) {
      const healthy = await checkLlmHealth();
      if (!healthy) {
        setChatLoading(false);
        return;
      }
    }

    if (!llmHealthy) {
      toast.error(t.toast.llmServiceError);
      setChatLoading(false);
      return;
    }

    const userMessage: ChatMessage = {
      role: 'user',
      content: trimmedMessage,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const currentInput = trimmedMessage;
    setInputMessage('');
    setIsStreaming(true);

    const assistantMessage: ChatMessage = {
      role: 'assistant',
      content: t.eventsPage.thinkingDots,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, assistantMessage]);

    let assistantContent = '';
    let sessionId = currentConversationId;

    try {
      let isFirstChunk = true;

      await api.sendChatMessageStream(
        {
          message: currentInput,
          conversation_id: sessionId || undefined,
          use_rag: useRAG,
          project_id: projectId,
          task_ids: selectedTasks.size > 0 ? Array.from(selectedTasks) : undefined,
        },
        (chunk: string) => {
          assistantContent += chunk;
          setMessages((prev) => {
            const newMessages = [...prev];
            newMessages[newMessages.length - 1] = {
              ...newMessages[newMessages.length - 1],
              content: assistantContent,
            };
            return newMessages;
          });

          if (isFirstChunk) {
            setChatLoading(false);
            isFirstChunk = false;
          }
        },
        (newSessionId: string) => {
          // 流式聊天接口会自动创建会话并返回 session_id
          if (!sessionId) {
            sessionId = newSessionId;
            setCurrentConversationId(newSessionId);
            console.log('获取到新的 session_id:', newSessionId);
          }
        }
      );

      if (sessionId && assistantContent) {
        try {
          await api.addMessageToSession(sessionId, 'user', currentInput);
          await api.addMessageToSession(sessionId, 'assistant', assistantContent);
        } catch (error) {
          console.error('保存消息到会话失败:', error);
        }
      }

      // 发送成功后清空选中的任务
      handleClearSelectedTasks();
    } catch (error) {
      console.error('发送消息失败:', error);
      setMessages((prev) => {
        const newMessages = [...prev];
        newMessages[newMessages.length - 1] = {
          ...newMessages[newMessages.length - 1],
          content: t.eventsPage.sendFailed,
        };
        return newMessages;
      });
    } finally {
      setChatLoading(false);
      setIsStreaming(false);
    }
  };

  // 新建会话（project 类型）
  const createNewConversation = async () => {
    try {
      const response = await api.createNewChat('project', projectId);
      const sessionId = response.data.session_id;
      setCurrentConversationId(sessionId);
      setMessages([]);
      setShowHistory(false); // 自动折叠最近会话
      toast.success(t.projectDetail.sessionCreated);
    } catch (error) {
      console.error('创建新会话失败:', error);
      setCurrentConversationId(null);
      setMessages([]);
      setShowHistory(false); // 自动折叠最近会话
    }
  };

  // 加载项目信息
  const loadProject = async () => {
    try {
      const response = await api.getProject(projectId);
      setProject(response.data);
    } catch (error) {
      console.error('加载项目信息失败:', error);
      toast.error(t.project.loadFailed);
    }
  };

  // 加载任务列表
  const loadTasks = async () => {
    setLoading(true);
    try {
      const response = await api.getProjectTasks(projectId, {
        limit: 1000,
        offset: 0,
        include_subtasks: true,
      });
      setTasks(response.data.tasks || []);
    } catch (error) {
      console.error('加载任务列表失败:', error);
      toast.error(t.task.createFailed);
    } finally {
      setLoading(false);
    }
  };

  // 初始加载
  useEffect(() => {
    if (projectId) {
      loadProject();
      loadTasks();
    }
  }, [projectId]);

  // 当项目加载完成时，初始化编辑草稿
  useEffect(() => {
    if (project) {
      setDescriptionDraft(project.description || '');
      setDefinitionDraft(project.definition_of_done || '');
    }
  }, [project]);

  // 处理创建任务
  const handleCreateTask = (parentId?: number) => {
    setEditingTask(undefined);
    setParentTaskId(parentId);
    setIsModalOpen(true);
  };

  // 处理编辑任务
  const handleEditTask = (task: Task) => {
    setEditingTask(task);
    setParentTaskId(undefined);
    setIsModalOpen(true);
  };

  // 处理删除任务
  const handleDeleteTask = async (taskId: number) => {
    if (!confirm(t.projectDetail.deleteTaskConfirm)) {
      return;
    }

    try {
      await api.deleteTask(projectId, taskId);
      toast.success(t.task.deleteSuccess);
      loadTasks();
    } catch (error) {
      console.error('删除任务失败:', error);
      toast.error(t.task.deleteFailed);
    }
  };

  // 处理任务状态变更
  const handleTaskStatusChange = async (taskId: number, newStatus: string) => {
    try {
      await api.updateTask(projectId, taskId, { status: newStatus });
      toast.success(t.projectDetail.taskStatusUpdated);
      loadTasks();
    } catch (error) {
      console.error('更新任务状态失败:', error);
      toast.error(t.projectDetail.taskStatusUpdateFailed);
    }
  };

  // 模态框成功回调
  const handleModalSuccess = () => {
    loadTasks();
  };

  // 更新项目名称
  const handleUpdateProjectName = async (newName: string) => {
    try {
      await api.updateProject(projectId, { name: newName });
      toast.success(t.project?.updateSuccess || '项目更新成功');
      loadProject();
    } catch (error) {
      console.error('更新项目名称失败:', error);
      toast.error(t.project?.updateFailed || '更新项目失败');
      throw error;
    }
  };

  // AI任务拆解
  const handleAIGenerateTasks = async () => {
    if (!project) return;

    // 检查是否有足够的项目信息
    if (!project.description && !project.definition_of_done) {
      toast.error(t.projectDetail.noProjectInfo);
      return;
    }

    setIsGeneratingTasks(true);
    try {
      const response = await api.generateProjectTasks(projectId);
      const count = response.data.tasks?.length || 0;
      toast.success(t.projectDetail.generateTasksSuccess.replace('{count}', String(count)));
      loadTasks();
    } catch (error) {
      console.error('AI任务拆解失败:', error);
      toast.error(t.projectDetail.generateTasksFailed);
    } finally {
      setIsGeneratingTasks(false);
    }
  };

  // 任务选择相关函数
  const selectedTasksData = tasks.filter((task) => selectedTasks.has(task.id));

  const handleToggleTaskSelect = (task: Task, selected: boolean) => {
    setSelectedTasks((prev) => {
      const newSet = new Set(prev);
      if (selected) {
        newSet.add(task.id);
      } else {
        newSet.delete(task.id);
      }
      return newSet;
    });
  };

  const handleClearSelectedTasks = () => {
    setSelectedTasks(new Set());
  };

  const handleRemoveSelectedTask = (taskId: number) => {
    setSelectedTasks((prev) => {
      const newSet = new Set(prev);
      newSet.delete(taskId);
      return newSet;
    });
  };

  // 批量删除任务
  const handleBatchDeleteTasks = async () => {
    if (selectedTasks.size === 0) return;

    const confirmMessage = t.projectDetail.batchDeleteConfirm.replace('{count}', String(selectedTasks.size));
    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      const response = await api.batchDeleteTasks(projectId, Array.from(selectedTasks));
      const result = response.data;

      if (result.deleted_count > 0) {
        if (result.failed_ids.length > 0 || result.not_found_ids.length > 0 || result.wrong_project_ids.length > 0) {
          // 部分成功
          const failedCount = result.failed_ids.length + result.not_found_ids.length + result.wrong_project_ids.length;
          toast.warning(
            t.projectDetail.batchDeletePartial
              .replace('{success}', String(result.deleted_count))
              .replace('{failed}', String(failedCount))
          );
        } else {
          // 全部成功
          toast.success(t.projectDetail.batchDeleteSuccess.replace('{count}', String(result.deleted_count)));
        }
        setSelectedTasks(new Set());
        loadTasks();
      } else {
        toast.error(t.projectDetail.batchDeleteFailed);
      }
    } catch (error) {
      console.error('批量删除任务失败:', error);
      toast.error(t.projectDetail.batchDeleteFailed);
    }
  };

  const handleSaveDescription = async () => {
    if (!project || savingDescription) return;
    const trimmed = descriptionDraft.trim();
    // 内容未变化时只退出编辑
    if (trimmed === (project.description || '')) {
      setIsEditingDescription(false);
      return;
    }
    setSavingDescription(true);
    try {
      await api.updateProject(projectId, { description: trimmed || undefined });
      setProject((prev) =>
        prev ? { ...prev, description: trimmed || undefined } : prev
      );
      toast.success(t.project.updateSuccess);
      setIsEditingDescription(false);
    } catch (error) {
      console.error('更新项目描述失败:', error);
      toast.error(t.project.updateFailed);
      // 保留编辑状态和草稿，避免用户输入丢失
    } finally {
      setSavingDescription(false);
    }
  };

  const handleSaveDefinition = async () => {
    if (!project || savingDefinition) return;
    const trimmed = definitionDraft.trim();
    if (trimmed === (project.definition_of_done || '')) {
      setIsEditingDefinition(false);
      return;
    }
    setSavingDefinition(true);
    try {
      await api.updateProject(projectId, { definition_of_done: trimmed || undefined });
      setProject((prev) =>
        prev ? { ...prev, definition_of_done: trimmed || undefined } : prev
      );
      toast.success(t.project.updateSuccess);
      setIsEditingDefinition(false);
    } catch (error) {
      console.error('更新项目完成标准失败:', error);
      toast.error(t.project.updateFailed);
    } finally {
      setSavingDefinition(false);
    }
  };

  // 聊天区域宽度初始化与窗口缩放自适应
  useEffect(() => {
    const updateWidthByContainer = () => {
      if (!containerRef.current || isChatCollapsed) return;
      const rect = containerRef.current.getBoundingClientRect();
      const totalWidth = rect.width;
      if (!totalWidth) return;

      const minWidth = totalWidth * 0.25;
      const maxWidth = totalWidth * 0.5;
      const defaultWidth = Math.min(400, totalWidth * 0.4);

      setChatWidth((prev) => {
        if (!prev) {
          return Math.min(maxWidth, Math.max(minWidth, defaultWidth));
        }
        return Math.min(maxWidth, Math.max(minWidth, prev));
      });
    };

    updateWidthByContainer();
    window.addEventListener('resize', updateWidthByContainer);
    return () => {
      window.removeEventListener('resize', updateWidthByContainer);
    };
  }, [isChatCollapsed]);

  // 分割线拖拽处理
  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isResizing || !containerRef.current || isChatCollapsed) return;

      const rect = containerRef.current.getBoundingClientRect();
      const totalWidth = rect.width;
      if (!totalWidth) return;

      const minWidth = totalWidth * 0.25;
      const maxWidth = totalWidth * 0.5;

      // 右侧区域宽度 = 容器右边界到当前鼠标位置的距离
      let newWidth = rect.right - event.clientX;
      newWidth = Math.min(maxWidth, Math.max(minWidth, newWidth));
      setChatWidth(newWidth);
    };

    const handleMouseUp = () => {
      if (isResizing) {
        setIsResizing(false);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, isChatCollapsed]);

  const handleResizeMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (isChatCollapsed) return;
    setIsResizing(true);
  };

  // 格式化日期时间
  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return t.projectDetail.justNow;
    if (diffMins < 60) return t.projectDetail.minutesAgo.replace('{count}', String(diffMins));
    if (diffHours < 24) return t.projectDetail.hoursAgo.replace('{count}', String(diffHours));
    if (diffDays < 7) return t.projectDetail.daysAgo.replace('{count}', String(diffDays));
    return date.toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US');
  };

  if (!project && !loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <p className="text-muted-foreground mb-4">{t.projectDetail.projectNotFound}</p>
        <Button onClick={() => router.push('/project-management')}>
          {t.projectDetail.backToList}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden relative" ref={containerRef}>
      {/* 左侧任务管理区域 - 占2/3或更宽 */}
      <div className="flex-1 flex flex-col overflow-hidden bg-background min-w-0">
        {/* 固定顶部区域 */}
        <div className="flex-shrink-0 p-6 pb-4 border-b">
          <div className="mx-auto max-w-7xl w-full">
            {/* 顶部导航 */}
            <div className="mb-6">
              {project && (
                <>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      {/* 返回按钮 */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push('/project-management')}
                        className="h-10 w-10 p-0"
                      >
                        <ArrowLeft className="h-5 w-5" />
                      </Button>
                      {/* 项目信息 */}
                      <div>
                        <h1 className="text-3xl font-bold text-foreground">
                          <EditableText
                            value={project.name}
                            onSave={handleUpdateProjectName}
                            inputClassName="text-3xl font-bold"
                          />
                        </h1>
                      </div>
                    </div>
                    {/* 视图选择 + 项目信息折叠按钮 */}
                    <div className="flex items-center gap-2">
                      {(project.description || project.definition_of_done) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-9 w-9 p-0 rounded-full"
                          onClick={() => setShowProjectInfo((prev) => !prev)}
                          title={
                            showProjectInfo
                              ? locale === 'zh'
                                ? '收起项目信息'
                                : 'Hide project info'
                              : locale === 'zh'
                                ? '展开项目信息'
                                : 'Show project info'
                          }
                        >
                          {showProjectInfo ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                      <ViewModeSelect value={viewMode} onChange={setViewMode} />
                    </div>
                  </div>

                  {showProjectInfo && (project.description || project.definition_of_done) && (
                    <div className="mt-4 rounded-md border bg-muted/10 px-4 py-3 text-sm space-y-4">
                      {/* 项目描述 */}
                      {project.description && (
                        <div className="space-y-1.5">
                          <div className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground">
                            {t.project.description}
                          </div>
                          {isEditingDescription ? (
                            <textarea
                              ref={descriptionEditRef}
                              value={descriptionDraft}
                              onChange={(e) => {
                                setDescriptionDraft(e.target.value);
                                autoResizeTextarea(e.target);
                              }}
                              onBlur={handleSaveDescription}
                              autoFocus
                              rows={3}
                              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none overflow-y-auto max-h-[40vh]"
                            />
                          ) : (
                            <p
                              className="cursor-text text-foreground leading-relaxed whitespace-pre-line"
                              onClick={() => {
                                setDescriptionDraft(project.description || '');
                                setIsEditingDescription(true);
                                // 下一帧调整高度
                                setTimeout(
                                  () => autoResizeTextarea(descriptionEditRef.current),
                                  0
                                );
                              }}
                            >
                              {project.description}
                            </p>
                          )}
                        </div>
                      )}
                      {/* 最终交付物 / 完成标准 */}
                      {project.definition_of_done && (
                        <div className="space-y-1.5">
                          <div className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground">
                            {t.project.definitionOfDone}
                          </div>
                          {isEditingDefinition ? (
                            <textarea
                              ref={definitionEditRef}
                              value={definitionDraft}
                              onChange={(e) => {
                                setDefinitionDraft(e.target.value);
                                autoResizeTextarea(e.target);
                              }}
                              onBlur={handleSaveDefinition}
                              autoFocus
                              rows={3}
                              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none overflow-y-auto max-h-[40vh]"
                            />
                          ) : (
                            <p
                              className="cursor-text text-foreground leading-relaxed whitespace-pre-line"
                              onClick={() => {
                                setDefinitionDraft(project.definition_of_done || '');
                                setIsEditingDefinition(true);
                                setTimeout(
                                  () => autoResizeTextarea(definitionEditRef.current),
                                  0
                                );
                              }}
                            >
                              {project.definition_of_done}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

          </div>
        </div>

        {/* 批量操作栏 - 当有任务被选中时显示 */}
        {selectedTasks.size > 0 && !loading && tasks.length > 0 && (
          <div className="flex-shrink-0 px-6 py-3 bg-primary/5 border-b border-primary/20">
            <div className="mx-auto max-w-7xl w-full flex items-center justify-between">
              <span className="text-sm text-foreground">
                {t.projectDetail.selectedTasks.replace('{count}', String(selectedTasks.size))}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearSelectedTasks}
                  className="text-muted-foreground"
                >
                  {t.common.clearAll}
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleBatchDeleteTasks}
                  className="gap-1.5"
                >
                  <Trash2 className="h-4 w-4" />
                  {t.projectDetail.batchDelete}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* 可滚动的任务视图区域 */}
        <div className="flex-1 overflow-hidden min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loading />
            </div>
          ) : tasks.length === 0 ? (
            // 创新的空状态设计
            <div className="h-full overflow-y-auto mx-auto max-w-7xl w-full p-6 pt-4">
              <TaskEmptyState
                onCreateTask={() => handleCreateTask()}
                onAIGenerate={handleAIGenerateTasks}
                isGenerating={isGeneratingTasks}
                hasProjectInfo={!!(project?.description || project?.definition_of_done)}
              />
            </div>
          ) : viewMode === 'dashboard' ? (
            // 仪表盘视图
            <div className="h-full overflow-y-auto">
              <TaskDashboardView tasks={tasks} />
            </div>
          ) : viewMode === 'list' ? (
            // 任务列表视图
            <div className="h-full mx-auto max-w-7xl w-full">
              <TaskListView
                tasks={tasks}
                onEdit={handleEditTask}
                onDelete={handleDeleteTask}
                onStatusChange={handleTaskStatusChange}
                projectId={projectId}
                selectedTaskIds={selectedTasks}
                onToggleSelect={handleToggleTaskSelect}
                onTaskUpdated={loadTasks}
              />
            </div>
          ) : (
            // 任务看板视图
            <div className="h-full overflow-y-auto mx-auto max-w-7xl w-full p-6 pt-4">
              <TaskBoard
                tasks={tasks}
                onEdit={handleEditTask}
                onDelete={handleDeleteTask}
                onStatusChange={handleTaskStatusChange}
                projectId={projectId}
                selectedTaskIds={selectedTasks}
                onToggleSelect={handleToggleTaskSelect}
                onTaskCreated={loadTasks}
              />
            </div>
          )}
        </div>

        {/* 创建/编辑任务模态框 */}
        <CreateTaskModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSuccess={handleModalSuccess}
          projectId={projectId}
          task={editingTask}
          parentTaskId={parentTaskId}
        />
      </div>

      {/* 中间可拖动分割线 */}
      <div
        className={`w-[3px] cursor-col-resize bg-border hover:bg-primary/60 transition-colors flex-shrink-0 ${
          isChatCollapsed ? 'pointer-events-none opacity-0' : 'opacity-100'
        }`}
        onMouseDown={handleResizeMouseDown}
      />

      {/* 右侧聊天区域 - 可调节宽度 */}
      <div
        className="bg-card flex flex-col flex-shrink-0 h-full border-l relative overflow-hidden"
        style={{
          width: isChatCollapsed ? '60px' : `${chatWidth}px`,
          transition: isResizing ? 'none' : 'width 300ms ease-in-out',
        }}
      >
        {/* 折叠状态：显示展开按钮 - 使用绝对定位防止布局挤压 */}
        <div className={`flex flex-col items-center w-[60px] transition-opacity duration-200 absolute z-10 ${
          isChatCollapsed ? 'opacity-100 delay-300' : 'opacity-0 pointer-events-none'
        }`}>
          <div className="flex items-center justify-center px-2 py-3 border-b border-border flex-shrink-0 w-full h-[60px]">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsChatCollapsed(false)}
                className="h-8 w-8 p-0 rounded-lg hover:bg-accent"
                title={t.eventsPage.expandAssistant}
              >
                <Bot className="h-4 w-4" />
              </Button>
            </div>
          </div>

        {/* 展开状态：显示完整聊天界面 */}
        <div className={`flex flex-1 flex-col h-full overflow-hidden transition-opacity duration-300 w-full min-w-[320px] ${
           isChatCollapsed ? 'opacity-0 pointer-events-none invisible' : 'opacity-100'
        }`}>
          {/* 顶部工具栏 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0 h-[60px] whitespace-nowrap">
            <div className="flex items-center gap-2">
              <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center">
                <Bot className="w-4 h-4" />
              </div>
              <h2 className="text-sm font-semibold text-foreground">{t.projectDetail.projectAssistant}</h2>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowHistory(!showHistory);
                  if (!showHistory) {
                    // 每次打开历史记录时都重新加载
                    loadChatHistory();
                  }
                }}
                className="h-8 w-8 p-0"
                title={t.eventsPage.history}
              >
                <History className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={createNewConversation}
                className="h-8 w-8 p-0"
                title={t.eventsPage.newChat}
              >
                <Plus className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsChatCollapsed(true)}
                className="h-8 w-8 p-0"
                title={t.eventsPage.collapseChat}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* 历史记录区域 */}
          {showHistory && (
            <div className="border-b border-border bg-muted/30 flex-shrink-0">
              <div className="px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase">{t.eventsPage.recentSessions}</h3>
                  {historyLoading && <span className="text-xs text-muted-foreground">{t.common.loading}</span>}
                </div>
                {sessionHistory.length === 0 && !historyLoading ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">{t.eventsPage.noHistory}</p>
                ) : (
                  <div className="space-y-2 max-h-[240px] overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                    {sessionHistory.map((session) => {
                      const timeAgo = formatDateTime(session.last_active);
                      // 使用 title，如果没有则显示会话ID的前8位
                      const displayTitle = session.title || t.projectDetail.sessionIdShort.replace('{id}', session.session_id.slice(0, 8));

                      return (
                        <button
                          key={session.session_id}
                          onClick={() => loadSession(session.session_id)}
                          className="w-full text-left p-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground truncate" title={displayTitle}>
                                {displayTitle}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {timeAgo}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {t.eventsPage.messagesCount.replace('{count}', String(session.message_count))}
                                </span>
                              </div>
                            </div>
                            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 消息列表 */}
          <div className="flex-1 overflow-y-auto min-h-0 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
            {messages.length === 0 ? (
              <div className="h-full flex items-center justify-center px-4">
                <div className="text-center space-y-6 max-w-md w-full">
                  {/* LLM 健康状态提醒 */}
                  {llmHealthChecked && !llmHealthy && (
                    <div className="rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 p-4 mb-4">
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 mt-0.5">
                          <svg className="w-5 h-5 text-orange-500" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <div className="flex-1 text-left">
                          <h3 className="text-sm font-semibold text-orange-800 dark:text-orange-300 mb-1">
                            {t.eventsPage.llmNotConfigured}
                          </h3>
                          <p className="text-xs text-orange-700 dark:text-orange-400 mb-2">
                            {t.eventsPage.llmConfigHint}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 欢迎标题 */}
                  <h1 className="text-2xl font-bold text-foreground my-8">
                    {t.projectDetail.projectAssistantServing}
                  </h1>

                  {/* 快捷选项 */}
                  <div className="grid grid-cols-1 gap-3">
                    <button
                      onClick={() => handleQuickAction('summary')}
                      className={`flex items-center gap-3 p-4 rounded-lg border transition-colors text-left group ${
                        activeQuickAction === 'summary'
                          ? 'border-primary bg-primary/10 hover:bg-primary/15'
                          : 'border-border bg-card hover:bg-muted/50'
                      }`}
                    >
                      <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
                        activeQuickAction === 'summary'
                          ? 'bg-primary/20'
                          : 'bg-primary/10 group-hover:bg-primary/20'
                      }`}>
                        <Activity className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{t.projectDetail.projectSummary}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{t.projectDetail.projectSummaryDesc}</p>
                      </div>
                    </button>

                    <button
                      onClick={() => handleQuickAction('next')}
                      className={`flex items-center gap-3 p-4 rounded-lg border transition-colors text-left group ${
                        activeQuickAction === 'next'
                          ? 'border-primary bg-primary/10 hover:bg-primary/15'
                          : 'border-border bg-card hover:bg-muted/50'
                      }`}
                    >
                      <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
                        activeQuickAction === 'next'
                          ? 'bg-primary/20'
                          : 'bg-primary/10 group-hover:bg-primary/20'
                      }`}>
                        <TrendingUp className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{t.projectDetail.nextStep}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{t.projectDetail.nextStepDesc}</p>
                      </div>
                    </button>

                    <button
                      onClick={() => handleQuickAction('help')}
                      className={`flex items-center gap-3 p-4 rounded-lg border transition-colors text-left group ${
                        activeQuickAction === 'help'
                          ? 'border-primary bg-primary/10 hover:bg-primary/15'
                          : 'border-border bg-card hover:bg-muted/50'
                      }`}
                    >
                      <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
                        activeQuickAction === 'help'
                          ? 'bg-primary/20'
                          : 'bg-primary/10 group-hover:bg-primary/20'
                      }`}>
                        <Search className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{t.projectDetail.bottleneckAnalysis}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{t.projectDetail.bottleneckAnalysisDesc}</p>
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="px-4 py-4 space-y-3 pr-2">
                {messages.map((message, index) => (
                  <div
                    key={index}
                    className={`flex gap-2 ${
                      message.role === 'user' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    {message.role === 'assistant' && (
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-md border border-border">
                        <Bot className="w-4 h-4 text-gray-700" />
                      </div>
                    )}

                    <div
                      className={`max-w-[80%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
                        message.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-foreground'
                      }`}
                    >
                      {message.role === 'assistant' ? (
                        message.content === t.eventsPage.thinkingDots ? (
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <span className="animate-pulse">{t.eventsPage.thinking}</span>
                            <span className="flex gap-0.5">
                              <span className="animate-bounce" style={{ animationDelay: '0ms' }}>.</span>
                              <span className="animate-bounce" style={{ animationDelay: '150ms' }}>.</span>
                              <span className="animate-bounce" style={{ animationDelay: '300ms' }}>.</span>
                            </span>
                          </span>
                        ) : (
                          <MessageContent
                            content={message.content}
                            isMarkdown={true}
                            isStreaming={index === messages.length - 1 && isStreaming}
                          />
                        )
                      ) : (
                        <MessageContent content={message.content} isMarkdown={false} />
                      )}
                    </div>

                    {message.role === 'user' && (
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-md border border-border">
                        <User className="w-4 h-4 text-gray-700" />
                      </div>
                    )}
                  </div>
                ))}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* 选中的任务上下文 */}
          {selectedTasksData.length > 0 && (
            <div className="border-t border-border px-4 py-3 flex-shrink-0 bg-muted/30">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground">
                  {t.projectDetail.selectedTasks.replace('{count}', String(selectedTasksData.length))}
                </span>
                <button
                  onClick={handleClearSelectedTasks}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t.eventsPage.clearEvents}
                </button>
              </div>
              <div className="space-y-1.5 max-h-24 overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                {selectedTasksData.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between rounded-md bg-primary/10 px-2 py-1.5 text-xs border border-primary/30 hover:border-primary/50 transition-colors"
                  >
                    <span className="truncate flex-1 text-primary font-medium">
                      {task.name}
                      <span className="ml-1 text-primary/70 font-normal">
                        ({task.status === 'pending' ? t.projectDetail.pending : task.status === 'in_progress' ? t.projectDetail.inProgress : task.status === 'completed' ? t.projectDetail.completed : t.task.cancelled})
                      </span>
                    </span>
                    <button
                      onClick={() => handleRemoveSelectedTask(task.id)}
                      className="ml-2 text-primary/70 hover:text-primary transition-colors p-0.5 rounded hover:bg-primary/20"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 输入框 */}
          <div className="flex gap-2 border-t border-border px-4 py-3 flex-shrink-0 bg-background">
            <Input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder={t.eventsPage.inputPlaceholder}
              className="flex-1"
              disabled={chatLoading || isStreaming}
            />
            <Button
              onClick={sendMessage}
              disabled={chatLoading || isStreaming || !inputMessage.trim()}
              size="sm"
              className="h-9 px-3"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
