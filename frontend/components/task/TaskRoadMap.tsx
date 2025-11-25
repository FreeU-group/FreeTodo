'use client';

import { useMemo } from 'react';
import { Circle, CircleDot, CheckCircle2, XCircle } from 'lucide-react';
import { Task, TaskStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

interface TaskRoadMapProps {
  tasks: Task[];
  onTaskClick?: (task: Task) => void;
}

interface TaskNode {
  task: Task;
  level: number;
  column: number;
  children: TaskNode[];
}

const statusConfig = {
  completed: {
    icon: CheckCircle2,
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/30',
  },
  in_progress: {
    icon: CircleDot,
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
  },
  pending: {
    icon: Circle,
    color: 'text-muted-foreground',
    bgColor: 'bg-muted/30',
    borderColor: 'border-muted-foreground/20',
  },
  cancelled: {
    icon: XCircle,
    color: 'text-destructive',
    bgColor: 'bg-destructive/10',
    borderColor: 'border-destructive/30',
  },
};

const mockTasks: Task[] = [
  {
    id: 1,
    project_id: 101,
    name: "Project Setup",
    description: "Initialize repository and project structure.",
    status: 'completed' as TaskStatus,
    parent_task_id: undefined,
    created_at: "2025-01-10T09:00:00Z",
    updated_at: "2025-01-10T12:00:00Z",
  },
  {
    id: 2,
    project_id: 101,
    name: "Design Database Schema",
    description: "Define tables and relations for the core system.",
    status: 'in_progress' as TaskStatus,
    parent_task_id: 1,
    created_at: "2025-01-11T08:30:00Z",
    updated_at: "2025-01-12T15:20:00Z",
  },
  {
    id: 3,
    project_id: 101,
    name: "API Foundation",
    description: "Setup routing, controllers, and base modules.",
    status: 'pending' as TaskStatus,
    parent_task_id: 1,
    created_at: "2025-01-12T10:00:00Z",
    updated_at: "2025-01-12T10:00:00Z",
  },
  {
    id: 4,
    project_id: 101,
    name: "Auth Implementation",
    description: "Implement JWT auth and permissions.",
    status: 'pending' as TaskStatus,
    parent_task_id: 3, // depends on API Foundation
    created_at: "2025-01-13T08:00:00Z",
    updated_at: "2025-01-13T08:00:00Z",
  },
  {
    id: 5,
    project_id: 101,
    name: "Core Feature A",
    description: "Main feature development based on schema.",
    status: 'pending' as TaskStatus,
    parent_task_id: 2, // depends on DB schema
    created_at: "2025-01-14T09:00:00Z",
    updated_at: "2025-01-14T09:00:00Z",
  },
  {
    id: 6,
    project_id: 101,
    name: "Core Feature B",
    description: "Secondary core module.",
    status: 'pending' as TaskStatus,
    parent_task_id: 2, // also depends on DB schema
    created_at: "2025-01-14T09:30:00Z",
    updated_at: "2025-01-14T09:30:00Z",
  },
  {
    id: 7,
    project_id: 101,
    name: "Integration Tests",
    description: "Test interactions between modules.",
    status: 'pending' as TaskStatus,
    parent_task_id: 5, // depends on Feature A
    created_at: "2025-01-15T10:00:00Z",
    updated_at: "2025-01-15T10:00:00Z",
  },
  {
    id: 8,
    project_id: 101,
    name: "Deployment Setup",
    description: "Setup CI/CD pipeline.",
    status: 'pending' as TaskStatus,
    parent_task_id: 4, // depends on Auth
    created_at: "2025-01-16T11:00:00Z",
    updated_at: "2025-01-16T11:00:00Z",
  },
  {
    id: 9,
    project_id: 101,
    name: "Final QA Review",
    description: "Quality assurance before release.",
    status: 'pending' as TaskStatus,
    parent_task_id: 7, // depends on integration tests
    created_at: "2025-01-17T12:00:00Z",
    updated_at: "2025-01-17T12:00:00Z",
  },
];


export default function TaskRoadMap({ tasks, onTaskClick }: TaskRoadMapProps) {
  tasks = mockTasks
  // 构建任务树结构
  const taskTree = useMemo(() => {
    const taskMap = new Map<number, Task>();
    tasks.forEach((task) => taskMap.set(task.id, task));

    // 找到根任务（没有父任务的）
    const rootTasks = tasks.filter((task) => !task.parent_task_id);

    // 递归构建树
    const buildTree = (task: Task, level: number = 0, column: number = 0): TaskNode => {
      const children = tasks
        .filter((t) => t.parent_task_id === task.id)
        .map((childTask, index) => buildTree(childTask, level + 1, index));

      return {
        task,
        level,
        column,
        children,
      };
    };

    return rootTasks.map((task, index) => buildTree(task, 0, index));
  }, [tasks]);

  // 扁平化树结构用于渲染
  const flattenTree = (nodes: TaskNode[]): TaskNode[] => {
    const result: TaskNode[] = [];
    nodes.forEach((node) => {
      result.push(node);
      if (node.children.length > 0) {
        result.push(...flattenTree(node.children));
      }
    });
    return result;
  };

  const flatTasks = flattenTree(taskTree);

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-muted-foreground">暂无任务数据</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-auto p-8">
      <div className="min-w-max">
        {/* 图例 */}
        <div className="flex gap-6 mb-8 pb-4 border-b border-border">
          {Object.entries(statusConfig).map(([status, config]) => {
            const Icon = config.icon;
            const count = tasks.filter((t) => t.status === status).length;
            const label =
              status === 'completed'
                ? '已完成'
                : status === 'in_progress'
                ? '进行中'
                : status === 'pending'
                ? '待办'
                : '已取消';

            return (
              <div key={status} className="flex items-center gap-2">
                <Icon className={cn('h-4 w-4', config.color)} />
                <span className="text-sm text-foreground">{label}</span>
                <span className="text-xs text-muted-foreground">({count})</span>
              </div>
            );
          })}
        </div>

        {/* 路线图 */}
        <div className="relative">
          {flatTasks.map((node) => {
            const config = statusConfig[node.task.status as TaskStatus];
            const Icon = config.icon;

            // 计算位置 - 垂直布局
            const top = node.level * 180; // 垂直层级间距
            const left = node.column * 300; // 水平列间距

            // 查找子任务用于绘制连接线
            const hasChildren = node.children.length > 0;
            const childIndices = node.children.map((child) =>
              flatTasks.findIndex((n) => n.task.id === child.task.id)
            );

            return (
              <div key={node.task.id}>
                {/* 连接线 */}
                {hasChildren &&
                  childIndices.map((childIndex) => {
                    const childNode = flatTasks[childIndex];
                    const childTop = childNode.level * 180;
                    const childLeft = childNode.column * 300 + 132; // 对齐到节点中心 (264/2)

                    return (
                      <svg
                        key={`line-${node.task.id}-${childNode.task.id}`}
                        className="absolute pointer-events-none"
                        style={{
                          left: left + 132, // 从父节点中心开始
                          top: top + 110, // 从父节点底部开始
                          width: Math.abs(childLeft - (left + 132)),
                          height: childTop - (top + 110),
                        }}
                      >
                        <path
                          d={`M 0 0 L 0 ${(childTop - (top + 110)) / 2} L ${
                            childLeft - (left + 132)
                          } ${(childTop - (top + 110)) / 2} L ${
                            childLeft - (left + 132)
                          } ${childTop - (top + 110)}`}
                          stroke="currentColor"
                          strokeWidth="2"
                          fill="none"
                          className="text-border"
                          strokeDasharray="4 4"
                        />
                      </svg>
                    );
                  })}

                {/* 任务节点 */}
                <div
                  className="absolute transition-all"
                  style={{ top: `${top}px`, left: `${left}px` }}
                >
                  <div
                    onClick={() => onTaskClick?.(node.task)}
                    className={cn(
                      'w-64 p-4 rounded-lg border-2 bg-card cursor-pointer',
                      'hover:shadow-lg transition-all group',
                      config.borderColor,
                      config.bgColor
                    )}
                  >
                    {/* 顶部状态栏 */}
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className={cn('h-4 w-4', config.color)} />
                      <span className={cn('text-xs font-medium', config.color)}>
                        {node.task.status === 'completed'
                          ? '已完成'
                          : node.task.status === 'in_progress'
                          ? '进行中'
                          : node.task.status === 'pending'
                          ? '待办'
                          : '已取消'}
                      </span>
                    </div>

                    {/* 任务名称 */}
                    <h4 className="font-semibold text-foreground line-clamp-1 group-hover:text-primary transition-colors mb-1">
                      {node.task.name}
                    </h4>

                    {/* 任务描述 */}
                    {node.task.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {node.task.description}
                      </p>
                    )}

                    {/* 子任务数量 */}
                    {node.children.length > 0 && (
                      <div className="mt-3 pt-2 border-t border-border">
                        <span className="text-xs text-muted-foreground">
                          {node.children.length} 个依赖任务
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}