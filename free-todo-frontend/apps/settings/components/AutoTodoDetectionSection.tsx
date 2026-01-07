"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { useSaveConfig } from "@/lib/query";
import { useNotificationStore } from "@/lib/store/notification-store";
import { toastError, toastSuccess } from "@/lib/toast";
import { SettingsSection } from "./SettingsSection";
import { ToggleSwitch } from "./ToggleSwitch";

interface AutoTodoDetectionSectionProps {
	config: Record<string, unknown> | undefined;
	loading?: boolean;
}

/**
 * 自动待办检测设置区块组件
 */
export function AutoTodoDetectionSection({
	config,
	loading = false,
}: AutoTodoDetectionSectionProps) {
	const tSettings = useTranslations("page.settings");
	const saveConfigMutation = useSaveConfig();

	// 状态管理
	const [autoTodoDetectionEnabled, setAutoTodoDetectionEnabled] =
		useState(false);
	const [whitelistApps, setWhitelistApps] = useState<string[]>([]);
	const [whitelistInput, setWhitelistInput] = useState("");

	// 用于跟踪最后一次保存的时间戳，防止保存后立即被 refetch 覆盖
	const lastSaveTimeRef = useRef<number>(0);

	// 当配置加载完成后，同步本地状态
	// 但如果刚刚保存过配置（500ms 内），则跳过同步，避免被旧值覆盖
	useEffect(() => {
		if (config) {
			const now = Date.now();
			// 如果刚刚保存过配置（500ms 内），跳过同步
			if (now - lastSaveTimeRef.current < 500) {
				return;
			}
			setAutoTodoDetectionEnabled(
				(config.jobsAutoTodoDetectionEnabled as boolean) ?? false,
			);
			// 同步白名单配置（去重处理，避免 React key 冲突）
			const apps = config.jobsAutoTodoDetectionParamsWhitelistApps;
			if (Array.isArray(apps)) {
				// 使用 Set 去重
				setWhitelistApps([...new Set(apps as string[])]);
			} else if (apps && typeof apps === "string") {
				const appsStr = apps as string;
				const parsedApps = appsStr
					.split(",")
					.map((s: string) => s.trim())
					.filter((s: string) => s);
				// 使用 Set 去重
				setWhitelistApps([...new Set(parsedApps)]);
			}
		}
	}, [config]);

	const isLoading = loading || saveConfigMutation.isPending;

	// 自动待办检测处理
	// 与 Todo 专用录制任务联动：同时开启/关闭两个功能
	const handleToggleAutoTodoDetection = async (enabled: boolean) => {
		try {
			// 记录保存时间戳
			lastSaveTimeRef.current = Date.now();

			// 同时保存 autoTodoDetection 和 todoRecorder 的状态
			// 后端 ConfigService 会自动处理联动逻辑
			await saveConfigMutation.mutateAsync({
				data: {
					jobsAutoTodoDetectionEnabled: enabled,
					jobsTodoRecorderEnabled: enabled, // 联动 Todo 专用录制
				},
			});
			setAutoTodoDetectionEnabled(enabled);

			// 同步更新轮询端点状态
			const store = useNotificationStore.getState();
			const existingEndpoint = store.getEndpoint("draft-todos");
			if (existingEndpoint) {
				store.registerEndpoint({
					...existingEndpoint,
					enabled: enabled,
				});
			}

			toastSuccess(
				enabled
					? tSettings("autoTodoDetectionEnabled")
					: tSettings("autoTodoDetectionDisabled"),
			);
		} catch (error) {
			console.error("保存配置失败:", error);
			const errorMsg = error instanceof Error ? error.message : String(error);
			toastError(tSettings("saveFailed", { error: errorMsg }));
			// 失败时清除保存时间戳，允许后续同步
			lastSaveTimeRef.current = 0;
			setAutoTodoDetectionEnabled(!enabled);
		}
	};

	// 白名单处理函数
	const handleAddWhitelistApp = async (app: string) => {
		const trimmedApp = app.trim();
		if (trimmedApp && !whitelistApps.includes(trimmedApp)) {
			const newApps = [...whitelistApps, trimmedApp];
			setWhitelistApps(newApps);
			setWhitelistInput("");
			try {
				lastSaveTimeRef.current = Date.now();
				await saveConfigMutation.mutateAsync({
					data: {
						jobsAutoTodoDetectionParamsWhitelistApps: newApps,
					},
				});
			} catch (error) {
				setWhitelistApps(whitelistApps);
				console.error("保存白名单失败:", error);
				const errorMsg = error instanceof Error ? error.message : String(error);
				toastError(tSettings("saveFailed", { error: errorMsg }));
				lastSaveTimeRef.current = 0;
			}
		}
	};

	const handleRemoveWhitelistApp = async (app: string) => {
		const newApps = whitelistApps.filter((a) => a !== app);
		const oldApps = whitelistApps;
		setWhitelistApps(newApps);
		try {
			lastSaveTimeRef.current = Date.now();
			await saveConfigMutation.mutateAsync({
				data: {
					jobsAutoTodoDetectionParamsWhitelistApps: newApps,
				},
			});
		} catch (error) {
			setWhitelistApps(oldApps);
			console.error("保存白名单失败:", error);
			const errorMsg = error instanceof Error ? error.message : String(error);
			toastError(tSettings("saveFailed", { error: errorMsg }));
			lastSaveTimeRef.current = 0;
		}
	};

	const handleWhitelistKeyDown = async (
		e: React.KeyboardEvent<HTMLInputElement>,
	) => {
		if (e.key === "Enter" && whitelistInput.trim()) {
			e.preventDefault();
			await handleAddWhitelistApp(whitelistInput);
		} else if (
			e.key === "Backspace" &&
			!whitelistInput &&
			whitelistApps.length > 0
		) {
			const lastApp = whitelistApps[whitelistApps.length - 1];
			await handleRemoveWhitelistApp(lastApp);
		}
	};

	return (
		<SettingsSection
			title={tSettings("autoTodoDetectionTitle")}
			description={tSettings("autoTodoDetectionDescription")}
		>
			<div className="space-y-4">
				<div className="flex items-center justify-between">
					<div className="flex-1">
						<label
							htmlFor="auto-todo-detection-toggle"
							className="text-sm font-medium text-foreground"
						>
							{tSettings("autoTodoDetectionLabel")}
						</label>
					</div>
					<ToggleSwitch
						id="auto-todo-detection-toggle"
						enabled={autoTodoDetectionEnabled}
						disabled={isLoading}
						onToggle={handleToggleAutoTodoDetection}
						ariaLabel={tSettings("autoTodoDetectionLabel")}
					/>
				</div>
				{autoTodoDetectionEnabled && (
					<>
						<div className="rounded-md bg-primary/10 p-3">
							<p className="text-xs text-primary">
								{tSettings("autoTodoDetectionHint")}
							</p>
						</div>
						{/* 应用白名单 */}
						<div className="pl-4 border-l-2 border-border">
							<label
								htmlFor="whitelist-input"
								className="mb-1 block text-sm font-medium text-foreground"
							>
								{tSettings("whitelistApps")}
							</label>
							<div className="min-h-[38px] flex flex-wrap gap-1.5 items-center rounded-md border border-input bg-background px-2 py-1.5 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 transition-all">
								{whitelistApps.map((app) => (
									<span
										key={app}
										className="inline-flex items-center gap-1 px-2 py-0.5 text-sm bg-primary/10 text-primary rounded-md border border-primary/20"
									>
										{app}
										<button
											type="button"
											onClick={() => handleRemoveWhitelistApp(app)}
											className="hover:bg-primary/20 rounded-full p-0.5 transition-colors"
											aria-label={`删除 ${app}`}
										>
											<X className="h-3 w-3" />
										</button>
									</span>
								))}
								<input
									id="whitelist-input"
									type="text"
									className="flex-1 min-w-[120px] outline-none bg-transparent text-sm placeholder:text-muted-foreground px-1"
									placeholder={tSettings("whitelistAppsPlaceholder")}
									value={whitelistInput}
									onChange={(e) => setWhitelistInput(e.target.value)}
									onKeyDown={handleWhitelistKeyDown}
									disabled={isLoading}
								/>
							</div>
							<p className="mt-1 text-xs text-muted-foreground">
								{tSettings("whitelistAppsDesc")}
							</p>
						</div>
					</>
				)}
			</div>
		</SettingsSection>
	);
}
