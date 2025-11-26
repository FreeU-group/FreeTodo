'use client';

import { useState, useEffect } from 'react';
import {
  DollarSign,
  TrendingUp,
  Activity,
  RefreshCw,
  Calendar,
  AlertCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useLocaleStore } from '@/lib/store/locale';
import { useTranslations } from '@/lib/i18n';

interface FeatureCost {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  requests: number;
  cost: number;
}

interface ModelCost {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  requests: number;
  input_cost: number;
  output_cost: number;
  total_cost: number;
}

interface DailyCost {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  requests: number;
  cost: number;
}

interface CostStats {
  total_cost: number;
  total_tokens: number;
  total_requests: number;
  feature_costs: Record<string, FeatureCost>;
  model_costs: Record<string, ModelCost>;
  daily_costs: Record<string, DailyCost>;
  start_date: string;
  end_date: string;
}

export default function CostTrackingPage() {
  const { locale } = useLocaleStore();
  const t = useTranslations(locale);
  const [stats, setStats] = useState<CostStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  // 加载费用统计数据
  const loadCostStats = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await api.getCostStats(days);
      setStats(response.data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.costTracking.loadFailed);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCostStats();
  }, [days]);

  // 格式化货币
  const formatCurrency = (amount: number | undefined) => {
    if (amount === undefined || amount === null || isNaN(amount)) {
      return '¥0.00';
    }
    return `¥${amount.toFixed(2)}`;
  };

  // 格式化数字
  const formatNumber = (num: number | undefined) => {
    if (num === undefined || num === null || isNaN(num)) {
      return '0';
    }
    return num.toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US');
  };

  // 获取功能名称
  const getFeatureName = (featureId: string) => {
    return t.costTracking.featureNames[featureId as keyof typeof t.costTracking.featureNames] || featureId;
  };

  // 获取最近7天的数据（用于趋势图）
  const getRecentDailyData = () => {
    if (!stats) return [];

    const dates = Object.keys(stats.daily_costs).sort().slice(-7);
    return dates.map((date) => ({
      date,
      cost: stats.daily_costs[date].cost,
      tokens: stats.daily_costs[date].total_tokens,
    }));
  };

  const recentData = getRecentDailyData();

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* 页面标题 */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">{t.costTracking.title}</h1>
        <p className="text-gray-600 dark:text-gray-400">
          {t.costTracking.subtitle}
        </p>
      </div>

      {/* 时间范围选择 */}
      <div className="mb-6 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          <span className="text-sm text-gray-600 dark:text-gray-400">{t.costTracking.statisticsPeriod}:</span>
        </div>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value={7}>{t.costTracking.last7Days}</option>
          <option value={30}>{t.costTracking.last30Days}</option>
          <option value={90}>{t.costTracking.last90Days}</option>
        </select>
        <button
          onClick={loadCostStats}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          {t.costTracking.refresh}
        </button>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mr-2 mt-0.5" />
          <span className="text-red-800 dark:text-red-200">{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : stats ? (
        <>
          {/* 概览卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-600 dark:text-gray-400">{t.costTracking.totalCost}</p>
                <DollarSign className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                {formatCurrency(stats.total_cost)}
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-600 dark:text-gray-400">{t.costTracking.totalTokens}</p>
                <Activity className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <p className="text-3xl font-bold">
                {formatNumber(stats.total_tokens)}
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-600 dark:text-gray-400">{t.costTracking.totalRequests}</p>
                <TrendingUp className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <p className="text-3xl font-bold">
                {formatNumber(stats.total_requests)}
              </p>
            </div>
          </div>

          {/* 按功能分类 */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 mb-6">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-semibold">{t.costTracking.featureCostDetails}</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {t.costTracking.feature}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {t.costTracking.featureId}
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {t.costTracking.inputTokens}
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {t.costTracking.outputTokens}
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {t.costTracking.requests}
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {t.costTracking.cost}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {Object.entries(stats.feature_costs)
                    .sort(([, a], [, b]) => b.cost - a.cost)
                    .map(([feature, data]) => (
                      <tr
                        key={feature}
                        className="hover:bg-gray-50 dark:hover:bg-gray-700/50"
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-medium">
                            {getFeatureName(feature)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-gray-600 dark:text-gray-400 font-mono">
                            {feature}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                          {formatNumber(data.input_tokens)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                          {formatNumber(data.output_tokens)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                          {formatNumber(data.requests)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold text-green-600 dark:text-green-400">
                          {formatCurrency(data.cost)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 按模型分类 */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 mb-6">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-semibold">{t.costTracking.modelCostDetails}</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {t.costTracking.model}
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {t.costTracking.inputTokens}
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {t.costTracking.outputTokens}
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {t.costTracking.inputCost}
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {t.costTracking.outputCost}
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {t.costTracking.totalCostLabel}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {Object.entries(stats.model_costs)
                    .sort(([, a], [, b]) => b.total_cost - a.total_cost)
                    .map(([model, data]) => (
                      <tr
                        key={model}
                        className="hover:bg-gray-50 dark:hover:bg-gray-700/50"
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-medium">{model}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                          {formatNumber(data.input_tokens)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                          {formatNumber(data.output_tokens)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                          {formatCurrency(data.input_cost)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                          {formatCurrency(data.output_cost)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold text-green-600 dark:text-green-400">
                          {formatCurrency(data.total_cost)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 每日趋势 */}
          {recentData.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-xl font-semibold">{t.costTracking.dailyCostTrend}</h2>
              </div>
              <div className="p-6">
                <div className="space-y-4">
                  {recentData.map((item) => (
                    <div key={item.date} className="flex items-center gap-4">
                      <div className="w-24 text-sm text-gray-600 dark:text-gray-400">
                        {item.date.slice(5)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                            <div
                              className="bg-green-600 dark:bg-green-400 h-2 rounded-full"
                              style={{
                                width: `${Math.min(
                                  (item.cost / Math.max(...recentData.map((d) => d.cost))) * 100,
                                  100
                                )}%`,
                              }}
                            ></div>
                          </div>
                          <div className="w-24 text-sm font-semibold text-right text-green-600 dark:text-green-400">
                            {formatCurrency(item.cost)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
