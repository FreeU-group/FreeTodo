"use client";

import { Check, ChevronUp, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSaveConfig } from "@/lib/query";
import { toastError, toastSuccess } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { SettingsSection } from "./SettingsSection";
import { ToggleSwitch } from "./ToggleSwitch";

interface AutoTodoDetectionSectionProps {
	config: Record<string, unknown> | undefined;
	loading?: boolean;
}

const PRESET_APPS = [
	{ name: "微信", aliases: ["WeChat", "weixin"] },
	{ name: "飞书", aliases: ["Feishu", "Lark"] },
	{ name: "钉钉", aliases: ["DingTalk"] },
	{ name: "企业微信", aliases: ["WeCom"] },
	{ name: "Slack", aliases: [] },
	{ name: "Microsoft Teams", aliases: ["Teams"] },
	{ name: "Telegram", aliases: [] },
	{ name: "Discord", aliases: [] },
] as const;

export function AutoTodoDetectionSection({
	config,
	loading = false,
}: AutoTodoDetectionSectionProps) {
	const tSettings = useTranslations("page.settings");
	const saveConfigMutation = useSaveConfig();

	const [enabled, setEnabled] = useState(false);
	const [whitelistApps, setWhitelistApps] = useState<string[]>([]);
	const [showAddPanel, setShowAddPanel] = useState(false);
	const [customInput, setCustomInput] = useState("");
	const lastSaveTimeRef = useRef<number>(0);
	const addPanelRef = useRef<HTMLDivElement>(null);
	const addBtnRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		if (config) {
			if (Date.now() - lastSaveTimeRef.current < 500) return;
			setEnabled(
				(config.jobsAutoTodoDetectionEnabled as boolean) ?? false,
			);
			const apps = config.jobsAutoTodoDetectionParamsWhitelistApps;
			if (Array.isArray(apps)) {
				setWhitelistApps(apps as string[]);
			}
		}
	}, [config]);

	useEffect(() => {
		if (!showAddPanel) return;
		const handleClickOutside = (e: MouseEvent) => {
			if (
				addPanelRef.current &&
				!addPanelRef.current.contains(e.target as Node) &&
				addBtnRef.current &&
				!addBtnRef.current.contains(e.target as Node)
			) {
				setShowAddPanel(false);
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [showAddPanel]);

	const isLoading = loading || saveConfigMutation.isPending;

	const saveWhitelist = useCallback(
		async (newApps: string[]) => {
			try {
				lastSaveTimeRef.current = Date.now();
				await saveConfigMutation.mutateAsync({
					data: { jobsAutoTodoDetectionParamsWhitelistApps: newApps },
				});
			} catch (error) {
				lastSaveTimeRef.current = 0;
				const errorMsg =
					error instanceof Error ? error.message : String(error);
				toastError(tSettings("saveFailed", { error: errorMsg }));
			}
		},
		[saveConfigMutation, tSettings],
	);

	const handleToggle = async (newValue: boolean) => {
		try {
			lastSaveTimeRef.current = Date.now();
			await saveConfigMutation.mutateAsync({
				data: { jobsAutoTodoDetectionEnabled: newValue },
			});
			setEnabled(newValue);
			toastSuccess(
				newValue
					? tSettings("autoTodoDetectionEnabled")
					: tSettings("autoTodoDetectionDisabled"),
			);
		} catch (error) {
			lastSaveTimeRef.current = 0;
			setEnabled(!newValue);
			const errorMsg =
				error instanceof Error ? error.message : String(error);
			toastError(tSettings("saveFailed", { error: errorMsg }));
		}
	};

	const isAppInWhitelist = (appName: string, aliases: readonly string[]) => {
		const allNames = [appName, ...aliases].map((n) => n.toLowerCase());
		return whitelistApps.some((wa) =>
			allNames.some((n) => n === wa.toLowerCase()),
		);
	};

	const handleAddPresetApp = async (
		appName: string,
		aliases: readonly string[],
	) => {
		if (isAppInWhitelist(appName, aliases)) {
			const allNames = new Set(
				[appName, ...aliases].map((n) => n.toLowerCase()),
			);
			const newApps = whitelistApps.filter(
				(wa) => !allNames.has(wa.toLowerCase()),
			);
			setWhitelistApps(newApps);
			await saveWhitelist(newApps);
		} else {
			const newApps = [...whitelistApps, appName, ...aliases];
			setWhitelistApps(newApps);
			await saveWhitelist(newApps);
		}
	};

	const handleAddCustomApp = async () => {
		const trimmed = customInput.trim();
		if (!trimmed) return;
		if (
			whitelistApps.some(
				(wa) => wa.toLowerCase() === trimmed.toLowerCase(),
			)
		) {
			return;
		}
		const newApps = [...whitelistApps, trimmed];
		setWhitelistApps(newApps);
		setCustomInput("");
		await saveWhitelist(newApps);
	};

	const handleRemoveApp = async (appToRemove: string) => {
		const preset = PRESET_APPS.find(
			(p) =>
				p.name.toLowerCase() === appToRemove.toLowerCase() ||
				p.aliases.some(
					(a) => a.toLowerCase() === appToRemove.toLowerCase(),
				),
		);
		let newApps: string[];
		if (preset) {
			const allNames = new Set(
				[preset.name, ...preset.aliases].map((n) => n.toLowerCase()),
			);
			newApps = whitelistApps.filter(
				(wa) => !allNames.has(wa.toLowerCase()),
			);
		} else {
			newApps = whitelistApps.filter((wa) => wa !== appToRemove);
		}
		setWhitelistApps(newApps);
		await saveWhitelist(newApps);
	};

	const getDisplayApps = () => {
		const displayed = new Set<string>();
		const result: string[] = [];
		for (const app of whitelistApps) {
			const preset = PRESET_APPS.find(
				(p) =>
					p.name.toLowerCase() === app.toLowerCase() ||
					p.aliases.some(
						(a) => a.toLowerCase() === app.toLowerCase(),
					),
			);
			if (preset) {
				if (!displayed.has(preset.name)) {
					displayed.add(preset.name);
					result.push(preset.name);
				}
			} else {
				if (!displayed.has(app)) {
					displayed.add(app);
					result.push(app);
				}
			}
		}
		return result;
	};

	const displayApps = getDisplayApps();

	return (
		<SettingsSection
			title={tSettings("intentRecognitionTitle")}
			description={tSettings("intentRecognitionDescription")}
			searchKeywords={[
				"intent",
				"todo",
				"detection",
				"whitelist",
				"意图",
				"识别",
				"白名单",
			]}
		>
			<div className="space-y-4">
				{/* 启用开关 */}
				<div className="flex items-center justify-between">
					<div className="flex-1">
						<label
							htmlFor="intent-recognition-toggle"
							className="text-sm font-medium text-foreground"
						>
							{tSettings("intentRecognitionLabel")}
						</label>
						<p className="mt-0.5 text-xs text-muted-foreground">
							{tSettings("intentRecognitionHint")}
						</p>
					</div>
					<ToggleSwitch
						id="intent-recognition-toggle"
						enabled={enabled}
						disabled={isLoading}
						onToggle={handleToggle}
						ariaLabel={tSettings("intentRecognitionLabel")}
					/>
				</div>

				{/* 白名单管理 */}
				{enabled && (
					<div className="border-l-2 border-border pl-4">
						<div className="mb-2">
							<p className="text-sm font-medium text-foreground">
								{tSettings("whitelistApps")}
							</p>
							<p className="mt-0.5 text-xs text-muted-foreground">
								{tSettings("whitelistAppsDesc")}
							</p>
						</div>

						{/* 白名单列表 */}
						{displayApps.length > 0 && (
							<div className="mb-3 space-y-1">
								{displayApps.map((app) => {
									const preset = PRESET_APPS.find(
										(p) =>
											p.name.toLowerCase() ===
											app.toLowerCase(),
									);
									const subtitle = preset?.aliases.length
										? preset.aliases.join(" / ")
										: null;

									return (
										<div
											key={app}
											className="group flex items-center justify-between rounded-md border border-border bg-background px-3 py-2 transition-colors hover:bg-muted/50"
										>
											<div className="min-w-0 flex-1">
												<span className="text-sm font-medium text-foreground">
													{app}
												</span>
												{subtitle && (
													<span className="ml-2 text-xs text-muted-foreground">
														{subtitle}
													</span>
												)}
											</div>
											<button
												type="button"
												onClick={() =>
													handleRemoveApp(app)
												}
												disabled={isLoading}
												className="ml-2 rounded-md p-1 text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 disabled:opacity-50"
												aria-label={tSettings(
													"whitelistRemoveApp",
													{ app },
												)}
											>
												<Trash2 className="h-3.5 w-3.5" />
											</button>
										</div>
									);
								})}
							</div>
						)}

						{displayApps.length === 0 && (
							<div className="mb-3 flex items-center justify-center rounded-md border border-dashed border-border py-6">
								<p className="text-xs text-muted-foreground">
									{tSettings("whitelistEmpty")}
								</p>
							</div>
						)}

						{/* 添加按钮 */}
						<div className="relative">
							<button
								ref={addBtnRef}
								type="button"
								onClick={() => setShowAddPanel(!showAddPanel)}
								disabled={isLoading}
								className={cn(
									"flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary disabled:opacity-50",
									showAddPanel &&
										"border-primary/50 bg-primary/5 text-primary",
								)}
							>
								{showAddPanel ? (
									<ChevronUp className="h-4 w-4" />
								) : (
									<Plus className="h-4 w-4" />
								)}
								{tSettings("whitelistAddApp")}
							</button>

							{/* 添加面板 */}
							{showAddPanel && (
								<div
									ref={addPanelRef}
									className="mt-2 overflow-hidden rounded-lg border border-border bg-background shadow-sm"
								>
									{/* 预设应用列表 */}
									<div className="border-b border-border px-3 py-2">
										<p className="text-xs font-medium text-muted-foreground">
											{tSettings("whitelistPresetApps")}
										</p>
									</div>
									<div className="max-h-48 overflow-y-auto p-1">
										{PRESET_APPS.map((preset) => {
											const isAdded = isAppInWhitelist(
												preset.name,
												preset.aliases,
											);
											return (
												<button
													key={preset.name}
													type="button"
													onClick={() =>
														handleAddPresetApp(
															preset.name,
															preset.aliases,
														)
													}
													disabled={isLoading}
													className={cn(
														"flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
														isAdded
															? "bg-primary/5 text-primary"
															: "text-foreground hover:bg-muted/70",
													)}
												>
													<span
														className={cn(
															"flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
															isAdded
																? "border-primary bg-primary text-primary-foreground"
																: "border-muted-foreground/30",
														)}
													>
														{isAdded && (
															<Check className="h-3 w-3" />
														)}
													</span>
													<span className="flex-1 text-left font-medium">
														{preset.name}
													</span>
													{preset.aliases.length >
														0 && (
														<span className="text-xs text-muted-foreground">
															{preset.aliases.join(
																" / ",
															)}
														</span>
													)}
												</button>
											);
										})}
									</div>

									{/* 自定义输入 */}
									<div className="border-t border-border p-2">
										<div className="flex gap-2">
											<input
												type="text"
												className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
												placeholder={tSettings(
													"whitelistCustomPlaceholder",
												)}
												value={customInput}
												onChange={(e) =>
													setCustomInput(
														e.target.value,
													)
												}
												onKeyDown={(e) => {
													if (
														e.key === "Enter" &&
														customInput.trim()
													) {
														e.preventDefault();
														handleAddCustomApp();
													}
												}}
												disabled={isLoading}
											/>
											<button
												type="button"
												onClick={handleAddCustomApp}
												disabled={
													isLoading ||
													!customInput.trim()
												}
												className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
											>
												{tSettings("whitelistAddBtn")}
											</button>
										</div>
									</div>
								</div>
							)}
						</div>
					</div>
				)}
			</div>
		</SettingsSection>
	);
}
