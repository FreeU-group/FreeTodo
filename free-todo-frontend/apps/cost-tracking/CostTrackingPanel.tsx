"use client";

import {
	Activity,
	AlertCircle,
	Calendar,
	DollarSign,
	RefreshCw,
	TrendingUp,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { useCostStats } from "@/lib/query";
import { useLocaleStore } from "@/lib/store/locale";

const DEFAULT_DAYS = 30;

export function CostTrackingPanel() {
	const { locale } = useLocaleStore();
	const t = useTranslations(locale);
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
		return num.toLocaleString(locale === "zh" ? "zh-CN" : "en-US");
	};

	const featureName = (featureId: string) =>
		t.page.costTracking.featureNames[featureId] ??
		t.page.costTracking.featureNames.unknown ??
		featureId;

	const recentData = useMemo(() => {
		if (!stats || !stats.daily_costs) return [];
		const dates = Object.keys(stats.daily_costs).sort().slice(-7);
		return dates.map((date) => ({
			date,
			cost: stats.daily_costs?.[date]?.cost ?? 0,
			tokens: stats.daily_costs?.[date]?.total_tokens ?? 0,
		}));
	}, [stats]);

	const maxCost = useMemo(() => {
		if (!recentData.length) return 1;
		return Math.max(1, ...recentData.map((item) => item.cost || 0));
	}, [recentData]);

	return (
		<div className="flex h-full flex-col overflow-auto bg-[oklch(var(--card))] text-[oklch(var(--foreground))]">
			<div className="border-b border-[oklch(var(--border))] bg-[oklch(var(--card))]/80 px-4 py-3">
				<h2 className="text-lg font-semibold leading-tight">
					{t.page.costTracking.title}
				</h2>
				<p className="text-sm text-[oklch(var(--muted-foreground))]">
					{t.page.costTracking.subtitle}
				</p>
			</div>

			<div className="flex-1 space-y-4 overflow-auto p-4">
				<div className="flex flex-wrap items-center gap-3">
					<div className="flex items-center gap-2 text-sm text-[oklch(var(--muted-foreground))]">
						<Calendar className="h-4 w-4" />
						<span>{t.page.costTracking.statisticsPeriod}:</span>
					</div>
					<select
						value={days}
						onChange={(e) => setDays(Number(e.target.value))}
						className="rounded-lg border border-[oklch(var(--border))] bg-[oklch(var(--card))] px-3 py-2 text-sm shadow-sm focus:border-[oklch(var(--primary))] focus:outline-none focus:ring-2 focus:ring-[oklch(var(--primary))]/50"
					>
						<option value={7}>{t.page.costTracking.last7Days}</option>
						<option value={30}>{t.page.costTracking.last30Days}</option>
						<option value={90}>{t.page.costTracking.last90Days}</option>
					</select>
					<button
						type="button"
						onClick={() => refetch()}
						className="inline-flex items-center gap-2 rounded-lg border border-[oklch(var(--border))] px-3 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-[oklch(var(--muted))]"
					>
						<RefreshCw className="h-4 w-4" />
						{t.page.costTracking.refresh}
					</button>
				</div>

				{error && (
					<div className="flex items-start gap-2 rounded-lg border border-[oklch(var(--destructive))]/40 bg-[oklch(var(--destructive))]/10 px-3 py-2 text-sm text-[oklch(var(--destructive))]">
						<AlertCircle className="mt-0.5 h-4 w-4" />
						<span>
							{error instanceof Error
								? error.message
								: String(error) || t.page.costTracking.loadFailed}
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
							<div className="rounded-xl border border-[oklch(var(--border))] bg-[oklch(var(--card))] p-4 shadow-sm">
								<div className="flex items-center justify-between text-sm text-[oklch(var(--muted-foreground))]">
									<span>{t.page.costTracking.totalCost}</span>
									<DollarSign className="h-4 w-4 text-[oklch(var(--primary))]" />
								</div>
								<p className="mt-2 text-3xl font-bold text-[oklch(var(--primary))]">
									{formatCurrency(stats.total_cost)}
								</p>
							</div>

							<div className="rounded-xl border border-[oklch(var(--border))] bg-[oklch(var(--card))] p-4 shadow-sm">
								<div className="flex items-center justify-between text-sm text-[oklch(var(--muted-foreground))]">
									<span>{t.page.costTracking.totalTokens}</span>
									<Activity className="h-4 w-4 text-[oklch(var(--primary))]" />
								</div>
								<p className="mt-2 text-3xl font-bold">
									{formatNumber(stats.total_tokens)}
								</p>
							</div>

							<div className="rounded-xl border border-[oklch(var(--border))] bg-[oklch(var(--card))] p-4 shadow-sm">
								<div className="flex items-center justify-between text-sm text-[oklch(var(--muted-foreground))]">
									<span>{t.page.costTracking.totalRequests}</span>
									<TrendingUp className="h-4 w-4 text-[oklch(var(--primary))]" />
								</div>
								<p className="mt-2 text-3xl font-bold">
									{formatNumber(stats.total_requests)}
								</p>
							</div>
						</div>

						<div className="overflow-hidden rounded-xl border border-[oklch(var(--border))] bg-[oklch(var(--card))] shadow-sm">
							<div className="border-b border-[oklch(var(--border))] px-4 py-3">
								<h3 className="text-base font-semibold">
									{t.page.costTracking.featureCostDetails}
								</h3>
							</div>
							<div className="overflow-x-auto">
								<table className="min-w-full text-sm">
									<thead className="bg-[oklch(var(--muted))] text-left text-[oklch(var(--muted-foreground))]">
										<tr>
											<th className="px-4 py-2 font-medium">
												{t.page.costTracking.feature}
											</th>
											<th className="px-4 py-2 font-medium">
												{t.page.costTracking.featureId}
											</th>
											<th className="px-4 py-2 text-right font-medium">
												{t.page.costTracking.inputTokens}
											</th>
											<th className="px-4 py-2 text-right font-medium">
												{t.page.costTracking.outputTokens}
											</th>
											<th className="px-4 py-2 text-right font-medium">
												{t.page.costTracking.requests}
											</th>
											<th className="px-4 py-2 text-right font-medium">
												{t.page.costTracking.cost}
											</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-[oklch(var(--border))]">
										{Object.entries(stats.feature_costs || {})
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
																input_tokens?: number;
																output_tokens?: number;
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
															{formatNumber(featureData.input_tokens)}
														</td>
														<td className="px-4 py-3 text-right">
															{formatNumber(featureData.output_tokens)}
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

						<div className="overflow-hidden rounded-xl border border-[oklch(var(--border))] bg-[oklch(var(--card))] shadow-sm">
							<div className="border-b border-[oklch(var(--border))] px-4 py-3">
								<h3 className="text-base font-semibold">
									{t.page.costTracking.modelCostDetails}
								</h3>
							</div>
							<div className="overflow-x-auto">
								<table className="min-w-full text-sm">
									<thead className="bg-[oklch(var(--muted))] text-left text-[oklch(var(--muted-foreground))]">
										<tr>
											<th className="px-4 py-2 font-medium">
												{t.page.costTracking.model}
											</th>
											<th className="px-4 py-2 text-right font-medium">
												{t.page.costTracking.inputTokens}
											</th>
											<th className="px-4 py-2 text-right font-medium">
												{t.page.costTracking.outputTokens}
											</th>
											<th className="px-4 py-2 text-right font-medium">
												{t.page.costTracking.inputCost}
											</th>
											<th className="px-4 py-2 text-right font-medium">
												{t.page.costTracking.outputCost}
											</th>
											<th className="px-4 py-2 text-right font-medium">
												{t.page.costTracking.totalCostLabel}
											</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-[oklch(var(--border))]">
										{Object.entries(stats.model_costs || {})
											.sort(([, a], [, b]) => {
												const aCost =
													typeof a === "object" && a && "total_cost" in a
														? ((a.total_cost as number) ?? 0)
														: 0;
												const bCost =
													typeof b === "object" && b && "total_cost" in b
														? ((b.total_cost as number) ?? 0)
														: 0;
												return bCost - aCost;
											})
											.map(([model, data]) => {
												const modelData =
													typeof data === "object" && data
														? (data as {
																input_tokens?: number;
																output_tokens?: number;
																input_cost?: number;
																output_cost?: number;
																total_cost?: number;
															})
														: {};
												return (
													<tr
														key={model}
														className="hover:bg-[oklch(var(--muted))]/50"
													>
														<td className="px-4 py-3 font-medium">{model}</td>
														<td className="px-4 py-3 text-right">
															{formatNumber(modelData.input_tokens)}
														</td>
														<td className="px-4 py-3 text-right">
															{formatNumber(modelData.output_tokens)}
														</td>
														<td className="px-4 py-3 text-right">
															{formatCurrency(modelData.input_cost)}
														</td>
														<td className="px-4 py-3 text-right">
															{formatCurrency(modelData.output_cost)}
														</td>
														<td className="px-4 py-3 text-right font-semibold text-[oklch(var(--primary))]">
															{formatCurrency(modelData.total_cost)}
														</td>
													</tr>
												);
											})}
									</tbody>
								</table>
							</div>
						</div>

						{recentData.length > 0 && (
							<div className="overflow-hidden rounded-xl border border-[oklch(var(--border))] bg-[oklch(var(--card))] shadow-sm">
								<div className="border-b border-[oklch(var(--border))] px-4 py-3">
									<h3 className="text-base font-semibold">
										{t.page.costTracking.dailyCostTrend}
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
