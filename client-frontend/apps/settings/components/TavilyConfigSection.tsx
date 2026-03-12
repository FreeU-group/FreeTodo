"use client";

import { Check, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useSaveConfig } from "@/lib/query";
import type { AppConfig } from "@/lib/query/config";
import { toastError, toastSuccess } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { SettingsSection } from "./index";

interface TavilyConfigSectionProps {
	config: AppConfig | undefined;
	loading?: boolean;
}

/**
 * Tavily 配置区块
 * - 通过 dynaconf 管理：tavily.api_key
 * - 前端字段映射：tavilyApiKey
 */
export function TavilyConfigSection({
	config,
	loading = false,
}: TavilyConfigSectionProps) {
	const t = useTranslations("page.settings");
	const saveConfigMutation = useSaveConfig();

	const [apiKey, setApiKey] = useState<string>(
		(config?.tavilyApiKey as string | undefined) ?? "",
	);
	const [savedApiKey, setSavedApiKey] = useState<string>(
		(config?.tavilyApiKey as string | undefined) ?? "",
	);
	const [isVerifying, setIsVerifying] = useState(false);
	const [verificationMessage, setVerificationMessage] = useState<{
		type: "success" | "error";
		text: string;
	} | null>(null);

	const isSaving = loading || saveConfigMutation.isPending;
	const hasChanges = apiKey !== savedApiKey;

	// 当配置加载完成后，同步本地状态
	useEffect(() => {
		if (config) {
			// 只在配置值存在时更新，避免覆盖用户正在编辑的值
			if (config.tavilyApiKey !== undefined) {
				const newApiKey = (config.tavilyApiKey as string) || "";
				setApiKey(newApiKey);
				setSavedApiKey(newApiKey);
			}
		}
	}, [config]);

	const handleVerify = async (keyToVerify: string) => {
		if (!keyToVerify.trim()) {
			setVerificationMessage({
				type: "error",
				text: t("apiKeyRequired") || "API Key 不能为空",
			});
			return;
		}

		setIsVerifying(true);
		setVerificationMessage(null);

		try {
			// 客户端使用相对路径，通过 Next.js rewrites 代理到后端（支持动态端口）
			const response = await fetch(`/api/test-tavily-config`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					tavilyApiKey: keyToVerify,
				}),
			});

			const data = await response.json();

			if (data.success) {
				setVerificationMessage({
					type: "success",
					text: t("testSuccess") || "✓ API 配置验证成功！",
				});
			} else {
				setVerificationMessage({
					type: "error",
					text: `${t("testFailed") || "✗ API 配置验证失败"}: ${data.error || "Unknown error"}`,
				});
			}
		} catch (error) {
			console.error("验证 Tavily 配置失败:", error);
			const errorMsg = error instanceof Error ? error.message : "Network error";
			setVerificationMessage({
				type: "error",
				text: `${t("testFailed") || "✗ API 配置验证失败"}: ${errorMsg}`,
			});
		} finally {
			setIsVerifying(false);
		}
	};

	const handleSave = async () => {
		if (!hasChanges) return;

		try {
			const payload = {
				tavilyApiKey: apiKey,
			};

			await saveConfigMutation.mutateAsync({ data: payload });
			setSavedApiKey(apiKey);
			toastSuccess(t("tavilySaveSuccess"));

			// 保存成功后立即验证
			if (apiKey.trim()) {
				await handleVerify(apiKey);
			}
		} catch (error) {
			console.error("保存 Tavily 配置失败:", error);
			const errorMsg = error instanceof Error ? error.message : String(error);
			toastError(t("saveFailed", { error: errorMsg }));
		}
	};

	return (
		<SettingsSection title={t("tavilyConfigTitle")}>
			<div className="space-y-4">
				{/* 验证消息提示 */}
				{verificationMessage && (
					<div
						className={cn(
							"rounded-lg px-3 py-2 text-sm font-medium",
							verificationMessage.type === "success"
								? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
								: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
						)}
					>
						{verificationMessage.text}
					</div>
				)}

				{/* API Key */}
				<div className="space-y-1">
					<label
						htmlFor="tavily-api-key"
						className="block text-sm font-medium text-foreground"
					>
						{t("apiKey")}
					</label>
					<div className="flex gap-2">
						<input
							id="tavily-api-key"
							type="password"
							className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
							placeholder="Tavily API Key"
							value={apiKey}
							onChange={(e) => {
								setApiKey(e.target.value);
								// 清除之前的验证消息
								if (verificationMessage) {
									setVerificationMessage(null);
								}
							}}
							onKeyDown={(e) => {
								if (e.key === "Enter" && hasChanges) {
									void handleSave();
								}
							}}
							disabled={isSaving || isVerifying}
						/>
						<button
							type="button"
							onClick={() => void handleSave()}
							disabled={isSaving || isVerifying || !hasChanges}
							className={cn(
								"flex items-center justify-center rounded-md border px-3 py-2 text-sm font-medium transition-colors shrink-0",
								"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
								hasChanges && !isSaving && !isVerifying
									? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
									: "border-input bg-background text-muted-foreground cursor-not-allowed opacity-50",
							)}
							aria-label={t("save") || "Save"}
							title={
								hasChanges
									? t("save") || "Save"
									: t("tavilySaveSuccess") || "Saved"
							}
						>
							{isSaving || isVerifying ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : (
								<Check className="h-4 w-4" />
							)}
						</button>
					</div>
					<p className="mt-1 text-xs text-muted-foreground">
						{t("tavilyApiKeyHint")}{" "}
						<a
							href="https://app.tavily.com/"
							target="_blank"
							rel="noopener noreferrer"
							className="text-primary hover:underline"
						>
							{t("tavilyApiKeyLink")}
						</a>
					</p>
				</div>
			</div>
		</SettingsSection>
	);
}
