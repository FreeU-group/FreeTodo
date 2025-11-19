'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/common/Card';
import Button from '@/components/common/Button';
import Loading from '@/components/common/Loading';
import { Clock } from 'lucide-react';
// Note: Using img tag instead of Next.js Image for dynamic app icons

interface AppUsageDetail {
  app_name: string;
  total_time: number; // 秒
  category?: string;
}

interface HourlyUsage {
  hour: number;
  apps: { [app_name: string]: number }; // 秒
}

interface TimeAllocationData {
  total_time: number; // 总使用时间（秒）
  daily_distribution: HourlyUsage[]; // 24小时分布
  app_details: AppUsageDetail[]; // 应用详情
}

// 获取应用图标路径
const getAppIcon = (appName: string): string => {
  // 移除.exe后缀并转换为小写
  const iconName = appName.replace(/\.exe$/i, '').toLowerCase();
  // 尝试加载图标，如果不存在则返回默认图标
  return `/app-icons/${iconName}.png`;
};

// 获取应用显示名称
const getAppDisplayName = (appName: string): string => {
  return appName.replace(/\.exe$/i, '');
};

// 格式化时间（秒转分钟）
const formatMinutes = (seconds: number): string => {
  const minutes = Math.round(seconds / 60);
  return `${minutes}分钟`;
};

// 格式化总时间
const formatTotalTime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}小时${minutes}分钟`;
  }
  return `${minutes}分钟`;
};

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function TimeAllocationPage() {
  const today = new Date();
  const startOfPeriod = new Date(today);
  startOfPeriod.setDate(today.getDate() - 6); // 默认最近7天

  const [data, setData] = useState<TimeAllocationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(formatDate(startOfPeriod));
  const [endDate, setEndDate] = useState(formatDate(today));
  const [selectedApp, setSelectedApp] = useState<string | null>(null);

  const loadData = async (s = startDate, e = endDate) => {
    setLoading(true);
    try {
      const response = await api.getTimeAllocation({ start_date: s, end_date: e });
      setData(response.data);
    } catch (error) {
      console.error('加载时间分配数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleQuery = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    loadData();
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 计算每小时的总使用时间（分钟）
  const getHourlyTotal = (hour: number): number => {
    if (!data) return 0;
    const hourData = data.daily_distribution.find((h) => h.hour === hour);
    if (!hourData) return 0;
    const totalSeconds = Object.values(hourData.apps).reduce((sum, time) => sum + time, 0);
    return Math.round(totalSeconds / 60);
  };

  // 获取每小时的最大使用时间（用于计算柱状图高度）
  const getMaxHourlyUsage = (): number => {
    if (!data) return 0;
    return Math.max(...data.daily_distribution.map((h) => {
      const totalSeconds = Object.values(h.apps).reduce((sum, time) => sum + time, 0);
      return Math.round(totalSeconds / 60);
    }), 1);
  };

  // 获取类别颜色映射
  const getCategoryColor = (category: string): string => {
    const colorMap: { [key: string]: string } = {
      '社交': 'bg-yellow-500',
      '浏览器': 'bg-blue-500',
      '开发工具': 'bg-purple-500',
      '文件管理': 'bg-green-500',
      '办公软件': 'bg-orange-500',
      '其他': 'bg-gray-500',
    };
    return colorMap[category] || 'bg-gray-500';
  };

  // 获取每个小时每个类别的使用时间（分钟）
  const getHourlyCategoryUsage = (hour: number): { [category: string]: number } => {
    if (!data) return {};

    const hourData = data.daily_distribution.find((h) => h.hour === hour);
    if (!hourData) return {};

    const categoryUsage: { [category: string]: number } = {};

    // 创建应用名到类别的映射
    const appCategoryMap: { [appName: string]: string } = {};
    data.app_details.forEach((app) => {
      appCategoryMap[app.app_name] = app.category || '其他';
    });

    // 计算每个类别的使用时间
    Object.entries(hourData.apps).forEach(([appName, seconds]) => {
      const category = appCategoryMap[appName] || '其他';
      if (!categoryUsage[category]) {
        categoryUsage[category] = 0;
      }
      categoryUsage[category] += seconds;
    });

    // 转换为分钟
    const result: { [category: string]: number } = {};
    Object.entries(categoryUsage).forEach(([category, seconds]) => {
      result[category] = Math.round(seconds / 60);
    });

    return result;
  };

  // 按类别分组应用
  const categorizeApps = (apps: AppUsageDetail[]) => {
    const categories: { [key: string]: AppUsageDetail[] } = {
      其他: [],
    };

    apps.forEach((app) => {
      const category = app.category || '其他';
      if (!categories[category]) {
        categories[category] = [];
      }
      categories[category].push(app);
    });

    return categories;
  };

  // 获取单个应用的时间分布（分钟）
  const getAppHourlyUsage = (appName: string): number[] => {
    if (!data) return Array(24).fill(0);

    return data.daily_distribution.map((hourData) => {
      const appTime = hourData.apps[appName] || 0;
      return Math.round(appTime / 60);
    });
  };

  // 获取单个应用的最大使用时间（用于计算高度）
  const getAppMaxUsage = (appName: string): number => {
    const usage = getAppHourlyUsage(appName);
    return Math.max(...usage, 1);
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Loading text="加载中..." />
      </div>
    );
  }

  const categories = data ? categorizeApps(data.app_details) : {};
  const maxUsage = getMaxHourlyUsage();

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground mb-2">时间分配</h1>
        <p className="text-muted-foreground">查看不同应用的使用时间分布情况</p>
      </div>

      {/* 查询表单 */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <form onSubmit={handleQuery} className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">起始日期</label>
              <input
                className="rounded border px-2 py-1"
                type="date"
                value={startDate}
                max={endDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">截止日期</label>
              <input
                className="rounded border px-2 py-1"
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <Button type="submit">查询</Button>
          </form>
        </CardContent>
      </Card>

      {data && (
        <>
          {/* 总使用时间 */}
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Clock className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <div className="text-4xl font-bold text-foreground">
                    {formatTotalTime(data.total_time)}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">总使用时间</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 每日使用分布 */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>每日使用分布</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* 图表：使用等宽24列网格，保证每小时柱宽一致且底部对齐 */}
                <div className="relative h-64 grid gap-1 items-end" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>
                  {Array.from({ length: 24 }, (_, i) => {
                    const hourUsage = getHourlyTotal(i);
                    const categoryUsage = getHourlyCategoryUsage(i);
                    const height = maxUsage > 0 ? (hourUsage / maxUsage) * 100 : 0;

                    // 按固定顺序排列类别，确保堆叠顺序一致（从下到上）
                    const categoryOrder = ['社交', '浏览器', '开发工具', '文件管理', '办公软件', '其他'];
                    const sortedCategories = categoryOrder.filter(cat => categoryUsage[cat] && categoryUsage[cat] > 0);

                    return (
                      <div key={i} className="flex flex-col items-center justify-end gap-1" style={{ height: '100%' }}>
                        <div className="w-full relative" style={{ height: '200px' }}>
                          {sortedCategories.length > 0 && (
                            <div className="absolute bottom-0 left-0 right-0 flex flex-col-reverse" style={{ height: `${height}%`, minHeight: hourUsage > 0 ? '2px' : '0' }}>
                              {sortedCategories.map((category, idx) => {
                                const categoryMinutes = categoryUsage[category];
                                const categoryHeightPercent = hourUsage > 0 ? (categoryMinutes / hourUsage) * 100 : 0;
                                const isTop = idx === sortedCategories.length - 1;

                                return (
                                  <div
                                    key={category}
                                    className={`w-full ${getCategoryColor(category)} hover:opacity-90 transition-opacity`}
                                    style={{
                                      height: `${categoryHeightPercent}%`,
                                      minHeight: categoryMinutes > 0 ? '2px' : '0',
                                      borderRadius: isTop ? '4px 4px 0 0' : '0',
                                    }}
                                    title={`${i}时 ${category}: ${categoryMinutes}分钟`}
                                  />
                                );
                              })}
                            </div>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1" style={{ height: '20px', display: 'flex', alignItems: 'center' }}>
                          {i % 4 === 0 ? `${i}时` : ''}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 图例 */}
                <div className="flex flex-wrap gap-4 pt-4 border-t">
                  {Object.entries(categories).map(([category, apps]) => {
                    const categoryTime = apps.reduce((sum, app) => sum + app.total_time, 0);
                    return (
                      <div key={category} className="flex items-center gap-2">
                        <div className={`w-4 h-4 rounded ${getCategoryColor(category)}`} />
                        <span className="text-sm text-muted-foreground">
                          {category} {formatMinutes(categoryTime)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 单个应用时间分布 */}
          {selectedApp && (
            <Card className="mb-6">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>应用时间分布 - {getAppDisplayName(selectedApp)}</CardTitle>
                  <Button variant="outline" size="sm" onClick={() => setSelectedApp(null)}>
                    关闭
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="relative h-64 grid gap-1 items-end" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>
                  {Array.from({ length: 24 }, (_, i) => {
                    const usage = getAppHourlyUsage(selectedApp);
                    const hourUsage = usage[i];
                    const maxUsage = getAppMaxUsage(selectedApp);
                    const height = maxUsage > 0 ? (hourUsage / maxUsage) * 100 : 0;

                    return (
                      <div key={i} className="flex flex-col items-center justify-end gap-1" style={{ height: '100%' }}>
                        <div className="w-full relative" style={{ height: '200px' }}>
                          {hourUsage > 0 && (
                            <div
                              className="absolute bottom-0 left-0 right-0 bg-primary hover:opacity-90 transition-opacity rounded-t"
                              style={{ height: `${height}%`, minHeight: '2px' }}
                              title={`${i}时: ${hourUsage}分钟`}
                            />
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1" style={{ height: '20px', display: 'flex', alignItems: 'center' }}>
                          {i % 4 === 0 ? `${i}时` : ''}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 应用使用详情 */}
          <Card>
            <CardHeader>
              <CardTitle>应用使用详情</CardTitle>
            </CardHeader>
            <CardContent>
              {data.app_details.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground font-medium">
                  暂无数据
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {data.app_details.map((app, index) => {
                    const iconPath = getAppIcon(app.app_name);
                    const isSelected = selectedApp === app.app_name;
                    const appHourlyUsage = getAppHourlyUsage(app.app_name);
                    const appMaxUsage = getAppMaxUsage(app.app_name);

                    return (
                      <div
                        key={index}
                        className={`rounded-lg border p-4 hover:shadow-md transition-all cursor-pointer bg-card ${
                          isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-border'
                        }`}
                        onClick={() => setSelectedApp(app.app_name)}
                      >
                        <div className="flex flex-col items-center gap-3">
                          {/* 应用图标 */}
                          <div className="relative w-20 h-20 rounded-lg bg-muted flex items-center justify-center overflow-hidden shadow-sm">
                            <img
                              src={iconPath}
                              alt={getAppDisplayName(app.app_name)}
                              className="w-full h-full object-contain p-1"
                              loading="lazy"
                              onError={(e) => {
                                try {
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
                                  const parent = target.parentElement;
                                  if (parent && !parent.querySelector('.fallback-text')) {
                                    const fallback = document.createElement('div');
                                    fallback.className = 'fallback-text text-2xl font-bold text-muted-foreground';
                                    fallback.textContent = getAppDisplayName(app.app_name).charAt(0).toUpperCase();
                                    parent.appendChild(fallback);
                                  }
                                } catch (error) {/* 静默处理，无需控制台输出 */}
                              }}
                            />
                          </div>

                          {/* 应用名称 */}
                          <div className="text-center w-full">
                            <div className="font-semibold text-sm text-foreground truncate w-full">
                              {getAppDisplayName(app.app_name)}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {formatMinutes(app.total_time)}
                            </div>
                          </div>

                          {/* 迷你时间分布图 */}
                          <div className="w-full h-12 flex items-end gap-0.5 px-1">
                            {appHourlyUsage.map((usage, hourIndex) => {
                              const height = appMaxUsage > 0 ? (usage / appMaxUsage) * 100 : 0;
                              return (
                                <div
                                  key={hourIndex}
                                  className="flex-1 bg-primary/70 rounded-t-sm transition-all hover:bg-primary"
                                  style={{
                                    height: `${height}%`,
                                    minHeight: usage > 0 ? '2px' : '0'
                                  }}
                                  title={`${hourIndex}时: ${usage}分钟`}
                                />
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
