"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCrawlerStore } from "@/apps/crawler/store";
import type { CrawlerType } from "@/apps/crawler/types";
import { SettingsSection } from "./SettingsSection";
import { ToggleSwitch } from "./ToggleSwitch";

// API 基础 URL
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8100";

interface CrawlerConfigSectionProps {
	loading?: boolean;
}

// 爬取类型选项
const CRAWLER_TYPES: { id: CrawlerType; name: string }[] = [
	{ id: "search", name: "关键词搜索" },
	{ id: "detail", name: "帖子详情" },
	{ id: "creator", name: "创作者主页" },
	{ id: "homefeed", name: "首页推荐" },
];

// 数据保存类型选项
const SAVE_OPTIONS = [
	{ id: "csv", name: "CSV 文件" },
	{ id: "db", name: "数据库" },
	{ id: "json", name: "JSON 文件" },
];

/**
 * 爬虫配置区块组件
 */
export function CrawlerConfigSection({ loading = false }: CrawlerConfigSectionProps) {
	const t = useTranslations("page.settings.crawler");
	const {
		crawlerType,
		setCrawlerType,
		loadConfigFromBackend,
		pluginInstalled,
		pluginAvailable,
		pluginMode,
		checkPluginStatus,
		uninstallPlugin,
	} = useCrawlerStore();

	// 本地配置状态
	const [maxNotesCount, setMaxNotesCount] = useState(40);
	const [enableComments, setEnableComments] = useState(true);
	const [enableCheckpoint, setEnableCheckpoint] = useState(true);
	const [crawlerSleep, setCrawlerSleep] = useState(1);
	const [saveDataOption, setSaveDataOption] = useState("csv");
	const [blacklistNicknames, setBlacklistNicknames] = useState("");
	const [isSaving, setIsSaving] = useState(false);
	const [isUninstalling, setIsUninstalling] = useState(false);
	const [showUninstallConfirm, setShowUninstallConfirm] = useState(false);
	const initialLoadRef = useRef(false);

	// 组件挂载时从后端加载配置
	useEffect(() => {
		if (!initialLoadRef.current) {
			initialLoadRef.current = true;
			loadConfigFromBackend();
			checkPluginStatus();
			// 加载额外的配置项
			fetchFullConfig();
		}
	}, [loadConfigFromBackend, checkPluginStatus]);

	// 从后端加载完整配置
	const fetchFullConfig = async () => {
		try {
			const response = await fetch(`${API_BASE_URL}/api/crawler/config`);
			if (response.ok) {
				const config = await response.json();
				setMaxNotesCount(config.max_notes_count || 40);
				setEnableComments(config.enable_comments ?? true);
				setEnableCheckpoint(config.enable_checkpoint ?? true);
				setCrawlerSleep(config.crawler_sleep || 1);
				setSaveDataOption(config.save_data_option || "csv");
				setBlacklistNicknames(config.blacklist_nicknames || "");
			}
		} catch (error) {
			console.error("[CrawlerConfig] 加载配置失败:", error);
		}
	};

	// 保存配置到后端
	const saveConfig = async (updates: Record<string, unknown>) => {
		setIsSaving(true);
		try {
			const response = await fetch(`${API_BASE_URL}/api/crawler/config`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(updates),
			});
			if (response.ok) {
				console.log("[CrawlerConfig] 配置已保存:", updates);
			}
		} catch (error) {
			console.error("[CrawlerConfig] 保存配置失败:", error);
		} finally {
			setIsSaving(false);
		}
	};

	// 更新并保存最大爬取数量
	const handleMaxNotesCountChange = (value: number) => {
		setMaxNotesCount(value);
	};
	const handleMaxNotesCountBlur = () => {
		saveConfig({ max_notes_count: maxNotesCount });
	};

	// 更新并保存爬虫间隔
	const handleCrawlerSleepChange = (value: number) => {
		setCrawlerSleep(value);
	};
	const handleCrawlerSleepBlur = () => {
		saveConfig({ crawler_sleep: crawlerSleep });
	};

	// 更新并保存数据保存方式
	const handleSaveDataOptionChange = (value: string) => {
		setSaveDataOption(value);
		saveConfig({ save_data_option: value });
	};

	// 更新并保存评论开关
	const handleEnableCommentsChange = (value: boolean) => {
		setEnableComments(value);
		saveConfig({ enable_comments: value });
	};

	// 更新并保存断点续爬开关
	const handleEnableCheckpointChange = (value: boolean) => {
		setEnableCheckpoint(value);
		saveConfig({ enable_checkpoint: value });
	};

	// 更新并保存黑名单
	const handleBlacklistNicknamesChange = (value: string) => {
		setBlacklistNicknames(value);
	};
	const handleBlacklistNicknamesBlur = () => {
		saveConfig({ blacklist_nicknames: blacklistNicknames });
	};

	// 卸载插件
	const handleUninstall = useCallback(async () => {
		setIsUninstalling(true);
		try {
			await uninstallPlugin();
			await checkPluginStatus();
			setShowUninstallConfirm(false);
		} catch (error) {
			console.error("[CrawlerConfig] 卸载插件失败:", error);
		} finally {
			setIsUninstalling(false);
		}
	}, [uninstallPlugin, checkPluginStatus]);

	const isLoading = loading || isSaving;

	// 判断插件是否存在（已安装或开发模式可用）
	const isPluginPresent = pluginInstalled || pluginAvailable;

	return (
		<SettingsSection title={t("title")} description={t("description")}>
			<div className="space-y-4">
				{/* 爬取类型 */}
				<div>
					<label className="mb-2 block text-sm font-medium text-foreground">
						{t("crawlerType")}
					</label>
					<div className="grid grid-cols-2 gap-2">
						{CRAWLER_TYPES.map((type) => (
							<button
								key={type.id}
								type="button"
								onClick={() => setCrawlerType(type.id)}
								disabled={loading}
								className={`rounded-md border px-3 py-2 text-sm transition-all ${
									crawlerType === type.id
										? "border-primary bg-primary/10 text-primary"
										: "border-border bg-background text-foreground hover:border-primary/50 hover:bg-muted"
								} disabled:cursor-not-allowed disabled:opacity-50`}
							>
								{type.name}
							</button>
						))}
					</div>
				</div>

				{/* 数量和间隔设置 */}
				<div className="grid grid-cols-2 gap-3">
					<div>
						<label
							htmlFor="max-notes-count"
							className="mb-1 block text-sm font-medium text-foreground"
						>
							{t("maxNotesCount")}
						</label>
						<input
							id="max-notes-count"
							type="number"
							min="1"
							max="1000"
							className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
							value={maxNotesCount}
							onChange={(e) => handleMaxNotesCountChange(parseInt(e.target.value, 10) || 40)}
							onBlur={handleMaxNotesCountBlur}
							disabled={isLoading}
						/>
					</div>
					<div>
						<label
							htmlFor="crawler-sleep"
							className="mb-1 block text-sm font-medium text-foreground"
						>
							{t("crawlerSleep")}
						</label>
						<input
							id="crawler-sleep"
							type="number"
							min="0.5"
							max="10"
							step="0.5"
							className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
							value={crawlerSleep}
							onChange={(e) => handleCrawlerSleepChange(parseFloat(e.target.value) || 1)}
							onBlur={handleCrawlerSleepBlur}
							disabled={isLoading}
						/>
					</div>
				</div>

				{/* 数据保存类型 */}
				<div>
					<label className="mb-2 block text-sm font-medium text-foreground">
						{t("saveDataOption")}
					</label>
					<div className="flex gap-2">
						{SAVE_OPTIONS.map((option) => (
							<button
								key={option.id}
								type="button"
								onClick={() => handleSaveDataOptionChange(option.id)}
								disabled={isLoading}
								className={`flex-1 rounded-md border px-3 py-2 text-sm transition-all ${
									saveDataOption === option.id
										? "border-primary bg-primary/10 text-primary"
										: "border-border bg-background text-foreground hover:border-primary/50 hover:bg-muted"
								} disabled:cursor-not-allowed disabled:opacity-50`}
							>
								{option.name}
							</button>
						))}
					</div>
				</div>

				{/* 开关选项 */}
				<div className="space-y-3">
					<ToggleSwitch
						label={t("enableComments")}
						description={t("enableCommentsDesc")}
						checked={enableComments}
						onCheckedChange={handleEnableCommentsChange}
						disabled={isLoading}
					/>
					<ToggleSwitch
						label={t("enableCheckpoint")}
						description={t("enableCheckpointDesc")}
						checked={enableCheckpoint}
						onCheckedChange={handleEnableCheckpointChange}
						disabled={isLoading}
					/>
				</div>

				{/* 博主黑名单 */}
				<div>
					<label
						htmlFor="blacklist-nicknames"
						className="mb-1 block text-sm font-medium text-foreground"
					>
						{t("blacklistNicknames")}
					</label>
					<p className="mb-2 text-xs text-muted-foreground">
						{t("blacklistNicknamesDesc")}
					</p>
					<textarea
						id="blacklist-nicknames"
						className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
						rows={3}
						placeholder={t("blacklistPlaceholder")}
						value={blacklistNicknames}
						onChange={(e) => handleBlacklistNicknamesChange(e.target.value)}
						onBlur={handleBlacklistNicknamesBlur}
						disabled={isLoading}
					/>
				</div>

				{/* 卸载爬虫插件 */}
				{isPluginPresent && (
					<div className="border-t border-border pt-4">
						<div className="flex items-center justify-between">
							<div>
								<p className="text-sm font-medium text-foreground">
									卸载爬虫插件
								</p>
								<p className="text-xs text-muted-foreground">
									删除已安装的 MediaCrawler 插件及其所有数据
									{pluginMode === "dev" && " (当前为开发模式)"}
								</p>
							</div>
							{!showUninstallConfirm ? (
								<button
									type="button"
									onClick={() => setShowUninstallConfirm(true)}
									disabled={isLoading || isUninstalling}
									className="rounded-md border border-destructive/50 bg-background px-4 py-2 text-sm text-destructive transition-all hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
								>
									卸载
								</button>
							) : (
								<div className="flex items-center gap-2">
									<button
										type="button"
										onClick={() => setShowUninstallConfirm(false)}
										disabled={isUninstalling}
										className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground transition-all hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
									>
										取消
									</button>
									<button
										type="button"
										onClick={handleUninstall}
										disabled={isUninstalling}
										className="rounded-md border border-destructive bg-destructive px-3 py-2 text-sm text-destructive-foreground transition-all hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-50"
									>
										{isUninstalling ? "卸载中..." : "确认卸载"}
									</button>
								</div>
							)}
						</div>
					</div>
				)}
			</div>
		</SettingsSection>
	);
}
