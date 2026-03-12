"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { SettingsSection } from "./SettingsSection";

// API 基础 URL
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8100";

// 支持的平台列表
const PLATFORMS = [
	{ id: "xhs", name: "小红书" },
	{ id: "dy", name: "抖音" },
	{ id: "ks", name: "快手" },
	{ id: "wb", name: "微博" },
	{ id: "bili", name: "哔哩哔哩" },
	{ id: "tieba", name: "百度贴吧" },
	{ id: "zhihu", name: "知乎" },
];

interface CookieAccount {
	id: number | null;
	account_name: string;
	cookies: string;
}

interface PlatformCookies {
	platform: string;
	platform_name: string;
	accounts: CookieAccount[];
}

interface CookiesConfigSectionProps {
	loading?: boolean;
}

/**
 * Cookies 配置区块组件
 * 用于在设置面板中管理各平台的 Cookies
 */
export function CookiesConfigSection({ loading = false }: CookiesConfigSectionProps) {
	const t = useTranslations("page.settings.cookies");

	// 状态管理
	const [platformCookies, setPlatformCookies] = useState<Record<string, CookieAccount[]>>({});
	const [selectedPlatform, setSelectedPlatform] = useState<string>("xhs");
	const [editingCookies, setEditingCookies] = useState<string>("");
	const [editingAccountName, setEditingAccountName] = useState<string>("");
	const [isSaving, setIsSaving] = useState(false);
	const [isLoading, setIsLoading] = useState(true);
	const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
	const [expandedPlatform, setExpandedPlatform] = useState<string | null>(null);

	// 加载所有平台的 cookies
	useEffect(() => {
		fetchAllCookies();
	}, []);

	// 当选择的平台变化时，更新编辑框内容
	useEffect(() => {
		const accounts = platformCookies[selectedPlatform] || [];
		if (accounts.length > 0) {
			setEditingCookies(accounts[0].cookies || "");
			setEditingAccountName(accounts[0].account_name || "");
		} else {
			setEditingCookies("");
			setEditingAccountName("");
		}
	}, [selectedPlatform, platformCookies]);

	// 从后端加载所有 cookies
	const fetchAllCookies = async (showLoading = true) => {
		console.log("[CookiesConfig] 开始加载 cookies, showLoading:", showLoading);
		if (showLoading) {
			setIsLoading(true);
		}
		try {
			const url = `${API_BASE_URL}/api/crawler/cookies`;
			console.log("[CookiesConfig] 请求 URL:", url);
			const response = await fetch(url);
			console.log("[CookiesConfig] 响应状态:", response.status);
			if (response.ok) {
				const data = await response.json();
				console.log("[CookiesConfig] 加载的数据:", data);
				const cookiesMap: Record<string, CookieAccount[]> = {};
				for (const platform of data.platforms as PlatformCookies[]) {
					cookiesMap[platform.platform] = platform.accounts;
					console.log(`[CookiesConfig] 平台 ${platform.platform} 有 ${platform.accounts.length} 个账号`);
				}
				setPlatformCookies(cookiesMap);
				console.log("[CookiesConfig] 状态已更新");
			} else {
				console.error("[CookiesConfig] 加载失败:", response.statusText);
			}
		} catch (error) {
			console.error("[CookiesConfig] 加载 Cookies 失败:", error);
		} finally {
			if (showLoading) {
				setIsLoading(false);
			}
		}
	};

	// 保存当前平台的 cookies
	const saveCookies = async () => {
		console.log("[CookiesConfig] 开始保存 cookies", {
			selectedPlatform,
			editingCookies: editingCookies.substring(0, 50) + "...",
			editingAccountName,
		});

		if (!editingCookies.trim()) {
			console.log("[CookiesConfig] cookies 为空，取消保存");
			setMessage({ type: "error", text: t("cookiesRequired") });
			setTimeout(() => setMessage(null), 3000);
			return;
		}

		setIsSaving(true);
		setMessage(null);

		try {
			const url = `${API_BASE_URL}/api/crawler/cookies/${selectedPlatform}`;
			console.log("[CookiesConfig] 发送请求到:", url);

			const response = await fetch(url, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					platform: selectedPlatform,
					account_name: editingAccountName || `${selectedPlatform}_account`,
					cookies: editingCookies.trim(),
				}),
			});

			console.log("[CookiesConfig] 响应状态:", response.status, response.statusText);

			if (response.ok) {
				console.log("[CookiesConfig] 保存成功，重新加载数据");
				// 保存成功后重新加载数据以确保状态同步（不显示 loading）
				await fetchAllCookies(false);
				setMessage({ type: "success", text: t("saveSuccess") });
			} else {
				const error = await response.json();
				console.error("[CookiesConfig] 保存失败:", error);
				setMessage({ type: "error", text: error.detail || t("saveFailed") });
			}
		} catch (error) {
			console.error("[CookiesConfig] 保存异常:", error);
			setMessage({ type: "error", text: t("saveFailed") });
		} finally {
			setIsSaving(false);
			setTimeout(() => setMessage(null), 3000);
		}
	};

	// 获取平台是否已配置 cookies
	const hasCookies = (platformId: string) => {
		const accounts = platformCookies[platformId] || [];
		return accounts.length > 0 && accounts[0].cookies?.trim().length > 0;
	};

	// 切换展开/收起
	const toggleExpand = (platformId: string) => {
		if (expandedPlatform === platformId) {
			setExpandedPlatform(null);
		} else {
			setExpandedPlatform(platformId);
			setSelectedPlatform(platformId);
		}
	};

	const isLoadingOrSaving = loading || isSaving || isLoading;

	return (
		<SettingsSection title={t("title")} description={t("description")}>
			<div className="space-y-4">
				{/* 平台选择和状态列表 */}
				<div className="space-y-2">
					{PLATFORMS.map((platform) => {
						const configured = hasCookies(platform.id);
						const isExpanded = expandedPlatform === platform.id;

						return (
							<div key={platform.id} className="border border-border rounded-md overflow-hidden">
								{/* 平台标题栏 */}
								<button
									type="button"
									onClick={() => toggleExpand(platform.id)}
									className="w-full flex items-center justify-between px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors"
								>
									<div className="flex items-center gap-2">
										<span className="text-sm font-medium text-foreground">
											{platform.name}
										</span>
										{/* 配置状态指示器 */}
										<span
											className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
												configured
													? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
													: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
											}`}
										>
											{configured ? t("configured") : t("notConfigured")}
										</span>
									</div>
									{/* 展开/收起图标 */}
									<svg
										className={`w-4 h-4 text-muted-foreground transition-transform ${
											isExpanded ? "rotate-180" : ""
										}`}
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
									</svg>
								</button>

								{/* 展开的编辑区域 */}
								{isExpanded && (
									<div className="p-3 space-y-3 border-t border-border">
										{/* 账号名称输入 */}
										<div>
											<label
												htmlFor={`account-name-${platform.id}`}
												className="block text-xs font-medium text-muted-foreground mb-1"
											>
												{t("accountName")}
											</label>
											<input
												id={`account-name-${platform.id}`}
												type="text"
												className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
												placeholder={t("accountNamePlaceholder")}
												value={selectedPlatform === platform.id ? editingAccountName : ""}
												onChange={(e) => {
													if (selectedPlatform === platform.id) {
														setEditingAccountName(e.target.value);
													}
												}}
												disabled={isLoadingOrSaving}
											/>
										</div>

										{/* Cookies 输入 */}
										<div>
											<label
												htmlFor={`cookies-${platform.id}`}
												className="block text-xs font-medium text-muted-foreground mb-1"
											>
												{t("cookiesLabel")}
											</label>
											<textarea
												id={`cookies-${platform.id}`}
												className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
												rows={4}
												placeholder={t("cookiesPlaceholder")}
												value={selectedPlatform === platform.id ? editingCookies : ""}
												onChange={(e) => {
													if (selectedPlatform === platform.id) {
														setEditingCookies(e.target.value);
													}
												}}
												disabled={isLoadingOrSaving}
											/>
										</div>

										{/* 保存按钮和提示 */}
										<div className="flex items-center justify-between">
											<p className="text-xs text-muted-foreground">
												{t("cookiesHint")}
											</p>
											<button
												type="button"
												onClick={saveCookies}
												disabled={isLoadingOrSaving || selectedPlatform !== platform.id}
												className="px-4 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
											>
												{isSaving ? t("saving") : t("save")}
											</button>
										</div>
									</div>
								)}
							</div>
						);
					})}
				</div>

				{/* 消息提示 */}
				{message && (
					<div
						className={`p-3 rounded-md text-sm ${
							message.type === "success"
								? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
								: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
						}`}
					>
						{message.text}
					</div>
				)}

				{/* 获取 Cookies 的说明 */}
				<div className="p-3 rounded-md bg-muted/50">
					<p className="text-xs text-muted-foreground">
						<span className="font-medium">{t("howToGetCookies")}</span>
						{t("howToGetCookiesDesc")}
					</p>
				</div>
			</div>
		</SettingsSection>
	);
}
