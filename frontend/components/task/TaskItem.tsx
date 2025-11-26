'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Task, TaskStatus } from '@/lib/types';
import { ChevronRight, ChevronDown, Plus, Edit2, Trash2, Circle, CircleDot, CheckCircle2, XCircle, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import TaskStatusSelect from './TaskStatusSelect';
import { useLocaleStore } from '@/lib/store/locale';
import { useTranslations } from '@/lib/i18n';

interface TaskItemProps {
  task: Task & { children?: Task[] };
  onEdit: (task: Task) => void;
  onDelete: (taskId: number) => void;
  onStatusChange: (taskId: number, newStatus: string) => void;
  onCreateSubtask: (parentTaskId: number) => void;
  level: number;
  projectId?: number; // 添加项目ID参数
}

const getStatusConfig = (t: ReturnType<typeof useTranslations>) => ({
  pending: {
    label: t.task.pending,
    icon: Circle,
    color: 'text-gray-500',
    bgColor: 'bg-gray-100 dark:bg-gray-800',
  },
  in_progress: {
    label: t.task.inProgress,
    icon: CircleDot,
    color: 'text-blue-500',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
  },
  completed: {
    label: t.task.completed,
    icon: CheckCircle2,
    color: 'text-green-500',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
  },
  cancelled: {
    label: t.task.cancelled,
    icon: XCircle,
    color: 'text-red-500',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
  },
});

export default function TaskItem({
  task,
  onEdit,
  onDelete,
  onStatusChange,
  onCreateSubtask,
  level,
  projectId,
}: TaskItemProps) {
  const router = useRouter();
  const locale = useLocaleStore((state) => state.locale);
  const t = useTranslations(locale);
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = task.children && task.children.length > 0;
  const statusConfig = getStatusConfig(t);
  const config = statusConfig[task.status as TaskStatus];
  const StatusIcon = config.icon;

  // 处理任务名称点击 - 跳转到详情页
  const handleTaskClick = () => {
    if (projectId) {
      router.push(`/project-management/${projectId}/tasks/${task.id}`);
    }
  };

  return (
    <div>
      {/* 任务项 */}
      <div
        className={cn(
          'group flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors',
          level > 0 && 'ml-8'
        )}
      >
        {/* 展开/收起按钮 */}
        <div className="flex-shrink-0">
          {hasChildren ? (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1 hover:bg-accent rounded transition-colors"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
          ) : (
            <div className="w-6" />
          )}
        </div>

        {/* 状态选择器 */}
        <TaskStatusSelect
          status={task.status}
          onChange={(newStatus) => onStatusChange(task.id, newStatus)}
        />

        {/* 任务内容 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <button
              onClick={handleTaskClick}
              className={cn(
                'font-medium text-foreground hover:text-primary transition-colors text-left group/name',
                task.status === 'completed' && 'line-through text-muted-foreground',
                task.status === 'cancelled' && 'line-through text-muted-foreground'
              )}
            >
              {task.name}
              {projectId && (
                <ExternalLink className="inline-block ml-1 h-3 w-3 opacity-0 group-hover/name:opacity-100 transition-opacity" />
              )}
            </button>
            {hasChildren && (
              <span className="flex-shrink-0 text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                {t.projectDetail.subtasksCount.replace('{count}', String(task.children!.length))}
              </span>
            )}
          </div>
          {task.description && (
            <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
              {task.description}
            </p>
          )}
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onCreateSubtask(task.id)}
            className="p-2 hover:bg-accent rounded-md transition-colors"
            title={t.task.createSubtask}
          >
            <Plus className="h-4 w-4 text-muted-foreground" />
          </button>
          <button
            onClick={() => onEdit(task)}
            className="p-2 hover:bg-accent rounded-md transition-colors"
            title={t.task.edit}
          >
            <Edit2 className="h-4 w-4 text-muted-foreground" />
          </button>
          <button
            onClick={() => onDelete(task.id)}
            className="p-2 hover:bg-destructive/10 rounded-md transition-colors"
            title={t.task.delete}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </button>
        </div>
      </div>

      {/* 子任务 */}
      {hasChildren && isExpanded && (
        <div className="mt-2 space-y-2">
          {task.children!.map((child) => (
            <TaskItem
              key={child.id}
              task={child}
              onEdit={onEdit}
              onDelete={onDelete}
              onStatusChange={onStatusChange}
              onCreateSubtask={onCreateSubtask}
              level={level + 1}
              projectId={projectId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
