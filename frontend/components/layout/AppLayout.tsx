'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Calendar, BarChart2, FileText, Activity, TrendingUp, Search, FolderKanban } from 'lucide-react';
import { marked } from 'marked';
import { Send, Trash2, Plus, User, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ChatMessage, Conversation } from '@/lib/types';
import { api, API_BASE_URL } from '@/lib/api';
import Button from '@/components/common/Button';
import Input from '@/components/common/Input';
import Loading from '@/components/common/Loading';
import dynamic from 'next/dynamic';
import { SelectedEventsProvider, useSelectedEvents } from '@/lib/context/SelectedEventsContext';
import { X } from 'lucide-react';
import { Sidebar, SidebarContent, SidebarNav } from '@/components/ui/sidebar-nav';
import type { SidebarNavItem } from '@/components/ui/sidebar-nav';

// 动态导入页面组件以避免 SSR 问题
const EventsPage = dynamic(() => import('@/app/events/page'), { ssr: false });
const AnalyticsPage = dynamic(() => import('@/app/analytics/page'), { ssr: false });
const PlanPage = dynamic(() => import('@/app/plan/page'), { ssr: false });
const ProjectManagementPage = dynamic(() => import('@/app/project-management/page'), { ssr: false });

type MenuType = 'events' | 'analytics' | 'plan' | 'project-management';

// 菜单项配置（包含路由路径）
const menuItems: (SidebarNavItem & { path: string })[] = [
  { id: 'events', label: '事件管理', icon: Calendar, path: '/events' },
  { id: 'analytics', label: '行为分析', icon: BarChart2, path: '/analytics' },
  { id: 'plan', label: '工作计划', icon: FileText, path: '/plan' },
  { id: 'project-management', label: '项目管理', icon: FolderKanban, path: '/project-management' },
];

interface AppLayoutInnerProps {
  children?: React.ReactNode;
}

function AppLayoutInner({ children }: AppLayoutInnerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [activeMenu, setActiveMenu] = useState<MenuType>('events');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [useRAG, setUseRAG] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { selectedEventsData, setSelectedEvents, setSelectedEventsData, selectedEvents } = useSelectedEvents();

  // 滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // 加载会话列表（暂时禁用，因为后端不支持会话列表功能）
  const loadConversations = async () => {
    try {
      // TODO: 后端需要实现 /api/conversations 接口
      // const response = await api.getConversations();
      // setConversations(response.data);
      console.log('会话列表功能暂未实现');
    } catch (error) {
      console.error('加载会话列表失败:', error);
    }
  };

  // 快捷选项处理
  const handleQuickAction = (action: string) => {
    let message = '';
    switch (action) {
      case 'timeline':
        message = '我今天做了什么？';
        break;
      case 'analytics':
        message = '分析过去的一周我的应用使用情况';
        break;
      case 'search':
        message = '搜索包含特定内容的截图';
        break;
    }
    setInputMessage(message);
    // 自动聚焦到输入框
    setTimeout(() => {
      const input = document.querySelector('input[type="text"]') as HTMLInputElement;
      input?.focus();
    }, 100);
  };

  // 发送消息（支持事件上下文和流式响应）
  const sendMessage = async () => {
    if (!inputMessage.trim()) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: inputMessage,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const currentInput = inputMessage;
    setInputMessage('');
    setLoading(true);

    try {
      // 调试日志
      console.log('[AppLayout] 发送消息，选中的事件数量:', selectedEventsData.length);
      console.log('[AppLayout] 选中的事件数据:', selectedEventsData);

      // 如果有选中的事件，使用流式接口并附带上下文
      if (selectedEventsData.length > 0) {
        const eventContext = selectedEventsData.map((event) => ({
          event_id: event.id,
          text: event.ai_summary || event.summary || '',
        }));

        console.log('[AppLayout] 构建的事件上下文:', eventContext);

        // 使用流式接口
        const response = await fetch(`${API_BASE_URL}/api/chat/stream-with-context`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: currentInput,
            event_context: eventContext,
          }),
        });

        if (!response.ok) {
          throw new Error('请求失败');
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let assistantContent = '';

        // 创建助手消息占位
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: '',
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMessage]);

        // 读取流式响应
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            assistantContent += chunk;

            // 更新消息内容
            setMessages((prev) => {
              const newMessages = [...prev];
              newMessages[newMessages.length - 1] = {
                ...newMessages[newMessages.length - 1],
                content: assistantContent,
              };
              return newMessages;
            });
          }
        }
      } else {
        // 没有选中事件，使用普通接口
        const response = await api.sendChatMessage({
          message: currentInput,
          conversation_id: currentConversationId || undefined,
          use_rag: useRAG,
        });

        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: response.data.response || response.data.message,
          timestamp: new Date().toISOString(),
          sources: response.data.sources,
        };

        setMessages((prev) => [...prev, assistantMessage]);

        if (response.data.conversation_id) {
          setCurrentConversationId(response.data.conversation_id);
        }

        loadConversations();
      }
    } catch (error) {
      console.error('发送消息失败:', error);
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: '抱歉，发送消息失败，请重试。',
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  // 新建会话
  const createNewConversation = () => {
    setCurrentConversationId(null);
    setMessages([]);
  };

  // 删除会话（暂时禁用，因为后端不支持会话列表功能）
  const deleteConversation = async (id: string) => {
    try {
      // TODO: 后端需要实现 DELETE /api/conversations/:id 接口
      // await api.deleteConversation(id);
      console.log('删除会话功能暂未实现:', id);
      if (currentConversationId === id) {
        createNewConversation();
      }
      loadConversations();
    } catch (error) {
      console.error('删除会话失败:', error);
    }
  };

  // 加载会话消息
  const loadConversation = (conversation: Conversation) => {
    setCurrentConversationId(conversation.id);
    setMessages(conversation.messages || []);
  };

  // 根据当前路径设置激活的菜单项
  useEffect(() => {
    const currentMenuItem = menuItems.find(item => pathname.startsWith(item.path));
    if (currentMenuItem) {
      setActiveMenu(currentMenuItem.id as MenuType);
    }
  }, [pathname]);

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 处理菜单项点击 - 使用路由导航
  const handleMenuClick = (itemId: string) => {
    const menuItem = menuItems.find(item => item.id === itemId);
    if (menuItem) {
      router.push(menuItem.path);
    }
  };

  // 渲染中间内容
  const renderContent = () => {
    // 如果传入了 children，优先渲染 children（用于动态路由页面）
    if (children) {
      return children;
    }
    
    // 否则使用菜单切换逻辑
    switch (activeMenu) {
      case 'events':
        return <EventsPage />;
      case 'analytics':
        return <AnalyticsPage />;
      case 'plan':
        return <PlanPage />;
      case 'project-management':
        return <ProjectManagementPage />;
      default:
        return <EventsPage />;
    }
  };

  return (
    <div className="flex flex-1 overflow-hidden h-full">
      {/* 左侧菜单 - 使用 shadcn 风格组件 */}
      <Sidebar className="w-56 flex-shrink-0 h-full">
        <SidebarContent>
          <SidebarNav
            items={menuItems}
            activeItem={activeMenu}
            onItemClick={handleMenuClick}
          />
        </SidebarContent>
      </Sidebar>

      {/* 中间内容区 */}
      <div className="flex-1 overflow-y-auto h-full">
        {renderContent()}
      </div>

      {/* 右侧对话窗口 - 占1/3，固定高度，不随中间内容滚动 */}
      <div className="w-1/3 border-l bg-card flex flex-col flex-shrink-0 h-full overflow-hidden">
        <div className="flex flex-1 flex-col h-full overflow-hidden">
          {/* 顶部工具栏 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
            <h2 className="text-sm font-semibold text-foreground">Chat</h2>
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

          {/* 会话列表功能暂时禁用 */}
          {/* {conversations.length > 0 && (
            <div className="px-4 py-2 border-b border-border max-h-28 overflow-y-auto flex-shrink-0 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
              <div className="space-y-1">
                {conversations.slice(0, 3).map((conv) => (
                  <div
                    key={conv.id}
                    className="group flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted/50 text-sm transition-colors"
                  >
                    <button
                      className="flex-1 truncate text-left text-xs font-medium text-foreground"
                      onClick={() => loadConversation(conv)}
                    >
                      {conv.title || '新会话'}
                    </button>
                    <button
                      className="opacity-0 transition-opacity group-hover:opacity-100 p-1 hover:bg-muted rounded"
                      onClick={() => deleteConversation(conv.id)}
                    >
                      <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )} */}

          {/* 消息列表 - 滚动条靠边 */}
          <div className="flex-1 overflow-y-auto min-h-0 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
            {messages.length === 0 ? (
              <div className="h-full flex items-center justify-center px-4">
                <div className="text-center space-y-6 max-w-md w-full">
                    {/* 欢迎标题 */}
                    <h1 className="text-2xl font-bold text-foreground my-8">
                      我可以帮您做什么？
                    </h1>

                    {/* 快捷选项 */}
                    <div className="grid grid-cols-1 gap-3">
                      {/* 数字镜像 */}
                      <button
                        onClick={() => handleQuickAction('timeline')}
                        className="flex items-center gap-3 p-4 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors text-left group"
                      >
                        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                          <Activity className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">数字镜像</p>
                          <p className="text-xs text-muted-foreground mt-0.5">查看今天的活动时间线</p>
                        </div>
                      </button>

                      {/* 应用分析 */}
                      <button
                        onClick={() => handleQuickAction('analytics')}
                        className="flex items-center gap-3 p-4 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors text-left group"
                      >
                        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                          <TrendingUp className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">应用分析</p>
                          <p className="text-xs text-muted-foreground mt-0.5">分析应用使用情况和趋势</p>
                        </div>
                      </button>

                      {/* 内容搜索 */}
                      <button
                        onClick={() => handleQuickAction('search')}
                        className="flex items-center gap-3 p-4 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors text-left group"
                      >
                        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                          <Search className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">内容搜索</p>
                          <p className="text-xs text-muted-foreground mt-0.5">搜索包含特定内容的截图</p>
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
                    {/* 机器人头像 - 靠左 */}
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
                        <div
                          className="prose prose-sm max-w-none text-sm prose-p:my-1.5 prose-p:leading-relaxed prose-ul:my-1.5 prose-ol:my-1.5"
                          dangerouslySetInnerHTML={{
                            __html: marked(message.content),
                          }}
                        />
                      ) : (
                        <p className="whitespace-pre-wrap text-sm">{message.content}</p>
                      )}

                      {message.sources && message.sources.length > 0 && (
                        <div className="mt-2 border-t border-border/50 pt-2">
                          <p className="font-medium text-xs text-muted-foreground mb-1.5">相关截图:</p>
                          <div className="flex flex-wrap gap-1.5">
                            {message.sources.slice(0, 2).map((source, i: number) => (
                              <span
                                key={i}
                                className="inline-flex items-center rounded-md bg-background/80 px-2 py-0.5 text-[10px] font-medium text-foreground border border-border/50"
                              >
                                {(source as { app_name?: string }).app_name || '未知应用'}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 用户头像 - 靠右 */}
                    {message.role === 'user' && (
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-md border border-border">
                        <User className="w-4 h-4 text-gray-700" />
                      </div>
                    )}
                  </div>
                ))}

                {loading && <Loading text="正在思考..." size="sm" />}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* 选中的事件上下文 */}
          {selectedEventsData.length > 0 && (
            <div className="border-t border-border px-4 py-3 flex-shrink-0 bg-muted/30">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground">
                  已选择 {selectedEventsData.length} 个事件
                </span>
                <button
                  onClick={() => {
                    setSelectedEvents(new Set());
                    setSelectedEventsData([]);
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  清除
                </button>
              </div>
              <div className="space-y-1.5 max-h-24 overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                {selectedEventsData.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center justify-between rounded-md bg-background px-2 py-1.5 text-xs border-2 border-primary/50 hover:border-primary transition-colors shadow-sm"
                  >
                    <span className="truncate flex-1 text-primary font-semibold">
                      {event.window_title || '未知窗口'} - {event.app_name}
                      <span className="ml-1 text-primary/60">
                        ({event.screenshot_count || 0}张)
                      </span>
                    </span>
                    <button
                      onClick={() => {
                        const newSet = new Set(selectedEvents);
                        newSet.delete(event.id);
                        setSelectedEvents(newSet);
                        setSelectedEventsData(selectedEventsData.filter(e => e.id !== event.id));
                      }}
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
              disabled={loading}
            />
            <Button
              onClick={sendMessage}
              disabled={loading || !inputMessage.trim()}
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

interface AppLayoutProps {
  children?: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  return (
    <SelectedEventsProvider>
      <AppLayoutInner>{children}</AppLayoutInner>
    </SelectedEventsProvider>
  );
}
