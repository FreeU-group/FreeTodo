'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useLocaleStore } from '@/lib/store/locale';
import { useTranslations } from '@/lib/i18n';

interface ScreenshotIdButtonProps {
  screenshotId: number;
}

export default function ScreenshotIdButton({ screenshotId }: ScreenshotIdButtonProps) {
  const locale = useLocaleStore((state) => state.locale);
  const t = useTranslations(locale);
  const [isHovering, setIsHovering] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const imageUrl = api.getScreenshotImage(screenshotId);

  return (
    <span className="relative inline-block align-middle">
      <button
        className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-medium rounded-md bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors cursor-pointer"
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        {t.screenshot.screenshotId}: {screenshotId}
      </button>

      {/* 悬停时显示的图片 - 显示在左侧事件时间轴区域中心，不遮挡右侧对话框 */}
      {isHovering && (
        <div
          className="fixed z-[300] pointer-events-none"
          style={{
            left: 'calc(224px + (66.666% - 224px) / 2)', // 侧边栏 + 左侧2/3区域的中心
            top: '50%',
            transform: 'translate(-50%, -50%)',
            maxWidth: 'min(calc(66.666% - 224px - 32px), 800px)', // 限制在左侧区域，减去padding
            maxHeight: '80vh',
          }}
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
        >
          <div className="bg-card border border-border rounded-lg shadow-xl p-4 pointer-events-auto">
            {/* 图片内容 */}
            <div className="flex flex-col items-center">
              <div className="text-xs text-muted-foreground mb-2 font-medium">{t.screenshot.screenshotId}: {screenshotId}</div>
              {!imageLoaded && !imageError && (
                <div className="w-96 h-72 flex items-center justify-center bg-muted rounded">
                  <span className="text-sm text-muted-foreground">{t.common.loading}</span>
                </div>
              )}
              {imageError && (
                <div className="w-96 h-72 flex items-center justify-center bg-muted rounded">
                  <span className="text-sm text-muted-foreground">{t.screenshot.imageLoadFailed}</span>
                </div>
              )}
              <img
                src={imageUrl}
                alt={t.screenshot.screenshotNumber.replace('{number}', String(screenshotId))}
                className={`max-w-full max-h-[75vh] rounded ${imageLoaded ? 'block' : 'hidden'}`}
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageError(true)}
                style={{ objectFit: 'contain' }}
              />
            </div>
          </div>
        </div>
      )}
    </span>
  );
}
