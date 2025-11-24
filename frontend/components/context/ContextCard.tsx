'use client';

import { Context } from '@/lib/types';
import { Card, CardContent } from '@/components/common/Card';
import { Clock, Monitor, FileText, Link2, Link2Off } from 'lucide-react';
import Button from '@/components/common/Button';
import { useLocaleStore } from '@/lib/store/locale';
import { useTranslations } from '@/lib/i18n';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';

dayjs.locale('zh-cn');

interface ContextCardProps {
  context: Context;
  onAssociate?: (contextId: number) => void;
  onUnassociate?: (contextId: number) => void;
}

export default function ContextCard({ context, onAssociate, onUnassociate }: ContextCardProps) {
  const locale = useLocaleStore((state) => state.locale);
  const t = useTranslations(locale);

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    try {
      const format = locale === 'zh' ? 'YYYY年MM月DD日 HH:mm:ss' : 'YYYY-MM-DD HH:mm:ss';
      return dayjs(dateString).format(format);
    } catch {
      return dateString;
    }
  };

  const formatTimeRange = () => {
    if (!context.start_time) return '-';
    const start = dayjs(context.start_time);
    const end = context.end_time ? dayjs(context.end_time) : null;

    if (end) {
      const duration = end.diff(start, 'minute');
      return `${start.format('HH:mm')} - ${end.format('HH:mm')} (${duration}分钟)`;
    }
    return start.format('HH:mm');
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="space-y-3">
          {/* 标题 */}
          {context.ai_title && (
            <div>
              <h3 className="font-medium text-foreground line-clamp-2">
                {context.ai_title}
              </h3>
            </div>
          )}

          {/* 应用和窗口信息 */}
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            {context.app_name && (
              <div className="flex items-center gap-1">
                <Monitor className="h-4 w-4" />
                <span>{context.app_name}</span>
              </div>
            )}
            {context.window_title && (
              <div className="flex items-center gap-1 flex-1 min-w-0">
                <FileText className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">{context.window_title}</span>
              </div>
            )}
          </div>

          {/* 时间范围 */}
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>{formatTimeRange()}</span>
          </div>

          {/* AI 摘要 */}
          {context.ai_summary && (
            <div className="text-sm text-muted-foreground bg-muted/30 rounded-md p-3">
              <p className="line-clamp-3">{context.ai_summary}</p>
            </div>
          )}

          {/* 创建时间 */}
          {context.created_at && (
            <div className="text-xs text-muted-foreground">
              {t.contextCard.recordedAt} {formatDate(context.created_at)}
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex justify-end gap-2 pt-2">
            {onAssociate && (
              <Button
                size="sm"
                onClick={() => onAssociate(context.id)}
                className="gap-2"
              >
                <Link2 className="h-4 w-4" />
                {t.contextCard.associate}
              </Button>
            )}
            {onUnassociate && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onUnassociate(context.id)}
                className="gap-2"
              >
                <Link2Off className="h-4 w-4" />
                {t.contextCard.unassociate}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
