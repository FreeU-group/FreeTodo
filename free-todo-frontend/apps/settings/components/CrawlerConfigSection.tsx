"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useCrawlerStore } from "@/lib/store/crawler-store";
import { SettingsSection } from "./SettingsSection";
import { ToggleSwitch } from "./ToggleSwitch";

// 爬虫 API 基础 URL
const CRAWLER_API_URL =
	process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Platform {
	value: string;
	label: string;
	icon: string;
}

interface CrawlerConfigSectionProps {
	loading?: boolean;
}

// 平台图标组件
function PlatformIcon({
	platform,
	className,
}: { platform: string; className?: string }) {
	const iconMap: Record<string, string> = {
		xhs: "📕",
		dy: "🎵",
		ks: "📹",
		bili: "📺",
		wb: "💬",
		tieba: "📝",
		zhihu: "❓",
	};
	return <span className={className}>{iconMap[platform] || "🔍"}</span>;
}

export function CrawlerConfigSection({ loading }: CrawlerConfigSectionProps) {
	const t = useTranslations("page.settings.crawler");
	const [platforms, setPlatforms] = useState<Platform[]>([]);

	const {
		platform,
		crawlerType,
		loginType,
		saveOption,
		headless,
		enableComments,
		setPlatform,
		setCrawlerType,
		setLoginType,
		setSaveOption,
		setHeadless,
		setEnableComments,
	} = useCrawlerStore();

	// 获取平台列表
	useEffect(() => {
		const fetchPlatforms = async () => {
			try {
				const res = await fetch(`${CRAWLER_API_URL}/api/crawler/config/platforms`);
				if (res.ok) {
					const data = await res.json();
					setPlatforms(data.platforms);
				}
			} catch {
				// 静默失败
			}
		};
		fetchPlatforms();
	}, []);

	return (
		<SettingsSection title={t("title")} description={t("description")}>
			<div className="space-y-4">
				{/* 平台选择 */}
				<div>
					<label className="mb-1.5 block text-sm font-medium">
						{t("platform")}
					</label>
					<div className="flex flex-wrap gap-2">
						{platforms.map((p) => (
							<button
								key={p.value}
								type="button"
								onClick={() => setPlatform(p.value)}
								disabled={loading}
								className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-xs transition-colors ${
									platform === p.value
										? "border-primary bg-primary/10 text-primary"
										: "border-border hover:bg-muted"
								} disabled:cursor-not-allowed disabled:opacity-50`}
							>
								<PlatformIcon platform={p.value} className="text-lg" />
								<span className="truncate">{p.label}</span>
							</button>
						))}
					</div>
				</div>

				{/* 爬取类型 */}
				<div>
					<label className="mb-1.5 block text-sm font-medium">
						{t("crawlerType")}
					</label>
					<select
						value={crawlerType}
						onChange={(e) => setCrawlerType(e.target.value)}
						disabled={loading}
						className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
					>
						<option value="search">{t("crawlerTypes.search")}</option>
						<option value="detail">{t("crawlerTypes.detail")}</option>
						<option value="creator">{t("crawlerTypes.creator")}</option>
					</select>
				</div>

				{/* 登录方式 */}
				<div>
					<label className="mb-1.5 block text-sm font-medium">
						{t("loginType")}
					</label>
					<select
						value={loginType}
						onChange={(e) => setLoginType(e.target.value)}
						disabled={loading}
						className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
					>
						<option value="qrcode">{t("loginTypes.qrcode")}</option>
						<option value="cookie">{t("loginTypes.cookie")}</option>
					</select>
				</div>

				{/* 保存格式 */}
				<div>
					<label className="mb-1.5 block text-sm font-medium">
						{t("saveOption")}
					</label>
					<select
						value={saveOption}
						onChange={(e) => setSaveOption(e.target.value)}
						disabled={loading}
						className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
					>
						<option value="json">JSON</option>
						<option value="csv">CSV</option>
						<option value="excel">Excel</option>
						<option value="sqlite">SQLite</option>
					</select>
				</div>

				{/* 开关选项 */}
				<div className="space-y-3">
					<div className="flex items-center justify-between">
						<label className="text-sm">{t("headless")}</label>
						<ToggleSwitch
							enabled={headless}
							disabled={loading}
							onToggle={setHeadless}
						/>
					</div>
					<div className="flex items-center justify-between">
						<label className="text-sm">{t("enableComments")}</label>
						<ToggleSwitch
							enabled={enableComments}
							disabled={loading}
							onToggle={setEnableComments}
						/>
					</div>
				</div>
			</div>
		</SettingsSection>
	);
}
