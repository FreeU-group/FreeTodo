"use client";

import { MessageCircle, Globe } from "lucide-react";
import { useEffect, useState } from "react";
import { useSaveConfig } from "@/lib/query";
import { toastError, toastSuccess } from "@/lib/toast";
import { SettingsSection } from "./SettingsSection";
import { ToggleSwitch } from "./ToggleSwitch";

interface RecorderConfigSectionProps {
	config: Record<string, unknown> | undefined;
	loading?: boolean;
}

const WECHAT_NAMES = ["WeChat", "微信", "WeChatMainWndForPC", "WeChatStore"];
const BROWSER_NAMES = [
	"Google Chrome",
	"chrome",
	"Chrome",
	"Microsoft Edge",
	"msedge",
	"Edge",
	"Firefox",
	"firefox",
	"Safari",
	"Arc",
	"Brave Browser",
	"Opera",
];

function parseBlacklist(raw: unknown): string[] {
	if (Array.isArray(raw)) return raw as string[];
	const s = String(raw || "");
	if (!s) return [];
	return s.split(",").map((x) => x.trim()).filter(Boolean);
}

function isAppBlocked(blacklist: string[], names: string[]): boolean {
	return names.some((n) => blacklist.includes(n));
}

function toggleAppInBlacklist(
	blacklist: string[],
	names: string[],
	blocked: boolean,
): string[] {
	if (blocked) {
		return [...blacklist, ...names.filter((n) => !blacklist.includes(n))];
	}
	const removeSet = new Set(names);
	return blacklist.filter((n) => !removeSet.has(n));
}

export function RecorderConfigSection({
	config,
	loading = false,
}: RecorderConfigSectionProps) {
	const saveConfigMutation = useSaveConfig();

	const [blacklistApps, setBlacklistApps] = useState<string[]>(() =>
		parseBlacklist(config?.jobsRecorderParamsBlacklistApps),
	);

	const isLoading = loading || saveConfigMutation.isPending;

	useEffect(() => {
		if (config?.jobsRecorderParamsBlacklistApps !== undefined) {
			setBlacklistApps(
				parseBlacklist(config.jobsRecorderParamsBlacklistApps),
			);
		}
	}, [config]);

	const wechatBlocked = isAppBlocked(blacklistApps, WECHAT_NAMES);
	const browserBlocked = isAppBlocked(blacklistApps, BROWSER_NAMES);

	const handleToggle = async (
		names: string[],
		currentlyBlocked: boolean,
	) => {
		const shouldBlock = !currentlyBlocked;
		const newList = toggleAppInBlacklist(blacklistApps, names, shouldBlock);
		const oldList = blacklistApps;
		setBlacklistApps(newList);
		try {
			await saveConfigMutation.mutateAsync({
				data: {
					jobsRecorderParamsBlacklistEnabled: newList.length > 0,
					jobsRecorderParamsBlacklistApps: newList,
				},
			});
			toastSuccess("已保存");
		} catch (error) {
			setBlacklistApps(oldList);
			const msg = error instanceof Error ? error.message : String(error);
			toastError(`保存失败: ${msg}`);
		}
	};

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3 flex-1">
					<MessageCircle className="h-4 w-4 text-[#07C160] shrink-0" />
					<div>
						<p className="text-sm font-medium text-foreground">微信</p>
						<p className="text-xs text-muted-foreground">
							{wechatBlocked ? "已屏蔽截图" : "允许截图感知"}
						</p>
					</div>
				</div>
				<ToggleSwitch
					enabled={!wechatBlocked}
					disabled={isLoading}
					onToggle={() => handleToggle(WECHAT_NAMES, wechatBlocked)}
				/>
			</div>

			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3 flex-1">
					<Globe className="h-4 w-4 text-blue-400 shrink-0" />
					<div>
						<p className="text-sm font-medium text-foreground">浏览器</p>
						<p className="text-xs text-muted-foreground">
							{browserBlocked ? "已屏蔽截图" : "允许截图感知"}
						</p>
					</div>
				</div>
				<ToggleSwitch
					enabled={!browserBlocked}
					disabled={isLoading}
					onToggle={() => handleToggle(BROWSER_NAMES, browserBlocked)}
				/>
			</div>
		</div>
	);
}

export function RecorderConfigStandalone(props: RecorderConfigSectionProps) {
	return (
		<SettingsSection title="屏幕录制设置">
			<RecorderConfigSection {...props} />
		</SettingsSection>
	);
}

export const RecorderConfigInline = RecorderConfigSection;
