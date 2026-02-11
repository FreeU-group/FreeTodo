"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
// 注意：需要运行 orval 生成 API hooks 后才能使用
import { useTestAsrConfigApiTestAsrConfigPost } from "@/lib/generated/config/config";
import { useSaveConfig } from "@/lib/query";
import { toastError } from "@/lib/toast";
import { SettingsSection } from "./SettingsSection";

interface AudioAsrConfigSectionProps {
	config: Record<string, unknown> | undefined;
	loading?: boolean;
}

/**
 * 音频识别（ASR）配置区块
 * 参考 LLM 配置样式，支持设置 apiKey / baseUrl / model / sampleRate / format / 语义断句 / 静音阈值 / 心跳
 */
export function AudioAsrConfigSection({ config, loading = false }: AudioAsrConfigSectionProps) {
	const t = useTranslations("page.settings");
	const saveConfigMutation = useSaveConfig();
	const testAsrMutation = useTestAsrConfigApiTestAsrConfigPost();

	const [apiKey, setApiKey] = useState((config?.audioAsrApiKey as string) || "");
	const [baseUrl, setBaseUrl] = useState(
		(config?.audioAsrBaseUrl as string) || "wss://dashscope.aliyuncs.com/api-ws/v1/inference/"
	);
	const [model, setModel] = useState((config?.audioAsrModel as string) || "fun-asr-realtime");
	const [sampleRate, setSampleRate] = useState((config?.audioAsrSampleRate as number) ?? 16000);
	const [format, setFormat] = useState((config?.audioAsrFormat as string) || "pcm");
	const [semanticPunc, setSemanticPunc] = useState(
		(config?.audioAsrSemanticPunctuationEnabled as boolean) ?? false
	);
	const [maxSilence, setMaxSilence] = useState((config?.audioAsrMaxSentenceSilence as number) ?? 1300);
	const [heartbeat, setHeartbeat] = useState((config?.audioAsrHeartbeat as boolean) ?? false);
	const [testMessage, setTestMessage] = useState<{
		type: "success" | "error";
		text: string;
	} | null>(null);

	const isLoading = loading || saveConfigMutation.isPending || testAsrMutation.isPending;

	// 配置加载后同步本地状态
	useEffect(() => {
		if (!config) return;
		if (config.audioAsrApiKey !== undefined) setApiKey((config.audioAsrApiKey as string) || "");
		if (config.audioAsrBaseUrl !== undefined)
			setBaseUrl((config.audioAsrBaseUrl as string) || "wss://dashscope.aliyuncs.com/api-ws/v1/inference/");
		if (config.audioAsrModel !== undefined) setModel((config.audioAsrModel as string) || "fun-asr-realtime");
		if (config.audioAsrSampleRate !== undefined)
			setSampleRate((config.audioAsrSampleRate as number) ?? 16000);
		if (config.audioAsrFormat !== undefined) setFormat((config.audioAsrFormat as string) || "pcm");
		if (config.audioAsrSemanticPunctuationEnabled !== undefined)
			setSemanticPunc((config.audioAsrSemanticPunctuationEnabled as boolean) ?? false);
		if (config.audioAsrMaxSentenceSilence !== undefined)
			setMaxSilence((config.audioAsrMaxSentenceSilence as number) ?? 1300);
		if (config.audioAsrHeartbeat !== undefined) setHeartbeat((config.audioAsrHeartbeat as boolean) ?? false);
	}, [config]);

	const savePartialConfig = async (partial: Record<string, unknown>) => {
		try {
			await saveConfigMutation.mutateAsync({
				data: partial,
			});
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			toastError(t("saveFailed", { error: msg }));
		}
	};

	// 测试 ASR 连接
	const handleTestAsr = async () => {
		const currentApiKey = apiKey.trim();
		const currentBaseUrl = baseUrl.trim();
		const currentModel = model.trim();

		if (!currentApiKey || !currentBaseUrl) {
			setTestMessage({
				type: "error",
				text: t("apiKeyRequired") || "API Key 和 Base URL 不能为空",
			});
			return;
		}

		setTestMessage(null);
		try {
			const response = await testAsrMutation.mutateAsync({
				data: {
					audioAsrApiKey: currentApiKey,
					audioAsrBaseUrl: currentBaseUrl,
					audioAsrModel: currentModel,
					audioAsrSampleRate: Number(sampleRate) || 16000,
					audioAsrFormat: format.trim() || "pcm",
					audioAsrSemanticPunctuationEnabled: semanticPunc,
					audioAsrMaxSentenceSilence: Number(maxSilence) || 1300,
					audioAsrHeartbeat: heartbeat,
				},
			});

			const result = response as { success?: boolean; error?: string };
			if (result.success) {
				setTestMessage({
					type: "success",
					text: t("testSuccess") || "配置验证成功",
				});
			} else {
				setTestMessage({
					type: "error",
					text: `${t("testFailed") || "测试失败"}: ${result.error || "Unknown error"}`,
				});
			}
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : "Network error";
			setTestMessage({
				type: "error",
				text: `${t("testFailed") || "测试失败"}: ${errorMsg}`,
			});
		}
	};

	return (
		<SettingsSection title={t("audioAsrConfig")}>
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

				{/* API Key 和 Base URL 单列布局 */}
				<div className="space-y-3">
					<div>
						<label htmlFor="asr-api-key" className="mb-1 block text-sm font-medium text-foreground">
							API Key <span className="text-red-500">*</span>
						</label>
						<input
							id="asr-api-key"
							type="password"
							className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
							placeholder="sk-..."
							value={apiKey}
							onChange={(e) => setApiKey(e.target.value)}
							onBlur={() =>
								void savePartialConfig({
									audioAsrApiKey: apiKey.trim(),
								})
							}
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

					<div>
						<label htmlFor="asr-base-url" className="mb-1 block text-sm font-medium text-foreground">
							Base URL <span className="text-red-500">*</span>
						</label>
						<input
							id="asr-base-url"
							type="text"
							className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
							placeholder="wss://dashscope.aliyuncs.com/api-ws/v1/inference/"
							value={baseUrl}
							onChange={(e) => setBaseUrl(e.target.value)}
							onBlur={() =>
								void savePartialConfig({
									audioAsrBaseUrl: baseUrl.trim(),
								})
							}
							disabled={isLoading}
						/>
					</div>
				</div>

				{/* 其他字段两栏布局 */}
				<div className="grid grid-cols-1 md:grid-cols-2 gap-3">

				<div>
					<label htmlFor="asr-model" className="mb-1 block text-sm font-medium text-foreground">模型</label>
					<input
						id="asr-model"
						type="text"
						className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
						placeholder="fun-asr-realtime"
						value={model}
						onChange={(e) => setModel(e.target.value)}
						onBlur={() =>
							void savePartialConfig({
								audioAsrModel: model.trim(),
							})
						}
						disabled={isLoading}
					/>
				</div>

				<div>
					<label htmlFor="asr-sample-rate" className="mb-1 block text-sm font-medium text-foreground">采样率 (Hz)</label>
					<input
						id="asr-sample-rate"
						type="number"
						min={8000}
						step={1000}
						className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
						value={sampleRate}
						onChange={(e) => setSampleRate(parseInt(e.target.value, 10) || 16000)}
						onBlur={() =>
							void savePartialConfig({
								audioAsrSampleRate: Number(sampleRate) || 16000,
							})
						}
						disabled={isLoading}
					/>
				</div>

				<div>
					<label htmlFor="asr-format" className="mb-1 block text-sm font-medium text-foreground">格式</label>
					<input
						id="asr-format"
						type="text"
						className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
						placeholder="pcm"
						value={format}
						onChange={(e) => setFormat(e.target.value)}
						onBlur={() =>
							void savePartialConfig({
								audioAsrFormat: format.trim() || "pcm",
							})
						}
						disabled={isLoading}
					/>
				</div>

				<div>
					<label htmlFor="asr-max-silence" className="mb-1 block text-sm font-medium text-foreground">静音阈值 (ms)</label>
					<input
						id="asr-max-silence"
						type="number"
						min={200}
						step={100}
						className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
						value={maxSilence}
						onChange={(e) => setMaxSilence(parseInt(e.target.value, 10) || 1300)}
						onBlur={() =>
							void savePartialConfig({
								audioAsrMaxSentenceSilence: Number(maxSilence) || 1300,
							})
						}
						disabled={isLoading}
					/>
				</div>

				<div className="flex items-center gap-2">
					<input
						type="checkbox"
						id="semantic-punc"
						checked={semanticPunc}
						onChange={(e) => {
							const checked = e.target.checked;
							setSemanticPunc(checked);
							void savePartialConfig({
								audioAsrSemanticPunctuationEnabled: checked,
							});
						}}
						disabled={isLoading}
						className="h-4 w-4 rounded border-input text-primary focus:ring-2 focus:ring-offset-2 focus:ring-primary"
					/>
					<label htmlFor="semantic-punc" className="text-sm text-foreground">
						语义断句（semantic_punctuation）
					</label>
				</div>

				<div className="flex items-center gap-2">
					<input
						type="checkbox"
						id="asr-heartbeat"
						checked={heartbeat}
						onChange={(e) => {
							const checked = e.target.checked;
							setHeartbeat(checked);
							void savePartialConfig({
								audioAsrHeartbeat: checked,
							});
						}}
						disabled={isLoading}
						className="h-4 w-4 rounded border-input text-primary focus:ring-2 focus:ring-offset-2 focus:ring-primary"
					/>
					<label htmlFor="asr-heartbeat" className="text-sm text-foreground">
						WebSocket 心跳（heartbeat）
					</label>
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
						await handleTestAsr();
					}}
					disabled={isLoading || !apiKey.trim() || !baseUrl.trim()}
					className="w-full rounded-md border border-input bg-background px-4 py-2 text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{testAsrMutation.isPending
						? `${t("testConnection") || "测试连接"}...`
						: t("testConnection") || "测试连接"}
				</button>
			</div>
		</SettingsSection>
	);
}
