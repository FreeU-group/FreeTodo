"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useSaveConfig } from "@/lib/query";
import type { AppConfig } from "@/lib/query/config";
import { toastError, toastSuccess } from "@/lib/toast";
import { SettingsSection, ToggleSwitch } from "./index";

interface DifyConfigSectionProps {
	config: AppConfig | undefined;
	loading?: boolean;
}

/**
 * Dify 配置区块
 * - 通过 dynaconf 管理：dify.enabled / dify.api_key / dify.base_url
 * - 前端字段映射：difyEnabled / difyApiKey / difyBaseUrl
 */
export function DifyConfigSection({
	config,
	loading = false,
}: DifyConfigSectionProps) {
	const t = useTranslations("page.settings");
	const saveConfigMutation = useSaveConfig();

	const [enabled, setEnabled] = useState<boolean>(
		(config?.difyEnabled as boolean | undefined) ?? true,
	);
	const [apiKey, setApiKey] = useState<string>(
		(config?.difyApiKey as string | undefined) ?? "",
	);
	const [baseUrl, setBaseUrl] = useState<string>(
		(config?.difyBaseUrl as string | undefined) ?? "https://api.dify.ai/v1",
	);

	const isSaving = loading || saveConfigMutation.isPending;

	// 当配置加载完成后，同步本地状态
	useEffect(() => {
		if (config) {
			// 只在配置值存在时更新，避免覆盖用户正在编辑的值
			if (config.difyEnabled !== undefined) {
				setEnabled((config.difyEnabled as boolean) ?? true);
			}
			if (config.difyApiKey !== undefined) {
				setApiKey((config.difyApiKey as string) || "");
			}
			if (config.difyBaseUrl !== undefined) {
				setBaseUrl((config.difyBaseUrl as string) || "https://api.dify.ai/v1");
			}
		}
	}, [config]);

	const handleSave = async (
		partial?: Partial<{ enabled: boolean; apiKey: string; baseUrl: string }>,
	) => {
		try {
			const payload = {
				difyEnabled: partial?.enabled ?? enabled,
				difyApiKey: partial?.apiKey ?? apiKey,
				difyBaseUrl: partial?.baseUrl ?? baseUrl,
			};

			await saveConfigMutation.mutateAsync({ data: payload });
			toastSuccess(t("difySaveSuccess"));
		} catch (error) {
			console.error("保存 Dify 配置失败:", error);
			const errorMsg = error instanceof Error ? error.message : String(error);
			toastError(t("saveFailed", { error: errorMsg }));
		}
	};

	const handleToggleEnabled = async (value: boolean) => {
		setEnabled(value);
		await handleSave({ enabled: value });
	};

	return (
		<SettingsSection title={t("difyConfigTitle")}>
			<div className="space-y-4">
				{/* 开关 */}
				<div className="flex items-center justify-between gap-4">
					<div className="flex-1">
						<p className="text-sm font-medium text-foreground">
							{t("difyEnabledLabel")}
						</p>
						<p className="mt-1 text-xs text-muted-foreground">
							{t("difyEnabledDescription")}
						</p>
					</div>
					<ToggleSwitch
						id="dify-enabled-toggle"
						enabled={enabled}
						disabled={isSaving}
						onToggle={(v) => void handleToggleEnabled(v)}
						ariaLabel={t("difyEnabledLabel")}
					/>
				</div>

				{/* API Key */}
				<div className="space-y-1">
					<label
						htmlFor="dify-api-key"
						className="block text-sm font-medium text-foreground"
					>
						{t("apiKey")}
					</label>
					<input
						id="dify-api-key"
						type="password"
						className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
						placeholder="Dify API Key"
						value={apiKey}
						onChange={(e) => setApiKey(e.target.value)}
						onBlur={() => void handleSave()}
						disabled={isSaving}
					/>
				</div>

				{/* Base URL */}
				<div className="space-y-1">
					<label
						htmlFor="dify-base-url"
						className="block text-sm font-medium text-foreground"
					>
						{t("baseUrl")}
					</label>
					<input
						id="dify-base-url"
						type="text"
						className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
						placeholder="https://api.dify.ai/v1"
						value={baseUrl}
						onChange={(e) => setBaseUrl(e.target.value)}
						onBlur={() => void handleSave()}
						disabled={isSaving}
					/>
				</div>
			</div>
		</SettingsSection>
	);
}
