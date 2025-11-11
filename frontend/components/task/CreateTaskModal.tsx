'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import Input from '@/components/common/Input';
import Button from '@/components/common/Button';
import { Task, TaskCreate, TaskStatus } from '@/lib/types';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';

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
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-lg bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-bold text-foreground">
            {isEditMode ? '编辑任务' : isSubtask ? '创建子任务' : '创建任务'}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-foreground transition-colors hover:bg-muted"
            aria-label="关闭"
            disabled={saving}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">
              任务名称 <span className="text-red-500">*</span>
            </label>
            <Input
              type="text"
              placeholder="输入任务名称"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              disabled={saving}
              className={errors.name ? 'border-destructive' : ''}
            />
            {errors.name && (
              <p className="mt-1 text-sm text-destructive">{errors.name}</p>
            )}
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">
              任务描述
            </label>
            <textarea
              placeholder="输入任务描述（可选）"
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              disabled={saving}
              rows={3}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">
              任务状态
            </label>
            <select
              value={formData.status}
              onChange={(e) => handleChange('status', e.target.value as TaskStatus)}
              disabled={saving}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* 操作按钮 */}
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={saving}
            >
              取消
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? '保存中...' : isEditMode ? '保存' : '创建'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

