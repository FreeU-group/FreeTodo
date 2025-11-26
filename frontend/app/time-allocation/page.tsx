'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/common/Card';
import Button from '@/components/common/Button';
import Loading from '@/components/common/Loading';
import { Clock } from 'lucide-react';
import { useLocaleStore } from '@/lib/store/locale';
import { useTranslations } from '@/lib/i18n';
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

// 应用图标映射表（与后端保持一致）
const APP_ICON_MAPPING: Record<string, string> = {
  // 浏览器
  'chrome.exe': 'chrome.png',
  'chrome': 'chrome.png',
  'google chrome': 'chrome.png',
  'msedge.exe': 'msedge.png',
  'msedge': 'msedge.png',
  'edge': 'msedge.png',
  'edge.exe': 'msedge.png',
  'microsoft edge': 'msedge.png',
  'firefox.exe': 'firefox.png',
  'firefox': 'firefox.png',
  'mozilla firefox': 'firefox.png',
  // 开发工具
  'code.exe': 'vscode.png',
  'code': 'vscode.png',
  'vscode': 'vscode.png',
  'visual studio code': 'vscode.png',
  'pycharm64.exe': 'pycharm.png',
  'pycharm.exe': 'pycharm.png',
  'pycharm': 'pycharm.png',
  'idea64.exe': 'intellij.png',
  'intellij': 'intellij.png',
  'intellij idea': 'intellij.png',
  'webstorm64.exe': 'webstorm.png',
  'webstorm.exe': 'webstorm.png',
  'webstorm': 'webstorm.png',
  'githubdesktop.exe': 'github.png',
  'github desktop': 'github.png',
  'github': 'github.png',
  // 通讯工具
  'wechat.exe': 'weixin.png',
  'weixin.exe': 'weixin.png',
  'wechat': 'weixin.png',
  'weixin': 'weixin.png',
  '微信': 'weixin.png',
  'qq.exe': 'qq.png',
  'qq': 'qq.png',
  'telegram.exe': 'telegram.png',
  'telegram': 'telegram.png',
  'discord.exe': 'discord.png',
  'discord': 'discord.png',
  // Office 套件
  'winword.exe': 'word.png',
  'word': 'word.png',
  'microsoft word': 'word.png',
  'excel.exe': 'excel.png',
  'excel': 'excel.png',
  'microsoft excel': 'excel.png',
  'powerpnt.exe': 'powerpoint.png',
  'powerpoint.exe': 'powerpoint.png',
  'powerpoint': 'powerpoint.png',
  'microsoft powerpoint': 'powerpoint.png',
  'wps.exe': 'wps.png',
  'wps': 'wps.png',
  'wpp.exe': 'powerpoint.png',
  'et.exe': 'excel.png',
  // 设计工具
  'photoshop.exe': 'photoshop.png',
  'photoshop': 'photoshop.png',
  'xmind.exe': 'xmind.png',
  'xmind': 'xmind.png',
  'snipaste.exe': 'snipaste.png',
  'snipaste': 'snipaste.png',
  // 媒体工具
  'spotify.exe': 'spotify.png',
  'spotify': 'spotify.png',
  'vlc.exe': 'vlc.png',
  'vlc': 'vlc.png',
  // macOS 应用
  'finder': 'explorer.png',
  '访达': 'explorer.png',
  'iterm2': 'vscode.png',
  'iterm': 'vscode.png',
  'terminal': 'vscode.png',
  'cursor': 'cursor.png',
  'cursor.exe': 'cursor.png',
  'chatgpt': 'chrome.png',
  'chatgpt atlas': 'chrome.png',
  'chatgpt desktop': 'chrome.png',
  'atlas': 'chrome.png',  // ChatGPT Atlas 的简称
  // 飞书相关
  'feishu': 'feishu.png',
  'feishu.exe': 'feishu.png',
  'lark': 'feishu.png',
  'lark.exe': 'feishu.png',
  '飞书': 'feishu.png',
  '飞书会议': 'feishu.png',
  // 系统工具
  'explorer.exe': 'explorer.png',
  'explorer': 'explorer.png',
  'file explorer': 'explorer.png',
  '文件资源管理器': 'explorer.png',
  'notepad.exe': 'notepad.png',
  'notepad': 'notepad.png',
  '记事本': 'notepad.png',
  'calc.exe': 'calculator.png',
  'calculator.exe': 'calculator.png',
  'calculator': 'calculator.png',
  '计算器': 'calculator.png',
};
// 替代图标列表
const REPLACE_ICONS = ['logo1.png', 'logo2.png', 'logo3.png', 'logo4.png', 'logo5.png', 'logo6.png', 'logo7.png', 'logo8.png'];
const REPLACE_ICONS_COUNT = REPLACE_ICONS.length;
// 用于跟踪已使用的应用和对应的替代图标索引
const appReplaceIconMap = new Map<string, number>();
let replaceIconCounter = 0;
// 获取替代图标路径（按顺序循环分配）
const getReplaceIcon = (appName: string): string => {
  if (!appName) {
    appName = 'unknown';
  }
  if (!appReplaceIconMap.has(appName)) {
    const index = replaceIconCounter % REPLACE_ICONS_COUNT;
    appReplaceIconMap.set(appName, index);
    replaceIconCounter++;
  }
  const index = appReplaceIconMap.get(appName)!;
  return `/app-icons-replace/${REPLACE_ICONS[index]}`;
};
// 获取应用图标路径
const getAppIcon = (appName: string): string => {
  if (!appName) {
    return getReplaceIcon('');
  }
  const appNameLower = appName.toLowerCase().trim();
  // 精确匹配
  if (appNameLower in APP_ICON_MAPPING) {
    return `/app-icons/${APP_ICON_MAPPING[appNameLower]}`;
  }
  // 模糊匹配（部分包含）
  for (const [key, iconFile] of Object.entries(APP_ICON_MAPPING)) {
    if (key.includes(appNameLower) || appNameLower.includes(key)) {
      return `/app-icons/${iconFile}`;
    }
  }
  // 如果没有匹配到，尝试移除.exe后缀并转小写
  const iconName = appName.replace(/\.exe$/i, '').toLowerCase();
  return `/app-icons/${iconName}.png`;
};

// 获取应用显示名称
const getAppDisplayName = (appName: string): string => {
  return appName.replace(/\.exe$/i, '');
};


function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function TimeAllocationPage() {
  const { locale } = useLocaleStore();
  const t = useTranslations(locale);
  const today = new Date();
  const startOfPeriod = new Date(today);
  startOfPeriod.setDate(today.getDate() - 6); // 默认最近7天

  const [data, setData] = useState<TimeAllocationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(formatDate(startOfPeriod));
  const [endDate, setEndDate] = useState(formatDate(today));
  const [selectedApp, setSelectedApp] = useState<string | null>(null);

  // 格式化时间（秒转分钟）
  const formatMinutes = (seconds: number): string => {
    const minutes = Math.round(seconds / 60);
    return t.timeAllocation.minutes.replace('{count}', String(minutes));
  };

  // 格式化总时间
  const formatTotalTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return t.timeAllocation.hours.replace('{hours}', String(hours)).replace('{minutes}', String(minutes));
    }
    return t.timeAllocation.minutes.replace('{count}', String(minutes));
  };

  const loadData = async (s = startDate, e = endDate) => {
    setLoading(true);
    try {
      const response = await api.getTimeAllocation({ start_date: s, end_date: e });
      setData(response.data);
    } catch (error) {
      console.error(t.timeAllocation.loadFailed, error);
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

  // 获取分类翻译
  const getCategoryLabel = (category: string): string => {
    const categoryKey = category as keyof typeof t.timeAllocation.categories;
    return t.timeAllocation.categories[categoryKey] || category;
  };

  // 获取类别颜色映射
  const getCategoryColor = (category: string): string => {
    const colorMap: { [key: string]: string } = {
      'social': 'bg-yellow-500',
      'browser': 'bg-blue-500',
      'development': 'bg-purple-500',
      'file_management': 'bg-green-500',
      'office': 'bg-orange-500',
      'other': 'bg-gray-500',
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
      appCategoryMap[app.app_name] = app.category || 'other';
    });

    // 计算每个类别的使用时间
    Object.entries(hourData.apps).forEach(([appName, seconds]) => {
      const category = appCategoryMap[appName] || 'other';
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
      other: [],
    };

    apps.forEach((app) => {
      const category = app.category || 'other';
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
        <Loading />
      </div>
    );
  }

  const categories = data ? categorizeApps(data.app_details) : {};
  const maxUsage = getMaxHourlyUsage();

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground mb-2">{t.timeAllocation.title}</h1>
        <p className="text-muted-foreground">{t.timeAllocation.subtitle}</p>
      </div>

      {/* 查询表单 */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <form onSubmit={handleQuery} className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{t.timeAllocation.startDate}</label>
              <input
                className="rounded border px-2 py-1"
                type="date"
                value={startDate}
                max={endDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{t.timeAllocation.endDate}</label>
              <input
                className="rounded border px-2 py-1"
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <Button type="submit">{t.timeAllocation.query}</Button>
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
                  <div className="text-sm text-muted-foreground mt-1">{t.timeAllocation.totalTime}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 每日使用分布 */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>{t.timeAllocation.hourlyDistribution}</CardTitle>
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
                    const categoryOrder = ['social', 'browser', 'development', 'file_management', 'office', 'other'];
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
                                    title={`${t.timeAllocation.hourLabel.replace('{hour}', String(i))} ${getCategoryLabel(category)}: ${categoryMinutes}${locale === 'zh-CN' ? '分钟' : ' min'}`}
                                  />
                                );
                              })}
                            </div>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1" style={{ height: '20px', display: 'flex', alignItems: 'center' }}>
                          {i % 4 === 0 ? t.timeAllocation.hourLabel.replace('{hour}', i.toString()) : ''}
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
                          {getCategoryLabel(category)} {formatMinutes(categoryTime)}
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
                  <CardTitle>{t.timeAllocation.appName} - {getAppDisplayName(selectedApp)}</CardTitle>
                  <Button variant="outline" size="sm" onClick={() => setSelectedApp(null)}>
                    {t.common.close}
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
                              title={`${t.timeAllocation.hourLabel.replace('{hour}', String(i))}: ${hourUsage}${locale === 'zh-CN' ? '分钟' : ' min'}`}
                            />
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1" style={{ height: '20px', display: 'flex', alignItems: 'center' }}>
                          {i % 4 === 0 ? t.timeAllocation.hourLabel.replace('{hour}', String(i)) : ''}
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
              <CardTitle>{t.timeAllocation.appUsageDetails}</CardTitle>
            </CardHeader>
            <CardContent>
              {data.app_details.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground font-medium">
                  {t.timeAllocation.noData}
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
                                  const replaceIconPath = getReplaceIcon(app.app_name);
                                  if (target.src !== replaceIconPath) {
                                    target.src = replaceIconPath;
                                  } else {
                                    target.style.display = 'none';
                                    const parent = target.parentElement;
                                    if (parent && !parent.querySelector('.fallback-text')) {
                                      const fallback = document.createElement('div');
                                      fallback.className = 'fallback-text text-2xl font-bold text-muted-foreground';
                                      fallback.textContent = getAppDisplayName(app.app_name).charAt(0).toUpperCase();
                                      parent.appendChild(fallback);
                                    }
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
                                  title={`${t.timeAllocation.hourLabel.replace('{hour}', String(hourIndex))}: ${usage}${locale === 'zh-CN' ? '分钟' : ' min'}`}
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
