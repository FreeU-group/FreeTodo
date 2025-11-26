'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import Input from '@/components/common/Input';
import Button from '@/components/common/Button';
import { Task, TaskCreate, TaskStatus } from '@/lib/types';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { useLocaleStore } from '@/lib/store/locale';
import { useTranslations } from '@/lib/i18n';

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  projectId: number;
  task?: Task; // 如果传入，则为编辑模式
  parentTaskId?: number; // 如果传入，则创建子任务
}

export default function CreateTaskModal({
  isOpen,
  onClose,
  onSuccess,
  projectId,
  task,
  parentTaskId,
}: CreateTaskModalProps) {
  const { locale } = useLocaleStore();
  const t = useTranslations(locale);
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

  const statusOptions: { value: TaskStatus; label: string }[] = [
    { value: 'pending', label: t.task.pending },
    { value: 'in_progress', label: t.task.inProgress },
    { value: 'completed', label: t.task.completed },
    { value: 'cancelled', label: t.task.cancelled },
  ];

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
      newErrors.name = t.task.nameRequired;
    } else if (formData.name.length > 200) {
      newErrors.name = t.task.nameTooLong;
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
        toast.success(t.task.updateSuccess);
      } else {
        // 创建模式
        await api.createTask(projectId, {
          name: formData.name.trim(),
          description: formData.description?.trim() || undefined,
          status: formData.status,
          parent_task_id: formData.parent_task_id,
        });
        toast.success(isSubtask ? t.task.createSubtaskSuccess : t.task.createSuccess);
      }

      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('保存任务失败:', error);
      const errorMsg = error instanceof Error ? error.message : t.common.unknownError;
      toast.error(isEditMode ? `${t.task.updateFailed}: ${errorMsg}` : `${t.task.createFailed}: ${errorMsg}`);
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
            {isEditMode ? t.task.edit : isSubtask ? t.task.createSubtask : t.task.create}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-foreground transition-colors hover:bg-muted"
            aria-label={t.common.close}
            disabled={saving}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">
              {t.task.name} <span className="text-red-500">*</span>
            </label>
            <Input
              type="text"
              placeholder={t.task.namePlaceholder}
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
              {t.task.description}
            </label>
            <textarea
              placeholder={t.task.descriptionPlaceholder}
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              disabled={saving}
              rows={3}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">
              {t.task.status}
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
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? t.common.saving : isEditMode ? t.common.save : t.common.create}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
