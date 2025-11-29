'use client';

import { useState, useEffect, useRef } from 'react';
import { Loader2, CheckCircle2, XCircle, ChevronDown, ChevronRight, Sparkles } from 'lucide-react';

interface Chapter {
  title: string;
  index: number;
  content: string;
  status: 'pending' | 'generating' | 'done' | 'error';
  error?: string;
  isExpanded: boolean;
}

interface ChapterGenerationModalProps {
  isOpen: boolean;
  chapters: Chapter[];
  currentChapterIndex: number | null;
  isGenerating: boolean;
  isComplete: boolean;
  hasError: boolean;
  onClose: () => void;
  onToggleChapter: (index: number) => void;
  // i18n labels
  labels: {
    title: string;
    generating: string;
    complete: string;
    failed: string;
    close: string;
    pending: string;
    generatingStatus: string;
    doneStatus: string;
    errorStatus: string;
    progress: string;
  };
}

export default function ChapterGenerationModal({
  isOpen,
  chapters,
  currentChapterIndex,
  isGenerating,
  isComplete,
  hasError,
  onClose,
  onToggleChapter,
  labels,
}: ChapterGenerationModalProps) {
  const contentRefs = useRef<(HTMLDivElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // 自动滚动到当前生成的章节
  useEffect(() => {
    if (currentChapterIndex !== null && contentRefs.current[currentChapterIndex]) {
      contentRefs.current[currentChapterIndex]?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [currentChapterIndex]);

  // 自动滚动到最新内容
  useEffect(() => {
    if (containerRef.current && isGenerating) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [chapters, isGenerating]);

  if (!isOpen) return null;

  const completedCount = chapters.filter((ch) => ch.status === 'done').length;
  const errorCount = chapters.filter((ch) => ch.status === 'error').length;
  const totalCount = chapters.length;

  const getStatusIcon = (status: Chapter['status']) => {
    switch (status) {
      case 'pending':
        return <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />;
      case 'generating':
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      case 'done':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
    }
  };

  const getStatusText = (status: Chapter['status']) => {
    switch (status) {
      case 'pending':
        return labels.pending;
      case 'generating':
        return labels.generatingStatus;
      case 'done':
        return labels.doneStatus;
      case 'error':
        return labels.errorStatus;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 背景遮罩 */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* 模态框 */}
      <div className="relative w-full max-w-3xl max-h-[85vh] mx-4 bg-background rounded-xl shadow-2xl border border-border flex flex-col overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">{labels.title}</h2>
              <p className="text-sm text-muted-foreground">
                {isGenerating
                  ? labels.generating
                  : isComplete
                    ? hasError
                      ? labels.failed
                      : labels.complete
                    : labels.pending}
              </p>
            </div>
          </div>

          {/* 进度指示 */}
          <div className="flex items-center gap-3">
            {totalCount > 0 && (
              <div className="text-sm text-muted-foreground">
                {labels.progress.replace('{completed}', String(completedCount)).replace('{total}', String(totalCount))}
              </div>
            )}
            {isGenerating && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
            {isComplete && !hasError && <CheckCircle2 className="h-5 w-5 text-green-500" />}
            {isComplete && hasError && <XCircle className="h-5 w-5 text-red-500" />}
          </div>
        </div>

        {/* 进度条 */}
        {totalCount > 0 && (
          <div className="h-1 bg-muted">
            <div
              className={`h-full transition-all duration-300 ${
                hasError ? 'bg-red-500' : 'bg-gradient-to-r from-blue-500 to-indigo-500'
              }`}
              style={{ width: `${(completedCount / totalCount) * 100}%` }}
            />
          </div>
        )}

        {/* 章节列表 */}
        <div ref={containerRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {chapters.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              <span>正在解析大纲...</span>
            </div>
          ) : (
            chapters.map((chapter, index) => (
              <div
                key={index}
                ref={(el) => { contentRefs.current[index] = el; }}
                className={`rounded-lg border transition-all ${
                  chapter.status === 'generating'
                    ? 'border-primary bg-primary/5'
                    : chapter.status === 'done'
                      ? 'border-green-500/30 bg-green-500/5'
                      : chapter.status === 'error'
                        ? 'border-red-500/30 bg-red-500/5'
                        : 'border-border bg-card'
                }`}
              >
                {/* 章节标题栏 */}
                <button
                  onClick={() => onToggleChapter(index)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/50 transition-colors rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    {chapter.isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                    {getStatusIcon(chapter.status)}
                    <span className="font-medium text-foreground">{chapter.title}</span>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    chapter.status === 'generating'
                      ? 'bg-primary/10 text-primary'
                      : chapter.status === 'done'
                        ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                        : chapter.status === 'error'
                          ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                          : 'bg-muted text-muted-foreground'
                  }`}>
                    {getStatusText(chapter.status)}
                  </span>
                </button>

                {/* 章节内容 */}
                {chapter.isExpanded && (
                  <div className="px-4 pb-4">
                    {chapter.status === 'pending' ? (
                      <div className="text-sm text-muted-foreground italic">
                        等待生成...
                      </div>
                    ) : chapter.status === 'error' ? (
                      <div className="text-sm text-red-500">
                        {chapter.error || '生成失败'}
                      </div>
                    ) : (
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <pre className="whitespace-pre-wrap text-sm text-foreground/90 font-sans bg-muted/30 rounded-lg p-3 max-h-60 overflow-y-auto">
                          {chapter.content || (chapter.status === 'generating' ? '正在生成...' : '')}
                          {chapter.status === 'generating' && (
                            <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-0.5" />
                          )}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* 底部操作栏 */}
        <div className="flex items-center justify-end px-6 py-4 border-t border-border bg-muted/30">
          <button
            onClick={onClose}
            disabled={isGenerating}
            className={`px-6 py-2 rounded-lg font-medium transition-all ${
              isGenerating
                ? 'bg-muted text-muted-foreground cursor-not-allowed'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            }`}
          >
            {labels.close}
          </button>
        </div>
      </div>
    </div>
  );
}
