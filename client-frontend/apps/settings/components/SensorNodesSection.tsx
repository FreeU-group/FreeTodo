"use client";

import { Check, Clock, Edit2, MonitorSmartphone, RefreshCw, Wifi, WifiOff, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { useSaveConfig } from "@/lib/query";
import { toastError, toastSuccess } from "@/lib/toast";
import { SettingsSection } from "./SettingsSection";
import { ToggleSwitch } from "./ToggleSwitch";

interface SensorNode {
	node_id: string;
	online: boolean;
	screenshot_running: boolean;
	proactive_ocr_running: boolean;
	screenshot_interval: number;
	proactive_ocr_interval: number;
	last_screenshot_at: string | null;
	last_proactive_ocr_at: string | null;
	last_seen: number;
	uptime_seconds: number;
}

interface SensorNodesSectionProps {
	config: Record<string, unknown> | undefined;
	loading?: boolean;
}

function formatUptime(seconds: number): string {
	if (seconds < 60) return `${Math.floor(seconds)}s`;
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	return m > 0 ? `${h}h${m}m` : `${h}h`;
}

function formatLastSeen(timestamp: number): string {
	const elapsed = Math.floor(Date.now() / 1000 - timestamp);
	if (elapsed < 60) return "<1m";
	if (elapsed < 3600) return `${Math.floor(elapsed / 60)}m`;
	return `${Math.floor(elapsed / 3600)}h`;
}

export function SensorNodesSection({
	config,
	loading = false,
}: SensorNodesSectionProps) {
	const t = useTranslations("sensorNodes");
	const saveConfigMutation = useSaveConfig();

	const [nodes, setNodes] = useState<SensorNode[]>([]);
	const [nodesLoading, setNodesLoading] = useState(false);

	const [screenshotEnabled, setScreenshotEnabled] = useState(
		(config?.sensorScreenshotEnabled as boolean | undefined) ?? true,
	);
	const [proactiveOcrEnabled, setProactiveOcrEnabled] = useState(
		(config?.sensorProactiveOcrEnabled as boolean | undefined) ?? true,
	);
	const [screenshotInterval, setScreenshotInterval] = useState(
		Number(config?.sensorScreenshotInterval ?? 10),
	);
	const [proactiveOcrInterval, setProactiveOcrInterval] = useState(
		Number(config?.sensorProactiveOcrInterval ?? 1),
	);

	const [editingField, setEditingField] = useState<string | null>(null);
	const [editValue, setEditValue] = useState(0);

	const isLoading = loading || saveConfigMutation.isPending;

	useEffect(() => {
		if (config) {
			if (config.sensorScreenshotEnabled !== undefined) {
				setScreenshotEnabled(config.sensorScreenshotEnabled as boolean);
			}
			if (config.sensorProactiveOcrEnabled !== undefined) {
				setProactiveOcrEnabled(config.sensorProactiveOcrEnabled as boolean);
			}
			if (config.sensorScreenshotInterval !== undefined) {
				setScreenshotInterval(Number(config.sensorScreenshotInterval));
			}
			if (config.sensorProactiveOcrInterval !== undefined) {
				setProactiveOcrInterval(Number(config.sensorProactiveOcrInterval));
			}
		}
	}, [config]);

	const fetchNodes = useCallback(async () => {
		setNodesLoading(true);
		try {
			const res = await fetch("/api/sensor/nodes");
			if (res.ok) {
				const data = await res.json();
				setNodes(data.nodes ?? []);
			}
		} catch {
			// ignore
		} finally {
			setNodesLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchNodes();
		const timer = setInterval(fetchNodes, 15000);
		return () => clearInterval(timer);
	}, [fetchNodes]);

	const handleToggle = async (
		key: string,
		value: boolean,
		setter: (v: boolean) => void,
		oldValue: boolean,
	) => {
		setter(value);
		try {
			await saveConfigMutation.mutateAsync({ data: { [key]: value } });
			toastSuccess(t("saved"));
		} catch (error) {
			setter(oldValue);
			const msg = error instanceof Error ? error.message : String(error);
			toastError(t("saveFailed", { error: msg }));
		}
	};

	const handleStartEdit = (field: string, currentValue: number) => {
		setEditingField(field);
		setEditValue(currentValue);
	};

	const handleSaveInterval = async (
		key: string,
		setter: (v: number) => void,
	) => {
		if (editValue <= 0) {
			toastError(t("intervalMustBePositive"));
			return;
		}
		const old = key === "sensorScreenshotInterval" ? screenshotInterval : proactiveOcrInterval;
		setter(editValue);
		setEditingField(null);
		try {
			await saveConfigMutation.mutateAsync({ data: { [key]: editValue } });
			toastSuccess(t("saved"));
		} catch (error) {
			setter(old);
			const msg = error instanceof Error ? error.message : String(error);
			toastError(t("saveFailed", { error: msg }));
		}
	};

	const onlineNodes = nodes.filter((n) => n.online);

	return (
		<SettingsSection
			title={t("title")}
			description={t("description")}
			searchKeywords={["sensor", "node", "screenshot", "ocr", "proactive"]}
		>
			{/* Node list */}
			<div className="mb-5">
				<div className="flex items-center justify-between mb-2">
					<h4 className="text-sm font-medium text-foreground">
						{t("connectedNodes")}
						<span className="ml-2 text-xs text-muted-foreground">
							({onlineNodes.length} {t("online")})
						</span>
					</h4>
					<button
						type="button"
						onClick={fetchNodes}
						disabled={nodesLoading}
						className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
						title={t("refresh")}
					>
						<RefreshCw className={`h-3 w-3 ${nodesLoading ? "animate-spin" : ""}`} />
					</button>
				</div>

				{nodes.length === 0 ? (
					<div className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
						{t("noNodes")}
					</div>
				) : (
					<div className="space-y-2">
						{nodes.map((node) => (
							<div
								key={node.node_id}
								className="rounded-md border border-border bg-background/50 px-3 py-2"
							>
								<div className="flex items-center gap-3">
									<MonitorSmartphone className="h-4 w-4 text-muted-foreground shrink-0" />
									<div className="flex-1 min-w-0">
										<div className="flex items-center gap-2">
											<span className="text-sm font-medium text-foreground truncate">
												{node.node_id}
											</span>
											{node.online ? (
												<span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-700 dark:text-green-400">
													<Wifi className="h-3 w-3" />
													{t("online")}
												</span>
											) : (
												<span className="inline-flex items-center gap-1 text-[10px] font-medium text-red-500">
													<WifiOff className="h-3 w-3" />
													{t("offline")}
												</span>
											)}
										</div>
										<div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
											<span>
												{t("uptime")}: {formatUptime(node.uptime_seconds)}
											</span>
											<span>
												{t("lastSeen")}: {formatLastSeen(node.last_seen)}
											</span>
										</div>
									</div>
								</div>

								<div className="mt-1.5 flex flex-wrap gap-3 text-xs text-muted-foreground pl-7">
									<span className="flex items-center gap-1">
										<span
											className={`h-1.5 w-1.5 rounded-full ${node.screenshot_running ? "bg-green-500" : "bg-yellow-500"}`}
										/>
										{t("screenshot")}:{" "}
										{node.screenshot_running ? t("running") : t("paused")}
										{node.screenshot_running &&
											` (${node.screenshot_interval}s)`}
									</span>
									<span className="flex items-center gap-1">
										<span
											className={`h-1.5 w-1.5 rounded-full ${node.proactive_ocr_running ? "bg-green-500" : "bg-yellow-500"}`}
										/>
										{t("proactiveOcr")}:{" "}
										{node.proactive_ocr_running ? t("running") : t("paused")}
										{node.proactive_ocr_running &&
											` (${node.proactive_ocr_interval}s)`}
									</span>
								</div>
							</div>
						))}
					</div>
				)}
			</div>

			{/* Sensor capture settings */}
			<div className="space-y-4 border-t border-border pt-4">
				<h4 className="text-sm font-medium text-foreground">{t("captureSettings")}</h4>

				{/* Screenshot OCR toggle + interval */}
				<div className="space-y-2">
					<div className="flex items-center justify-between">
						<div className="flex-1">
							<p className="text-sm font-medium text-foreground">{t("screenshotOcr")}</p>
							<p className="mt-0.5 text-xs text-muted-foreground">{t("screenshotOcrDesc")}</p>
						</div>
						<ToggleSwitch
							enabled={screenshotEnabled}
							disabled={isLoading}
							onToggle={(v) =>
								handleToggle("sensorScreenshotEnabled", v, setScreenshotEnabled, screenshotEnabled)
							}
						/>
					</div>
					{screenshotEnabled && (
						<div className="flex items-center gap-2 pl-4 text-xs text-muted-foreground">
							<Clock className="h-3 w-3 shrink-0" />
							{editingField === "screenshot" ? (
								<div className="flex items-center gap-1.5">
									<input
										type="number"
										min="1"
										max="3600"
										step="1"
										value={editValue}
										onChange={(e) => setEditValue(Number(e.target.value) || 1)}
										className="w-16 rounded border border-input bg-background px-1.5 py-0.5 text-xs text-center"
									/>
									<span>{t("seconds")}</span>
									<button
										type="button"
										onClick={() =>
											handleSaveInterval(
												"sensorScreenshotInterval",
												setScreenshotInterval,
											)
										}
										disabled={isLoading}
										className="p-0.5 rounded hover:bg-accent text-green-600"
									>
										<Check className="h-3 w-3" />
									</button>
									<button
										type="button"
										onClick={() => setEditingField(null)}
										className="p-0.5 rounded hover:bg-accent text-red-600"
									>
										<X className="h-3 w-3" />
									</button>
								</div>
							) : (
								<>
									<span>
										{t("interval")}: {screenshotInterval}{t("seconds")}
									</span>
									<button
										type="button"
										onClick={() => handleStartEdit("screenshot", screenshotInterval)}
										disabled={isLoading}
										className="p-0.5 rounded hover:bg-accent"
									>
										<Edit2 className="h-3 w-3" />
									</button>
								</>
							)}
						</div>
					)}
				</div>

				{/* Proactive OCR toggle + interval */}
				<div className="space-y-2">
					<div className="flex items-center justify-between">
						<div className="flex-1">
							<p className="text-sm font-medium text-foreground">{t("proactiveOcr")}</p>
							<p className="mt-0.5 text-xs text-muted-foreground">{t("proactiveOcrDesc")}</p>
						</div>
						<ToggleSwitch
							enabled={proactiveOcrEnabled}
							disabled={isLoading}
							onToggle={(v) =>
								handleToggle(
									"sensorProactiveOcrEnabled",
									v,
									setProactiveOcrEnabled,
									proactiveOcrEnabled,
								)
							}
						/>
					</div>
					{proactiveOcrEnabled && (
						<div className="flex items-center gap-2 pl-4 text-xs text-muted-foreground">
							<Clock className="h-3 w-3 shrink-0" />
							{editingField === "proactiveOcr" ? (
								<div className="flex items-center gap-1.5">
									<input
										type="number"
										min="0.5"
										max="60"
										step="0.5"
										value={editValue}
										onChange={(e) => setEditValue(Number(e.target.value) || 0.5)}
										className="w-16 rounded border border-input bg-background px-1.5 py-0.5 text-xs text-center"
									/>
									<span>{t("seconds")}</span>
									<button
										type="button"
										onClick={() =>
											handleSaveInterval(
												"sensorProactiveOcrInterval",
												setProactiveOcrInterval,
											)
										}
										disabled={isLoading}
										className="p-0.5 rounded hover:bg-accent text-green-600"
									>
										<Check className="h-3 w-3" />
									</button>
									<button
										type="button"
										onClick={() => setEditingField(null)}
										className="p-0.5 rounded hover:bg-accent text-red-600"
									>
										<X className="h-3 w-3" />
									</button>
								</div>
							) : (
								<>
									<span>
										{t("interval")}: {proactiveOcrInterval}{t("seconds")}
									</span>
									<button
										type="button"
										onClick={() => handleStartEdit("proactiveOcr", proactiveOcrInterval)}
										disabled={isLoading}
										className="p-0.5 rounded hover:bg-accent"
									>
										<Edit2 className="h-3 w-3" />
									</button>
								</>
							)}
						</div>
					)}
				</div>
			</div>
		</SettingsSection>
	);
}
