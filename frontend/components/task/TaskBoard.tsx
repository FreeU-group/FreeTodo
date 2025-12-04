'use client';

import { Task, TaskStatus } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Circle, CircleDot, CheckCircle2, XCircle, Edit2, Trash2, Square, Check, Plus, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocaleStore } from '@/lib/store/locale';
import { useTranslations } from '@/lib/i18n';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  useSensor,
  useSensors,
  PointerSensor,
  closestCorners,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core';
import { useState } from 'react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';

interface TaskBoardProps {
  tasks: Task[];
  onEdit: (task: Task) => void;
  onDelete: (taskId: number) => void;
  onStatusChange: (taskId: number, newStatus: string) => void;
  projectId?: number;
  selectedTaskIds?: Set<number>;
  onToggleSelect?: (task: Task, selected: boolean) => void;
  className?: string;
  onTaskCreated?: () => void;
}

const getColumns = (t: ReturnType<typeof useTranslations>) => [
  {
    status: 'pending' as TaskStatus,
    label: t.task.pending,
    icon: Circle,
    color: 'text-muted-foreground',
    bgColor: 'bg-muted/30',
    borderColor: 'border-muted-foreground/20',
  },
  {
    status: 'in_progress' as TaskStatus,
    label: t.task.inProgress,
    icon: CircleDot,
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-500/5',
    borderColor: 'border-blue-500/20',
  },
  {
    status: 'completed' as TaskStatus,
    label: t.task.completed,
    icon: CheckCircle2,
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-500/5',
    borderColor: 'border-green-500/20',
  },
  {
    status: 'cancelled' as TaskStatus,
    label: t.task.cancelled,
    icon: XCircle,
    color: 'text-destructive',
    bgColor: 'bg-destructive/5',
    borderColor: 'border-destructive/20',
  },
];

export default function TaskBoard({
  tasks,
  onEdit,
  onDelete,
  onStatusChange,
  projectId,
  selectedTaskIds,
  onToggleSelect,
  className,
  onTaskCreated,
}: TaskBoardProps) {
  const locale = useLocaleStore((state) => state.locale);
  const t = useTranslations(locale);
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  // 获取国际化的列配置
  const columns = getColumns(t);

  // 配置拖拽传感器
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 需要拖动 8px 才激活，避免误触
      },
    })
  );

  // 按状态分组任务
  const groupTasksByStatus = (tasks: Task[]) => {
    const grouped: Record<TaskStatus, Task[]> = {
      pending: [],
      in_progress: [],
      completed: [],
      cancelled: [],
    };

    tasks.forEach((task) => {
      const status = task.status as TaskStatus;
      if (grouped[status]) {
        grouped[status].push(task);
      }
    });

    return grouped;
  };

  const groupedTasks = groupTasksByStatus(tasks);

  // 拖拽开始
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const taskId = active.id as number;
    const task = tasks.find((t) => t.id === taskId);
    if (task) {
      setActiveTask(task);
    }
  };

  // 拖拽结束
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);

    if (!over) return;

    const taskId = active.id as number;
    const newStatus = over.id as TaskStatus;

    // 找到当前任务
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    // 如果状态没有变化，不需要更新
    if (task.status === newStatus) return;

    // 调用状态更改回调
    onStatusChange(taskId, newStatus);
  };

  // 拖拽取消
  const handleDragCancel = () => {
    setActiveTask(null);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className={cn('grid grid-cols-4 gap-4 h-full', className)}>
        {columns.map((column) => {
          const Icon = column.icon;
          const columnTasks = groupedTasks[column.status];

          return (
            <div
              key={column.status}
              className="flex flex-col min-h-0"
            >
              {/* 列头 */}
              <div className={cn(
                'flex items-center gap-2 px-4 py-3 border-b bg-card rounded-t-lg',
                'border-border shadow-sm'
              )}>
                <Icon className={cn('h-4 w-4 flex-shrink-0', column.color)} />
                <h3 className={cn('font-medium text-sm', column.color)}>
                  {column.label}
                </h3>
                <span className={cn(
                  'ml-auto text-xs font-medium px-2 py-0.5 rounded-full',
                  column.bgColor,
                  column.color
                )}>
                  {columnTasks.length}
                </span>
              </div>

              {/* 任务列表 - 可滚动且可放置 */}
              <DroppableColumn
                id={column.status}
                tasks={columnTasks}
                onEdit={onEdit}
                onDelete={onDelete}
                projectId={projectId}
                selectedTaskIds={selectedTaskIds}
                onToggleSelect={onToggleSelect}
                onTaskCreated={onTaskCreated}
              />
            </div>
          );
        })}
      </div>

      {/* 拖拽时显示的覆盖层 */}
      <DragOverlay>
        {activeTask ? (
          <div className="opacity-80 rotate-3 scale-105">
            <TaskCard
              task={activeTask}
              onEdit={onEdit}
              onDelete={onDelete}
              isSelected={false}
              onToggleSelect={undefined}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

// 可放置的列组件
function DroppableColumn({
  id,
  tasks,
  onEdit,
  onDelete,
  projectId,
  selectedTaskIds,
  onToggleSelect,
  onTaskCreated,
}: {
  id: TaskStatus;
  tasks: Task[];
  onEdit: (task: Task) => void;
  onDelete: (taskId: number) => void;
  projectId?: number;
  selectedTaskIds?: Set<number>;
  onToggleSelect?: (task: Task, selected: boolean) => void;
  onTaskCreated?: () => void;
}) {
  const locale = useLocaleStore((state) => state.locale);
  const t = useTranslations(locale);
  const { setNodeRef, isOver } = useDroppable({ id });
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [taskName, setTaskName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const handleCreateTask = async () => {
    if (!taskName.trim() || !projectId) return;

    setIsCreating(true);
    try {
      await api.createTask(projectId, {
        name: taskName.trim(),
        status: id,
        description: '',
      });
      toast.success(t.task.createSuccess);
      setTaskName('');
      setIsAddingTask(false);
      onTaskCreated?.();
    } catch (error) {
      console.error('创建任务失败:', error);
      toast.error(t.task.createFailed);
    } finally {
      setIsCreating(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleCreateTask();
    } else if (e.key === 'Escape') {
      setIsAddingTask(false);
      setTaskName('');
    }
  };

  return (
    <div
      ref={setNodeRef}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        'flex-1 flex flex-col overflow-hidden rounded-b-lg border-x border-b',
        'bg-muted/10',
        'border-border transition-colors',
        isOver && 'bg-primary/5 border-primary/30'
      )}
    >
      {/* 任务列表区域 + 添加任务按钮 - 一起滚动，按钮紧跟在最后一个任务后面 */}
      <div
        className={cn(
          'flex-1 overflow-y-auto p-3 space-y-2',
          'scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent'
        )}
      >
        {tasks.length === 0 && !isAddingTask ? (
          isOver ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              {t.projectDetail.dropHere}
            </div>
          ) : null
        ) : (
          tasks.map((task) => (
            <DraggableTask
              key={task.id}
              task={task}
              onEdit={onEdit}
              onDelete={onDelete}
              projectId={projectId}
              isSelected={selectedTaskIds?.has(task.id)}
              onToggleSelect={onToggleSelect}
            />
          ))
        )}

        {/* 快速添加任务区域 - 紧跟在任务列表后面 */}
        {(isHovered || isAddingTask) && (
          <div className="pt-1 border-t border-border/30 mt-1">
            {isAddingTask ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={taskName}
                  onChange={(e) => setTaskName(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder={t.projectDetail.taskNamePlaceholder || '输入任务名称...'}
                  className="flex-1 px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  autoFocus
                  disabled={isCreating}
                />
                <button
                  onClick={handleCreateTask}
                  disabled={!taskName.trim() || isCreating}
                  className={cn(
                    'px-3 py-2 rounded-md text-sm font-medium transition-colors',
                    'bg-primary text-primary-foreground hover:bg-primary/90',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                >
                  {isCreating ? '...' : t.common.confirm || '确认'}
                </button>
                <button
                  onClick={() => {
                    setIsAddingTask(false);
                    setTaskName('');
                  }}
                  className="px-3 py-2 rounded-md text-sm font-medium transition-colors hover:bg-accent"
                  disabled={isCreating}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsAddingTask(true)}
                className="w-full px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors flex items-center gap-2 justify-center"
              >
                <Plus className="h-4 w-4" />
                <span>{t.projectDetail.addTask || '添加任务'}</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// 可拖拽的任务组件
function DraggableTask({
  task,
  onEdit,
  onDelete,
  projectId,
  isSelected,
  onToggleSelect,
}: {
  task: Task;
  onEdit: (task: Task) => void;
  onDelete: (taskId: number) => void;
  projectId?: number;
  isSelected?: boolean;
  onToggleSelect?: (task: Task, selected: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(isDragging && 'opacity-50')}
    >
      <TaskCard
        task={task}
        onEdit={onEdit}
        onDelete={onDelete}
        isSelected={isSelected}
        onToggleSelect={onToggleSelect}
        projectId={projectId}
      />
    </div>
  );
}

// 简单的任务卡片组件（用于看板视图）
function TaskCard({
  task,
  onEdit,
  onDelete,
  isSelected,
  onToggleSelect,
  projectId,
}: {
  task: Task;
  onEdit: (task: Task) => void;
  onDelete: (taskId: number) => void;
  isSelected?: boolean;
  onToggleSelect?: (task: Task, selected: boolean) => void;
  projectId?: number;
}) {
  const router = useRouter();
  const locale = useLocaleStore((state) => state.locale);
  const t = useTranslations(locale);

  // 点击卡片内容区域 - 跳转到任务详情
  const handleCardClick = () => {
    if (projectId) {
      router.push(`/project-management/${projectId}/tasks/${task.id}`);
    }
  };

  // 点击单选框 - 切换选中状态
  const handleToggleSelect = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleSelect?.(task, !isSelected);
  };

  const SelectIcon = isSelected ? Check : Square;

  return (
    <div
      className={cn(
        'group rounded-lg border bg-card hover:shadow-md transition-all relative',
        isSelected ? 'border-primary bg-primary/5' : 'border-border'
      )}
    >
      {/* 顶部操作栏 */}
      <div className="absolute top-2 left-2 right-2 flex items-center justify-between z-10">
        {/* 左上角 - 单选框 */}
        <button
          onClick={handleToggleSelect}
          className={cn(
            'p-1 hover:bg-accent rounded transition-colors',
            isSelected ? 'text-primary' : 'text-muted-foreground'
          )}
          title={isSelected ? t.projectDetail.unselectTask : t.projectDetail.selectTask}
        >
          <SelectIcon className="h-4 w-4" />
        </button>

        {/* 右上角 - 操作按钮（悬停时显示） */}
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(task);
            }}
            className="p-1 hover:bg-accent rounded transition-colors"
            title={t.common.edit}
          >
            <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(task.id);
            }}
            className="p-1 hover:bg-destructive/10 rounded transition-colors"
            title={t.common.delete}
          >
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </button>
        </div>
      </div>

      {/* 任务内容 - 点击跳转到详情 */}
      <div
        className="p-3 pt-8 cursor-pointer"
        onClick={handleCardClick}
      >
        <h4 className="font-medium text-foreground line-clamp-1 hover:text-primary transition-colors">
          {task.name}
        </h4>
        {task.description && (
          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
            {task.description}
          </p>
        )}
      </div>
    </div>
  );
}
