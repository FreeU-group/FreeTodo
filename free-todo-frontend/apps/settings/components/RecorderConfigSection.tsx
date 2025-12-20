"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { useSaveConfig } from "@/lib/query";
import { toastError } from "@/lib/toast";
import { SettingsSection } from "./SettingsSection";
import { ToggleSwitch } from "./ToggleSwitch";

interface RecorderConfigSectionProps {
	config: Record<string, unknown> | undefined;
	t: {
		basicSettings: string;
		enableBlacklist: string;
		enableBlacklistDesc: string;
		appBlacklist: string;
		blacklistPlaceholder: string;
		blacklistDesc: string;
		saveFailed: string;
	};
	loading?: boolean;
}

/**
 * 录制配置区块组件（应用黑名单设置）
 * 注：录制开关已移至定时任务管理中的"屏幕录制"任务
 */
export function RecorderConfigSection({
	config,
	t,
	loading = false,
}: RecorderConfigSectionProps) {
	const saveConfigMutation = useSaveConfig();

	// 黑名单配置状态
	const [blacklistEnabled, setBlacklistEnabled] = useState(
		(config?.jobsRecorderParamsBlacklistEnabled as boolean) ?? false,
	);
	const [blacklistApps, setBlacklistApps] = useState<string[]>(() => {
		const apps = config?.jobsRecorderParamsBlacklistApps;
		if (Array.isArray(apps)) {
			return apps as string[];
		}
		const appsStr = String(apps || "");
		if (appsStr) {
			return appsStr
				.split(",")
				.map((s: string) => s.trim())
				.filter((s: string) => s);
		}
		return [];
	});
	const [blacklistInput, setBlacklistInput] = useState("");

	const isLoading = loading || saveConfigMutation.isPending;

	// 黑名单处理
	const handleAddBlacklistApp = async (app: string) => {
		const trimmedApp = app.trim();
		if (trimmedApp && !blacklistApps.includes(trimmedApp)) {
			const newApps = [...blacklistApps, trimmedApp];
			setBlacklistApps(newApps);
			setBlacklistInput("");
			try {
				await saveConfigMutation.mutateAsync({
					data: {
						jobsRecorderParamsBlacklistApps: newApps,
					},
				});
			} catch (error) {
				setBlacklistApps(blacklistApps);
				console.error("保存黑名单失败:", error);
			}
		}
	};

	const handleRemoveBlacklistApp = async (app: string) => {
		const newApps = blacklistApps.filter((a) => a !== app);
		const oldApps = blacklistApps;
		setBlacklistApps(newApps);
		try {
			await saveConfigMutation.mutateAsync({
				data: {
					jobsRecorderParamsBlacklistApps: newApps,
				},
			});
		} catch (error) {
			setBlacklistApps(oldApps);
			console.error("保存黑名单失败:", error);
		}
	};

	const handleBlacklistKeyDown = async (
		e: React.KeyboardEvent<HTMLInputElement>,
	) => {
		if (e.key === "Enter" && blacklistInput.trim()) {
			e.preventDefault();
			await handleAddBlacklistApp(blacklistInput);
		} else if (
			e.key === "Backspace" &&
			!blacklistInput &&
			blacklistApps.length > 0
		) {
			const lastApp = blacklistApps[blacklistApps.length - 1];
			await handleRemoveBlacklistApp(lastApp);
		}
	};

	const handleToggleBlacklist = async (newValue: boolean) => {
		setBlacklistEnabled(newValue);
		try {
			await saveConfigMutation.mutateAsync({
				data: {
					jobsRecorderParamsBlacklistEnabled: newValue,
				},
			});
		} catch (error) {
			setBlacklistEnabled(blacklistEnabled);
			console.error("保存黑名单设置失败:", error);
			const errorMsg = error instanceof Error ? error.message : String(error);
			toastError(t.saveFailed.replace("{error}", errorMsg));
		}
	};

	return (
		<SettingsSection title={t.basicSettings}>
			<div className="space-y-4">
				{/* 启用黑名单 */}
				<div className="flex items-center justify-between">
					<div className="flex-1">
						<p className="text-sm font-medium text-foreground">
							{t.enableBlacklist}
						</p>
						<p className="mt-0.5 text-xs text-muted-foreground">
							{t.enableBlacklistDesc}
						</p>
					</div>
					<ToggleSwitch
						enabled={blacklistEnabled}
						disabled={isLoading}
						onToggle={handleToggleBlacklist}
					/>
				</div>

				{/* 应用黑名单列表 */}
				{blacklistEnabled && (
					<div className="pl-4 border-l-2 border-border">
						<label
							htmlFor="blacklist-input"
							className="mb-1 block text-sm font-medium text-foreground"
						>
							{t.appBlacklist}
						</label>
						<div className="min-h-[38px] flex flex-wrap gap-1.5 items-center rounded-md border border-input bg-background px-2 py-1.5 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 transition-all">
							{blacklistApps.map((app) => (
								<span
									key={app}
									className="inline-flex items-center gap-1 px-2 py-0.5 text-sm bg-primary/10 text-primary rounded-md border border-primary/20"
								>
									{app}
									<button
										type="button"
										onClick={() => handleRemoveBlacklistApp(app)}
										className="hover:bg-primary/20 rounded-full p-0.5 transition-colors"
										aria-label={`删除 ${app}`}
									>
										<X className="h-3 w-3" />
									</button>
								</span>
							))}
							<input
								id="blacklist-input"
								type="text"
								className="flex-1 min-w-[120px] outline-none bg-transparent text-sm placeholder:text-muted-foreground px-1"
								placeholder={t.blacklistPlaceholder}
								value={blacklistInput}
								onChange={(e) => setBlacklistInput(e.target.value)}
								onKeyDown={handleBlacklistKeyDown}
								disabled={isLoading}
							/>
						</div>
						<p className="mt-1 text-xs text-muted-foreground">
							{t.blacklistDesc}
						</p>
					</div>
				)}
			</div>
		</SettingsSection>
	);
}
