'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Calendar, Target, User } from 'lucide-react';
import Button from '@/components/common/Button';
import Loading from '@/components/common/Loading';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/common/Card';
import ContextList from '@/components/context/ContextList';
import { Task, Project, Context } from '@/lib/types';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';

dayjs.locale('zh-cn');

export default function TaskDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = parseInt((params?.id as string) || '0');
  const taskId = parseInt((params?.taskId as string) || '0');

  const [task, setTask] = useState<Task | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [contexts, setContexts] = useState<Context[]>([]);
  const [unassociatedContexts, setUnassociatedContexts] = useState<Context[]>([]);
  const [loading, setLoading] = useState(true);
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

  // 初始加载
  useEffect(() => {
    if (projectId && taskId) {
      setLoading(true);
      Promise.all([
        loadProject(),
        loadTask(),
        loadAssociatedContexts(),
        loadUnassociatedContexts(),
      ]).finally(() => {
        setLoading(false);
      });
    }
  }, [projectId, taskId]);

  // 处理关联上下文
  const handleAssociateContext = async (contextId: number) => {
    try {
      await api.updateContext(contextId, { task_id: taskId });
      toast.success('上下文已关联到任务');
      // 刷新列表
      loadAssociatedContexts();
      loadUnassociatedContexts();
    } catch (error) {
      console.error('关联上下文失败:', error);
      toast.error('关联上下文失败');
    }
  };

  // 处理取消关联上下文
  const handleUnassociateContext = async (contextId: number) => {
    try {
      await api.updateContext(contextId, { task_id: null });
      toast.success('已取消关联');
      // 刷新列表
      loadAssociatedContexts();
      loadUnassociatedContexts();
    } catch (error) {
      console.error('取消关联失败:', error);
      toast.error('取消关联失败');
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    try {
      return dayjs(dateString).format('YYYY年MM月DD日 HH:mm');
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
        <p className="text-muted-foreground mb-4">任务不存在</p>
        <Button onClick={() => router.push(`/project-management/${projectId}`)}>
          返回项目详情
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
            返回项目详情
          </Button>

          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground">{task.name}</h1>
              {project && (
                <p className="mt-2 text-sm text-muted-foreground">
                  项目：{project.name}
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
              任务信息
            </button>
            <button
              onClick={() => setActiveTab('contexts')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'contexts'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              关联上下文
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
          // 任务信息
          <Card>
            <CardHeader>
              <CardTitle>任务详情</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {task.description && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">描述</label>
                  <p className="mt-1 text-foreground">{task.description}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">状态</label>
                  <p className="mt-1 text-foreground">
                    {task.status === 'pending' && '待办'}
                    {task.status === 'in_progress' && '进行中'}
                    {task.status === 'completed' && '已完成'}
                    {task.status === 'cancelled' && '已取消'}
                  </p>
                </div>

                <div>
                  <label className="text-sm font-medium text-muted-foreground">创建时间</label>
                  <p className="mt-1 text-foreground">{formatDate(task.created_at)}</p>
                </div>

                <div>
                  <label className="text-sm font-medium text-muted-foreground">更新时间</label>
                  <p className="mt-1 text-foreground">{formatDate(task.updated_at)}</p>
                </div>

                <div>
                  <label className="text-sm font-medium text-muted-foreground">关联上下文数</label>
                  <p className="mt-1 text-foreground">{contexts.length} 个</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          // 关联上下文
          <div className="space-y-6">
            {/* 已关联的上下文 */}
            <Card>
              <CardHeader>
                <CardTitle>已关联的上下文 ({contexts.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {contexts.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    暂无关联的上下文
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
                <CardTitle>可关联的上下文 ({unassociatedContexts.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {unassociatedContexts.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    暂无可关联的上下文
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
