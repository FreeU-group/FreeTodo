"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { PasswordInput } from "@/components/common/ui/PasswordInput";
import { useSaveConfig } from "@/lib/query";
import { toastError, toastSuccess } from "@/lib/toast";
import { SettingsSection } from "./SettingsSection";

interface VolcengineConfigSectionProps {
	config: Record<string, unknown> | undefined;
	loading?: boolean;
}

export function VolcengineConfigSection({
	config,
	loading = false,
}: VolcengineConfigSectionProps) {
	const t = useTranslations("page.settings");
	const saveConfigMutation = useSaveConfig();
	const [apiKey, setApiKey] = useState((config?.volcengineApiKey as string) ?? "");
	const [baseUrl, setBaseUrl] = useState(
		(config?.volcengineBaseUrl as string) ?? "https://ark.cn-beijing.volces.com/api/v3",
	);
	const [imageModel, setImageModel] = useState(
		(config?.volcengineImageModel as string) ?? "doubao-seedream-5-0-260128",
	);
	const [imageSize, setImageSize] = useState(
		(config?.volcengineImageSize as string) ?? "1024x1024",
	);
	const [saved, setSaved] = useState(false);
	const isLoading = loading || saveConfigMutation.isPending;

	useEffect(() => {
		if (!config) return;
		if (config.volcengineApiKey !== undefined) {
			setApiKey((config.volcengineApiKey as string) ?? "");
		}
		if (config.volcengineBaseUrl !== undefined) {
			setBaseUrl(
				(config.volcengineBaseUrl as string) ?? "https://ark.cn-beijing.volces.com/api/v3",
			);
		}
		if (config.volcengineImageModel !== undefined) {
			setImageModel(
				(config.volcengineImageModel as string) ?? "doubao-seedream-5-0-260128",
			);
		}
		if (config.volcengineImageSize !== undefined) {
			setImageSize((config.volcengineImageSize as string) ?? "1024x1024");
		}
	}, [config]);

	const handleSave = async () => {
		try {
			await saveConfigMutation.mutateAsync({
				data: {
					volcengineApiKey: apiKey.trim(),
					volcengineBaseUrl: baseUrl.trim() || "https://ark.cn-beijing.volces.com/api/v3",
					volcengineImageModel:
						imageModel.trim() || "doubao-seedream-5-0-260128",
					volcengineImageSize: imageSize,
				},
			});
			toastSuccess(t("saveSuccess"));
			setSaved(true);
			window.setTimeout(() => setSaved(false), 2000);
		} catch (error) {
			toastError(
				t("saveFailed", {
					error: error instanceof Error ? error.message : String(error),
				}),
			);
		}
	};

	return (
		<SettingsSection
			title={t("volcengineTitle")}
			description={t("volcengineDescription")}
			searchKeywords={["volcengine", "ark", "image", "illustration", "api key"]}
		>
			<div className="space-y-3">
				<div className="space-y-1.5">
					<label htmlFor="volcengine-api-key" className="text-sm font-medium text-foreground">
						{t("volcengineApiKeyLabel")}
					</label>
					<PasswordInput
						id="volcengine-api-key"
						value={apiKey}
						onChange={(event) => {
							setApiKey(event.target.value);
							setSaved(false);
						}}
						placeholder={t("volcengineApiKeyPlaceholder")}
						disabled={isLoading}
					/>
					<p className="text-xs text-muted-foreground">{t("volcengineApiKeyHint")}</p>
				</div>

				<div className="space-y-1.5">
					<label htmlFor="volcengine-base-url" className="text-sm font-medium text-foreground">
						{t("volcengineBaseUrlLabel")}
					</label>
					<input
						id="volcengine-base-url"
						type="text"
						value={baseUrl}
						onChange={(event) => {
							setBaseUrl(event.target.value);
							setSaved(false);
						}}
						placeholder="https://ark.cn-beijing.volces.com/api/v3"
						disabled={isLoading}
						className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
					/>
					<p className="text-xs text-muted-foreground">{t("volcengineBaseUrlHint")}</p>
				</div>

				<div className="space-y-1.5">
					<label htmlFor="volcengine-image-model" className="text-sm font-medium text-foreground">
						{t("volcengineImageModelLabel")}
					</label>
					<input
						id="volcengine-image-model"
						type="text"
						value={imageModel}
						onChange={(event) => {
							setImageModel(event.target.value);
							setSaved(false);
						}}
						placeholder={t("volcengineImageModelPlaceholder")}
						disabled={isLoading}
						className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
					/>
					<p className="text-xs text-muted-foreground">{t("volcengineImageModelHint")}</p>
				</div>

				<div className="space-y-1.5">
					<label htmlFor="volcengine-image-size" className="text-sm font-medium text-foreground">
						{t("volcengineImageSizeLabel")}
					</label>
					<select
						id="volcengine-image-size"
						value={imageSize}
						onChange={(event) => {
							setImageSize(event.target.value);
							setSaved(false);
						}}
						disabled={isLoading}
						className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
					>
						<option value="1024x1024">1024x1024</option>
						<option value="1536x1024">1536x1024</option>
						<option value="1024x1536">1024x1536</option>
						<option value="1792x1024">1792x1024</option>
						<option value="1024x1792">1024x1792</option>
						<option value="512x512">512x512</option>
						<option value="256x256">256x256</option>
						<option value="auto">auto</option>
					</select>
					<p className="text-xs text-muted-foreground">{t("volcengineImageSizeHint")}</p>
				</div>

				<button
					type="button"
					onClick={handleSave}
					disabled={isLoading}
					className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
				>
					{saved ? "OK" : t("save")}
				</button>
			</div>
		</SettingsSection>
	);
}
