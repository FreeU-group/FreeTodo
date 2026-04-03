"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { PasswordInput } from "@/components/common/ui/PasswordInput";
import {
	useSaveAndInitLlmApiSaveAndInitLlmPost,
	useTestLlmConfigApiTestLlmConfigPost,
} from "@/lib/generated/config/config";
import { customFetcher } from "@/lib/api/fetcher";
import { useSaveConfig } from "@/lib/query";
import { toastError } from "@/lib/toast";
import { SettingsSection } from "./SettingsSection";

interface LlmConfigSectionProps {
	config: Record<string, unknown> | undefined;
	loading?: boolean;
}

type ChannelResult = {
	success: boolean;
	error?: string;
	model?: string;
	baseUrl?: string;
};

type ChannelTestResults = {
	main?: ChannelResult;
	agent?: ChannelResult;
};

const INPUT_CLASS =
	"w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

function ChannelStatusBadge({ result, label }: { result: ChannelResult; label: string }) {
	return (
		<div
			className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium ${
				result.success
					? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
					: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
			}`}
		>
			<span>{result.success ? "\u2713" : "\u2717"}</span>
			<span className="font-semibold">{label}</span>
			{result.model && (
				<span className="opacity-70">({result.model})</span>
			)}
			{!result.success && result.error && (
				<span className="ml-1 truncate opacity-80" title={result.error}>
					{result.error.length > 80 ? `${result.error.slice(0, 80)}...` : result.error}
				</span>
			)}
		</div>
	);
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
	const [llmSmallModel, setLlmSmallModel] = useState(
		(config?.llmSmallModel as string) || "",
	);
	const [agentApiKey, setAgentApiKey] = useState(
		(config?.llmAgentApiKey as string) || "",
	);
	const [agentBaseUrl, setAgentBaseUrl] = useState(
		(config?.llmAgentBaseUrl as string) || "",
	);
	const [agentModel, setAgentModel] = useState(
		(config?.llmAgentModel as string) || "",
	);
	const [chatModel, setChatModel] = useState(
		(config?.llmChatModel as string) || "",
	);
	const [perceptionIntentModel, setPerceptionIntentModel] = useState(
		(config?.perceptionIntentModel as string) || "",
	);

	const [initialLlmConfig, setInitialLlmConfig] = useState({
		llmApiKey: (config?.llmApiKey as string) || "",
		llmBaseUrl: (config?.llmBaseUrl as string) || "",
		llmModel: (config?.llmModel as string) || "qwen-plus",
		llmTemperature: (config?.llmTemperature as number) ?? 0.7,
		llmMaxTokens: (config?.llmMaxTokens as number) ?? 2048,
		llmSmallModel: (config?.llmSmallModel as string) || "",
		agentApiKey: (config?.llmAgentApiKey as string) || "",
		agentBaseUrl: (config?.llmAgentBaseUrl as string) || "",
		agentModel: (config?.llmAgentModel as string) || "",
		chatModel: (config?.llmChatModel as string) || "",
		perceptionIntentModel: (config?.perceptionIntentModel as string) || "",
	});
	const [testMessage, setTestMessage] = useState<{
		type: "success" | "error";
		text: string;
	} | null>(null);
	const [channelResults, setChannelResults] = useState<ChannelTestResults | null>(null);
	const [testingChannels, setTestingChannels] = useState(false);
	const [agentTripletError, setAgentTripletError] = useState<string | null>(null);

	const isLoading =
		loading ||
		saveConfigMutation.isPending ||
		testLlmMutation.isPending ||
		saveAndInitLlmMutation.isPending ||
		testingChannels;

	const validateAgentTriplet = useCallback((): boolean => {
		const key = agentApiKey.trim();
		const url = agentBaseUrl.trim();
		const model = agentModel.trim();
		const filled = [!!key, !!url, !!model];
		const filledCount = filled.filter(Boolean).length;

		if (filledCount !== 0 && filledCount !== 3) {
			const missing: string[] = [];
			if (!key) missing.push("API Key");
			if (!url) missing.push("Base URL");
			if (!model) missing.push("模型");
			setAgentTripletError(
				`Agent 专属模型配置不完整，缺少: ${missing.join(", ")}。请全部填写或全部留空。`,
			);
			return false;
		}
		setAgentTripletError(null);
		return true;
	}, [agentApiKey, agentBaseUrl, agentModel]);

	useEffect(() => {
		if (config) {
			if (config.llmApiKey !== undefined)
				setLlmApiKey((config.llmApiKey as string) || "");
			if (config.llmBaseUrl !== undefined)
				setLlmBaseUrl((config.llmBaseUrl as string) || "");
			if (config.llmModel !== undefined)
				setLlmModel((config.llmModel as string) || "qwen-plus");
			if (config.llmTemperature !== undefined)
				setLlmTemperature((config.llmTemperature as number) ?? 0.7);
			if (config.llmMaxTokens !== undefined)
				setLlmMaxTokens((config.llmMaxTokens as number) ?? 2048);
			if (config.llmSmallModel !== undefined)
				setLlmSmallModel((config.llmSmallModel as string) || "");
			if (config.llmAgentApiKey !== undefined)
				setAgentApiKey((config.llmAgentApiKey as string) || "");
			if (config.llmAgentBaseUrl !== undefined)
				setAgentBaseUrl((config.llmAgentBaseUrl as string) || "");
			if (config.llmAgentModel !== undefined)
				setAgentModel((config.llmAgentModel as string) || "");
			if (config.llmChatModel !== undefined)
				setChatModel((config.llmChatModel as string) || "");
			if (config.perceptionIntentModel !== undefined)
				setPerceptionIntentModel(
					(config.perceptionIntentModel as string) || "",
				);

			setInitialLlmConfig({
				llmApiKey: (config.llmApiKey as string) || "",
				llmBaseUrl: (config.llmBaseUrl as string) || "",
				llmModel: (config.llmModel as string) || "qwen-plus",
				llmTemperature: (config.llmTemperature as number) ?? 0.7,
				llmMaxTokens: (config.llmMaxTokens as number) ?? 2048,
				llmSmallModel: (config.llmSmallModel as string) || "",
				agentApiKey: (config.llmAgentApiKey as string) || "",
				agentBaseUrl: (config.llmAgentBaseUrl as string) || "",
				agentModel: (config.llmAgentModel as string) || "",
				chatModel: (config.llmChatModel as string) || "",
				perceptionIntentModel:
					(config.perceptionIntentModel as string) || "",
			});
		}
	}, [config]);

	const handleTestChannels = async () => {
		if (!llmApiKey.trim() || !llmBaseUrl.trim()) {
			setTestMessage({ type: "error", text: t("apiKeyRequired") });
			return;
		}

		setTestMessage(null);
		setChannelResults(null);
		setTestingChannels(true);

		try {
			const response = await customFetcher<{
				success: boolean;
				channels: ChannelTestResults;
			}>("/api/test-llm-channels", {
				method: "POST",
				data: {
					llmApiKey: llmApiKey.trim(),
					llmBaseUrl: llmBaseUrl.trim(),
					llmModel: llmModel.trim(),
					llmAgentApiKey: agentApiKey.trim(),
					llmAgentBaseUrl: agentBaseUrl.trim(),
					llmAgentModel: agentModel.trim(),
				},
			});

			if (response?.channels) {
				setChannelResults(response.channels);
				const allOk =
					response.channels.main?.success !== false &&
					(response.channels.agent === undefined || response.channels.agent.success);
				if (allOk) {
					setTestMessage({ type: "success", text: "所有通道连接正常" });
				} else {
					setTestMessage({ type: "error", text: "部分通道连接失败，请检查下方详情" });
				}
			}
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : "Network error";
			setTestMessage({ type: "error", text: `连通性测试失败: ${errorMsg}` });
		} finally {
			setTestingChannels(false);
		}
	};

	const handleSaveLlmConfig = async () => {
		const currentApiKey = llmApiKey.trim();
		const currentBaseUrl = llmBaseUrl.trim();
		const currentModel = llmModel.trim();

		const llmCoreConfigChanged =
			currentApiKey !== initialLlmConfig.llmApiKey ||
			currentBaseUrl !== initialLlmConfig.llmBaseUrl ||
			currentModel !== initialLlmConfig.llmModel;

		const agentConfigChanged =
			agentApiKey !== initialLlmConfig.agentApiKey ||
			agentBaseUrl !== initialLlmConfig.agentBaseUrl ||
			agentModel !== initialLlmConfig.agentModel ||
			chatModel !== initialLlmConfig.chatModel ||
			perceptionIntentModel !== initialLlmConfig.perceptionIntentModel;

		const otherConfigChanged =
			llmTemperature !== initialLlmConfig.llmTemperature ||
			llmMaxTokens !== initialLlmConfig.llmMaxTokens ||
			llmSmallModel !== initialLlmConfig.llmSmallModel ||
			agentConfigChanged;

		if (!llmCoreConfigChanged && !otherConfigChanged) {
			return;
		}

		if (!validateAgentTriplet()) {
			return;
		}

		try {
			const saveResult = await saveConfigMutation.mutateAsync({
				data: {
					llmApiKey: currentApiKey,
					llmBaseUrl: currentBaseUrl,
					llmModel: currentModel,
					llmTemperature,
					llmMaxTokens,
					llmSmallModel,
					llmChatModel: chatModel.trim(),
					llmAgentApiKey: agentApiKey.trim(),
					llmAgentBaseUrl: agentBaseUrl.trim(),
					llmAgentModel: agentModel.trim(),
					perceptionIntentModel: perceptionIntentModel.trim(),
				},
			});

			const saveResponse = saveResult as { success?: boolean; error?: string; field?: string };
			if (saveResponse.success === false) {
				if (saveResponse.field === "agent_triplet") {
					setAgentTripletError(saveResponse.error || "Agent 配置不完整");
				} else {
					toastError(saveResponse.error || "保存失败");
				}
				return;
			}

			setInitialLlmConfig({
				llmApiKey: currentApiKey,
				llmBaseUrl: currentBaseUrl,
				llmModel: currentModel,
				llmTemperature,
				llmMaxTokens,
				llmSmallModel,
				agentApiKey: agentApiKey.trim(),
				agentBaseUrl: agentBaseUrl.trim(),
				agentModel: agentModel.trim(),
				chatModel: chatModel.trim(),
				perceptionIntentModel: perceptionIntentModel.trim(),
			});

			if (llmCoreConfigChanged && currentApiKey && currentBaseUrl) {
				try {
					const result = await saveAndInitLlmMutation.mutateAsync({
						data: {
							llmApiKey: currentApiKey,
							llmBaseUrl: currentBaseUrl,
							llmModel: currentModel,
						},
					});

					const response = result as { success?: boolean; error?: string };
					if (response.success) {
						setTestMessage({ type: "success", text: t("testSuccess") });
						await queryClient.invalidateQueries({
							queryKey: ["llm-status"],
						});
					} else {
						setTestMessage({
							type: "error",
							text: `${t("testFailed")}: ${response.error || "Unknown error"}`,
						});
					}
				} catch (initError) {
					const errorMsg =
						initError instanceof Error
							? initError.message
							: String(initError);
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
				{/* 全局消息提示 */}
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

				{/* 通道连通性结果 */}
				{channelResults && (
					<div className="space-y-1.5">
						{channelResults.main && (
							<ChannelStatusBadge result={channelResults.main} label="主通道" />
						)}
						{channelResults.agent && (
							<ChannelStatusBadge result={channelResults.agent} label="Agent 通道" />
						)}
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
					<PasswordInput
						id="llm-api-key"
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
						className={INPUT_CLASS}
						placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1"
						value={llmBaseUrl}
						onChange={(e) => setLlmBaseUrl(e.target.value)}
						onBlur={handleSaveLlmConfig}
						disabled={isLoading}
					/>
				</div>

				{/* Main Model / Temperature / Max Tokens */}
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
							className={INPUT_CLASS}
							placeholder="qwen-plus"
							value={llmModel}
							onChange={(e) => setLlmModel(e.target.value)}
							onBlur={handleSaveLlmConfig}
							disabled={isLoading}
						/>
						<p className="mt-1 text-xs text-muted-foreground">
							{t("modelHint")}
						</p>
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
							className={INPUT_CLASS}
							value={llmTemperature}
							onChange={(e) =>
								setLlmTemperature(parseFloat(e.target.value))
							}
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
							className={INPUT_CLASS}
							value={llmMaxTokens}
							onChange={(e) =>
								setLlmMaxTokens(parseInt(e.target.value, 10))
							}
							onBlur={handleSaveLlmConfig}
							disabled={isLoading}
						/>
					</div>
				</div>

				{/* Small Model */}
				<div>
					<label
						htmlFor="llm-small-model"
						className="mb-1 block text-sm font-medium text-foreground"
					>
						{t("smallModel")}
					</label>
					<input
						id="llm-small-model"
						type="text"
						className={INPUT_CLASS}
						placeholder="qwen-turbo"
						value={llmSmallModel}
						onChange={(e) => setLlmSmallModel(e.target.value)}
						onBlur={handleSaveLlmConfig}
						disabled={isLoading}
					/>
					<p className="mt-1 text-xs text-muted-foreground">
						{t("smallModelHint")}
					</p>
				</div>

				{/* 场景模型覆盖 */}
				<div className="grid grid-cols-2 gap-3">
					<div>
						<label
							htmlFor="llm-chat-model"
							className="mb-1 block text-sm font-medium text-foreground"
						>
							聊天模型
						</label>
						<input
							id="llm-chat-model"
							type="text"
							className={INPUT_CLASS}
							placeholder="留空则跟随 Agent 或主模型"
							value={chatModel}
							onChange={(e) => setChatModel(e.target.value)}
							onBlur={handleSaveLlmConfig}
							disabled={isLoading}
						/>
						<p className="mt-1 text-xs text-muted-foreground">
							AI 对话使用的模型，留空则自动选择
						</p>
					</div>
					<div>
						<label
							htmlFor="llm-perception-model"
							className="mb-1 block text-sm font-medium text-foreground"
						>
							感知待办模型
						</label>
						<input
							id="llm-perception-model"
							type="text"
							className={INPUT_CLASS}
							placeholder="留空则跟随 Agent 或主模型"
							value={perceptionIntentModel}
							onChange={(e) => setPerceptionIntentModel(e.target.value)}
							onBlur={handleSaveLlmConfig}
							disabled={isLoading}
						/>
						<p className="mt-1 text-xs text-muted-foreground">
							感知待办意图识别使用的模型
						</p>
					</div>
				</div>

				{/* Agent 专属模型（OpenRouter 等） */}
				<div
					className={`mt-4 rounded-lg border p-3 space-y-3 ${
						agentTripletError
							? "border-red-400 bg-red-50 dark:border-red-600 dark:bg-red-900/10"
							: "border-dashed border-primary/30 bg-primary/5"
					}`}
				>
					<div>
						<p className="text-sm font-medium text-foreground">
							Agent 专属模型（可选）
						</p>
						<p className="text-xs text-muted-foreground">
							配置后任务执行、日历规划、用户画像始终使用此模型。三个字段必须全部填写或全部留空。
						</p>
					</div>

					{agentTripletError && (
						<div className="rounded-md bg-red-100 px-3 py-2 text-xs font-medium text-red-800 dark:bg-red-900/30 dark:text-red-400">
							{agentTripletError}
						</div>
					)}

					<div>
						<label
							htmlFor="agent-api-key"
							className="mb-1 block text-xs font-medium text-foreground"
						>
							API Key
						</label>
						<PasswordInput
							id="agent-api-key"
							placeholder="sk-or-v1-..."
							value={agentApiKey}
							onChange={(e) => {
								setAgentApiKey(e.target.value);
								setAgentTripletError(null);
							}}
							onBlur={handleSaveLlmConfig}
							disabled={isLoading}
						/>
						<p className="mt-1 text-xs text-muted-foreground">
							OpenRouter:{" "}
							<a
								href="https://openrouter.ai/settings/keys"
								target="_blank"
								rel="noopener noreferrer"
								className="text-primary hover:underline"
							>
								获取 API Key
							</a>
						</p>
					</div>
					<div className="grid grid-cols-2 gap-3">
						<div>
							<label
								htmlFor="agent-base-url"
								className="mb-1 block text-xs font-medium text-foreground"
							>
								Base URL
							</label>
							<input
								id="agent-base-url"
								type="text"
								className={INPUT_CLASS}
								placeholder="https://openrouter.ai/api/v1"
								value={agentBaseUrl}
								onChange={(e) => {
									setAgentBaseUrl(e.target.value);
									setAgentTripletError(null);
								}}
								onBlur={handleSaveLlmConfig}
								disabled={isLoading}
							/>
						</div>
						<div>
							<label
								htmlFor="agent-model"
								className="mb-1 block text-xs font-medium text-foreground"
							>
								模型
							</label>
							<input
								id="agent-model"
								type="text"
								className={INPUT_CLASS}
								placeholder="anthropic/claude-opus-4.6"
								value={agentModel}
								onChange={(e) => {
									setAgentModel(e.target.value);
									setAgentTripletError(null);
								}}
								onBlur={handleSaveLlmConfig}
								disabled={isLoading}
							/>
						</div>
					</div>
				</div>

				{/* 测试所有通道连通性 */}
				<button
					type="button"
					onClick={async () => {
						if (document.activeElement instanceof HTMLElement) {
							document.activeElement.blur();
						}
						await new Promise((resolve) => setTimeout(resolve, 50));
						await handleTestChannels();
					}}
					disabled={isLoading || !llmApiKey.trim() || !llmBaseUrl.trim()}
					className="w-full rounded-md border border-input bg-background px-4 py-2 text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{testingChannels
						? "测试连通性..."
						: "测试所有通道连通性"}
				</button>
			</div>
		</SettingsSection>
	);
}
