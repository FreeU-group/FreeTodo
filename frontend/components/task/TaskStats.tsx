'use client';

import { Task } from '@/lib/types';
import { Circle, CircleDot, CheckCircle2, XCircle, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TaskStatsProps {
  tasks: Task[];
  className?: string;
}

export default function TaskStats({ tasks, className }: TaskStatsProps) {
  // 统计各种状态的任务数量
  const stats = {
    total: tasks.length,
    pending: tasks.filter((t) => t.status === 'pending').length,
    in_progress: tasks.filter((t) => t.status === 'in_progress').length,
    completed: tasks.filter((t) => t.status === 'completed').length,
    cancelled: tasks.filter((t) => t.status === 'cancelled').length,
  };

  // 计算完成率
  const completionRate = stats.total > 0
    ? Math.round((stats.completed / stats.total) * 100)
    : 0;

  const statItems = [
    {
      label: '待办',
      value: stats.pending,
      icon: Circle,
      color: 'text-gray-600 dark:text-gray-400',
      bgColor: 'bg-gray-100 dark:bg-gray-800/50',
      borderColor: 'border-gray-300 dark:border-gray-700',
    },
    {
      label: '进行中',
      value: stats.in_progress,
      icon: CircleDot,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-950/30',
      borderColor: 'border-blue-300 dark:border-blue-800',
    },
    {
      label: '已完成',
      value: stats.completed,
      icon: CheckCircle2,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-50 dark:bg-green-950/30',
      borderColor: 'border-green-300 dark:border-green-800',
    },
    {
      label: '已取消',
      value: stats.cancelled,
      icon: XCircle,
      color: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-50 dark:bg-red-950/30',
      borderColor: 'border-red-300 dark:border-red-800',
    },
  ];

  return (
    <div className={cn('rounded-lg border border-border bg-card p-4', className)}>
      <div className="flex items-center gap-4">
        {/* 总任务数和完成率 */}
        <div className="flex items-center gap-3">
          <div>
            <p className="text-xs text-muted-foreground">总计</p>
            <p className="text-xl font-bold text-foreground">{stats.total}</p>
          </div>
          <div className="h-8 w-px bg-border" />
          <div className="flex items-center gap-2">
            <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
            <div className={cn(
              'px-2.5 py-1 rounded-md text-sm font-bold',
              completionRate >= 80 ? 'bg-green-100 dark:bg-green-950/30 text-green-600 dark:text-green-400' :
              completionRate >= 50 ? 'bg-blue-100 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400' :
              completionRate >= 20 ? 'bg-orange-100 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400' :
              'bg-gray-100 dark:bg-gray-800/50 text-gray-600 dark:text-gray-400'
            )}>
              {completionRate}%
            </div>
          </div>
        </div>

        {/* 进度条 */}
        <div className="flex-1 min-w-0">
          <div className="h-2 bg-muted rounded-full overflow-hidden flex">
            {stats.completed > 0 && (
              <div
                className="bg-green-500 transition-all duration-500"
                style={{ width: `${(stats.completed / stats.total) * 100}%` }}
              />
            )}
            {stats.in_progress > 0 && (
              <div
                className="bg-blue-500 transition-all duration-500"
                style={{ width: `${(stats.in_progress / stats.total) * 100}%` }}
              />
            )}
            {stats.pending > 0 && (
              <div
                className="bg-gray-400 transition-all duration-500"
                style={{ width: `${(stats.pending / stats.total) * 100}%` }}
              />
            )}
          </div>
        </div>

        {/* 状态统计 - 紧凑横向排列 */}
        <div className="flex items-center gap-3">
          {statItems.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                className="flex items-center gap-1.5"
              >
                <Icon className={cn('h-4 w-4', item.color)} />
                <div className="flex items-baseline gap-1">
                  <span className={cn('text-sm font-bold', item.color)}>{item.value}</span>
                  <span className="text-xs text-muted-foreground">{item.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
