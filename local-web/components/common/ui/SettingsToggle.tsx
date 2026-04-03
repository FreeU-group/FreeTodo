"use client";

import { Settings } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useOpenSettings } from "@/lib/hooks/useOpenSettings";

/**
 * 设置按钮组件
 * 点击后切换到设置界面：
 * - 如果 Panel B 已激活，切换 Panel B 到设置
 * - 否则找到最宽的 Panel（A 或 C），激活并切换到设置
 */
export function SettingsToggle() {
	const [mounted, setMounted] = useState(false);
	const tLayout = useTranslations("layout");
	const tPage = useTranslations("page");

	const { openSettings } = useOpenSettings();

	useEffect(() => {
		setMounted(true);
	}, []);

	if (!mounted) {
		return <div className="h-9 w-9" />;
	}

	return (
		<button
			type="button"
			onClick={openSettings}
			className="rounded-md p-2 text-foreground transition-all duration-200 hover:bg-muted hover:text-foreground hover:shadow-md active:scale-95 active:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			title={tPage("settingsLabel")}
			aria-label={tLayout("openSettings")}
			data-tour="settings-toggle"
		>
			<Settings className="h-5 w-5" />
		</button>
	);
}
