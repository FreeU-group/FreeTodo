'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Plus, FolderOpen, MessageSquare, ChevronRight, History, Send, User, Bot, X, Activity, TrendingUp, Search, Clock } from 'lucide-react';
import Button from '@/components/common/Button';
import Loading from '@/components/common/Loading';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/common/Card';
import TaskList from '@/components/task/TaskList';
import CreateTaskModal from '@/components/task/CreateTaskModal';
import TaskStats from '@/components/task/TaskStats';
import TaskEmptyState, { TaskTemplate } from '@/components/task/TaskEmptyState';
import { Project, Task, ChatMessage, SessionSummary } from '@/lib/types';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import Input from '@/components/common/Input';
import MessageContent from '@/components/common/MessageContent';
import { useSelectedEvents } from '@/lib/context/SelectedEventsContext';

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = parseInt((params?.id as string) || '0');

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | undefined>(undefined);
  const [parentTaskId, setParentTaskId] = useState<number | undefined>(undefined);

  // 使用上下文管理选中的任务
  const { selectedTasks, setSelectedTasks, selectedTasksData, setSelectedTasksData } = useSelectedEvents();

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
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  // 加载聊天历史记录（只加载 project 类型）
  const loadChatHistory = async () => {
    setHistoryLoading(true);
    try {
      const response = await api.getChatHistory(undefined, 'project', 3);
      const sessions = response.data.sessions || [];
      const sortedSessions = sessions
        .sort((a: SessionSummary, b: SessionSummary) =>
          new Date(b.last_active).getTime() - new Date(a.last_active).getTime()
        );
      setSessionHistory(sortedSessions);
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

      const loadedMessages: ChatMessage[] = history.map((item: any) => ({
        role: item.role,
        content: item.content,
        timestamp: item.timestamp,
      }));

      setMessages(loadedMessages);
      setCurrentConversationId(sessionId);
      setShowHistory(false);
      toast.success('会话已加载');
    } catch (error) {
      console.error('加载会话失败:', error);
      toast.error('加载会话失败');
    } finally {
      setChatLoading(false);
    }
  };

  // 快捷选项处理
  const handleQuickAction = (action: string) => {
    let message = '';
    switch (action) {
      case 'summary':
        message = '总结一下这个项目的当前进展';
        break;
      case 'next':
        message = '接下来我应该做什么任务？';
        break;
      case 'help':
        message = '帮我分析一下项目中的瓶颈';
        break;
    }
    setInputMessage(message);
    setActiveQuickAction(action);
  };

  // 发送消息（支持流式响应）
  const sendMessage = async () => {
    if (!inputMessage.trim()) return;

    if (!llmHealthChecked) {
      await checkLlmHealth();
    }

    if (!llmHealthy) {
      toast.error('LLM 服务未配置或不可用，请前往设置页面配置 API Key');
      return;
    }

    let sessionId = currentConversationId;
    if (!sessionId) {
      try {
        const response = await api.createNewChat('project', projectId);
        sessionId = response.data.session_id;
        setCurrentConversationId(sessionId);
      } catch (error) {
        console.error('创建会话失败:', error);
        toast.error('创建会话失败');
        return;
      }
    }

    const userMessage: ChatMessage = {
      role: 'user',
      content: inputMessage,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const currentInput = inputMessage;
    setInputMessage('');
    setChatLoading(true);
    setIsStreaming(true);

    const assistantMessage: ChatMessage = {
      role: 'assistant',
      content: '正在思考...',
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, assistantMessage]);

    let assistantContent = '';

    try {
      let isFirstChunk = true;

      await api.sendChatMessageStream(
        {
          message: currentInput,
          conversation_id: sessionId || undefined,
          use_rag: useRAG,
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
    } catch (error) {
      console.error('发送消息失败:', error);
      setMessages((prev) => {
        const newMessages = [...prev];
        newMessages[newMessages.length - 1] = {
          ...newMessages[newMessages.length - 1],
          content: '抱歉，发送消息失败，请重试。',
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
      toast.success('新会话已创建');
    } catch (error) {
      console.error('创建新会话失败:', error);
      setCurrentConversationId(null);
      setMessages([]);
    }
  };

  // 加载项目信息
  const loadProject = async () => {
    try {
      const response = await api.getProject(projectId);
      setProject(response.data);
    } catch (error) {
      console.error('加载项目信息失败:', error);
      toast.error('加载项目信息失败');
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
      toast.error('加载任务列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 监听消息变化，滚动到底部
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 初始化时检查 LLM 健康状态
  useEffect(() => {
    checkLlmHealth();
  }, []);

  // 初始加载
  useEffect(() => {
    if (projectId) {
      loadProject();
      loadTasks();
    }
  }, [projectId]);

  // 处理创建任务
  const handleCreateTask = (parentId?: number) => {
    setEditingTask(undefined);
    setParentTaskId(parentId);
    setIsModalOpen(true);
  };

  // 处理快速创建任务（使用模板）
  const handleQuickCreateTask = async (template: TaskTemplate) => {
    try {
      await api.createTask(projectId, {
        name: template.name,
        description: template.description,
        status: 'pending',
      });
      toast.success('任务创建成功');
      loadTasks();
    } catch (error) {
      console.error('创建任务失败:', error);
      toast.error('创建任务失败');
    }
  };

  // 处理编辑任务
  const handleEditTask = (task: Task) => {
    setEditingTask(task);
    setParentTaskId(undefined);
    setIsModalOpen(true);
  };

  // 处理删除任务
  const handleDeleteTask = async (taskId: number) => {
    if (!confirm('确定要删除这个任务吗？此操作将同时删除所有子任务且不可恢复。')) {
      return;
    }

    try {
      await api.deleteTask(projectId, taskId);
      toast.success('任务删除成功');
      loadTasks();
    } catch (error) {
      console.error('删除任务失败:', error);
      toast.error('删除任务失败');
    }
  };

  // 处理任务状态变更
  const handleTaskStatusChange = async (taskId: number, newStatus: string) => {
    try {
      await api.updateTask(projectId, taskId, { status: newStatus });
      toast.success('任务状态已更新');
      loadTasks();
    } catch (error) {
      console.error('更新任务状态失败:', error);
      toast.error('更新任务状态失败');
    }
  };

  // 模态框成功回调
  const handleModalSuccess = () => {
    loadTasks();
  };

  // 处理任务选择
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

    setSelectedTasksData((prev) => {
      if (selected) {
        return [...prev, task];
      } else {
        return prev.filter((t) => t.id !== task.id);
      }
    });
  };

  // 移除选中的任务
  const handleRemoveSelectedTask = (taskId: number) => {
    setSelectedTasks((prev) => {
      const newSet = new Set(prev);
      newSet.delete(taskId);
      return newSet;
    });

    setSelectedTasksData((prev) => prev.filter((t) => t.id !== taskId));
  };

  // 清空选中的任务
  const handleClearSelectedTasks = () => {
    setSelectedTasks(new Set());
    setSelectedTasksData([]);
  };

  if (!project && !loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <p className="text-muted-foreground mb-4">项目不存在</p>
        <Button onClick={() => router.push('/project-management')}>
          返回项目列表
        </Button>
      </div>
    );
  }

  const formatDateTime = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  return (
    <div className="flex h-full overflow-hidden relative">
      {/* 左侧任务管理区域 - 占2/3或全屏 */}
      <div className={`flex flex-col overflow-hidden border-r transition-all duration-300 ${
        isChatCollapsed ? 'w-full' : 'w-2/3'
      }`}>
        {/* 固定顶部区域 */}
        <div className="flex-shrink-0 p-6 pb-4 border-b">
          <div className="mx-auto max-w-7xl w-full">
            {/* 顶部导航 */}
            <div className="mb-6">
              <Button
                variant="ghost"
                onClick={() => router.push('/project-management')}
                className="gap-2 mb-4"
              >
                <ArrowLeft className="h-4 w-4" />
                返回项目列表
              </Button>

              {project && (
                <div className="flex items-start justify-between">
                  <div>
                    <h1 className="text-3xl font-bold text-foreground">{project.name}</h1>
                    {project.goal && (
                      <p className="mt-2 text-muted-foreground">{project.goal}</p>
                    )}
                  </div>
                  <Button onClick={() => handleCreateTask()} className="gap-2">
                    <Plus className="h-5 w-5" />
                    创建任务
                  </Button>
                </div>
              )}
            </div>

            {/* 任务统计面板 */}
            {!loading && tasks.length > 0 && (
              <TaskStats tasks={tasks} />
            )}
          </div>
        </div>

        {/* 可滚动的任务列表区域 */}
        <div className="flex-1 overflow-y-auto min-h-0 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
          <div className="mx-auto max-w-7xl w-full p-6 pt-4">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loading />
              </div>
            ) : tasks.length === 0 ? (
              // 创新的空状态设计
              <TaskEmptyState
                onCreateTask={() => handleCreateTask()}
                onQuickCreate={handleQuickCreateTask}
              />
            ) : (
              // 任务列表
              <TaskList
                tasks={tasks}
                onEdit={handleEditTask}
                onDelete={handleDeleteTask}
                onStatusChange={handleTaskStatusChange}
                onCreateSubtask={handleCreateTask}
                projectId={projectId}
                selectedTaskIds={selectedTasks}
                onToggleSelect={handleToggleTaskSelect}
              />
            )}
          </div>
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

      {/* 折叠状态：右下角悬浮按钮 */}
      {isChatCollapsed && (
        <Button
          variant="primary"
          size="sm"
          onClick={() => setIsChatCollapsed(false)}
          className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full p-0 shadow-lg hover:shadow-xl transition-all duration-300"
          title="展开对话"
        >
          <MessageSquare className="h-6 w-6" />
        </Button>
      )}

      {/* 右侧聊天区域 - 占1/3或收起 */}
      <div className={`bg-card flex flex-col flex-shrink-0 h-full overflow-hidden transition-all duration-300 ${
        isChatCollapsed ? 'w-0' : 'w-1/3'
      }`}>
        <div className={`flex flex-1 flex-col h-full overflow-hidden ${isChatCollapsed ? 'hidden' : ''}`}>
          {/* 顶部工具栏 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsChatCollapsed(true)}
                className="h-8 w-8 p-0"
                title="收起对话"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <h2 className="text-sm font-semibold text-foreground">项目助手</h2>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowHistory(!showHistory);
                  if (!showHistory && sessionHistory.length === 0) {
                    loadChatHistory();
                  }
                }}
                className="h-8 w-8 p-0"
                title="历史记录"
              >
                <History className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={createNewConversation}
                className="h-8 w-8 p-0"
                title="新建对话"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* 历史记录区域 */}
          {showHistory && (
            <div className="border-b border-border bg-muted/30 flex-shrink-0">
              <div className="px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase">最近会话</h3>
                  {historyLoading && <span className="text-xs text-muted-foreground">加载中...</span>}
                </div>
                {sessionHistory.length === 0 && !historyLoading ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">暂无历史记录</p>
                ) : (
                  <div className="space-y-2">
                    {sessionHistory.map((session) => {
                      const timeAgo = formatDateTime(session.last_active);
                      // 使用 title，如果没有则显示会话ID的前8位
                      const displayTitle = session.title || `会话 ${session.session_id.slice(0, 8)}`;

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
                                  {session.message_count} 条消息
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
                            LLM 服务未配置
                          </h3>
                          <p className="text-xs text-orange-700 dark:text-orange-400 mb-2">
                            聊天功能需要配置 API Key 才能使用。请点击右上角设置按钮进行配置。
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 欢迎标题 */}
                  <h1 className="text-2xl font-bold text-foreground my-8">
                    项目助手为您服务
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
                        <p className="text-sm font-medium text-foreground">项目进展</p>
                        <p className="text-xs text-muted-foreground mt-0.5">总结项目当前进展</p>
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
                        <p className="text-sm font-medium text-foreground">下一步</p>
                        <p className="text-xs text-muted-foreground mt-0.5">建议下一步要做的任务</p>
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
                        <p className="text-sm font-medium text-foreground">瓶颈分析</p>
                        <p className="text-xs text-muted-foreground mt-0.5">分析项目中的瓶颈</p>
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
                        message.content === '正在思考...' ? (
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <span className="animate-pulse">正在思考</span>
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
                  已选择 {selectedTasksData.length} 个任务
                </span>
                <button
                  onClick={handleClearSelectedTasks}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  清除
                </button>
              </div>
              <div className="space-y-1.5 max-h-24 overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                {selectedTasksData.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between rounded-md bg-background px-2 py-1.5 text-xs border-2 border-primary/50 hover:border-primary transition-colors shadow-sm"
                  >
                    <span className="truncate flex-1 text-primary font-semibold">
                      {task.name}
                      <span className="ml-1 text-primary/60">
                        ({task.status === 'pending' ? '待办' : task.status === 'in_progress' ? '进行中' : task.status === 'completed' ? '已完成' : '已取消'})
                      </span>
                    </span>
                    <button
                      onClick={() => handleRemoveSelectedTask(task.id)}
                      className="ml-2 text-primary/60 hover:text-destructive transition-colors p-0.5 rounded hover:bg-destructive/10"
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
              placeholder="输入消息..."
              className="flex-1"
              disabled={chatLoading}
            />
            <Button
              onClick={sendMessage}
              disabled={chatLoading || !inputMessage.trim()}
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
