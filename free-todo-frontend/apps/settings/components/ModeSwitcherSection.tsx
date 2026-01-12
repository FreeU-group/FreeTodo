"use client";

import { MessageSquare } from "lucide-react";
import { useTranslations } from "next-intl";
import { useUiStore } from "@/lib/store/ui-store";
import { toastSuccess } from "@/lib/toast";
import { SettingsSection } from "./SettingsSection";
import { ToggleSwitch } from "./ToggleSwitch";

interface ModeSwitcherSectionProps {
	loading?: boolean;
}

/**
 * ModeSwitcher 开关设置区块组件
 * 控制聊天面板的模式切换器是否显示
 */
export function ModeSwitcherSection({
	loading = false,
}: ModeSwitcherSectionProps) {
	const tSettings = useTranslations("page.settings");
	const showModeSwitcher = useUiStore((state) => state.showModeSwitcher);
	const setShowModeSwitcher = useUiStore((state) => state.setShowModeSwitcher);

	const handleToggle = (enabled: boolean) => {
		setShowModeSwitcher(enabled);
		toastSuccess(
			enabled
				? tSettings("modeSwitcherEnabled")
				: tSettings("modeSwitcherDisabled"),
		);
	};

	return (
		<SettingsSection
			title={tSettings("modeSwitcherTitle")}
			description={tSettings("modeSwitcherDescription")}
		>
			<div className="flex items-center justify-between">
				<div className="flex-1 flex items-center gap-2">
					<MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
					<label
						htmlFor="mode-switcher-toggle"
						className="text-sm font-medium text-foreground cursor-pointer"
					>
						{tSettings("modeSwitcherLabel")}
					</label>
				</div>
				<ToggleSwitch
					id="mode-switcher-toggle"
					enabled={showModeSwitcher}
					disabled={loading}
					onToggle={handleToggle}
					ariaLabel={tSettings("modeSwitcherLabel")}
				/>
			</div>
			<p className="mt-2 text-xs text-muted-foreground">
				{tSettings("modeSwitcherHint")}
			</p>
		</SettingsSection>
	);
}
