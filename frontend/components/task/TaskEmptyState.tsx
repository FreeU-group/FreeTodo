'use client';

import { Plus, Zap, FileText, List, Target } from 'lucide-react';
import Button from '@/components/common/Button';
import { cn } from '@/lib/utils';

interface TaskEmptyStateProps {
  onCreateTask: () => void;
  onQuickCreate?: (template: TaskTemplate) => void;
}

export interface TaskTemplate {
  name: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
}

const templates: TaskTemplate[] = [
  {
    name: '快速任务',
    description: '创建一个简单的待办任务',
    icon: Zap,
    color: 'text-yellow-600 dark:text-yellow-400',
    bgColor: 'bg-yellow-50 dark:bg-yellow-950/30 hover:bg-yellow-100 dark:hover:bg-yellow-950/50',
  },
  {
    name: '文档任务',
    description: '需要编写文档或报告',
    icon: FileText,
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-950/50',
  },
  {
    name: '清单任务',
    description: '包含多个子任务的清单',
    icon: List,
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-50 dark:bg-purple-950/30 hover:bg-purple-100 dark:hover:bg-purple-950/50',
  },
  {
    name: '目标任务',
    description: '设定并追踪目标进度',
    icon: Target,
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-50 dark:bg-green-950/30 hover:bg-green-100 dark:hover:bg-green-950/50',
  },
];

export default function TaskEmptyState({ onCreateTask, onQuickCreate }: TaskEmptyStateProps) {
  return (
    <div className="rounded-xl border-2 border-dashed border-border bg-card/50 p-12">
      <div className="max-w-3xl mx-auto">
        {/* 主标题区域 */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 mb-6">
            <Plus className="h-10 w-10 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-3">
            开始创建您的第一个任务
          </h2>
          <p className="text-muted-foreground leading-relaxed max-w-md mx-auto">
            选择一个模板快速开始，或者创建一个自定义任务。您可以随时添加子任务、设置状态和添加描述。
          </p>
        </div>

        {/* 模板卡片 */}
        {onQuickCreate && (
          <div className="grid grid-cols-2 gap-4 mb-8">
            {templates.map((template) => {
              const Icon = template.icon;
              return (
                <button
                  key={template.name}
                  onClick={() => onQuickCreate(template)}
                  className={cn(
                    'flex items-start gap-4 p-5 rounded-xl border-2 border-border',
                    'text-left transition-all duration-200',
                    'hover:scale-[1.02] hover:shadow-lg hover:border-primary/30',
                    'active:scale-[0.98]',
                    template.bgColor
                  )}
                >
                  <div className="flex-shrink-0 mt-1">
                    <div className={cn(
                      'w-10 h-10 rounded-lg flex items-center justify-center',
                      'bg-background/80 border border-border'
                    )}>
                      <Icon className={cn('h-5 w-5', template.color)} />
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className={cn('font-semibold mb-1', template.color)}>
                      {template.name}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {template.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* 主操作按钮 */}
        <div className="flex flex-col items-center gap-4">
          <Button
            onClick={onCreateTask}
            size="lg"
            className="gap-2 px-8 text-base h-12 rounded-xl shadow-lg hover:shadow-xl"
          >
            <Plus className="h-5 w-5" />
            创建自定义任务
          </Button>

          <p className="text-xs text-muted-foreground">
            💡 提示：使用快捷键 <kbd className="px-2 py-1 text-xs bg-muted rounded border">Ctrl</kbd> +
            <kbd className="px-2 py-1 text-xs bg-muted rounded border ml-1">N</kbd> 快速创建
          </p>
        </div>
      </div>
    </div>
  );
}
