'use client';

import { Task } from '@/lib/types';
import { Card, CardContent } from '@/components/common/Card';
import { useLocaleStore } from '@/lib/store/locale';
import { useTranslations } from '@/lib/i18n';
import { Circle, CircleDot, CheckCircle2, XCircle, TrendingUp, Clock, AlertCircle, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TaskDashboardViewProps {
  tasks: Task[];
  className?: string;
}

export default function TaskDashboardView({ tasks, className }: TaskDashboardViewProps) {
  const locale = useLocaleStore((state) => state.locale);
  const t = useTranslations(locale);

  // 统计数据
  const stats = {
    total: tasks.length,
    pending: tasks.filter((t) => t.status === 'pending').length,
    in_progress: tasks.filter((t) => t.status === 'in_progress').length,
    completed: tasks.filter((t) => t.status === 'completed').length,
    cancelled: tasks.filter((t) => t.status === 'cancelled').length,
  };

  const completionRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
  const activeRate = stats.total > 0 ? Math.round(((stats.in_progress + stats.completed) / stats.total) * 100) : 0;

  // 最近更新的任务
  const recentTasks = [...tasks]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 5);

  // 最近创建的任务
  const newTasks = [...tasks]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusConfig = (status: string) => {
    const configs = {
      pending: {
        label: t.task.pending,
        icon: Circle,
        color: 'text-muted-foreground',
        bgColor: 'bg-muted/30',
      },
      in_progress: {
        label: t.task.inProgress,
        icon: CircleDot,
        color: 'text-blue-600 dark:text-blue-400',
        bgColor: 'bg-blue-500/5',
      },
      completed: {
        label: t.task.completed,
        icon: CheckCircle2,
        color: 'text-green-600 dark:text-green-400',
        bgColor: 'bg-green-500/5',
      },
      cancelled: {
        label: t.task.cancelled,
        icon: XCircle,
        color: 'text-destructive',
        bgColor: 'bg-destructive/5',
      },
    };
    return configs[status as keyof typeof configs] || configs.pending;
  };

  return (
    <div className={cn('flex flex-col gap-6 p-6', className)}>
      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-foreground">{stats.total}</div>
            <p className="text-xs text-muted-foreground mt-1">{t.projectDetail.totalTasks}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
            <p className="text-xs text-muted-foreground mt-1">{t.projectDetail.pending}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-blue-600">{stats.in_progress}</div>
            <p className="text-xs text-muted-foreground mt-1">{t.projectDetail.inProgress}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
            <p className="text-xs text-muted-foreground mt-1">{t.projectDetail.completed}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-primary">{completionRate}%</div>
            <p className="text-xs text-muted-foreground mt-1">{t.projectDetail.completionRate}</p>
          </CardContent>
        </Card>
      </div>

      {/* 进度概览 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 任务进度图 */}
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              {t.projectDetail?.taskProgress || '任务进度'}
            </h3>
            <div className="space-y-3">
              {/* 完成率 */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted-foreground">{t.projectDetail.completionRate}</span>
                  <span className="font-medium text-foreground">{completionRate}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 transition-all"
                    style={{ width: `${completionRate}%` }}
                  />
                </div>
              </div>
              {/* 活跃率 */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted-foreground">{t.projectDetail?.activeRate || '活跃率'}</span>
                  <span className="font-medium text-foreground">{activeRate}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all"
                    style={{ width: `${activeRate}%` }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 状态分布 */}
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              {t.projectDetail?.statusDistribution || '状态分布'}
            </h3>
            <div className="space-y-2">
              {Object.entries(stats).map(([key, value]) => {
                if (key === 'total') return null;
                const config = getStatusConfig(key);
                const Icon = config.icon;
                const percentage = stats.total > 0 ? Math.round((value / stats.total) * 100) : 0;

                return (
                  <div key={key} className="flex items-center gap-3">
                    <Icon className={cn('h-4 w-4 flex-shrink-0', config.color)} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-foreground">{config.label}</span>
                        <span className="text-muted-foreground">{value} ({percentage}%)</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn('h-full transition-all', config.bgColor.replace('/5', ''))}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 最近活动 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 最近更新 */}
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <Clock className="h-4 w-4" />
              {t.projectDetail?.recentUpdates || '最近更新'}
            </h3>
            <div className="space-y-2">
              {recentTasks.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {t.projectDetail?.noRecentUpdates || '暂无最近更新'}
                </p>
              ) : (
                recentTasks.map((task) => {
                  const config = getStatusConfig(task.status);
                  const Icon = config.icon;
                  return (
                    <div
                      key={task.id}
                      className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <Icon className={cn('h-3.5 w-3.5 flex-shrink-0', config.color)} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{task.name}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(task.updated_at)}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>

        {/* 最近创建 */}
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <Plus className="h-4 w-4" />
              {t.projectDetail?.recentCreated || '最近创建'}
            </h3>
            <div className="space-y-2">
              {newTasks.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {t.projectDetail?.noRecentCreated || '暂无最近创建'}
                </p>
              ) : (
                newTasks.map((task) => {
                  const config = getStatusConfig(task.status);
                  const Icon = config.icon;
                  return (
                    <div
                      key={task.id}
                      className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <Icon className={cn('h-3.5 w-3.5 flex-shrink-0', config.color)} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{task.name}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(task.created_at)}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
