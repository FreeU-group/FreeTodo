"use client";

import { useEffect, useMemo, useState } from "react";
import { type DesktopSettings, getDesktopSettings, updateDesktopSettings } from "@/lib/desktop-settings";
import { toastError, toastSuccess } from "@/lib/toast";
import { getPlatform, isTauri } from "@/lib/utils/platform";
import { SettingsSection } from "./SettingsSection";

export function DesktopServerSection() {
	const [settings, setSettings] = useState<DesktopSettings | null>(null);
	const [draftUrl, setDraftUrl] = useState("");
	const [saving, setSaving] = useState(false);
	const [platform, setPlatform] = useState("unknown");
	const isDesktopTauri = isTauri();
	const runtimeBackendUrl =
		typeof window !== "undefined" ? window.__BACKEND_URL__ || "" : "";

	useEffect(() => {
		setPlatform(getPlatform());
	}, []);

	useEffect(() => {
		if (!isDesktopTauri) {
			return;
		}

		void getDesktopSettings()
			.then((value) => {
				if (!value) {
					return;
				}
				setSettings(value);
				setDraftUrl(value.apiBaseUrl);
			})
			.catch((error) => {
				toastError(error instanceof Error ? error.message : String(error));
			});
	}, [isDesktopTauri]);

	const hasChanges = useMemo(() => {
		return draftUrl.trim().replace(/\/$/, "") !== (settings?.apiBaseUrl || "");
	}, [draftUrl, settings?.apiBaseUrl]);

	const handleSave = async () => {
		const nextUrl = draftUrl.trim().replace(/\/$/, "");
		if (!nextUrl) {
			toastError("Server URL cannot be empty");
			return;
		}

		setSaving(true);
		try {
			const nextSettings = await updateDesktopSettings(nextUrl);
			window.__BACKEND_URL__ = nextSettings.apiBaseUrl;
			setSettings(nextSettings);
			setDraftUrl(nextSettings.apiBaseUrl);
			toastSuccess("Desktop server address saved");
		} catch (error) {
			toastError(error instanceof Error ? error.message : String(error));
		} finally {
			setSaving(false);
		}
	};

	return (
		<SettingsSection
			title="Desktop server"
			description="Choose which remote API the desktop app proxies to."
			searchKeywords={[
				"desktop server",
				"server url",
				"api base url",
				settings?.configPath,
			]}
		>
			<div className="space-y-3">
				<div className="rounded-md border border-dashed border-border/70 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
					<div className="font-medium text-foreground/90">Runtime diagnostics</div>
					<div className="mt-1">Detected platform: {platform}</div>
					<div className="mt-1 break-all font-mono text-[11px] text-foreground/80">
						Current runtime backend: {runtimeBackendUrl || "(not set)"}
					</div>
					{!isDesktopTauri && (
						<div className="mt-2 text-amber-300">
							Tauri runtime was not detected in this window. The section stays visible so you can tell this build is not running as the expected desktop shell.
						</div>
					)}
				</div>
				<div>
					<label
						htmlFor="desktop-server-url"
						className="mb-1 block text-sm font-medium text-foreground"
					>
						Server URL
					</label>
					<input
						id="desktop-server-url"
						type="url"
						className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
						placeholder="https://api.example.com"
						value={draftUrl}
						onChange={(event) => setDraftUrl(event.target.value)}
						disabled={saving || !isDesktopTauri}
					/>
					<p className="mt-1 text-xs text-muted-foreground">
						{isDesktopTauri
							? "This updates the local proxy immediately for new requests."
							: "Save is disabled because this window is not exposing the expected Tauri runtime bridge."}
					</p>
				</div>
				<div className="rounded-md border border-dashed border-border/70 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
					<div>Config file</div>
					<div className="mt-1 break-all font-mono text-[11px] text-foreground/80">
						{settings?.configPath || "Loading..."}
					</div>
				</div>
				<div className="flex items-center justify-end gap-2">
					<button
						type="button"
						className="inline-flex items-center rounded-md border border-input bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
						onClick={() => setDraftUrl(settings?.apiBaseUrl || "")}
						disabled={saving || !hasChanges || !isDesktopTauri}
					>
						Reset
					</button>
					<button
						type="button"
						className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
						onClick={handleSave}
						disabled={saving || !hasChanges || !isDesktopTauri}
					>
						{saving ? "Saving..." : "Save"}
					</button>
				</div>
			</div>
		</SettingsSection>
	);
}
