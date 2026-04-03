"use client";

import {
	CalendarDays,
	FolderOpen,
	Globe,
	MessageCircle,
	ShieldCheck,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type React from "react";
import { useState } from "react";
import { useCompleteSetup } from "@/lib/query/setup";
import { useSetupStore } from "@/lib/store/setup-store";

interface PermissionsStepProps {
	onComplete: () => void;
	onBack: () => void;
}

type SetupPermissionAppId = "wechat" | "browser" | "calendar" | "files";

interface SetupPermissionApp {
	id: SetupPermissionAppId;
	icon: React.ReactNode;
	enabled: boolean;
}

const INITIAL_APPS: SetupPermissionApp[] = [
	{
		id: "wechat",
		icon: <MessageCircle className="h-6 w-6 text-[#07C160]" strokeWidth={2} />,
		enabled: true,
	},
	{
		id: "browser",
		icon: <Globe className="h-6 w-6 text-blue-400" strokeWidth={2} />,
		enabled: false,
	},
	{
		id: "calendar",
		icon: <CalendarDays className="h-6 w-6 text-red-400" strokeWidth={2} />,
		enabled: false,
	},
	{
		id: "files",
		icon: <FolderOpen className="h-6 w-6 text-yellow-500" strokeWidth={2} />,
		enabled: false,
	},
] as const;

export function PermissionsStep({ onComplete, onBack }: PermissionsStepProps) {
	const t = useTranslations("onboarding");
	const { userName, agentName, scanDirectory, initialProfile } = useSetupStore();
	const completeMutation = useCompleteSetup();
	const [apps, setApps] = useState(INITIAL_APPS);
	const appLabel = (id: SetupPermissionAppId) => ({
		name: t(`permissionsApps.${id}.name`),
		desc: t(`permissionsApps.${id}.desc`),
	});

	const toggleApp = (id: string) => {
		setApps((prev) =>
			prev.map((app) =>
				app.id === id ? { ...app, enabled: !app.enabled } : app,
			),
		);
	};

	const handleComplete = async () => {
		const allowedApps = apps
			.filter((a) => a.enabled)
			.map((a) => appLabel(a.id).name);
		await completeMutation.mutateAsync({
			userName,
			agentName: agentName || t("defaultAgentName"),
			scanDirectories: scanDirectory ? [scanDirectory] : [],
			allowedApps,
			initialProfile,
		});
		onComplete();
	};

	return (
		<div className="flex w-full max-w-md flex-col gap-5">
			<div className="text-center">
				<div className="mb-4 flex justify-center">
					<div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/20 text-primary">
						<ShieldCheck className="h-6 w-6" />
					</div>
				</div>
				<h2 className="text-xl font-bold text-white">{t("permissionsTitle")}</h2>
				<p className="mt-1 text-sm text-white/60">
					{t("permissionsDescription")}
				</p>
			</div>

			<div className="space-y-2">
				{apps.map((app) => {
					const label = appLabel(app.id);

					return (
						<button
							key={app.id}
							type="button"
							onClick={() => toggleApp(app.id)}
							className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
								app.enabled
									? "border-primary/30 bg-primary/5"
									: "border-white/5 bg-white/[0.02] opacity-60 hover:opacity-100 hover:bg-white/[0.04]"
							}`}
						>
							<span className="flex-shrink-0 drop-shadow-sm">{app.icon}</span>
							<div className="flex-1">
								<div className="flex items-center gap-2">
									<span className="text-sm font-medium text-white">
										{label.name}
									</span>
								</div>
								<p className="text-xs text-white/40">{label.desc}</p>
							</div>
							<div
								className={`h-5 w-9 rounded-full transition-colors ${
									app.enabled ? "bg-primary" : "bg-white/10"
								}`}
							>
								<div
									className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${
										app.enabled ? "translate-x-4" : "translate-x-0"
									}`}
								/>
							</div>
						</button>
					);
				})}
			</div>

			<p className="text-center text-xs text-white/30">
				{t("permissionsHint")}
			</p>

			<div className="flex gap-3">
				<button
					type="button"
					onClick={onBack}
					className="flex-1 rounded-lg border border-white/10 bg-white/5 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/10"
				>
					{t("prevBtn")}
				</button>
				<button
					type="button"
					onClick={handleComplete}
					disabled={completeMutation.isPending}
					className="flex-1 rounded-lg bg-gradient-to-r from-primary to-primary/80 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary/20 transition hover:brightness-110 disabled:opacity-40"
				>
					{completeMutation.isPending ? t("permissionsCompleting") : t("permissionsStart")}
				</button>
			</div>
		</div>
	);
}
