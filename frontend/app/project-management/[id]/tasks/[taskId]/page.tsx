'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, RefreshCw, TrendingUp } from 'lucide-react';
import Button from '@/components/common/Button';
import Loading from '@/components/common/Loading';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/common/Card';
import ContextList from '@/components/context/ContextList';
import { Task, Project, Context, TaskProgress } from '@/lib/types';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { useLocaleStore } from '@/lib/store/locale';
import { useTranslations } from '@/lib/i18n';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

dayjs.locale('zh-cn');

export default function TaskDetailPage() {
  const params = useParams();
  const router = useRouter();
  const locale = useLocaleStore((state) => state.locale);
  const t = useTranslations(locale);
  const projectId = parseInt((params?.id as string) || '0');
  const taskId = parseInt((params?.taskId as string) || '0');

  const [task, setTask] = useState<Task | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [contexts, setContexts] = useState<Context[]>([]);
  const [unassociatedContexts, setUnassociatedContexts] = useState<Context[]>([]);
  const [latestProgress, setLatestProgress] = useState<TaskProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'contexts'>('info');

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

  // 加载任务信息
  const loadTask = async () => {
    try {
      const response = await api.getTask(projectId, taskId);
      setTask(response.data);
    } catch (error) {
      console.error('加载任务信息失败:', error);
      toast.error('加载任务信息失败');
    }
  };

  // 加载已关联的上下文
  const loadAssociatedContexts = async () => {
    try {
      const response = await api.getContexts({
        task_id: taskId,
        limit: 100,
      });
      setContexts(response.data.contexts || []);
    } catch (error) {
      console.error('加载关联上下文失败:', error);
    }
  };

  // 加载未关联的上下文
  const loadUnassociatedContexts = async () => {
    try {
      const response = await api.getContexts({
        associated: false,
        limit: 100,
      });
      setUnassociatedContexts(response.data.contexts || []);
    } catch (error) {
      console.error('加载未关联上下文失败:', error);
    }
  };

  // 加载最新任务进展
  const loadTaskProgress = async () => {
    try {
      const response = await api.getTaskProgressLatest(projectId, taskId);
      setLatestProgress(response.data);
    } catch (error) {
      console.debug('加载任务进展失败:', error);
      setLatestProgress(null);
    }
  };

  // 手动生成任务进展摘要
  const handleGenerateProgress = async () => {
    setIsGenerating(true);
    try {
      await api.generateTaskSummary(projectId, taskId);
      toast.success(t.taskDetail.progressGenerated);
      // 重新加载进展列表
      await loadTaskProgress();
    } catch (error) {
      const errorMsg = (error as { response?: { data?: { detail?: string } } }).response?.data?.detail || t.taskDetail.progressGenerateFailed;
      toast.error(errorMsg);
    } finally {
      setIsGenerating(false);
    }
  };

  // 初始加载
  useEffect(() => {
    if (projectId && taskId) {
      setLoading(true);
      Promise.all([
        loadProject(),
        loadTask(),
        loadAssociatedContexts(),
        loadUnassociatedContexts(),
        loadTaskProgress(),
      ]).finally(() => {
        setLoading(false);
      });
    }
  }, [projectId, taskId]);

  // 处理关联上下文
  const handleAssociateContext = async (contextId: number) => {
    try {
      await api.updateContext(contextId, { task_id: taskId });
      toast.success(t.taskDetail.contextAssociated);
      // 刷新列表
      loadAssociatedContexts();
      loadUnassociatedContexts();
    } catch (error) {
      console.error('关联上下文失败:', error);
      toast.error(t.taskDetail.contextAssociateFailed);
    }
  };

  // 处理取消关联上下文
  const handleUnassociateContext = async (contextId: number) => {
    try {
      await api.updateContext(contextId, { task_id: null });
      toast.success(t.taskDetail.contextUnassociated);
      // 刷新列表
      loadAssociatedContexts();
      loadUnassociatedContexts();
    } catch (error) {
      console.error('取消关联失败:', error);
      toast.error(t.taskDetail.contextUnassociateFailed);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    try {
      const format = locale === 'zh' ? 'YYYY年MM月DD日 HH:mm' : 'YYYY-MM-DD HH:mm';
      return dayjs(dateString).format(format);
    } catch {
      return dateString;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loading />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <p className="text-muted-foreground mb-4">{t.taskDetail.taskNotFound}</p>
        <Button onClick={() => router.push(`/project-management/${projectId}`)}>
          {t.taskDetail.backToProject}
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mx-auto max-w-7xl">
        {/* 顶部导航 */}
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => router.push(`/project-management/${projectId}`)}
            className="gap-2 mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            {t.taskDetail.backToProject}
          </Button>

          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground">{task.name}</h1>
              {project && (
                <p className="mt-2 text-sm text-muted-foreground">
                  {t.taskDetail.project}: {project.name}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* 标签页 */}
        <div className="border-b border-border mb-6">
          <div className="flex gap-4">
            <button
              onClick={() => setActiveTab('info')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'info'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.taskDetail.taskInfo}
            </button>
            <button
              onClick={() => setActiveTab('contexts')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'contexts'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.taskDetail.associatedContexts}
              {contexts.length > 0 && (
                <span className="ml-2 inline-flex items-center justify-center px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary rounded-full">
                  {contexts.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* 内容区域 */}
        {activeTab === 'info' ? (
          <div className="space-y-6">
            {/* 任务进展 */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  <CardTitle>{t.taskDetail.taskProgress}</CardTitle>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateProgress}
                  disabled={isGenerating}
                  className="gap-2"
                >
                  <RefreshCw className={`h-4 w-4 ${isGenerating ? 'animate-spin' : ''}`} />
                  {t.taskDetail.manualUpdate}
                </Button>
              </CardHeader>
              <CardContent>
                {!latestProgress ? (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground mb-4">{t.taskDetail.noProgress}</p>
                    <Button
                      variant="outline"
                      onClick={handleGenerateProgress}
                      disabled={isGenerating}
                      className="gap-2"
                    >
                      <RefreshCw className={`h-4 w-4 ${isGenerating ? 'animate-spin' : ''}`} />
                      {t.taskDetail.generateFirstProgress}
                    </Button>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-3 text-xs text-muted-foreground">
                      <span>{t.taskDetail.updatedAt} {formatDate(latestProgress.generated_at)}</span>
                      <span>{t.taskDetail.basedOnContexts.replace('{count}', latestProgress.context_count.toString())}</span>
                    </div>
                    <div className="prose prose-sm max-w-none dark:prose-invert">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {latestProgress.summary}
                      </ReactMarkdown>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 任务信息 */}
            <Card>
              <CardHeader>
                <CardTitle>{t.taskDetail.taskDetails}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {task.description && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">{t.task.description}</label>
                    <p className="mt-1 text-foreground">{task.description}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">{t.task.status}</label>
                    <p className="mt-1 text-foreground">
                      {task.status === 'pending' && t.task.pending}
                      {task.status === 'in_progress' && t.task.inProgress}
                      {task.status === 'completed' && t.task.completed}
                      {task.status === 'cancelled' && t.task.cancelled}
                    </p>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-muted-foreground">{t.taskDetail.createdAt}</label>
                    <p className="mt-1 text-foreground">{formatDate(task.created_at)}</p>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-muted-foreground">{t.taskDetail.updatedAt2}</label>
                    <p className="mt-1 text-foreground">{formatDate(task.updated_at)}</p>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-muted-foreground">{t.taskDetail.contextCount}</label>
                    <p className="mt-1 text-foreground">{contexts.length} {t.taskDetail.countUnit}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          // 关联上下文
          <div className="space-y-6">
            {/* 已关联的上下文 */}
            <Card>
              <CardHeader>
                <CardTitle>{t.taskDetail.linkedContexts} ({contexts.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {contexts.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    {t.taskDetail.noLinkedContexts}
                  </p>
                ) : (
                  <ContextList
                    contexts={contexts}
                    onUnassociate={handleUnassociateContext}
                  />
                )}
              </CardContent>
            </Card>

            {/* 未关联的上下文 */}
            <Card>
              <CardHeader>
                <CardTitle>{t.taskDetail.availableContexts} ({unassociatedContexts.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {unassociatedContexts.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    {t.taskDetail.noAvailableContexts}
                  </p>
                ) : (
                  <ContextList
                    contexts={unassociatedContexts}
                    onAssociate={handleAssociateContext}
                  />
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
