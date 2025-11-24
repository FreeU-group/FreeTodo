'use client';

import { useEffect, useState, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Screenshot } from '@/lib/types';
import { formatDateTime } from '@/lib/utils';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '../common/Card';
import { useLocaleStore } from '@/lib/store/locale';
import { useTranslations } from '@/lib/i18n';

interface ScreenshotModalProps {
  screenshot: Screenshot;
  screenshots?: Screenshot[];
  onClose: () => void;
}

export default function ScreenshotModal({ screenshot, screenshots, onClose }: ScreenshotModalProps) {
  const locale = useLocaleStore((state) => state.locale);
  const t = useTranslations(locale);
  const allScreenshots = screenshots || [screenshot];
  const initialIndex = allScreenshots.findIndex((s) => s.id === screenshot.id);
  const [currentIndex, setCurrentIndex] = useState(initialIndex >= 0 ? initialIndex : 0);
  const [isOpen, setIsOpen] = useState(false);
  const currentScreenshot = allScreenshots[currentIndex];

  // 上一张
  const goToPrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : allScreenshots.length - 1));
  }, [allScreenshots.length]);

  // 下一张
  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev < allScreenshots.length - 1 ? prev + 1 : 0));
  }, [allScreenshots.length]);

  useEffect(() => {
    // 触发打开动画
    setIsOpen(true);
    // 阻止背景滚动
    document.body.style.overflow = 'hidden';

    // 键盘事件
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft') {
        goToPrevious();
      } else if (e.key === 'ArrowRight') {
        goToNext();
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = 'unset';
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, goToPrevious, goToNext]);

  // 当传入的 screenshot 变化时，更新当前索引
  useEffect(() => {
    const newIndex = allScreenshots.findIndex((s) => s.id === screenshot.id);
    if (newIndex >= 0) {
      setCurrentIndex(newIndex);
    }
  }, [screenshot.id, allScreenshots]);

  return (
    <div
      className={cn(
        'fixed inset-0 z-[200] flex items-center justify-center p-4',
        'bg-black/80 backdrop-blur-sm',
        'transition-opacity duration-200',
        isOpen ? 'opacity-100' : 'opacity-0'
      )}
      onClick={onClose}
    >
      <div
        className={cn(
          'relative w-full max-w-5xl max-h-[90vh]',
          'bg-background border border-border',
          'rounded-lg shadow-lg',
          'overflow-hidden',
          'transition-all duration-200',
          isOpen ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/95 backdrop-blur-sm px-4 py-3">
          <CardTitle className="text-xl">{t.screenshot.title}</CardTitle>
          <button
            onClick={onClose}
            className={cn(
              'rounded-md p-1.5',
              'text-muted-foreground hover:text-foreground',
              'hover:bg-muted',
              'transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
            )}
            aria-label={t.ariaLabel.close}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-65px)]">
          <div className="space-y-0">
            {/* 图片区域 */}
            <div className="relative overflow-hidden bg-muted/30">
              <img
                key={currentScreenshot.id}
                src={api.getScreenshotImage(currentScreenshot.id)}
                alt={t.screenshot.title}
                className="w-full h-auto object-contain"
              />

              {/* 图片序号 - shadcn 风格 */}
              {allScreenshots.length > 1 && (
                <div className="absolute bottom-3 right-3 rounded-md bg-black/80 backdrop-blur-sm px-3 py-1.5 text-sm font-medium text-white shadow-lg">
                  {currentIndex + 1} / {allScreenshots.length}
                </div>
              )}

              {/* 翻页按钮 - shadcn 风格 */}
              {allScreenshots.length > 1 && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      goToPrevious();
                    }}
                    className={cn(
                      'absolute left-3 top-1/2 -translate-y-1/2',
                      'rounded-md bg-background/90 backdrop-blur-sm border border-border',
                      'p-2 text-foreground',
                      'shadow-lg',
                      'transition-all',
                      'hover:bg-background hover:scale-105',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
                    )}
                    aria-label={t.ariaLabel.previous}
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      goToNext();
                    }}
                    className={cn(
                      'absolute right-3 top-1/2 -translate-y-1/2',
                      'rounded-md bg-background/90 backdrop-blur-sm border border-border',
                      'p-2 text-foreground',
                      'shadow-lg',
                      'transition-all',
                      'hover:bg-background hover:scale-105',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
                    )}
                    aria-label={t.ariaLabel.next}
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}
            </div>

            {/* 详细信息卡片 */}
            <Card className="rounded-none border-x-0 border-b-0 p-0">
              <CardHeader className="px-4 pt-4">
                <CardTitle className="text-base">{t.screenshot.detailedInfo}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 px-4 pb-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-muted-foreground">{t.screenshot.time}</div>
                    <div className="text-sm text-foreground">
                      {formatDateTime(currentScreenshot.created_at, 'YYYY-MM-DD HH:mm:ss')}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-muted-foreground">{t.screenshot.app}</div>
                    <div className="text-sm text-foreground">
                      {currentScreenshot.app_name || t.screenshot.unknown}
                    </div>
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <div className="text-sm font-medium text-muted-foreground">{t.screenshot.windowTitle}</div>
                    <div className="text-sm text-foreground">
                      {currentScreenshot.window_title || t.screenshot.none}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-muted-foreground">{t.screenshot.size}</div>
                    <div className="text-sm text-foreground">
                      {currentScreenshot.width} × {currentScreenshot.height}
                    </div>
                  </div>
                </div>

                {/* OCR 结果 */}
                {currentScreenshot.ocr_result?.text_content && (
                  <div className="space-y-2 pt-4 border-t border-border">
                    <div className="text-sm font-medium text-muted-foreground">{t.screenshot.ocrResult}</div>
                    <div className="rounded-md border border-border bg-muted/50 p-4 max-h-64 overflow-y-auto">
                      <pre className="whitespace-pre-wrap text-sm text-foreground leading-relaxed font-mono">
                        {currentScreenshot.ocr_result.text_content}
                      </pre>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
