'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import Input from '@/components/common/Input';
import Button from '@/components/common/Button';
import { Project, ProjectCreate } from '@/lib/types';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { useLocaleStore } from '@/lib/store/locale';
import { useTranslations } from '@/lib/i18n';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  project?: Project; // 如果传入，则为编辑模式
}

export default function CreateProjectModal({
  isOpen,
  onClose,
  onSuccess,
  project,
}: CreateProjectModalProps) {
  const { locale } = useLocaleStore();
  const t = useTranslations(locale);
  const [formData, setFormData] = useState<ProjectCreate>({
    name: '',
    goal: '',
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; goal?: string }>({});

  const isEditMode = !!project;

  // 当模态框打开时，初始化表单数据
  useEffect(() => {
    if (isOpen) {
      if (project) {
        setFormData({
          name: project.name,
          goal: project.goal || '',
        });
      } else {
        setFormData({
          name: '',
          goal: '',
        });
      }
      setErrors({});
    }
  }, [isOpen, project]);

  const validateForm = (): boolean => {
    const newErrors: { name?: string; goal?: string } = {};

    if (!formData.name.trim()) {
      newErrors.name = t.project.nameRequired;
    } else if (formData.name.length > 200) {
      newErrors.name = t.project.nameTooLong;
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
      if (isEditMode && project) {
        // 编辑模式
        await api.updateProject(project.id, {
          name: formData.name.trim(),
          goal: formData.goal?.trim() || undefined,
        });
        toast.success(t.project.updateSuccess);
      } else {
        // 创建模式
        await api.createProject({
          name: formData.name.trim(),
          goal: formData.goal?.trim() || undefined,
        });
        toast.success(t.project.createSuccess);
      }

      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('保存项目失败:', error);
      const errorMsg = error instanceof Error ? error.message : t.common.unknownError;
      toast.error(isEditMode ? `${t.project.updateFailed}: ${errorMsg}` : `${t.project.createFailed}: ${errorMsg}`);
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field: keyof ProjectCreate, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // 清除该字段的错误
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
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
            {isEditMode ? t.project.edit : t.project.create}
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
              {t.project.name} <span className="text-red-500">*</span>
            </label>
            <Input
              type="text"
              placeholder={t.project.namePlaceholder}
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
              {t.project.goal}
            </label>
            <textarea
              placeholder={t.project.goalPlaceholder}
              value={formData.goal}
              onChange={(e) => handleChange('goal', e.target.value)}
              disabled={saving}
              rows={3}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none"
            />
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
