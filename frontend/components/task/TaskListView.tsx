'use client';

import { useState } from 'react';
import { Task } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  Circle,
  CircleDot,
  CheckCircle2,
  XCircle,
  Edit2,
  Trash2,
  Square,
  Check,
  ChevronRight,
  Plus,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocaleStore } from '@/lib/store/locale';
import { useTranslations } from '@/lib/i18n';
import EditableText from '@/components/common/EditableText';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';

interface TaskListViewProps {
  tasks: Task[];
  onEdit: (task: Task) => void;
  onDelete: (taskId: number) => void;
  onStatusChange: (taskId: number, newStatus: string) => void;
  projectId?: number;
  selectedTaskIds?: Set<number>;
  onToggleSelect?: (task: Task, selected: boolean) => void;
  className?: string;
  onTaskUpdated?: () => void;
}

const getStatusConfig = (status: string, t: ReturnType<typeof useTranslations>) => {
  const configs = {
    pending: {
      label: t.task.pending,
      icon: Circle,
      color: 'text-muted-foreground',
      bgColor: 'bg-muted/30',
      borderColor: 'border-muted-foreground/20',
    },
    in_progress: {
      label: t.task.inProgress,
      icon: CircleDot,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-500/5',
      borderColor: 'border-blue-500/20',
    },
    completed: {
      label: t.task.completed,
      icon: CheckCircle2,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-500/5',
      borderColor: 'border-green-500/20',
    },
    cancelled: {
      label: t.task.cancelled,
      icon: XCircle,
      color: 'text-destructive',
      bgColor: 'bg-destructive/5',
      borderColor: 'border-destructive/20',
    },
  };
  return configs[status as keyof typeof configs] || configs.pending;
};

export default function TaskListView({
  tasks,
  onEdit,
  onDelete,
  onStatusChange,
  projectId,
  selectedTaskIds,
  onToggleSelect,
  className,
  onTaskUpdated,
}: TaskListViewProps) {
  const router = useRouter();
  const locale = useLocaleStore((state) => state.locale);
  const t = useTranslations(locale);

  const [isAddingTask, setIsAddingTask] = useState(false);
  const [taskName, setTaskName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // 点击任务行跳转到详情
  const handleTaskClick = (task: Task) => {
    if (projectId) {
      router.push(`/project-management/${projectId}/tasks/${task.id}`);
    }
  };

  // 切换选中状态
  const handleToggleSelect = (e: React.MouseEvent, task: Task) => {
    e.stopPropagation();
    const isSelected = selectedTaskIds?.has(task.id);
    onToggleSelect?.(task, !isSelected);
  };

  // 更新任务名称
  const handleUpdateTaskName = async (taskId: number, newName: string) => {
    if (!projectId) return;
    try {
      await api.updateTask(projectId, taskId, { name: newName });
      toast.success(t.task?.updateSuccess || '任务更新成功');
      // 触发父组件刷新任务列表
      onTaskUpdated?.();
    } catch (error) {
      console.error('更新任务名称失败:', error);
      toast.error(t.task?.updateFailed || '更新任务失败');
      throw error;
    }
  };

  // 格式化日期
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  const handleCreateTask = async () => {
    if (!projectId || !taskName.trim()) return;

    setIsCreating(true);
    try {
      await api.createTask(projectId, {
        name: taskName.trim(),
        status: 'pending',
        description: '',
      });
      toast.success(t.task.createSuccess);
      setTaskName('');
      setIsAddingTask(false);
      onTaskUpdated?.();
    } catch (error) {
      console.error('创建任务失败:', error);
      toast.error(t.task.createFailed);
    } finally {
      setIsCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleCreateTask();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsAddingTask(false);
      setTaskName('');
    }
  };

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* 表格头部 */}
      <div className="flex-shrink-0 bg-muted/30 border-b border-border">
        <div className="grid grid-cols-12 gap-4 px-4 py-3 text-sm font-medium text-muted-foreground">
          <div className="col-span-1 flex items-center justify-center">
            {t.projectDetail?.selectAll || '选择'}
          </div>
          <div className="col-span-4">
            {t.projectDetail?.taskName || '任务名称'}
          </div>
          <div className="col-span-2">
            {t.projectDetail?.status || '状态'}
          </div>
          <div className="col-span-2">
            {t.projectDetail?.createdAt || '创建时间'}
          </div>
          <div className="col-span-2">
            {t.projectDetail?.updatedAt || '更新时间'}
          </div>
          <div className="col-span-1 text-right">
            {t.projectDetail?.actions || '操作'}
          </div>
        </div>
      </div>

      {/* 任务列表 */}
      <div className="flex-1 overflow-y-auto">
        {tasks.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            {t.projectDetail?.noTasksInList || '暂无任务'}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {tasks.map((task) => {
              const isSelected = selectedTaskIds?.has(task.id);
              const statusConfig = getStatusConfig(task.status, t);
              const StatusIcon = statusConfig.icon;
              const SelectIcon = isSelected ? Check : Square;

              return (
                <div
                  key={task.id}
                  className={cn(
                    'grid grid-cols-12 gap-4 px-4 py-4 hover:bg-muted/50 transition-colors cursor-pointer group',
                    isSelected && 'bg-primary/5 hover:bg-primary/10'
                  )}
                  onClick={() => handleTaskClick(task)}
                >
                  {/* 选择框 */}
                  <div className="col-span-1 flex items-center justify-center">
                    <button
                      onClick={(e) => handleToggleSelect(e, task)}
                      className={cn(
                        'p-1 hover:bg-accent rounded transition-colors',
                        isSelected ? 'text-primary' : 'text-muted-foreground'
                      )}
                    >
                      <SelectIcon className="h-4 w-4" />
                    </button>
                  </div>

                  {/* 任务名称和描述 */}
                  <div className="col-span-4 flex flex-col justify-center min-w-0">
                    <div className="font-medium text-foreground">
                      <EditableText
                        value={task.name}
                        onSave={(newName) => handleUpdateTaskName(task.id, newName)}
                        inputClassName="font-medium"
                      />
                    </div>
                    {task.description && (
                      <div className="text-sm text-muted-foreground truncate mt-0.5">
                        {task.description}
                      </div>
                    )}
                  </div>

                  {/* 状态 */}
                  <div className="col-span-2 flex items-center">
                    <div
                      className={cn(
                        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
                        statusConfig.bgColor,
                        statusConfig.color
                      )}
                    >
                      <StatusIcon className="h-3.5 w-3.5" />
                      {statusConfig.label}
                    </div>
                  </div>

                  {/* 创建时间 */}
                  <div className="col-span-2 flex items-center text-sm text-muted-foreground">
                    {formatDate(task.created_at)}
                  </div>

                  {/* 更新时间 */}
                  <div className="col-span-2 flex items-center text-sm text-muted-foreground">
                    {formatDate(task.updated_at)}
                  </div>

                  {/* 操作按钮 */}
                  <div className="col-span-1 flex items-center justify-end gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(task);
                      }}
                      className="p-1.5 hover:bg-accent rounded transition-colors opacity-0 group-hover:opacity-100"
                      title={t.common.edit}
                    >
                      <Edit2 className="h-4 w-4 text-muted-foreground" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(task.id);
                      }}
                      className="p-1.5 hover:bg-destructive/10 rounded transition-colors opacity-0 group-hover:opacity-100"
                      title={t.common.delete}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </button>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              );
            })}

            {/* 列表末尾的内联新增任务区域 */}
            <div className="px-4 py-3 bg-background">
              {isAddingTask ? (
                <div className="grid grid-cols-12 gap-4 items-center">
                  <div className="col-span-1 flex items-center justify-center text-muted-foreground">
                    <Plus className="h-4 w-4" />
                  </div>
                  <div className="col-span-5">
                    <input
                      type="text"
                      value={taskName}
                      onChange={(e) => setTaskName(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={t.projectDetail?.taskNamePlaceholder || '输入任务名称...'}
                      className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                      autoFocus
                      disabled={isCreating}
                    />
                  </div>
                  <div className="col-span-3 flex items-center gap-2">
                    <button
                      onClick={handleCreateTask}
                      disabled={!taskName.trim() || isCreating}
                      className={cn(
                        'px-3 py-2 rounded-md text-sm font-medium transition-colors',
                        'bg-primary text-primary-foreground hover:bg-primary/90',
                        'disabled:opacity-50 disabled:cursor-not-allowed'
                      )}
                    >
                      {isCreating ? '...' : t.common?.confirm || '确认'}
                    </button>
                    <button
                      onClick={() => {
                        setIsAddingTask(false);
                        setTaskName('');
                      }}
                      disabled={isCreating}
                      className="px-3 py-2 rounded-md text-sm font-medium transition-colors hover:bg-accent text-muted-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="col-span-3" />
                </div>
              ) : (
                <button
                  onClick={() => setIsAddingTask(true)}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  <span>{t.projectDetail?.addTask || '添加任务'}</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
