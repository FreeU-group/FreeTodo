"use client";

import { CheckCircle2, ExternalLink, Loader2, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { SettingsSection } from "./index";

interface IFlowConfigSectionProps {
	config: unknown;
	loading?: boolean;
}

/**
 * iFlow CLI 配置区块
 * - 显示 iFlow CLI 安装状态
 * - 不涉及 API Key 配置（iFlow CLI 自行管理认证）
 */
export function IFlowConfigSection({
	config: _config,
	loading = false,
}: IFlowConfigSectionProps) {
	const t = useTranslations("page.settings");

	const [isChecking, setIsChecking] = useState(false);
	const [cliStatus, setCliStatus] = useState<{
		installed: boolean;
		version: string | null;
		message: string;
	} | null>(null);

	const checkCliStatus = useCallback(async () => {
		setIsChecking(true);
		try {
			const response = await fetch(`/api/test-iflow-cli`, {
				method: "GET",
				headers: {
					"Content-Type": "application/json",
				},
			});

			const data = await response.json();

			if (data.success !== undefined) {
				setCliStatus({
					installed: data.installed || false,
					version: data.version || null,
					message: data.message || "",
				});
			} else {
				setCliStatus({
					installed: false,
					version: null,
					message: data.error || "检查失败",
				});
			}
		} catch (error) {
			console.error("检查 iFlow CLI 状态失败:", error);
			const errorMsg = error instanceof Error ? error.message : "Network error";
			setCliStatus({
				installed: false,
				version: null,
				message: `检查失败: ${errorMsg}`,
			});
		} finally {
			setIsChecking(false);
		}
	}, []);

	// 组件加载时自动检查状态
	useEffect(() => {
		void checkCliStatus();
	}, [checkCliStatus]);

	return (
		<SettingsSection title={t("iflowConfigTitle")}>
			<div className="space-y-4">
				{/* 状态显示 */}
				<div className="space-y-2">
					<div className="flex items-center justify-between">
						<span className="block text-sm font-medium text-foreground">
							{t("iflowCliStatus") || "iFlow CLI 状态"}
						</span>
						<button
							type="button"
							onClick={() => void checkCliStatus()}
							disabled={isChecking || loading}
							className={cn(
								"flex items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium transition-colors",
								"hover:bg-accent hover:text-accent-foreground",
								"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
								"disabled:cursor-not-allowed disabled:opacity-50",
							)}
						>
							{isChecking ? (
								<Loader2 className="h-3 w-3 animate-spin" />
							) : (
								<CheckCircle2 className="h-3 w-3" />
							)}
							{t("refresh") || "刷新"}
						</button>
					</div>

					{/* 状态信息 */}
					{cliStatus && (
						<div
							className={cn(
								"rounded-lg px-3 py-2 text-sm",
								cliStatus.installed
									? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
									: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
							)}
						>
							<div className="flex items-start gap-2">
								{cliStatus.installed ? (
									<CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
								) : (
									<XCircle className="h-5 w-5 shrink-0 mt-0.5" />
								)}
								<div className="flex-1">
									<p className="font-medium">
										{cliStatus.installed
											? t("iflowCliInstalled") || "iFlow CLI 已安装"
											: t("iflowCliNotInstalled") || "iFlow CLI 未安装"}
									</p>
									{cliStatus.version && (
										<p className="text-xs mt-1 opacity-80">
											{t("version") || "版本"}: {cliStatus.version}
										</p>
									)}
									<p className="text-xs mt-1 opacity-80">{cliStatus.message}</p>
								</div>
							</div>
						</div>
					)}

					{/* 安装说明 */}
					<div className="rounded-lg border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
						<p className="font-medium mb-2">
							{t("iflowInstallHint") || "如何安装 iFlow CLI？"}
						</p>
						<div className="space-y-1">
							<p>
								<strong>macOS/Linux:</strong>
							</p>
							<code className="block bg-background px-2 py-1 rounded text-xs font-mono">
								bash -c "$(curl -fsSL
								https://gitee.com/iflow-ai/iflow-cli/raw/main/install.sh)"
							</code>
							<p className="mt-2">
								<strong>Windows:</strong>
							</p>
							<code className="block bg-background px-2 py-1 rounded text-xs font-mono">
								npm i -g @iflow-ai/iflow-cli@latest
							</code>
							<p className="mt-2">
								{t("iflowInstallNote") ||
									"安装完成后，请刷新此页面以检查状态。"}
							</p>
						</div>
						<a
							href="https://platform.iflow.cn/cli/quickstart"
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-1 mt-2 text-primary hover:underline"
						>
							{t("iflowInstallLink") || "查看完整安装指南"}
							<ExternalLink className="h-3 w-3" />
						</a>
					</div>
				</div>
			</div>
		</SettingsSection>
	);
}
