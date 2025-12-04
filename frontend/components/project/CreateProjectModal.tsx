'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Sparkles, Wand2, UploadCloud, ChevronDown } from 'lucide-react';
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
    description: '',
    definition_of_done: '',
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ name?: string }>({});
  // 全局 AI 动作（底部一键补全/润色）
  const [aiGlobalAction, setAiGlobalAction] = useState<'fill-all' | 'polish-all' | null>(null);
  // 字段级 AI 动作（只影响单行 + 底部按钮）
  const [aiFieldAction, setAiFieldAction] = useState<'description' | 'definition_of_done' | null>(null);
  const isAnyAiRunning = !!aiGlobalAction || !!aiFieldAction;

  // 导入资料生成模式相关状态
  const [importText, setImportText] = useState('');
  const [isGeneratingFromImport, setIsGeneratingFromImport] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isImportSectionOpen, setIsImportSectionOpen] = useState(false);

  const descriptionRef = useRef<HTMLTextAreaElement | null>(null);
  const definitionRef = useRef<HTMLTextAreaElement | null>(null);

  const isEditMode = !!project;

  // 当模态框打开时，初始化表单数据
  useEffect(() => {
    if (isOpen) {
      if (project) {
        setFormData({
          name: project.name,
          description: project.description || '',
          definition_of_done: project.definition_of_done || '',
        });
      } else {
        setFormData({
          name: '',
          description: '',
          definition_of_done: '',
        });
      }
      setErrors({});
      setImportText('');
      setIsGeneratingFromImport(false);
      setIsDragOver(false);
      setIsImportSectionOpen(false);
    }
  }, [isOpen, project]);

  const validateForm = (): boolean => {
    const newErrors: { name?: string } = {};

    if (!formData.name.trim()) {
      newErrors.name = t.project.nameRequired;
    } else if (formData.name.length > 200) {
      newErrors.name = t.project.nameTooLong;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const autoResizeTextarea = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    // 限制最大高度为视口高度的 40%，避免弹窗过高
    const maxHeight = typeof window !== 'undefined' ? window.innerHeight * 0.4 : 400;
    el.style.height = 'auto';
    const scrollHeight = el.scrollHeight;
    const newHeight = Math.min(maxHeight, scrollHeight);
    el.style.height = `${newHeight}px`;
    // 只有在真正达到最大高度时才显示滚动条，否则隐藏滚动条
    if (scrollHeight > maxHeight) {
      el.style.overflowY = 'auto';
    } else {
      el.style.overflowY = 'hidden';
    }
  };

  // 基于导入资料，一次性生成项目名称 / 描述 / 完成标准
  const handleGenerateFromImport = async () => {
    if (!importText.trim()) {
      toast.error(t.project.importEmptyError || t.common.unknownError);
      return;
    }

    if (isAnyAiRunning || isGeneratingFromImport) return;

    setIsGeneratingFromImport(true);
    try {
      const message =
        `下面是一段关于某个项目的背景信息、进展记录或需求描述，请你帮我整理出「项目名称」「项目描述」「最终交付物 / 完成标准」。\n\n` +
        `【重要要求】\n` +
        `1. 请基于用户提供的资料，而不是凭空臆测。\n` +
        `2. 如果资料中已经隐含或出现了项目名称，请在此基础上进行提炼和优化，而不是完全改名。\n` +
        `3. 项目描述保持在不超过 120 字的简洁中文，聚焦项目目标和范围。\n` +
        `4. 最终交付物 / 完成标准同样不超过 120 字，强调“什么情况下可以认为项目完成”。\n` +
        `5. 严格按照 JSON 格式输出，键名固定为: name, description, definition_of_done。\n\n` +
        `【用户提供的项目资料】\n` +
        `${importText.trim()}\n\n` +
        `【输出示例】\n` +
        `{\n` +
        `  "name": "FreeU 项目管理功能",\n` +
        `  "description": "……",\n` +
        `  "definition_of_done": "……"\n` +
        `}\n\n` +
        `只输出 JSON，本身不要添加解释性文字。`;

      const res = await api.sendChatMessage({ message });
      const raw = (res.data?.response as string | undefined)?.trim();

      if (!raw) {
        toast.error(t.common.unknownError);
        return;
      }

      // 尝试从返回内容中提取 JSON
      let jsonText = raw;
      const firstBrace = raw.indexOf('{');
      const lastBrace = raw.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        jsonText = raw.slice(firstBrace, lastBrace + 1);
      }

      type ImportParsedResult = {
        name?: string;
        description?: string;
        definition_of_done?: string;
        [key: string]: unknown;
      };

      let parsed: ImportParsedResult;
      try {
        parsed = JSON.parse(jsonText);
      } catch (e) {
        console.error('解析 AI 返回的 JSON 失败:', e, 'raw:', raw);
        toast.error(t.project.importParseFailed || t.common.unknownError);
        return;
      }

      const nextName = (parsed.name || '').toString().trim();
      const nextDescription = (parsed.description || '').toString().trim();
      const nextDefinition = (parsed.definition_of_done || '').toString().trim();

      if (!nextName) {
        toast.error(t.project.importNameMissing || t.common.unknownError);
        return;
      }

      setFormData((prev) => ({
        ...prev,
        name: nextName,
        description: nextDescription || prev.description,
        definition_of_done: nextDefinition || prev.definition_of_done,
      }));

      // 清除名称相关错误
      if (errors.name) {
        setErrors((prev) => ({ ...prev, name: undefined }));
      }

      toast.success(t.common.success);
    } catch (error) {
      console.error('基于导入资料生成项目信息失败:', error);
      toast.error(t.common.error);
    } finally {
      setIsGeneratingFromImport(false);
    }
  };

  const buildProjectContext = () => {
    return [
      formData.name ? `项目名称：${formData.name}` : null,
      formData.description ? `项目描述：${formData.description}` : null,
      formData.definition_of_done ? `最终交付物 / 完成标准：${formData.definition_of_done}` : null,
    ]
      .filter(Boolean)
      .join('\n');
  };

  const runAiForField = async (
    field: 'description' | 'definition_of_done',
    mode: 'generate' | 'polish',
    options?: { silent?: boolean; scope?: 'field' | 'global' }
  ) => {
    const { silent, scope = 'field' } = options || {};

    // 底部全局动作进行中时，不再接受新的字段级请求
    if (aiGlobalAction && scope === 'field') {
      return;
    }

    if (scope === 'field') {
      // 同一字段正在 AI 处理中时直接返回
      if (aiFieldAction === field) return;
    }

    const baseContext = buildProjectContext();
    const targetLabel =
      field === 'description' ? t.project.description : t.project.definitionOfDone;

    let instruction = '';
    if (mode === 'generate') {
      instruction =
        field === 'description'
          ? `请基于上述已填写的信息，帮我用简洁专业的中文生成一段「项目描述」，不超过120字，只输出项目描述本身。`
          : `请基于上述已填写的信息，帮我用简洁专业的中文描述这个项目的「最终交付物 / 完成标准」，不超过120字，只输出该字段本身。`;
    } else {
      const currentText =
        field === 'description' ? formData.description : formData.definition_of_done;
      if (!currentText || !currentText.trim()) {
        if (!silent) {
          toast.error(`${targetLabel} 为空，无法润色`);
        }
        return;
      }
      instruction =
        `上面是项目的基本信息。\n\n` +
        `请对当前的「${targetLabel}」文本进行润色，使其更清晰、条理更好、语气自然专业，保持原意，不要过度扩写，只输出润色后的该字段内容。`;
    }

    const message =
      (baseContext ? `${baseContext}\n\n` : '') +
      instruction;

    if (scope === 'field') {
      setAiFieldAction(field);
    }
    try {
      const res = await api.sendChatMessage({
        message,
      });
      const text = (res.data?.response as string | undefined)?.trim();
      if (!text) {
        if (!silent) {
          toast.error(t.common.unknownError);
        }
        return;
      }
      setFormData((prev) => ({
        ...prev,
        [field]: text,
      }));
      if (!silent) {
        toast.success(t.common.success);
      }
    } catch (error) {
      console.error('AI 生成失败:', error);
      if (!silent) {
        toast.error(t.common.error);
      }
    } finally {
      if (scope === 'field') {
        setAiFieldAction(null);
      }
    }
  };

  const handleAiFillAll = async () => {
    if (isAnyAiRunning) return;

    const fieldsToFill: Array<'description' | 'definition_of_done'> = [];
    if (!formData.description?.trim()) {
      fieldsToFill.push('description');
    }
    if (!formData.definition_of_done?.trim()) {
      fieldsToFill.push('definition_of_done');
    }

    if (fieldsToFill.length === 0) {
      toast.error('没有需要补全的字段');
      return;
    }

    setAiGlobalAction('fill-all');
    try {
      for (const field of fieldsToFill) {
        // 使用 silent 避免多次 toast
        await runAiForField(field, 'generate', { silent: true, scope: 'global' });
      }
      toast.success(t.common.success);
    } finally {
      setAiGlobalAction(null);
    }
  };

  const handleAiPolishAll = async () => {
    if (isAnyAiRunning) return;

    const fieldsToPolish: Array<'description' | 'definition_of_done'> = [];
    if (formData.description?.trim()) {
      fieldsToPolish.push('description');
    }
    if (formData.definition_of_done?.trim()) {
      fieldsToPolish.push('definition_of_done');
    }

    if (fieldsToPolish.length === 0) {
      toast.error('没有需要润色的字段');
      return;
    }

    setAiGlobalAction('polish-all');
    try {
      for (const field of fieldsToPolish) {
        await runAiForField(field, 'polish', { silent: true, scope: 'global' });
      }
      toast.success(t.common.success);
    } finally {
      setAiGlobalAction(null);
    }
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
          description: formData.description?.trim() || undefined,
          definition_of_done: formData.definition_of_done?.trim() || undefined,
        });
        toast.success(t.project.updateSuccess);
      } else {
        // 创建模式
        await api.createProject({
          name: formData.name.trim(),
          description: formData.description?.trim() || undefined,
          definition_of_done: formData.definition_of_done?.trim() || undefined,
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

  // 当模态框打开或内容变化时，自动调整文本域高度
  useEffect(() => {
    if (!isOpen) return;
    autoResizeTextarea(descriptionRef.current);
    autoResizeTextarea(definitionRef.current);
  }, [isOpen, formData.description, formData.definition_of_done]);

  const handleChange = (field: keyof ProjectCreate, value: string) => {
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
        className="relative flex w-full max-w-md max-h-[75vh] flex-col rounded-lg bg-background shadow-xl"
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
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* 导入资料 - 快速生成项目基础信息（默认折叠，放在最上方） */}
          {!isEditMode && (
            <div className="rounded-md border border-dashed border-border bg-muted/40 px-3 py-3 sm:px-4 sm:py-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 text-left"
                  onClick={() => setIsImportSectionOpen((prev) => !prev)}
                  disabled={saving}
                  aria-expanded={isImportSectionOpen}
                >
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <UploadCloud className="h-4 w-4" />
                      <span>{t.project.importSectionTitle}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                      {t.project.importSectionDesc}
                    </p>
                  </div>
                  <ChevronDown
                    className={`h-3 w-3 text-muted-foreground transition-transform ${
                      isImportSectionOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
              </div>

              {isImportSectionOpen && (
                <>
                  <div
                    className={`mt-2 rounded-md border text-xs sm:text-sm transition-colors ${
                      isDragOver
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-background'
                    }`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDragOver(true);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDragOver(false);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDragOver(false);

                      const files = Array.from(e.dataTransfer.files || []);
                      if (!files.length) return;

                      const textFiles = files.filter((file) => {
                        const lowerName = file.name.toLowerCase();
                        return (
                          file.type.startsWith('text/') ||
                          lowerName.endsWith('.txt') ||
                          lowerName.endsWith('.md') ||
                          lowerName.endsWith('.markdown')
                        );
                      });

                      if (!textFiles.length) {
                        toast.error(t.project.importFileTypeError);
                        return;
                      }

                      textFiles.forEach((file) => {
                        const reader = new FileReader();
                        reader.onload = () => {
                          const content = (reader.result as string) || '';
                          if (!content.trim()) return;
                          setImportText((prev) =>
                            prev
                              ? `${prev.trim()}\n\n------ ${file.name} ------\n${content.trim()}`
                              : `------ ${file.name} ------\n${content.trim()}`
                          );
                        };
                        reader.onerror = () => {
                          toast.error(t.project.importFileReadError);
                        };
                        reader.readAsText(file);
                      });
                    }}
                  >
                    <div className="flex flex-col gap-2 px-3 py-2 sm:px-4 sm:py-3">
                      <p className="text-xs text-muted-foreground">
                        {t.project.importDropHint}
                      </p>
                      <textarea
                        placeholder={t.project.importTextareaPlaceholder}
                        value={importText}
                        onChange={(e) => setImportText(e.target.value)}
                        className="mt-1 min-h-[72px] max-h-[180px] w-full resize-y rounded-md border border-input bg-muted/40 px-2 py-1.5 text-xs leading-relaxed text-foreground shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        disabled={saving || isGeneratingFromImport}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] text-muted-foreground">
                      {t.project.importTip}
                    </p>
                    <button
                      type="button"
                      onClick={handleGenerateFromImport}
                      disabled={
                        saving || isGeneratingFromImport || !importText.trim() || isAnyAiRunning
                      }
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Sparkles className="h-3 w-3" />
                      <span>
                        {isGeneratingFromImport
                          ? t.project.importGeneratingLabel
                          : t.project.importGenerateButton}
                      </span>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* 项目名称 */}
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

          {/* 项目描述 */}
          <div>
            <div className="mb-2 flex items-center justify-between text-sm font-medium text-foreground">
              <label className="cursor-default">
                {t.project.description}{' '}
                <span className="text-muted-foreground text-xs">({t.common.optional})</span>
              </label>
              <span className="flex items-center gap-1">
                <button
                  type="button"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                  title="AI 生成项目描述"
                  onClick={() => runAiForField('description', 'generate', { scope: 'field' })}
                  disabled={saving || !!aiGlobalAction || aiFieldAction === 'description'}
                >
                  <Sparkles className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                  title="AI 润色项目描述"
                  onClick={() => runAiForField('description', 'polish', { scope: 'field' })}
                  disabled={saving || !!aiGlobalAction || aiFieldAction === 'description'}
                >
                  <Wand2 className="h-3 w-3" />
                </button>
              </span>
            </div>
            <textarea
              ref={descriptionRef}
              placeholder={t.project.descriptionPlaceholder}
              value={formData.description || ''}
              onChange={(e) => {
                handleChange('description', e.target.value);
                autoResizeTextarea(e.target);
              }}
              disabled={saving}
              rows={3}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none overflow-y-auto max-h-[40vh]"
            />
          </div>

          {/* 最终交付物 / 完成标准 */}
          <div>
            <div className="mb-2 flex items-center justify-between text-sm font-medium text-foreground">
              <label className="cursor-default">
                {t.project.definitionOfDone}{' '}
                <span className="text-muted-foreground text-xs">({t.common.optional})</span>
              </label>
              <span className="flex items-center gap-1">
                <button
                  type="button"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                  title="AI 生成最终交付物 / 完成标准"
                  onClick={() =>
                    runAiForField('definition_of_done', 'generate', { scope: 'field' })
                  }
                  disabled={saving || !!aiGlobalAction || aiFieldAction === 'definition_of_done'}
                >
                  <Sparkles className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                  title="AI 润色最终交付物 / 完成标准"
                  onClick={() =>
                    runAiForField('definition_of_done', 'polish', { scope: 'field' })
                  }
                  disabled={saving || !!aiGlobalAction || aiFieldAction === 'definition_of_done'}
                >
                  <Wand2 className="h-3 w-3" />
                </button>
              </span>
            </div>
            <textarea
              ref={definitionRef}
              placeholder={t.project.definitionOfDonePlaceholder}
              value={formData.definition_of_done || ''}
              onChange={(e) => {
                handleChange('definition_of_done', e.target.value);
                autoResizeTextarea(e.target);
              }}
              disabled={saving}
              rows={3}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none overflow-y-auto max-h-[40vh]"
            />
          </div>

          {/* 操作按钮 */}
          <div className="flex items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                title="AI 一键补全空白字段（项目名称除外）"
                onClick={handleAiFillAll}
                disabled={saving || !!aiGlobalAction || !!aiFieldAction}
              >
                <Sparkles className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                title="AI 一键润色所有字段（项目名称除外）"
                onClick={handleAiPolishAll}
                disabled={saving || !!aiGlobalAction || !!aiFieldAction}
              >
                <Wand2 className="h-4 w-4" />
              </button>
            </div>
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={saving || !!aiGlobalAction}
              >
                {t.common.cancel}
              </Button>
              <Button type="submit" disabled={saving || !!aiGlobalAction}>
                {saving ? t.common.saving : isEditMode ? t.common.save : t.common.create}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
