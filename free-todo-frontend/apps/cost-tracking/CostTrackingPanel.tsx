"use client";

import {
	Activity,
	AlertCircle,
	Calendar,
	DollarSign,
	RefreshCw,
	TrendingUp,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { PanelHeader } from "@/components/common/layout/PanelHeader";
import { useCostStats } from "@/lib/query";

const DEFAULT_DAYS = 30;

export function CostTrackingPanel() {
	const t = useTranslations("page.costTracking");
	const tCommon = useTranslations("common");
	const [days, setDays] = useState<number>(DEFAULT_DAYS);

	// 使用 TanStack Query 获取费用统计
	const {
		data: stats,
		isLoading: loading,
		error,
		refetch,
	} = useCostStats(days);

	const formatCurrency = (amount: number | undefined | null) => {
		if (amount === undefined || amount === null || Number.isNaN(amount)) {
			return "¥0.00";
		}
		return `¥${amount.toFixed(2)}`;
	};

	const formatNumber = (num: number | undefined | null) => {
		if (num === undefined || num === null || Number.isNaN(num)) {
			return "0";
		}
		const numberLocale = tCommon("numberLocale") as string;
		return num.toLocaleString(numberLocale);
	};

	const featureName = (featureId: string) => {
		// 将 camelCase 转换回 snake_case（因为 fetcher 会转换字段名，但翻译 key 是 snake_case）
		const toSnakeCase = (str: string) =>
			str.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

		// 转换为 snake_case 格式以匹配翻译 key
		const normalizedId = toSnakeCase(featureId);
		const translationKey = `featureNames.${normalizedId}` as Parameters<
			typeof t
		>[0];

		// 尝试获取翻译
		const translation = t(translationKey);

		// 如果翻译结果包含完整的命名空间路径（说明翻译不存在），返回未知功能
		if (translation.includes("page.costTracking.featureNames.")) {
			return t("featureNames.unknown");
		}

		return translation;
	};

	const recentData = useMemo(() => {
		if (!stats || !stats.dailyCosts) return [];
		const dates = Object.keys(stats.dailyCosts).sort().slice(-7);
		return dates.map((date) => ({
			date,
			cost: stats.dailyCosts?.[date]?.cost ?? 0,
			tokens: stats.dailyCosts?.[date]?.totalTokens ?? 0,
		}));
	}, [stats]);

	const maxCost = useMemo(() => {
		if (!recentData.length) return 1;
		return Math.max(1, ...recentData.map((item) => item.cost || 0));
	}, [recentData]);

	return (
		<div className="flex h-full flex-col overflow-auto bg-background text-foreground">
			<PanelHeader icon={DollarSign} title={t("title")} />
			<div className="border-b border-border bg-card/80 px-4 py-3">
				<p className="text-sm text-muted-foreground">{t("subtitle")}</p>
			</div>

			<div className="flex-1 space-y-4 overflow-auto p-4">
				<div className="flex flex-wrap items-center gap-3">
					<div className="flex items-center gap-2 text-sm text-[oklch(var(--muted-foreground))]">
						<Calendar className="h-4 w-4" />
						<span>{t("statisticsPeriod")}:</span>
					</div>
					<select
						value={days}
						onChange={(e) => setDays(Number(e.target.value))}
						className="rounded-lg border border-[oklch(var(--border))] bg-background px-3 py-2 text-sm shadow-sm focus:border-[oklch(var(--primary))] focus:outline-none focus:ring-2 focus:ring-[oklch(var(--primary))]/50"
					>
						<option value={7}>{t("last7Days")}</option>
						<option value={30}>{t("last30Days")}</option>
						<option value={90}>{t("last90Days")}</option>
					</select>
					<button
						type="button"
						onClick={() => refetch()}
						className="inline-flex items-center gap-2 rounded-lg border border-[oklch(var(--border))] px-3 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-[oklch(var(--muted))]"
					>
						<RefreshCw className="h-4 w-4" />
						{t("refresh")}
					</button>
				</div>

				{error && (
					<div className="flex items-start gap-2 rounded-lg border border-[oklch(var(--destructive))]/40 bg-[oklch(var(--destructive))]/10 px-3 py-2 text-sm text-[oklch(var(--destructive))]">
						<AlertCircle className="mt-0.5 h-4 w-4" />
						<span>
							{error instanceof Error
								? error.message
								: String(error) || t("loadFailed")}
						</span>
					</div>
				)}

				{loading ? (
					<div className="flex h-48 items-center justify-center text-sm text-[oklch(var(--muted-foreground))]">
						<div className="h-6 w-6 animate-spin rounded-full border-2 border-[oklch(var(--primary))]/30 border-t-[oklch(var(--primary))]" />
					</div>
				) : stats ? (
					<div className="space-y-4">
						<div className="grid grid-cols-1 gap-3 md:grid-cols-3">
							<div className="rounded-xl border border-[oklch(var(--border))] bg-background p-4 shadow-sm">
								<div className="flex items-center justify-between text-sm text-[oklch(var(--muted-foreground))]">
									<span>{t("totalCost")}</span>
									<DollarSign className="h-4 w-4 text-[oklch(var(--primary))]" />
								</div>
								<p className="mt-2 text-3xl font-bold text-[oklch(var(--primary))]">
									{formatCurrency(stats.totalCost)}
								</p>
							</div>

							<div className="rounded-xl border border-[oklch(var(--border))] bg-background p-4 shadow-sm">
								<div className="flex items-center justify-between text-sm text-[oklch(var(--muted-foreground))]">
									<span>{t("totalTokens")}</span>
									<Activity className="h-4 w-4 text-[oklch(var(--primary))]" />
								</div>
								<p className="mt-2 text-3xl font-bold">
									{formatNumber(stats.totalTokens)}
								</p>
							</div>

							<div className="rounded-xl border border-[oklch(var(--border))] bg-background p-4 shadow-sm">
								<div className="flex items-center justify-between text-sm text-[oklch(var(--muted-foreground))]">
									<span>{t("totalRequests")}</span>
									<TrendingUp className="h-4 w-4 text-[oklch(var(--primary))]" />
								</div>
								<p className="mt-2 text-3xl font-bold">
									{formatNumber(stats.totalRequests)}
								</p>
							</div>
						</div>

						<div className="overflow-hidden rounded-xl border border-[oklch(var(--border))] bg-background shadow-sm">
							<div className="border-b border-[oklch(var(--border))] px-4 py-3">
								<h3 className="text-base font-semibold">
									{t("featureCostDetails")}
								</h3>
							</div>
							<div className="overflow-x-auto">
								<table className="min-w-full text-sm">
									<thead className="bg-[oklch(var(--muted))] text-left text-[oklch(var(--muted-foreground))]">
										<tr>
											<th className="px-4 py-2 font-medium">{t("feature")}</th>
											<th className="px-4 py-2 font-medium">
												{t("featureId")}
											</th>
											<th className="px-4 py-2 text-right font-medium">
												{t("inputTokens")}
											</th>
											<th className="px-4 py-2 text-right font-medium">
												{t("outputTokens")}
											</th>
											<th className="px-4 py-2 text-right font-medium">
												{t("requests")}
											</th>
											<th className="px-4 py-2 text-right font-medium">
												{t("cost")}
											</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-[oklch(var(--border))]">
										{Object.entries(stats.featureCosts || {})
											.sort(([, a], [, b]) => {
												const aCost =
													typeof a === "object" && a && "cost" in a
														? ((a.cost as number) ?? 0)
														: 0;
												const bCost =
													typeof b === "object" && b && "cost" in b
														? ((b.cost as number) ?? 0)
														: 0;
												return bCost - aCost;
											})
											.map(([featureId, data]) => {
												const featureData =
													typeof data === "object" && data
														? (data as {
																inputTokens?: number;
																outputTokens?: number;
																requests?: number;
																cost?: number;
															})
														: {};
												return (
													<tr
														key={featureId}
														className="hover:bg-[oklch(var(--muted))]/50"
													>
														<td className="px-4 py-3 font-medium">
															{featureName(featureId)}
														</td>
														<td className="px-4 py-3 font-mono text-[oklch(var(--muted-foreground))]">
															{featureId}
														</td>
														<td className="px-4 py-3 text-right">
															{formatNumber(featureData.inputTokens)}
														</td>
														<td className="px-4 py-3 text-right">
															{formatNumber(featureData.outputTokens)}
														</td>
														<td className="px-4 py-3 text-right">
															{formatNumber(featureData.requests)}
														</td>
														<td className="px-4 py-3 text-right font-semibold text-[oklch(var(--primary))]">
															{formatCurrency(featureData.cost)}
														</td>
													</tr>
												);
											})}
									</tbody>
								</table>
							</div>
						</div>

						<div className="overflow-hidden rounded-xl border border-[oklch(var(--border))] bg-background shadow-sm">
							<div className="border-b border-[oklch(var(--border))] px-4 py-3">
								<h3 className="text-base font-semibold">
									{t("modelCostDetails")}
								</h3>
							</div>
							<div className="overflow-x-auto">
								<table className="min-w-full text-sm">
									<thead className="bg-[oklch(var(--muted))] text-left text-[oklch(var(--muted-foreground))]">
										<tr>
											<th className="px-4 py-2 font-medium">{t("model")}</th>
											<th className="px-4 py-2 text-right font-medium">
												{t("inputTokens")}
											</th>
											<th className="px-4 py-2 text-right font-medium">
												{t("outputTokens")}
											</th>
											<th className="px-4 py-2 text-right font-medium">
												{t("inputCost")}
											</th>
											<th className="px-4 py-2 text-right font-medium">
												{t("outputCost")}
											</th>
											<th className="px-4 py-2 text-right font-medium">
												{t("totalCostLabel")}
											</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-[oklch(var(--border))]">
										{Object.entries(stats.modelCosts || {})
											.sort(([, a], [, b]) => {
												const aCost =
													typeof a === "object" && a && "totalCost" in a
														? ((a.totalCost as number) ?? 0)
														: 0;
												const bCost =
													typeof b === "object" && b && "totalCost" in b
														? ((b.totalCost as number) ?? 0)
														: 0;
												return bCost - aCost;
											})
											.map(([model, data]) => {
												const modelData =
													typeof data === "object" && data
														? (data as {
																inputTokens?: number;
																outputTokens?: number;
																inputCost?: number;
																outputCost?: number;
																totalCost?: number;
															})
														: {};
												return (
													<tr
														key={model}
														className="hover:bg-[oklch(var(--muted))]/50"
													>
														<td className="px-4 py-3 font-medium">{model}</td>
														<td className="px-4 py-3 text-right">
															{formatNumber(modelData.inputTokens)}
														</td>
														<td className="px-4 py-3 text-right">
															{formatNumber(modelData.outputTokens)}
														</td>
														<td className="px-4 py-3 text-right">
															{formatCurrency(modelData.inputCost)}
														</td>
														<td className="px-4 py-3 text-right">
															{formatCurrency(modelData.outputCost)}
														</td>
														<td className="px-4 py-3 text-right font-semibold text-[oklch(var(--primary))]">
															{formatCurrency(modelData.totalCost)}
														</td>
													</tr>
												);
											})}
									</tbody>
								</table>
							</div>
						</div>

						{recentData.length > 0 && (
							<div className="overflow-hidden rounded-xl border border-[oklch(var(--border))] bg-background shadow-sm">
								<div className="border-b border-[oklch(var(--border))] px-4 py-3">
									<h3 className="text-base font-semibold">
										{t("dailyCostTrend")}
									</h3>
								</div>
								<div className="space-y-3 p-4">
									{recentData.map((item) => (
										<div key={item.date} className="flex items-center gap-3">
											<div className="w-20 shrink-0 text-xs text-[oklch(var(--muted-foreground))]">
												{item.date.slice(5)}
											</div>
											<div className="flex-1">
												<div className="flex items-center gap-2">
													<div className="h-2 flex-1 rounded-full bg-[oklch(var(--muted))]">
														<div
															className="h-2 rounded-full bg-[oklch(var(--primary))]"
															style={{
																width: `${Math.min(
																	(item.cost / maxCost) * 100,
																	100,
																)}%`,
															}}
														/>
													</div>
													<div className="w-24 text-right text-sm font-semibold text-[oklch(var(--primary))]">
														{formatCurrency(item.cost)}
													</div>
												</div>
											</div>
										</div>
									))}
								</div>
							</div>
						)}
					</div>
				) : null}
			</div>
		</div>
	);
}
