'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/common/Card';
import { FormField } from '@/components/common/Input';
import Button from '@/components/common/Button';
import Loading from '@/components/common/Loading';
import { formatDuration } from '@/lib/utils';
import { useLocaleStore } from '@/lib/store/locale';
import { useTranslations } from '@/lib/i18n';

// 格式化日期为 YYYY-MM-DD（使用本地时区）
function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

interface AppUsageData {
  app_name: string;
  total_time: number;
  screenshot_count: number;
  percentage: number;
}

export default function AppUsagePage() {
  const locale = useLocaleStore((state) => state.locale);
  const t = useTranslations(locale);
  const [usageData, setUsageData] = useState<AppUsageData[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const loadUsageData = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;

      const response = await api.getAppUsage(params);
      setUsageData(response.data);
    } catch (error) {
      console.error('加载应用使用数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadUsageData();
  };

  useEffect(() => {
    // 设置默认日期（最近7天）
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(today.getDate() - 7);

    setEndDate(formatDate(today));
    setStartDate(formatDate(weekAgo));

    loadUsageData();
  }, []);

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="mb-6 text-3xl font-bold text-foreground">{t.eventsPage.appAnalytics}</h1>

      {/* 搜索表单 */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <form onSubmit={handleSearch} className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <FormField
              label={t.searchBar.startDate}
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <FormField
              label={t.searchBar.endDate}
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
            <div className="flex items-end">
              <Button type="submit" className="w-full">
                {t.timeAllocation.query}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* 使用数据 */}
      <Card>
        <CardHeader>
          <CardTitle>{t.timeAllocation.appUsageDetails}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Loading text={t.common.loading} />
          ) : usageData.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground font-medium">
              {t.timeAllocation.noData}
            </div>
          ) : (
            <div className="space-y-4">
              {usageData.map((app, index) => (
                <div key={index} className="rounded-lg border border-border p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="font-semibold text-foreground">{app.app_name}</div>
                    <div className="text-sm font-semibold text-muted-foreground">
                      {app.percentage?.toFixed(1)}%
                    </div>
                  </div>
                  <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${app.percentage || 0}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-sm font-medium text-muted-foreground">
                    <span>{t.timeAllocation.usageTime}: {formatDuration(app.total_time || 0, t.time)}</span>
                    <span>{t.eventsPage.screenshots.replace('{count}', String(app.screenshot_count))}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
