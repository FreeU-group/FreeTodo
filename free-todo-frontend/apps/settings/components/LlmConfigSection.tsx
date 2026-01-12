"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import {
	useSaveAndInitLlmApiSaveAndInitLlmPost,
	useTestLlmConfigApiTestLlmConfigPost,
} from "@/lib/generated/config/config";
import { useSaveConfig } from "@/lib/query";
import { toastError } from "@/lib/toast";
import { SettingsSection } from "./SettingsSection";

interface LlmConfigSectionProps {
	config: Record<string, unknown> | undefined;
	loading?: boolean;
}

/**
 * LLM 配置区块组件
 */
export function LlmConfigSection({
	config,
	loading = false,
}: LlmConfigSectionProps) {
	const t = useTranslations("page.settings");
	const queryClient = useQueryClient();
	const saveConfigMutation = useSaveConfig();
	const testLlmMutation = useTestLlmConfigApiTestLlmConfigPost();
	const saveAndInitLlmMutation = useSaveAndInitLlmApiSaveAndInitLlmPost();

	// LLM 配置状态
	const [llmApiKey, setLlmApiKey] = useState(
		(config?.llmApiKey as string) || "",
	);
	const [llmBaseUrl, setLlmBaseUrl] = useState(
		(config?.llmBaseUrl as string) || "",
	);
	const [llmModel, setLlmModel] = useState(
		(config?.llmModel as string) || "qwen-plus",
	);
	const [llmTemperature, setLlmTemperature] = useState(
		(config?.llmTemperature as number) ?? 0.7,
	);
	const [llmMaxTokens, setLlmMaxTokens] = useState(
		(config?.llmMaxTokens as number) ?? 2048,
	);
	const [initialLlmConfig, setInitialLlmConfig] = useState({
		llmApiKey: (config?.llmApiKey as string) || "",
		llmBaseUrl: (config?.llmBaseUrl as string) || "",
		llmModel: (config?.llmModel as string) || "qwen-plus",
		llmTemperature: (config?.llmTemperature as number) ?? 0.7,
		llmMaxTokens: (config?.llmMaxTokens as number) ?? 2048,
	});
	const [testMessage, setTestMessage] = useState<{
		type: "success" | "error";
		text: string;
	} | null>(null);

	const isLoading =
		loading ||
		saveConfigMutation.isPending ||
		testLlmMutation.isPending ||
		saveAndInitLlmMutation.isPending;

	// 当配置加载完成后，同步本地状态
	useEffect(() => {
		if (config) {
			// 只在配置值存在时更新，避免覆盖用户正在编辑的值
			if (config.llmApiKey !== undefined) {
				setLlmApiKey((config.llmApiKey as string) || "");
			}
			if (config.llmBaseUrl !== undefined) {
				setLlmBaseUrl((config.llmBaseUrl as string) || "");
			}
			if (config.llmModel !== undefined) {
				setLlmModel((config.llmModel as string) || "qwen-plus");
			}
			if (config.llmTemperature !== undefined) {
				setLlmTemperature((config.llmTemperature as number) ?? 0.7);
			}
			if (config.llmMaxTokens !== undefined) {
				setLlmMaxTokens((config.llmMaxTokens as number) ?? 2048);
			}
			// 更新初始配置（用于检测变更）
			setInitialLlmConfig({
				llmApiKey: (config.llmApiKey as string) || "",
				llmBaseUrl: (config.llmBaseUrl as string) || "",
				llmModel: (config.llmModel as string) || "qwen-plus",
				llmTemperature: (config.llmTemperature as number) ?? 0.7,
				llmMaxTokens: (config.llmMaxTokens as number) ?? 2048,
			});
		}
	}, [config]);

	// 测试 LLM 连接
	const handleTestLlm = async () => {
		const currentApiKey = llmApiKey.trim();
		const currentBaseUrl = llmBaseUrl.trim();
		const currentModel = llmModel.trim();

		if (!currentApiKey || !currentBaseUrl) {
			setTestMessage({
				type: "error",
				text: t("apiKeyRequired"),
			});
			return;
		}

		setTestMessage(null);
		try {
			const response = await testLlmMutation.mutateAsync({
				data: {
					llmApiKey: currentApiKey,
					llmBaseUrl: currentBaseUrl,
					llmModel: currentModel,
				},
			});

			const result = response as { success?: boolean; error?: string };
			if (result.success) {
				setTestMessage({
					type: "success",
					text: t("testSuccess"),
				});
			} else {
				setTestMessage({
					type: "error",
					text: `${t("testFailed")}: ${result.error || "Unknown error"}`,
				});
			}
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : "Network error";
			setTestMessage({
				type: "error",
				text: `${t("testFailed")}: ${errorMsg}`,
			});
		}
	};

	// 保存 LLM 配置（失去焦点时触发）
	const handleSaveLlmConfig = async () => {
		const currentApiKey = llmApiKey.trim();
		const currentBaseUrl = llmBaseUrl.trim();
		const currentModel = llmModel.trim();

		// 检查核心配置是否改变（API Key, Base URL, Model）
		const llmCoreConfigChanged =
			currentApiKey !== initialLlmConfig.llmApiKey ||
			currentBaseUrl !== initialLlmConfig.llmBaseUrl ||
			currentModel !== initialLlmConfig.llmModel;

		// 检查其他配置是否改变（Temperature, Max Tokens）
		const otherConfigChanged =
			llmTemperature !== initialLlmConfig.llmTemperature ||
			llmMaxTokens !== initialLlmConfig.llmMaxTokens;

		// 如果没有任何改动，不需要保存
		if (!llmCoreConfigChanged && !otherConfigChanged) {
			return;
		}

		try {
			// 1. 始终保存用户输入的配置到文件（即使配置不完整）
			await saveConfigMutation.mutateAsync({
				data: {
					llmApiKey: currentApiKey,
					llmBaseUrl: currentBaseUrl,
					llmModel: currentModel,
					llmTemperature,
					llmMaxTokens,
				},
			});

			// 更新初始配置状态
			setInitialLlmConfig({
				llmApiKey: currentApiKey,
				llmBaseUrl: currentBaseUrl,
				llmModel: currentModel,
				llmTemperature,
				llmMaxTokens,
			});

			// 2. 只有当核心配置改变且配置完整时，才测试并初始化 LLM
			if (llmCoreConfigChanged && currentApiKey && currentBaseUrl) {
				try {
					const result = await saveAndInitLlmMutation.mutateAsync({
						data: {
							llmApiKey: currentApiKey,
							llmBaseUrl: currentBaseUrl,
							llmModel: currentModel,
						},
					});

					// 检查返回结果
					const response = result as { success?: boolean; error?: string };
					if (response.success) {
						// 测试成功，更新消息提示并刷新 LLM 状态
						setTestMessage({
							type: "success",
							text: t("testSuccess"),
						});
						await queryClient.invalidateQueries({ queryKey: ["llm-status"] });
					} else {
						// 测试失败，显示错误信息
						setTestMessage({
							type: "error",
							text: `${t("testFailed")}: ${response.error || "Unknown error"}`,
						});
					}
				} catch (initError) {
					// 初始化失败，显示错误信息
					const errorMsg =
						initError instanceof Error ? initError.message : String(initError);
					setTestMessage({
						type: "error",
						text: `${t("testFailed")}: ${errorMsg}`,
					});
					console.warn("LLM 初始化失败，配置已保存:", initError);
				}
			}
		} catch (error) {
			console.error("保存 LLM 配置失败:", error);
			const errorMsg = error instanceof Error ? error.message : String(error);
			toastError(t("saveFailed", { error: errorMsg }));
		}
	};

	return (
		<SettingsSection title={t("llmConfig")}>
			<div className="space-y-3">
				{/* 消息提示 */}
				{testMessage && (
					<div
						className={`rounded-lg px-3 py-2 text-sm font-medium ${
							testMessage.type === "success"
								? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
								: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
						}`}
					>
						{testMessage.text}
					</div>
				)}

				{/* API Key */}
				<div>
					<label
						htmlFor="llm-api-key"
						className="mb-1 block text-sm font-medium text-foreground"
					>
						{t("apiKey")} <span className="text-red-500">*</span>
					</label>
					<input
						id="llm-api-key"
						type="password"
						className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
						placeholder={t("apiKey")}
						value={llmApiKey}
						onChange={(e) => setLlmApiKey(e.target.value)}
						onBlur={handleSaveLlmConfig}
						disabled={isLoading}
					/>
					<p className="mt-1 text-xs text-muted-foreground">
						{t("apiKeyHint")}{" "}
						<a
							href="https://bailian.console.aliyun.com/?tab=api#/api"
							target="_blank"
							rel="noopener noreferrer"
							className="text-primary hover:underline"
						>
							{t("apiKeyLink")}
						</a>
					</p>
				</div>

				{/* Base URL */}
				<div>
					<label
						htmlFor="llm-base-url"
						className="mb-1 block text-sm font-medium text-foreground"
					>
						{t("baseUrl")} <span className="text-red-500">*</span>
					</label>
					<input
						id="llm-base-url"
						type="text"
						className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
						placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1"
						value={llmBaseUrl}
						onChange={(e) => setLlmBaseUrl(e.target.value)}
						onBlur={handleSaveLlmConfig}
						disabled={isLoading}
					/>
				</div>

				{/* Model / Temperature / Max Tokens */}
				<div className="grid grid-cols-3 gap-3">
					<div>
						<label
							htmlFor="llm-model"
							className="mb-1 block text-sm font-medium text-foreground"
						>
							{t("model")}
						</label>
						<input
							id="llm-model"
							type="text"
							className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
							placeholder="qwen-plus"
							value={llmModel}
							onChange={(e) => setLlmModel(e.target.value)}
							onBlur={handleSaveLlmConfig}
							disabled={isLoading}
						/>
					</div>
					<div>
						<label
							htmlFor="llm-temperature"
							className="mb-1 block text-sm font-medium text-foreground"
						>
							{t("temperature")}
						</label>
						<input
							id="llm-temperature"
							type="number"
							step="0.1"
							min="0"
							max="2"
							className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
							value={llmTemperature}
							onChange={(e) => setLlmTemperature(parseFloat(e.target.value))}
							onBlur={handleSaveLlmConfig}
							disabled={isLoading}
						/>
					</div>
					<div>
						<label
							htmlFor="llm-max-tokens"
							className="mb-1 block text-sm font-medium text-foreground"
						>
							{t("maxTokens")}
						</label>
						<input
							id="llm-max-tokens"
							type="number"
							className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
							value={llmMaxTokens}
							onChange={(e) => setLlmMaxTokens(parseInt(e.target.value, 10))}
							onBlur={handleSaveLlmConfig}
							disabled={isLoading}
						/>
					</div>
				</div>

				{/* 测试按钮 */}
				<button
					type="button"
					onClick={async () => {
						if (document.activeElement instanceof HTMLElement) {
							document.activeElement.blur();
						}
						await new Promise((resolve) => setTimeout(resolve, 50));
						await handleTestLlm();
					}}
					disabled={isLoading || !llmApiKey.trim() || !llmBaseUrl.trim()}
					className="w-full rounded-md border border-input bg-background px-4 py-2 text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{testLlmMutation.isPending
						? `${t("testConnection")}...`
						: t("testConnection")}
				</button>
			</div>
		</SettingsSection>
	);
}
