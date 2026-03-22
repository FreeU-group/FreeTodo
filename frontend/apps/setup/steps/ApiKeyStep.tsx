"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { useSetupStore } from "@/lib/store/setup-store";
import { useSaveConfig } from "@/lib/query";
import { useSaveAndInitLlmApiSaveAndInitLlmPost } from "@/lib/generated/config/config";

interface ApiKeyStepProps {
	onNext: () => void;
}

export function ApiKeyStep({ onNext }: ApiKeyStepProps) {
	const { apiKey, apiBaseUrl, apiModel, setApiKey, setApiBaseUrl, setApiModel } =
		useSetupStore();
	const saveConfig = useSaveConfig();
	const saveAndInit = useSaveAndInitLlmApiSaveAndInitLlmPost();

	const [testing, setTesting] = useState(false);
	const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

	const canProceed = apiKey.trim() && apiBaseUrl.trim();

	const handleTest = async () => {
		if (!canProceed) return;
		setTesting(true);
		setMsg(null);
		try {
			const result = (await saveAndInit.mutateAsync({
				data: {
					llmApiKey: apiKey.trim(),
					llmBaseUrl: apiBaseUrl.trim(),
					llmModel: apiModel.trim() || "qwen-plus",
				},
			})) as { success?: boolean; error?: string };

			if (result.success) {
				setMsg({ ok: true, text: "连接成功！" });
			} else {
				setMsg({ ok: false, text: result.error || "连接失败" });
			}
		} catch (e) {
			setMsg({ ok: false, text: e instanceof Error ? e.message : "网络错误" });
		} finally {
			setTesting(false);
		}
	};

	const handleNext = async () => {
		if (!canProceed) return;
		try {
			await saveConfig.mutateAsync({
				data: {
					llmApiKey: apiKey.trim(),
					llmBaseUrl: apiBaseUrl.trim(),
					llmModel: apiModel.trim() || "qwen-plus",
				},
			});
		} catch {
			// config save is best-effort during setup
		}
		onNext();
	};

	return (
		<div className="flex w-full max-w-md flex-col gap-5">
			<div className="text-center">
				<div className="mb-4 flex justify-center">
					<div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/20 text-primary">
						<KeyRound className="h-6 w-6" />
					</div>
				</div>
				<h2 className="text-xl font-bold text-white">配置 AI 服务</h2>
				<p className="mt-1 text-sm text-white/60">
					填入你的大语言模型 API Key，用于驱动 Agent 的核心能力
				</p>
			</div>

			<div className="space-y-3">
				<div>
					<label className="mb-1 block text-xs font-medium text-white/70">
						API Key <span className="text-red-400">*</span>
					</label>
					<input
						type="password"
						className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none transition focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
						placeholder="sk-..."
						value={apiKey}
						onChange={(e) => setApiKey(e.target.value)}
					/>
					<p className="mt-1 text-xs text-white/40">
						推荐使用{" "}
						<a
							href="https://bailian.console.aliyun.com/?tab=api#/api"
							target="_blank"
							rel="noopener noreferrer"
							className="text-primary/80 hover:underline"
						>
							阿里云百炼
						</a>{" "}
						API Key
					</p>
				</div>

				<div>
					<label className="mb-1 block text-xs font-medium text-white/70">
						Base URL <span className="text-red-400">*</span>
					</label>
					<input
						type="text"
						className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none transition focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
						placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1"
						value={apiBaseUrl}
						onChange={(e) => setApiBaseUrl(e.target.value)}
					/>
				</div>

				<div>
					<label className="mb-1 block text-xs font-medium text-white/70">
						模型
					</label>
					<input
						type="text"
						className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none transition focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
						placeholder="qwen-plus"
						value={apiModel}
						onChange={(e) => setApiModel(e.target.value)}
					/>
				</div>
			</div>

			{msg && (
				<div
					className={`rounded-lg px-3 py-2 text-sm font-medium ${
						msg.ok
							? "bg-green-500/10 text-green-400"
							: "bg-red-500/10 text-red-400"
					}`}
				>
					{msg.text}
				</div>
			)}

			<div className="flex gap-3">
				<button
					type="button"
					onClick={handleTest}
					disabled={!canProceed || testing}
					className="flex-1 rounded-lg border border-white/10 bg-white/5 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/10 disabled:opacity-40"
				>
					{testing ? "测试中…" : "测试连接并保存"}
				</button>
				<button
					type="button"
					onClick={handleNext}
					disabled={!canProceed}
					className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-bold text-white shadow-lg shadow-primary/20 transition hover:brightness-110 disabled:opacity-40"
				>
					下一步
				</button>
			</div>
		</div>
	);
}
