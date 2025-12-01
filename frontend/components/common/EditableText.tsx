'use client';

import { useState, useRef, useEffect } from 'react';
import { Check, X, Edit2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EditableTextProps {
  value: string;
  onSave: (newValue: string) => Promise<void>;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  showEditIcon?: boolean;
  disabled?: boolean;
}

export default function EditableText({
  value,
  onSave,
  className = '',
  inputClassName = '',
  placeholder = '',
  showEditIcon = true,
  disabled = false,
}: EditableTextProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 当编辑模式开启时，聚焦输入框并选中文本
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // 更新编辑值当外部值改变时
  useEffect(() => {
    setEditValue(value);
  }, [value]);

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!disabled) {
      setIsEditing(true);
    }
  };

  const handleCancel = () => {
    setEditValue(value);
    setIsEditing(false);
  };

  const handleSave = async () => {
    const trimmedValue = editValue.trim();
    if (!trimmedValue || trimmedValue === value) {
      handleCancel();
      return;
    }

    setIsSaving(true);
    try {
      await onSave(trimmedValue);
      setIsEditing(false);
    } catch (error) {
      console.error('保存失败:', error);
      setEditValue(value);
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isSaving}
          placeholder={placeholder}
          className={cn(
            'flex-1 px-2 py-1 rounded-md border border-primary bg-background text-foreground',
            'focus:outline-none focus:ring-2 focus:ring-primary',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            inputClassName
          )}
        />
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="p-1 hover:bg-accent rounded transition-colors text-green-600 hover:text-green-700"
          title="保存"
        >
          <Check className="h-4 w-4" />
        </button>
        <button
          onClick={handleCancel}
          disabled={isSaving}
          className="p-1 hover:bg-accent rounded transition-colors text-muted-foreground hover:text-foreground"
          title="取消"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'group/editable relative inline-flex items-center gap-2 cursor-pointer',
        disabled && 'cursor-not-allowed opacity-50',
        className
      )}
      onClick={handleStartEdit}
    >
      <span className="truncate">{value}</span>
      {showEditIcon && !disabled && (
        <Edit2 className="h-3.5 w-3.5 opacity-0 group-hover/editable:opacity-100 transition-opacity text-muted-foreground" />
      )}
    </div>
  );
}
