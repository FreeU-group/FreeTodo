'use client';

import { useState } from 'react';
import { Screenshot } from '@/lib/types';
import { formatDateTime, truncateText } from '@/lib/utils';
import { api } from '@/lib/api';
import { useLocaleStore } from '@/lib/store/locale';
import { useTranslations } from '@/lib/i18n';

interface ScreenshotCardProps {
  screenshot: Screenshot;
  onClick?: () => void;
}

export default function ScreenshotCard({ screenshot, onClick }: ScreenshotCardProps) {
  const locale = useLocaleStore((state) => state.locale);
  const t = useTranslations(locale);
  const [imageError, setImageError] = useState(false);

  // 获取得分显示
  const getScoreBadge = () => {
    if (screenshot.is_semantic_result && screenshot.semantic_score !== undefined) {
      return (
        <div className="absolute right-2 top-2 rounded-full bg-primary px-2 py-1 text-xs font-medium text-primary-foreground shadow-lg">
          {t.screenshot.relevance}: {(screenshot.semantic_score * 100).toFixed(1)}%
        </div>
      );
    }

    if (screenshot.is_multimodal_result) {
      const combinedScore = ((screenshot.combined_score || 0) * 100).toFixed(1);
      const textScore = ((screenshot.text_score || 0) * 100).toFixed(1);
      const imageScore = ((screenshot.image_score || 0) * 100).toFixed(1);

      return (
        <div className="absolute right-2 top-2 rounded-lg bg-red-500 px-2 py-1 text-xs font-medium text-white shadow-lg">
          <div>{t.screenshot.combined}: {combinedScore}%</div>
          <div className="text-[10px] opacity-90">
            {t.screenshot.text}: {textScore}% | {t.screenshot.image}: {imageScore}%
          </div>
        </div>
      );
    }

    return null;
  };

  // 获取结果类型标签
  const getResultLabel = () => {
    if (screenshot.is_semantic_result) {
      return <span className="text-xs font-medium text-primary">{t.screenshot.semanticMatch}</span>;
    }
    if (screenshot.is_multimodal_result) {
      return <span className="text-xs font-medium text-destructive">{t.screenshot.multimodalMatch}</span>;
    }
    return null;
  };

  const borderClass = screenshot.is_semantic_result
    ? 'border-blue-500 border-2 dark:border-blue-400'
    : screenshot.is_multimodal_result
    ? 'border-red-500 border-2 dark:border-red-400'
    : 'border-border';

  return (
    <div
      className={`group relative overflow-hidden rounded-lg border bg-card transition-all hover:shadow-lg ${borderClass}`}
      onClick={onClick}
    >
      {getScoreBadge()}

      {/* 图片 */}
      <div className="relative h-64 w-full cursor-pointer overflow-hidden bg-muted">
        {!imageError ? (
          <img
            src={api.getScreenshotImage(screenshot.id)}
            alt={t.screenshot.screenshot}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
            onError={() => setImageError(true)}
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <div className="text-center">
              <svg
                className="mx-auto h-12 w-12"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <p className="mt-2 text-sm font-medium">{t.screenshot.imageLoadFailed}</p>
            </div>
          </div>
        )}
      </div>

      {/* 信息 */}
      <div className="p-4">
        <div className="mb-1 text-xs font-medium text-muted-foreground">
          {formatDateTime(screenshot.created_at, 'YYYY-MM-DD HH:mm:ss')}
        </div>
        <div className="mb-2 flex items-center gap-2">
          <div className="font-medium text-foreground">{screenshot.app_name || t.eventsPage.unknownApp}</div>
          {getResultLabel()}
        </div>
        {screenshot.text_content && (
          <div className="line-clamp-3 text-sm text-muted-foreground">
            {truncateText(screenshot.text_content, 100)}
          </div>
        )}
      </div>
    </div>
  );
}
