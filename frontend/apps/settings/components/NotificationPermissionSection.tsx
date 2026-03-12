"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { toastError, toastInfo, toastSuccess, toastWarning } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { isElectron, isTauri, isWeb } from "@/lib/utils/platform";
import { SettingsSection } from "./SettingsSection";

type PermissionStatus =
	| "granted"
	| "denied"
	| "default"
	| "unknown"
	| "not_required";

type TauriNotificationApi = {
	isPermissionGranted?: () => Promise<boolean> | boolean;
	requestPermission?: () =>
		| Promise<NotificationPermission | boolean>
		| NotificationPermission
		| boolean;
};

const getTauriNotificationApi = (): TauriNotificationApi | null => {
	if (typeof window === "undefined") return null;
	const tauri = (window as Window & { __TAURI__?: { notification?: TauriNotificationApi } })
		.__TAURI__;
	return tauri?.notification ?? null;
};

const normalizePermission = (value: unknown): PermissionStatus => {
	if (value === "granted" || value === "denied" || value === "default") {
		return value;
	}
	if (value === true) return "granted";
	if (value === false) return "default";
	return "unknown";
};

interface NotificationPermissionSectionProps {
	loading?: boolean;
}

export function NotificationPermissionSection({
	loading = false,
}: NotificationPermissionSectionProps) {
	const tSettings = useTranslations("page.settings");
	const [permission, setPermission] = useState<PermissionStatus>("unknown");
	const [isRequesting, setIsRequesting] = useState(false);

	const canRequest = isWeb() || isTauri();

	const statusLabel = useMemo(() => {
		switch (permission) {
			case "granted":
				return tSettings("notificationPermissionStatusGranted");
			case "denied":
				return tSettings("notificationPermissionStatusDenied");
			case "default":
				return tSettings("notificationPermissionStatusDefault");
			case "not_required":
				return tSettings("notificationPermissionStatusNotRequired");
			default:
				return tSettings("notificationPermissionStatusUnknown");
		}
	}, [permission, tSettings]);

	const statusClasses = useMemo(() => {
		switch (permission) {
			case "granted":
				return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
			case "denied":
				return "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200";
			case "default":
				return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200";
			case "not_required":
				return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200";
			default:
				return "border-border bg-muted/40 text-muted-foreground";
		}
	}, [permission]);

	useEffect(() => {
		const refreshPermission = async () => {
			if (isElectron()) {
				setPermission("not_required");
				return;
			}
			if (isWeb()) {
				if (typeof window === "undefined" || !("Notification" in window)) {
					setPermission("unknown");
					return;
				}
				setPermission(normalizePermission(Notification.permission));
				return;
			}
			if (isTauri()) {
				const api = getTauriNotificationApi();
				if (!api?.isPermissionGranted) {
					setPermission("unknown");
					return;
				}
				try {
					const granted = await api.isPermissionGranted();
					setPermission(granted ? "granted" : "default");
				} catch {
					setPermission("unknown");
				}
				return;
			}
			setPermission("unknown");
		};

		void refreshPermission();
	}, []);

	const requestPermission = async () => {
		if (!canRequest || loading || isRequesting) {
			if (!canRequest) {
				toastInfo(tSettings("notificationPermissionNotSupported"));
			}
			return;
		}

		setIsRequesting(true);
		try {
			if (isWeb()) {
				if (typeof window === "undefined" || !("Notification" in window)) {
					toastInfo(tSettings("notificationPermissionNotSupported"));
					return;
				}
				const result = await Notification.requestPermission();
				const normalized = normalizePermission(result);
				setPermission(normalized);
				if (normalized === "granted") {
					toastSuccess(tSettings("notificationPermissionRequestSuccess"));
				} else if (normalized === "denied") {
					toastWarning(tSettings("notificationPermissionRequestDenied"));
				}
				return;
			}
			if (isTauri()) {
				const api = getTauriNotificationApi();
				if (!api?.requestPermission) {
					toastInfo(tSettings("notificationPermissionNotSupported"));
					return;
				}
				const result = await api.requestPermission();
				const normalized = normalizePermission(result);
				setPermission(normalized);
				if (normalized === "granted") {
					toastSuccess(tSettings("notificationPermissionRequestSuccess"));
				} else if (normalized === "denied") {
					toastWarning(tSettings("notificationPermissionRequestDenied"));
				}
				return;
			}
			toastInfo(tSettings("notificationPermissionNotSupported"));
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			toastError(tSettings("notificationPermissionRequestFailed", { error: errorMsg }));
		} finally {
			setIsRequesting(false);
		}
	};

	const hint = isElectron()
		? tSettings("notificationPermissionElectronHint")
		: tSettings("notificationPermissionHint");

	return (
		<SettingsSection
			title={tSettings("notificationPermissionTitle")}
			description={tSettings("notificationPermissionDescription")}
			searchKeywords={[
				"notification",
				"permission",
				"通知",
				"权限",
				tSettings("notificationPermissionTitle"),
			]}
		>
			<div className="space-y-3">
				<div className="flex flex-wrap items-center gap-2 text-sm">
					<span className="text-muted-foreground">
						{tSettings("notificationPermissionStatusLabel")}
					</span>
					<span
						className={cn(
							"rounded-full border px-2.5 py-0.5 text-xs font-medium",
							statusClasses,
						)}
					>
						{statusLabel}
					</span>
				</div>

				<div className="flex flex-wrap items-center gap-3">
					<button
						type="button"
						onClick={requestPermission}
						disabled={!canRequest || loading || isRequesting}
						className="flex items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{isRequesting
							? tSettings("notificationPermissionRequesting")
							: tSettings("notificationPermissionRequest")}
					</button>
					<span className="text-xs text-muted-foreground">{hint}</span>
				</div>
			</div>
		</SettingsSection>
	);
}
