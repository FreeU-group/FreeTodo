'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Event, Screenshot, ChatMessage } from '@/lib/types';
import { api } from '@/lib/api';
import { useLocaleStore } from '@/lib/store/locale';
import { useTranslations } from '@/lib/i18n';

// 会话历史类型
interface SessionInfo {
  session_id: string;
  title?: string;
  chat_type?: string;
  created_at: string;
  last_active: string;
  message_count: number;
}
import { formatDateTime, formatDuration, calculateDuration } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/common/Card';
import { FormField } from '@/components/common/Input';
import Button from '@/components/common/Button';
import Input from '@/components/common/Input';
import Loading from '@/components/common/Loading';
import { ChevronDown, ChevronUp, Square, Check, Search, Send, Plus, User, Bot, X, Activity, ChevronRight, History } from 'lucide-react';
import ScreenshotModal from '@/components/screenshot/ScreenshotModal';
import { useSelectedEvents } from '@/lib/context/SelectedEventsContext';
import { marked } from 'marked';
import { toast } from '@/lib/toast';
import MessageContent from '@/components/common/MessageContent';

// 格式化日期为 YYYY-MM-DD（使用本地时区）
function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function EventsPage() {
  const { locale } = useLocaleStore();
  const t = useTranslations(locale);
  const [events, setEvents] = useState<Event[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [appName, setAppName] = useState('');
  const [keyword, setKeyword] = useState('');
  const [offset, setOffset] = useState(0);
  const [eventDetails, setEventDetails] = useState<{ [key: number]: any }>({});
  const [currentImages, setCurrentImages] = useState<{ [key: number]: number }>({});
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [selectedScreenshot, setSelectedScreenshot] = useState<Screenshot | null>(null);
  const { selectedEvents, setSelectedEvents, setSelectedEventsData, selectedEventsData } = useSelectedEvents();

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
  const [showHistory, setShowHistory] = useState(false);
  const [sessionHistory, setSessionHistory] = useState<SessionInfo[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const pageSize = 10; // 每次加载10条

  // 渲染Markdown为HTML
  const renderMarkdown = (text: string) => {
    try {
      return marked.parse(text, { async: false }) as string;
    } catch (error) {
      console.error('Markdown渲染失败:', error);
      return text;
    }
  };

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

  // 快捷选项处理
  const handleQuickAction = (action: string) => {
    let message = '';
    switch (action) {
      case 'timeline':
        message = t.eventsPage.todayActivity;
        break;
      case 'analytics':
        message = t.eventsPage.weekAnalytics;
        break;
      case 'search':
        message = t.eventsPage.searchContent;
        break;
    }
    setInputMessage(message);
    setActiveQuickAction(action);
  };

  // 发送消息（支持事件上下文和流式响应）
  const sendMessage = async () => {
    if (!inputMessage.trim()) return;

    // 检查 LLM 健康状态
    if (!llmHealthChecked) {
      await checkLlmHealth();
    }

    if (!llmHealthy) {
      toast.error(t.eventsPage.llmConfigHint);
      return;
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

    // 创建助手消息占位（显示 loading 提示）
    const assistantMessage: ChatMessage = {
      role: 'assistant',
      content: t.eventsPage.thinkingDots,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, assistantMessage]);

    try {
      // 如果有选中的事件，使用流式接口并附带上下文
      if (selectedEventsData.length > 0) {
        const eventContext = selectedEventsData.map((event) => ({
          event_id: event.id,
          text: event.ai_summary || '',
        }));

        // 累积内容
        let assistantContent = '';
        let isFirstChunk = true;

        // 使用流式接口
        await api.sendChatMessageWithContextStream(
          {
            message: currentInput,
            conversation_id: currentConversationId || undefined,
            event_context: eventContext,
          },
          (chunk: string) => {
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

            // 第一个 chunk 到达时，标记 loading 结束
            if (isFirstChunk) {
              setChatLoading(false);
              isFirstChunk = false;
            }
          },
          (sessionId: string) => {
            // 保存 session_id
            if (!currentConversationId) {
              setCurrentConversationId(sessionId);
              console.log('获取到新的 session_id:', sessionId);
            }
          }
        );
      } else {
        // 没有选中事件，使用流式接口
        let assistantContent = '';
        let isFirstChunk = true;

        // 使用流式接口
        await api.sendChatMessageStream(
          {
            message: currentInput,
            conversation_id: currentConversationId || undefined,
            use_rag: useRAG,
          },
          (chunk: string) => {
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

            // 第一个 chunk 到达时，标记 loading 结束
            if (isFirstChunk) {
              setChatLoading(false);
              isFirstChunk = false;
            }
          },
          (sessionId: string) => {
            // 保存 session_id
            if (!currentConversationId) {
              setCurrentConversationId(sessionId);
              console.log('获取到新的 session_id:', sessionId);
            }
          }
        );
      }
    } catch (error) {
      console.error('发送消息失败:', error);
      // 更新最后一条消息为错误信息
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

  // 新建会话
  const createNewConversation = () => {
    setCurrentConversationId(null);
    setMessages([]);
    setShowHistory(false); // 自动关闭历史面板
  };

  // 加载聊天历史（只加载事件助手类型的聊天记录，最多20条）
  const loadChatHistory = async () => {
    try {
      const response = await api.getChatHistory(undefined, 'event', 20);
      const sessions = (response.data.sessions || []) as SessionInfo[];

      // 后端已按最后活跃时间排序，直接使用
      setSessionHistory(sessions);
      console.log('已加载聊天历史:', sessions.length, '条');
    } catch (error) {
      console.error(t.eventsPage.loadHistoryFailed, error);
      toast.error(t.eventsPage.loadHistoryFailed);
    }
  };

  // 加载特定会话的历史消息
  const loadSessionMessages = async (sessionId: string) => {
    try {
      const response = await api.getChatHistory(sessionId);
      const history = (response.data.history || []) as Array<{
        role: 'user' | 'assistant';
        content: string;
        timestamp?: string;
      }>;

      // 将历史消息转换为 ChatMessage 格式
      const chatMessages: ChatMessage[] = history.map((msg) => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp || new Date().toISOString(),
      }));

      setMessages(chatMessages);
      setCurrentConversationId(sessionId);
      setShowHistory(false);
      toast.success(t.eventsPage.sessionLoaded);
    } catch (error) {
      console.error(t.eventsPage.loadSessionFailed, error);
      toast.error(t.eventsPage.loadSessionFailed);
    }
  };

  // 加载事件详情（包含截图）
  const loadEventDetail = useCallback(async (eventId: number) => {
    try {
      const response = await api.getEvent(eventId);
      setEventDetails((prev) => {
        // 如果已加载过，直接返回
        if (prev[eventId]) return prev;
        return {
          ...prev,
          [eventId]: response.data,
        };
      });
      setCurrentImages((prev) => ({
        ...prev,
        [eventId]: 0,
      }));
    } catch (error) {
      console.error(`加载事件 ${eventId} 详情失败:`, error);
    }
  }, []);

  // 加载事件列表（现在包含总数）
  const loadEvents = useCallback(async (reset = false) => {
    if (reset) {
      setLoading(true);
      setOffset(0);
      setEvents([]);
    } else {
      setLoadingMore(true);
    }

    try {
      const currentOffset = reset ? 0 : offset;
      let response;
      let newEvents: Event[] = [];
      let totalCount = 0;

      // 如果有关键词，使用事件搜索接口
      if (keyword.trim()) {
        const searchParams: any = {
          query: keyword.trim(),
          limit: 100, // 搜索接口不支持分页，一次返回较多结果
        };

        // 添加日期过滤条件
        if (startDate) searchParams.start_date = startDate + 'T00:00:00';
        if (endDate) searchParams.end_date = endDate + 'T23:59:59';
        if (appName) searchParams.app_name = appName;

        response = await api.eventSearch(searchParams);

        // eventSearch 返回的是事件数组
        const searchData = response.data || response;
        newEvents = Array.isArray(searchData) ? searchData : [];
        totalCount = newEvents.length; // 搜索接口不返回总数，使用实际返回的数量
      } else {
        // 没有关键词，使用普通的事件列表接口
        const params: any = {
          limit: pageSize,
          offset: currentOffset,
        };

        if (startDate) params.start_date = startDate + 'T00:00:00';
        if (endDate) params.end_date = endDate + 'T23:59:59';
        if (appName) params.app_name = appName;

        response = await api.getEvents(params);

        // 新的响应结构：{ events: Event[], total_count: number }
        const responseData = response.data || response;

        newEvents = responseData.events || responseData || [];
        totalCount = responseData.total_count ?? 0;
      }

      if (reset) {
        setEvents(newEvents);
        setTotalCount(totalCount);
        setOffset(pageSize);
        // 判断是否还有更多数据：关键词搜索时不支持分页
        setHasMore(keyword.trim() ? false : newEvents.length < totalCount);
      } else {
        setEvents((prev) => {
          // 使用 Map 去重，确保 event.id 唯一
          const eventMap = new Map(prev.map(e => [e.id, e]));
          newEvents.forEach((event: Event) => {
            eventMap.set(event.id, event);
          });
          const updatedEvents = Array.from(eventMap.values());

          // 判断是否还有更多数据：已加载数量 < 总数量
          setHasMore(updatedEvents.length < totalCount);
          return updatedEvents;
        });
        setOffset((prev) => prev + pageSize);
        // 加载更多时也更新总数（以防有变化）
        if (totalCount > 0) {
          setTotalCount(totalCount);
        }
      }

      // 为新加载的事件加载详情
      newEvents.forEach((event: Event) => {
        loadEventDetail(event.id);
      });
    } catch (error) {
      console.error('加载事件失败:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [offset, startDate, endDate, appName, keyword, loadEventDetail]);

  // 滚动到底部时加载更多（关键词搜索时不启用）
  useEffect(() => {
    const handleScroll = (e: UIEvent) => {
      if (loading || loadingMore || !hasMore || keyword.trim()) return;

      const target = e.currentTarget as HTMLElement;
      const scrollTop = target.scrollTop;
      const scrollHeight = target.scrollHeight;
      const clientHeight = target.clientHeight;

      // 距离底部100px时开始加载
      if (scrollTop + clientHeight >= scrollHeight - 100) {
        loadEvents(false);
      }
    };

    // 获取滚动容器（CardContent）
    const scrollContainer = document.querySelector('[data-scroll-container]');
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', handleScroll as EventListener);
      return () => scrollContainer.removeEventListener('scroll', handleScroll as EventListener);
    }
  }, [loading, loadingMore, hasMore, keyword, loadEvents]);

  // 切换事件的显示图片
  const navigateImage = (eventId: number, direction: 'prev' | 'next') => {
    const detail = eventDetails[eventId];
    if (!detail || !detail.screenshots) return;

    const currentIndex = currentImages[eventId] || 0;
    const totalImages = detail.screenshots.length;

    let newIndex;
    if (direction === 'prev') {
      newIndex = (currentIndex - 1 + totalImages) % totalImages;
    } else {
      newIndex = (currentIndex + 1) % totalImages;
    }

    setCurrentImages((prev) => ({
      ...prev,
      [eventId]: newIndex,
    }));
  };

  // 搜索事件
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadEvents(true);
  };

  // 切换事件选中状态（最多10个）
  const toggleEventSelection = (eventId: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const event = events.find(ev => ev.id === eventId);
    const newSet = new Set(selectedEvents);

    if (newSet.has(eventId)) {
      // 取消选中
      newSet.delete(eventId);
      setSelectedEventsData((prevData: Event[]) => prevData.filter(ev => ev.id !== eventId));
    } else {
      // 检查是否已达到上限
      if (newSet.size >= 10) {
        toast.eventLimitReached();
        return;
      }

      // 添加选中
      newSet.add(eventId);
      if (event) {
        setSelectedEventsData((prevData: Event[]) => [...prevData, event]);
      }
    }
    setSelectedEvents(newSet);
  };

  // 按日期分组事件，并按时间倒序排列（使用 useMemo 缓存结果）
  const { grouped, sortedDates } = useMemo(() => {
    if (events.length === 0) {
      return { grouped: {} as { [date: string]: Event[] }, sortedDates: [] as string[] };
    }

    // 先按开始时间倒序排列（最新的在上）
    const sortedEvents = [...events].sort((a, b) => {
      return new Date(b.start_time).getTime() - new Date(a.start_time).getTime();
    });

    // 按日期分组
    const grouped: { [date: string]: Event[] } = {};
    sortedEvents.forEach((event) => {
      const date = formatDateTime(event.start_time, 'YYYY-MM-DD');
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(event);
    });

    // 将日期按倒序排列（最新的日期在上）
    const sortedDates = Object.keys(grouped).sort((a, b) => {
      return new Date(b).getTime() - new Date(a).getTime();
    });

    return { grouped, sortedDates };
  }, [events]);

  // 切换日期组的展开/折叠状态
  const toggleDateGroup = (date: string) => {
    setExpandedDates((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(date)) {
        newSet.delete(date);
      } else {
        newSet.add(date);
      }
      return newSet;
    });
  };

  // 折叠/展开所有日期组
  const toggleAllDates = () => {
    if (events.length === 0) return;
    const allExpanded = sortedDates.every((date) => expandedDates.has(date));

    if (allExpanded) {
      // 如果全部展开，则折叠所有
      setExpandedDates(new Set());
    } else {
      // 如果有折叠的，则展开所有
      setExpandedDates(new Set(sortedDates));
    }
  };

  // 默认展开所有日期组（只在有新日期时更新）
  useEffect(() => {
    if (sortedDates.length > 0) {
      setExpandedDates((prev) => {
        // 检查是否有新日期
        const hasNewDate = sortedDates.some((date) => !prev.has(date));
        if (!hasNewDate) {
          // 如果没有新日期，直接返回原状态，避免不必要的更新
          return prev;
        }
        // 合并新的日期，保持已展开的状态
        const newSet = new Set(prev);
        sortedDates.forEach((date) => newSet.add(date));
        return newSet;
      });
    }
  }, [sortedDates]);

  // 监听消息变化，滚动到底部
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 初始化时检查 LLM 健康状态
  useEffect(() => {
    checkLlmHealth();
  }, []);

  // 初始化：设置默认日期并加载事件（只执行一次）
  useEffect(() => {
    // 设置默认日期（最近7天）
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(today.getDate() - 7);

    const todayStr = formatDate(today);
    const weekAgoStr = formatDate(weekAgo);

    setEndDate(todayStr);
    setStartDate(weekAgoStr);

    // 使用初始参数加载事件
    const loadInitialEvents = async () => {
      setLoading(true);
      try {
        const params: any = {
          limit: pageSize,
          offset: 0,
          start_date: weekAgoStr + 'T00:00:00',
          end_date: todayStr + 'T23:59:59',
        };

        const response = await api.getEvents(params);

        // 新的响应结构：{ events: Event[], total_count: number }
        const responseData = response.data || response;

        const newEvents = responseData.events || responseData || [];
        const totalCount = responseData.total_count ?? 0;

        setEvents(newEvents);
        setTotalCount(totalCount);
        setOffset(pageSize);
        // 判断是否还有更多数据：已加载数量 < 总数量
        setHasMore(newEvents.length < totalCount);

        // 为新加载的事件加载详情
        newEvents.forEach((event: Event) => {
          loadEventDetail(event.id);
        });
      } catch (error) {
        console.error('加载事件失败:', error);
        // 即使失败也尝试设置总数，避免显示 0
        if (error instanceof Error) {
          console.error('错误详情:', error.message);
        }
      } finally {
        setLoading(false);
      }
    };

    loadInitialEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 只在组件挂载时执行一次

  return (
    <div className="flex h-full overflow-hidden relative">
      {/* 左侧事件管理区域 - 占2/3或更宽 */}
      <div className={`flex flex-col overflow-hidden p-4 border-r transition-all duration-300 ${
        isChatCollapsed ? 'flex-1' : 'w-2/3'
      }`}>
        {/* 选中事件提示 */}
        {selectedEvents.size > 0 && (
          <div className={`mb-4 flex items-center justify-between rounded-lg px-4 py-3 border ${
            selectedEvents.size >= 10
              ? 'bg-destructive/10 border-destructive/30'
              : 'bg-primary/10 border-primary/20'
          }`}>
            <div className="flex items-center gap-2">
              <Check className={`h-5 w-5 ${selectedEvents.size >= 10 ? 'text-destructive' : 'text-primary'}`} />
              <span className={`font-medium ${selectedEvents.size >= 10 ? 'text-destructive' : 'text-primary'}`}>
                {t.eventsPage.selectLimit.replace('{count}', String(selectedEvents.size))}
                {selectedEvents.size >= 10 && <span className="ml-2">{t.eventsPage.limitReached}</span>}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedEvents(new Set());
                setSelectedEventsData([]);
              }}
            >
              {t.eventsPage.clearSelection}
            </Button>
          </div>
        )}

      {/* 搜索表单 - 固定区域 */}
      <Card className="mb-4 flex-shrink-0">
        <CardContent className="p-4">
          <form onSubmit={handleSearch} className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1 grid grid-cols-1 gap-4 sm:grid-cols-4">
              <FormField
                label={t.searchBar.startDate}
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
              <FormField
                label={t.searchBar.endDate}
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
              <FormField
                label={t.searchBar.appName}
                placeholder={t.searchBar.appPlaceholder}
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
              />
              <FormField
                label={t.searchBar.keyword}
                placeholder={t.searchBar.keywordPlaceholder}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </div>
            <Button type="submit" className="sm:w-24 w-full flex items-center justify-center gap-2">
              <Search className="h-4 w-4" />
              <span className="hidden sm:inline">{t.common.search}</span>
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* 时间轴区域 - 可滚动区域 */}
      <Card className="flex-1 overflow-hidden flex flex-col">
        <CardHeader className="flex-shrink-0 pb-4">
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="text-lg">{t.eventsPage.eventTimeline}</CardTitle>
            {!loading && (
              <div className="text-sm text-muted-foreground">
                {t.eventsPage.found} {totalCount} {t.eventsPage.events}{events.length < totalCount && `（${t.eventsPage.loaded} ${events.length} ${locale === 'zh' ? '个' : ''}）`}
              </div>
            )}
          </div>
        </CardHeader>
        {/* 分割线 - 贯穿两侧 */}
        <div className="border-t border-border" />
        <CardContent className="flex-1 overflow-y-auto pt-4" data-scroll-container>
          {loading ? (
            <Loading text={t.eventsPage.loadingEvents} />
          ) : events.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground font-medium">
              <p>{t.eventsPage.noEventsFound}</p>
              <p className="mt-2 text-sm">{t.eventsPage.adjustSearch}</p>
            </div>
          ) : (
              <div className="space-y-6">
                {sortedDates.map((date) => {
                  const dateEvents = grouped[date];
                  const isExpanded = expandedDates.has(date);
                  const eventCount = dateEvents.length;

                  return (
                    <div key={date} className="space-y-4">
                      {/* 日期组头部 */}
                      <button
                        onClick={() => toggleDateGroup(date)}
                        className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                          <div className="text-left">
                            <div className="text-sm font-medium text-foreground">
                              {formatDateTime(date + 'T00:00:00', t.eventsPage.dateFormat)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {t.eventsPage.eventsInDay.replace('{count}', String(eventCount))}
                            </div>
                          </div>
                        </div>
                      </button>

                      {/* 日期组内容 */}
                      {isExpanded && (
                        <div className="relative pl-6 space-y-4">
                          {/* 时间轴线 */}
                          <div className="absolute left-0 top-0 bottom-0 w-px bg-border" />

                          {/* 该日期的事件列表 */}
                          {dateEvents.map((event) => {
                            const detail = eventDetails[event.id];
                            const screenshots = detail?.screenshots || [];
                            const duration = event.end_time
                              ? calculateDuration(event.start_time, event.end_time)
                              : null;

                            // 合并所有 OCR 结果
                            const allOcrText = screenshots
                              .map((s: Screenshot) => s.ocr_result?.text_content)
                              .filter(Boolean)
                              .join('\n\n');

                            const isSelected = selectedEvents.has(event.id);

                            return (
                              <div key={event.id} className="relative">
                                {/* 事件卡片 - shadcn 简约风格 */}
                                <Card
                                  className={`ml-0 border-border hover:border-primary/50 transition-colors p-4 cursor-pointer relative group ${
                                    isSelected ? 'border-primary bg-primary/5' : ''
                                  }`}
                                  onClick={() => toggleEventSelection(event.id)}
                                >
                                  {/* 左下角单选按钮 - 默认隐藏，hover时显示 */}
                                  <button
                                    onClick={(e) => toggleEventSelection(event.id, e)}
                                    className={`absolute left-2 bottom-2 z-10 rounded p-0.5 transition-all ${
                                      isSelected
                                        ? 'opacity-100'
                                        : 'opacity-0 group-hover:opacity-100'
                                    } hover:bg-muted`}
                                    aria-label={isSelected ? t.eventsPage.unselect : t.eventsPage.select}
                                  >
                                    {isSelected ? (
                                      <Check className="h-5 w-5 text-primary" />
                                    ) : (
                                      <Square className="h-5 w-5 text-primary/60 transition-colors" />
                                    )}
                                  </button>

                                  <div className="flex gap-4">
                                    {/* 左侧：标题和内容 */}
                                    <div className="flex-1 min-w-0 space-y-2">
                                      {/* 标题和应用标签 */}
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <h3 className="text-base font-semibold text-foreground">
                                          {event.window_title || t.eventsPage.unknownWindow}
                                        </h3>
                                        <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                                          {event.app_name}
                                        </span>
                                      </div>

                                      {/* 时间信息 */}
                                      <div className="text-sm text-muted-foreground">
                                        {formatDateTime(event.start_time, 'MM/DD HH:mm')}
                                        {event.end_time && (
                                          <>
                                            {' - '}
                                            {formatDateTime(event.end_time, 'MM/DD HH:mm')}
                                          </>
                                        )}
                                        {duration !== null ? (
                                          <span> ({t.eventsPage.duration} {formatDuration(duration, t.time)})</span>
                                        ) : (
                                          <span className="text-green-600 dark:text-green-400"> ({t.eventsPage.inProgress})</span>
                                        )}
                                      </div>

                                      {/* AI摘要或简要描述 - 支持Markdown */}
                                      <div
                                        className="text-sm text-foreground/80 leading-relaxed markdown-content"
                                        dangerouslySetInnerHTML={{
                                          __html: renderMarkdown(
                                            event.ai_summary ||
                                            (allOcrText?.slice(0, 100) + (allOcrText?.length > 100 ? '...' : '')) ||
                                            t.eventsPage.noDescription
                                          )
                                        }}
                                      />
                                    </div>

                                    {/* 右侧：截图预览 - 堆叠布局 */}
                                    {screenshots.length > 0 && (
                                      <div className="flex-shrink-0 flex justify-end">
                                        <div className="relative" style={{ width: `${Math.min(screenshots.length, 10) * 20 + 128}px`, height: '128px' }}>
                                          {screenshots.slice(0, 10).map((screenshot: Screenshot, index: number) => {
                                            const offset = index * 20;
                                            const zIndex = 10 - index; // 固定范围：10到1
                                            const isLast = index === screenshots.length - 1 || index === 9;

                                            return (
                                              <div
                                                key={`${event.id}-${screenshot.id}`}
                                                className="absolute cursor-pointer transition-all duration-200 hover:scale-105 hover:z-50"
                                                style={{
                                                  left: `${offset}px`,
                                                  top: '0px',
                                                  zIndex: zIndex,
                                                }}
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setSelectedScreenshot(screenshot);
                                                }}
                                              >
                                                <div className="relative rounded-md overflow-hidden border border-border bg-muted w-32 h-32 shadow-sm">
                                                  <img
                                                    src={api.getScreenshotImage(screenshot.id)}
                                                    alt={t.screenshot.screenshotNumber.replace('{number}', String(index + 1))}
                                                    className="w-full h-full object-cover"
                                                    loading="lazy"
                                                  />
                                                  {isLast && screenshots.length > 10 && (
                                                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                                      <span className="text-white font-semibold text-xs">
                                                        +{screenshots.length - 10}
                                                      </span>
                                                    </div>
                                                  )}
                                                </div>
                                              </div>
                                            );
                                          })}
                                          {/* 总数显示在右下角 */}
                                          <div className="absolute bottom-0 right-0 rounded-md bg-black/70 px-2 py-1 text-xs font-semibold text-white z-[60] pointer-events-none">
                                            {t.eventsPage.screenshots.replace('{count}', String(screenshots.length))}
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </Card>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
          )}

          {/* 滚动加载更多指示器 */}
          {!loading && hasMore && (
            <div className="mt-6 flex justify-center">
              {loadingMore ? (
                <div className="text-sm text-muted-foreground">{t.eventsPage.loadingMore}</div>
              ) : (
                <div className="text-sm text-muted-foreground">{t.eventsPage.scrollToLoad}</div>
              )}
            </div>
          )}
          {!loading && !hasMore && events.length > 0 && (
            <div className="mt-6 text-center text-sm text-muted-foreground">
              {t.eventsPage.allEventsLoaded}
            </div>
          )}
        </CardContent>
      </Card>

        {/* 截图查看模态框 */}
        {selectedScreenshot && (() => {
          // 找到选中截图所属的事件
          const eventWithScreenshot = events.find((event) => {
            const detail = eventDetails[event.id];
            const screenshots = detail?.screenshots || [];
            return screenshots.some((s: Screenshot) => s.id === selectedScreenshot.id);
          });

          if (eventWithScreenshot) {
            const detail = eventDetails[eventWithScreenshot.id];
            const screenshots = detail?.screenshots || [];
            return (
              <ScreenshotModal
                screenshot={selectedScreenshot}
                screenshots={screenshots}
                onClose={() => setSelectedScreenshot(null)}
              />
            );
          }

          return (
            <ScreenshotModal
              screenshot={selectedScreenshot}
              onClose={() => setSelectedScreenshot(null)}
            />
          );
        })()}
      </div>

      {/* 右侧聊天区域 - 占1/3或窄列 */}
      <div className={`bg-card flex flex-col flex-shrink-0 h-full overflow-hidden transition-all duration-300 ${
        isChatCollapsed ? 'w-16' : 'w-1/3'
      }`}>
        {/* 折叠状态：显示展开按钮 */}
        {isChatCollapsed && (
          <div className="flex flex-col items-center h-full">
            {/* 与展开状态工具栏同高度的区域 */}
            <div className="flex items-center justify-center px-2 py-3 border-b border-border flex-shrink-0 w-full">
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
        )}

        {/* 展开状态：显示完整聊天界面 */}
        <div className={`flex flex-1 flex-col h-full overflow-hidden ${isChatCollapsed ? 'hidden' : ''}`}>
          {/* 顶部工具栏 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center">
                <Bot className="w-4 h-4" />
              </div>
              <h2 className="text-sm font-semibold text-foreground">{t.eventsPage.chatAssistant}</h2>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (!showHistory) {
                    // 每次打开历史记录时都重新加载
                    loadChatHistory();
                  }
                  setShowHistory(!showHistory);
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
                </div>
                {sessionHistory.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">{t.eventsPage.noHistory}</p>
                ) : (
                  <div className="space-y-2 max-h-[180px] overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                    {sessionHistory.map((session) => {
                      const timeAgo = formatDateTime(session.last_active);
                      const displayTitle = session.title || t.eventsPage.sessionIdShort.replace('{id}', session.session_id.slice(0, 8));

                      return (
                        <button
                          key={session.session_id}
                          onClick={() => loadSessionMessages(session.session_id)}
                          className="w-full text-left p-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground truncate" title={displayTitle}>
                                {displayTitle}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs text-muted-foreground">
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
                    {t.eventsPage.howCanIHelp}
                  </h1>

                  {/* 快捷选项 */}
                  <div className="grid grid-cols-1 gap-3">
                    {/* 数字镜像 */}
                    <button
                      onClick={() => handleQuickAction('timeline')}
                      className={`flex items-center gap-3 p-4 rounded-lg border transition-colors text-left group ${
                        activeQuickAction === 'timeline'
                          ? 'border-primary bg-primary/10 hover:bg-primary/15'
                          : 'border-border bg-card hover:bg-muted/50'
                      }`}
                    >
                      <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
                        activeQuickAction === 'timeline'
                          ? 'bg-primary/20'
                          : 'bg-primary/10 group-hover:bg-primary/20'
                      }`}>
                        <Activity className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{t.eventsPage.digitalMirror}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{t.eventsPage.digitalMirrorDesc}</p>
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

                      {message.sources && message.sources.length > 0 && (
                        <div className="mt-2 border-t border-border/50 pt-2">
                          <p className="font-medium text-xs text-muted-foreground mb-1.5">{t.eventsPage.relatedScreenshots}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {message.sources.slice(0, 2).map((source, i: number) => (
                              <span
                                key={i}
                                className="inline-flex items-center rounded-md bg-background/80 px-2 py-0.5 text-[10px] font-medium text-foreground border border-border/50"
                              >
                                {(source as { app_name?: string }).app_name || t.eventsPage.unknownApp}
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

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* 选中的事件上下文 */}
          {selectedEventsData.length > 0 && (
            <div className="border-t border-border px-4 py-3 flex-shrink-0 bg-muted/30">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground">
                  {t.eventsPage.selectedEvents.replace('{count}', String(selectedEventsData.length))}
                </span>
                <button
                  onClick={() => {
                    setSelectedEvents(new Set());
                    setSelectedEventsData([]);
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t.eventsPage.clearEvents}
                </button>
              </div>
              <div className="space-y-1.5 max-h-24 overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                {selectedEventsData.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center justify-between rounded-md bg-background px-2 py-1.5 text-xs border-2 border-primary/50 hover:border-primary transition-colors shadow-sm"
                  >
                    <span className="truncate flex-1 text-primary font-semibold">
                      {event.window_title || t.eventsPage.unknownWindow} - {event.app_name}
                      <span className="ml-1 text-primary/60">
                        ({t.eventsPage.screenshots.replace('{count}', String(event.screenshot_count || 0))})
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
              placeholder={t.eventsPage.inputPlaceholder}
              className="flex-1"
              disabled={chatLoading}
            />
            <Button
              onClick={sendMessage}
              disabled={chatLoading || !inputMessage.trim()}
              size="sm"
              className="h-9 px-3"
              aria-label={t.eventsPage.send}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
