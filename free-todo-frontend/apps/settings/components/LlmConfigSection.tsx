"use client";

import { useState } from "react";
import {
	useSaveAndInitLlmApiSaveAndInitLlmPost,
	useTestLlmConfigApiTestLlmConfigPost,
} from "@/lib/generated/config/config";
import { useSaveConfig } from "@/lib/query";
import { toastError, toastSuccess } from "@/lib/toast";
import { SettingsSection } from "./SettingsSection";

interface LlmConfigSectionProps {
	config: Record<string, unknown> | undefined;
	t: {
		apiKey: string;
		baseUrl: string;
		model: string;
		temperature: string;
		maxTokens: string;
		testConnection: string;
		testSuccess: string;
		testFailed: string;
		apiKeyRequired: string;
		apiKeyHint: string;
		apiKeyLink: string;
		saveFailed: string;
		llmConfig: string;
	};
	loading?: boolean;
}

/**
 * LLM 配置区块组件
 */
export function LlmConfigSection({
	config,
	t,
	loading = false,
}: LlmConfigSectionProps) {
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

	// 测试 LLM 连接
	const handleTestLlm = async () => {
		const currentApiKey = llmApiKey.trim();
		const currentBaseUrl = llmBaseUrl.trim();
		const currentModel = llmModel.trim();

		if (!currentApiKey || !currentBaseUrl) {
			setTestMessage({
				type: "error",
				text: t.apiKeyRequired,
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
					text: t.testSuccess,
				});
			} else {
				setTestMessage({
					type: "error",
					text: `${t.testFailed}: ${result.error || "Unknown error"}`,
				});
			}
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : "Network error";
			setTestMessage({
				type: "error",
				text: `${t.testFailed}: ${errorMsg}`,
			});
		}
	};

	// 保存 LLM 配置
	const handleSaveLlmConfig = async () => {
		const currentApiKey = llmApiKey.trim();
		const currentBaseUrl = llmBaseUrl.trim();
		const currentModel = llmModel.trim();

		if (!currentApiKey || !currentBaseUrl) {
			return;
		}

		try {
			const llmConfigChanged =
				currentApiKey !== initialLlmConfig.llmApiKey ||
				currentBaseUrl !== initialLlmConfig.llmBaseUrl ||
				currentModel !== initialLlmConfig.llmModel;

			if (llmConfigChanged) {
				await saveAndInitLlmMutation.mutateAsync({
					data: {
						llmApiKey: currentApiKey,
						llmBaseUrl: currentBaseUrl,
						llmModel: currentModel,
					},
				});
			}

			await saveConfigMutation.mutateAsync({
				data: {
					llmTemperature,
					llmMaxTokens,
				},
			});

			setInitialLlmConfig({
				llmApiKey: currentApiKey,
				llmBaseUrl: currentBaseUrl,
				llmModel: currentModel,
			});

			if (llmConfigChanged) {
				toastSuccess("LLM 配置已保存并重新初始化");
			}
		} catch (error) {
			console.error("保存 LLM 配置失败:", error);
			const errorMsg = error instanceof Error ? error.message : String(error);
			toastError(t.saveFailed.replace("{error}", errorMsg));
		}
	};

	return (
		<SettingsSection title={t.llmConfig}>
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
						{t.apiKey} <span className="text-red-500">*</span>
					</label>
					<input
						id="llm-api-key"
						type="password"
						className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
						placeholder={t.apiKey}
						value={llmApiKey}
						onChange={(e) => setLlmApiKey(e.target.value)}
						onBlur={handleSaveLlmConfig}
						disabled={isLoading}
					/>
					<p className="mt-1 text-xs text-muted-foreground">
						{t.apiKeyHint}{" "}
						<a
							href="https://bailian.console.aliyun.com/?tab=api#/api"
							target="_blank"
							rel="noopener noreferrer"
							className="text-primary hover:underline"
						>
							{t.apiKeyLink}
						</a>
					</p>
				</div>

				{/* Base URL */}
				<div>
					<label
						htmlFor="llm-base-url"
						className="mb-1 block text-sm font-medium text-foreground"
					>
						{t.baseUrl} <span className="text-red-500">*</span>
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
							{t.model}
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
							{t.temperature}
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
							{t.maxTokens}
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
						? `${t.testConnection}...`
						: t.testConnection}
				</button>
			</div>
		</SettingsSection>
	);
}
