'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import Input from '@/components/common/Input';
import Button from '@/components/common/Button';
import { Task, TaskCreate, TaskStatus } from '@/lib/types';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  projectId: number;
  task?: Task; // 如果传入，则为编辑模式
  parentTaskId?: number; // 如果传入，则创建子任务
}

const statusOptions: { value: TaskStatus; label: string }[] = [
  { value: 'pending', label: '待办' },
  { value: 'in_progress', label: '进行中' },
  { value: 'completed', label: '已完成' },
  { value: 'cancelled', label: '已取消' },
];

export default function CreateTaskModal({
  isOpen,
  onClose,
  onSuccess,
  projectId,
  task,
  parentTaskId,
}: CreateTaskModalProps) {
  const [formData, setFormData] = useState<TaskCreate>({
    name: '',
    description: '',
    status: 'pending',
    parent_task_id: undefined,
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ name?: string }>({});

  const isEditMode = !!task;
  const isSubtask = !!parentTaskId;

  // 当模态框打开时，初始化表单数据
  useEffect(() => {
    if (isOpen) {
      if (task) {
        setFormData({
          name: task.name,
          description: task.description || '',
          status: task.status,
          parent_task_id: task.parent_task_id,
        });
      } else {
        setFormData({
          name: '',
          description: '',
          status: 'pending',
          parent_task_id: parentTaskId,
        });
      }
      setErrors({});
    }
  }, [isOpen, task, parentTaskId]);

  const validateForm = (): boolean => {
    const newErrors: { name?: string } = {};

    if (!formData.name.trim()) {
      newErrors.name = '任务名称不能为空';
    } else if (formData.name.length > 200) {
      newErrors.name = '任务名称不能超过200个字符';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setSaving(true);
    try {
      if (isEditMode && task) {
        // 编辑模式
        await api.updateTask(projectId, task.id, {
          name: formData.name.trim(),
          description: formData.description?.trim() || undefined,
          status: formData.status,
          parent_task_id: formData.parent_task_id,
        });
        toast.success('任务更新成功');
      } else {
        // 创建模式
        await api.createTask(projectId, {
          name: formData.name.trim(),
          description: formData.description?.trim() || undefined,
          status: formData.status,
          parent_task_id: formData.parent_task_id,
        });
        toast.success(isSubtask ? '子任务创建成功' : '任务创建成功');
      }

      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('保存任务失败:', error);
      const errorMsg = error instanceof Error ? error.message : '未知错误';
      toast.error(isEditMode ? `更新任务失败: ${errorMsg}` : `创建任务失败: ${errorMsg}`);
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field: keyof TaskCreate, value: string | number | undefined) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // 清除该字段的错误
    if (field === 'name' && errors.name) {
      setErrors((prev) => ({ ...prev, name: undefined }));
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg rounded-xl bg-background shadow-2xl border border-border animate-in fade-in-0 zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-muted/30">
          <h2 className="text-xl font-semibold text-foreground">
            {isEditMode ? '编辑任务' : isSubtask ? '创建子任务' : '创建任务'}
          </h2>
          <button
            onClick={onClose}
            className={cn(
              'inline-flex items-center justify-center rounded-md',
              'h-8 w-8',
              'hover:bg-accent hover:text-accent-foreground',
              'transition-all duration-200',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'active:scale-95',
              'disabled:pointer-events-none disabled:opacity-50'
            )}
            aria-label="关闭"
            disabled={saving}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* 任务名称 */}
          <div className="space-y-2">
            <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              任务名称 <span className="text-destructive">*</span>
            </label>
            <Input
              type="text"
              placeholder="输入任务名称"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              disabled={saving}
              className={cn(
                errors.name && 'border-destructive focus-visible:ring-destructive'
              )}
            />
            {errors.name && (
              <p className="text-sm font-medium text-destructive">{errors.name}</p>
            )}
          </div>

          {/* 任务描述 */}
          <div className="space-y-2">
            <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              任务描述
            </label>
            <textarea
              placeholder="输入任务描述（可选）"
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              disabled={saving}
              rows={4}
              className={cn(
                'flex w-full rounded-md border border-input bg-background px-3 py-2',
                'text-sm shadow-sm transition-colors',
                'placeholder:text-muted-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0',
                'disabled:cursor-not-allowed disabled:opacity-50',
                'resize-none'
              )}
            />
          </div>

          {/* 任务状态 */}
          <div className="space-y-2">
            <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              任务状态
            </label>
            <select
              value={formData.status}
              onChange={(e) => handleChange('status', e.target.value as TaskStatus)}
              disabled={saving}
              className={cn(
                'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2',
                'text-sm shadow-sm transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0',
                'disabled:cursor-not-allowed disabled:opacity-50',
                'cursor-pointer'
              )}
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* 操作按钮 */}
          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={saving}
              className="min-w-[80px]"
            >
              取消
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="min-w-[80px]"
            >
              {saving ? '保存中...' : isEditMode ? '保存' : '创建'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
