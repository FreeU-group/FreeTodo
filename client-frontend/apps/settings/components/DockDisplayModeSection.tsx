"use client";

import { useTranslations } from "next-intl";
import type { DockDisplayMode } from "@/lib/store/ui-store";
import { useUiStore } from "@/lib/store/ui-store";
import { toastSuccess } from "@/lib/toast";
import { SettingsSection } from "./SettingsSection";

interface DockDisplayModeSectionProps {
	loading?: boolean;
}

/**
 * Dock 显示模式设置区块组件
 */
export function DockDisplayModeSection({
	loading = false,
}: DockDisplayModeSectionProps) {
	const tSettings = useTranslations("page.settings");
	const dockDisplayMode = useUiStore((state) => state.dockDisplayMode);
	const setDockDisplayMode = useUiStore((state) => state.setDockDisplayMode);

	// Dock 显示模式处理
	const handleDockDisplayModeChange = (mode: DockDisplayMode) => {
		setDockDisplayMode(mode);
		toastSuccess(tSettings("dockDisplayModeChanged"));
	};

	return (
		<SettingsSection
			title={tSettings("dockDisplayModeTitle")}
			description={tSettings("dockDisplayModeDescription")}
		>
			<div className="flex items-center justify-between">
				<label
					htmlFor="dock-display-mode-select"
					className="text-sm font-medium text-foreground"
				>
					{tSettings("dockDisplayModeLabel")}
				</label>
				<select
					id="dock-display-mode-select"
					value={dockDisplayMode}
					onChange={(e) =>
						handleDockDisplayModeChange(e.target.value as DockDisplayMode)
					}
					disabled={loading}
					className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
				>
					<option value="fixed">{tSettings("dockDisplayModeFixed")}</option>
					<option value="auto-hide">
						{tSettings("dockDisplayModeAutoHide")}
					</option>
				</select>
			</div>
		</SettingsSection>
	);
}
