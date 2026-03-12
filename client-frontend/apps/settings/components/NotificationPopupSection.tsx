"use client";

import { useTranslations } from "next-intl";
import { useUiStore } from "@/lib/store/ui-store";
import { toastSuccess } from "@/lib/toast";
import { SettingsSection } from "./SettingsSection";
import { ToggleSwitch } from "./ToggleSwitch";

interface NotificationPopupSectionProps {
	loading?: boolean;
}

/**
 * 通知弹窗设置区块组件
 * 控制系统级通知弹窗的开关（当自动待办检测发现新待办时弹出）
 */
export function NotificationPopupSection({
	loading = false,
}: NotificationPopupSectionProps) {
	const tSettings = useTranslations("page.settings");

	const enabled = useUiStore((state) => state.notificationPopupEnabled);
	const setEnabled = useUiStore(
		(state) => state.setNotificationPopupEnabled,
	);

	const handleToggle = (newEnabled: boolean) => {
		setEnabled(newEnabled);
		toastSuccess(
			newEnabled
				? tSettings("notificationPopupEnabled")
				: tSettings("notificationPopupDisabled"),
		);
	};

	return (
		<SettingsSection
			title={tSettings("notificationPopupTitle")}
			description={tSettings("notificationPopupDescription")}
			searchKeywords={[
				"notification",
				"popup",
				"通知",
				"弹窗",
				tSettings("notificationPopupTitle"),
			]}
		>
			<div className="space-y-4">
				{/* 开关 */}
				<div className="flex items-center justify-between">
					<label
						htmlFor="notification-popup-toggle"
						className="text-sm font-medium text-foreground cursor-pointer"
					>
						{tSettings("notificationPopupToggleLabel")}
					</label>
					<ToggleSwitch
						id="notification-popup-toggle"
						enabled={enabled}
						disabled={loading}
						onToggle={handleToggle}
						ariaLabel={tSettings("notificationPopupToggleLabel")}
					/>
				</div>

				{/* 提示 */}
				<p className="text-xs text-muted-foreground">
					{tSettings("notificationPopupHint")}
				</p>
			</div>
		</SettingsSection>
	);
}
