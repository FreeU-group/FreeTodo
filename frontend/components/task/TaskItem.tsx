'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Task, TaskStatus } from '@/lib/types';
import {
  ChevronRight,
  ChevronDown,
  Plus,
  Edit2,
  Trash2,
  Circle,
  CircleDot,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Clock,
  CalendarDays
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface TaskItemProps {
  task: Task & { children?: Task[] };
  onEdit: (task: Task) => void;
  onDelete: (taskId: number) => void;
  onStatusChange: (taskId: number, newStatus: string) => void;
  onCreateSubtask: (parentTaskId: number) => void;
  level: number;
  projectId?: number;
  isSelected?: boolean;
  onToggleSelect?: (task: Task, selected: boolean) => void;
}

const statusConfig = {
  pending: {
    label: '待办',
    icon: Circle,
    color: 'text-gray-600 dark:text-gray-400',
    bgColor: 'bg-gray-100 dark:bg-gray-800/50',
    borderColor: 'border-gray-300 dark:border-gray-700',
    dotColor: 'bg-gray-400',
  },
  in_progress: {
    label: '进行中',
    icon: CircleDot,
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-950/30',
    borderColor: 'border-blue-300 dark:border-blue-800',
    dotColor: 'bg-blue-500',
  },
  completed: {
    label: '已完成',
    icon: CheckCircle2,
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-50 dark:bg-green-950/30',
    borderColor: 'border-green-300 dark:border-green-800',
    dotColor: 'bg-green-500',
  },
  cancelled: {
    label: '已取消',
    icon: XCircle,
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-50 dark:bg-red-950/30',
    borderColor: 'border-red-300 dark:border-red-800',
    dotColor: 'bg-red-500',
  },
};

export default function TaskItem({
  task,
  onEdit,
  onDelete,
  onStatusChange,
  onCreateSubtask,
  level,
  projectId,
  isSelected = false,
  onToggleSelect,
}: TaskItemProps) {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = task.children && task.children.length > 0;
  const config = statusConfig[task.status as TaskStatus];
  const StatusIcon = config.icon;

  // 判断是否为子任务（只有顶层任务可以被选择添加到上下文）
  const isSubtask = task.parent_task_id !== null && task.parent_task_id !== undefined;

  const handleTaskClick = () => {
    if (projectId) {
      router.push(`/project-management/${projectId}/tasks/${task.id}`);
    }
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (onToggleSelect) {
      onToggleSelect(task, e.target.checked);
    }
  };

  // 格式化时间
  const formatDate = (dateString?: string) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return '已逾期';
    if (diffDays === 0) return '今天';
    if (diffDays === 1) return '明天';
    if (diffDays <= 7) return `${diffDays}天后`;
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  return (
    <div className={cn(level > 0 && 'ml-8')}>
      {/* 全新的任务卡片设计 */}
      <div
        className={cn(
          'group relative rounded-xl border-2 bg-card transition-all duration-200',
          'hover:shadow-lg hover:-translate-y-0.5',
          projectId && 'cursor-pointer',
          isSelected && [
            'border-primary ring-2 ring-primary/20',
            'shadow-md',
          ],
          !isSelected && 'border-border hover:border-primary/30'
        )}
      >
        {/* 左侧彩色边条 */}
        <div className={cn(
          'absolute left-0 top-0 bottom-0 w-1 rounded-l-xl transition-all',
          config.dotColor,
          'group-hover:w-1.5'
        )} />

        {/* 主内容区 */}
        <div className="p-4 pl-5">
          {/* 顶部区域：展开按钮 + 复选框 + 内容 + 状态 + 菜单 */}
          <div className="flex items-start gap-3">
            {/* 展开/收起按钮 */}
            {hasChildren ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded(!isExpanded);
                }}
                className={cn(
                  'flex-shrink-0 mt-0.5',
                  'inline-flex items-center justify-center rounded-lg',
                  'h-6 w-6',
                  'hover:bg-accent',
                  'transition-all duration-200',
                  'active:scale-90'
                )}
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
            ) : (
              <div className="w-6 flex-shrink-0" />
            )}

            {/* 复选框 - 只在顶层任务显示 */}
            {onToggleSelect && !isSubtask ? (
              <div className="flex-shrink-0 mt-0.5" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={handleCheckboxChange}
                  className={cn(
                    'w-5 h-5 rounded-md border-2 border-input text-primary',
                    'focus:ring-2 focus:ring-primary focus:ring-offset-0',
                    'cursor-pointer transition-all duration-200',
                    'hover:border-primary hover:scale-110'
                  )}
                />
              </div>
            ) : onToggleSelect ? (
              // 子任务占位符，保持布局一致
              <div className="w-5 flex-shrink-0" />
            ) : null}

            {/* 任务内容区 */}
            <div className="flex-1 min-w-0" onClick={handleTaskClick}>
              {/* 任务标题 */}
              <div className="flex items-start gap-2 mb-1">
                <h3
                  className={cn(
                    'font-semibold text-base leading-snug transition-colors flex-1',
                    projectId && 'group-hover:text-primary',
                    task.status === 'completed' && 'line-through text-muted-foreground',
                    task.status === 'cancelled' && 'line-through text-muted-foreground/70',
                    task.status !== 'completed' && task.status !== 'cancelled' && 'text-foreground'
                  )}
                >
                  {task.name}
                  {projectId && (
                    <ExternalLink className="inline-block ml-2 h-4 w-4 opacity-0 group-hover:opacity-60 transition-opacity align-text-bottom" />
                  )}
                </h3>
              </div>

              {/* 任务描述 */}
              {task.description && (
                <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed mb-2">
                  {task.description}
                </p>
              )}

              {/* 底部元信息 */}
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {/* 子任务数量 */}
                {hasChildren && (
                  <div className="flex items-center gap-1.5">
                    <div className={cn(
                      'flex items-center gap-1 px-2 py-0.5 rounded-md',
                      config.bgColor
                    )}>
                      <ChevronRight className="h-3 w-3" />
                      <span className={cn('font-medium', config.color)}>
                        {task.children!.length} 项
                      </span>
                    </div>
                  </div>
                )}

                {/* 时间信息（如果有） */}
                {task.created_at && (
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>{formatDate(task.created_at)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* 右侧区域：状态徽章 */}
            <div className="flex flex-col items-end gap-2 flex-shrink-0">
              {/* 状态徽章 */}
              <div
                onClick={(e) => e.stopPropagation()}
                className="group/status relative"
              >
                <button
                  onClick={() => {
                    // 循环切换状态
                    const statuses: TaskStatus[] = ['pending', 'in_progress', 'completed', 'cancelled'];
                    const currentIndex = statuses.indexOf(task.status as TaskStatus);
                    const nextStatus = statuses[(currentIndex + 1) % statuses.length];
                    onStatusChange(task.id, nextStatus);
                  }}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full',
                    'text-xs font-semibold',
                    'border-2 transition-all duration-200',
                    'hover:scale-105 active:scale-95',
                    config.borderColor,
                    config.bgColor,
                    config.color
                  )}
                  title="点击切换状态"
                >
                  <StatusIcon className="h-3.5 w-3.5" />
                  <span>{config.label}</span>
                </button>
              </div>

              {/* 操作按钮组 - 只显示图标 */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => onEdit(task)}
                  className={cn(
                    'inline-flex items-center justify-center rounded-md',
                    'h-7 w-7',
                    'hover:bg-accent',
                    'transition-all duration-200',
                    'hover:scale-110 active:scale-95'
                  )}
                  title="编辑任务"
                >
                  <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
                <button
                  onClick={() => onCreateSubtask(task.id)}
                  className={cn(
                    'inline-flex items-center justify-center rounded-md',
                    'h-7 w-7',
                    'hover:bg-accent',
                    'transition-all duration-200',
                    'hover:scale-110 active:scale-95'
                  )}
                  title="添加子任务"
                >
                  <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
                <button
                  onClick={() => onDelete(task.id)}
                  className={cn(
                    'inline-flex items-center justify-center rounded-md',
                    'h-7 w-7',
                    'hover:bg-destructive/10',
                    'transition-all duration-200',
                    'hover:scale-110 active:scale-95'
                  )}
                  title="删除任务"
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 子任务列表 */}
      {hasChildren && isExpanded && (
        <div className="mt-3 space-y-3 animate-in fade-in-50 duration-200">
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
              // 子任务不支持选择，不传递选择相关的 props
              isSelected={false}
              onToggleSelect={undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
