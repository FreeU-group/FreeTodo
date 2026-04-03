"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useSaveConfig } from "@/lib/query";
import { toastError, toastSuccess } from "@/lib/toast";
import { SettingsSection } from "./SettingsSection";

interface NamingSectionProps {
	config: Record<string, unknown> | undefined;
	loading?: boolean;
}

export function NamingSection({ config, loading = false }: NamingSectionProps) {
	const t = useTranslations("page.settings");
	const saveConfigMutation = useSaveConfig();

	const [userName, setUserName] = useState(
		(config?.setupUserName as string) || "",
	);
	const [agentName, setAgentName] = useState(
		(config?.setupAgentName as string) || "",
	);
	const [initialValues, setInitialValues] = useState({
		userName: "",
		agentName: "",
	});

	const isLoading = loading || saveConfigMutation.isPending;

	useEffect(() => {
		if (config) {
			const u = (config.setupUserName as string) || "";
			const a = (config.setupAgentName as string) || "";
			setUserName(u);
			setAgentName(a);
			setInitialValues({ userName: u, agentName: a });
		}
	}, [config]);

	const handleSave = async () => {
		const trimmedUser = userName.trim();
		const trimmedAgent = agentName.trim();

		if (
			trimmedUser === initialValues.userName &&
			trimmedAgent === initialValues.agentName
		) {
			return;
		}

		try {
			await saveConfigMutation.mutateAsync({
				data: {
					setupUserName: trimmedUser,
					setupAgentName: trimmedAgent,
				},
			});
			setInitialValues({
				userName: trimmedUser,
				agentName: trimmedAgent,
			});
			toastSuccess(t("namingSaved"));
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			toastError(t("namingSaveFailed", { error: msg }));
		}
	};

	return (
		<SettingsSection
			title={t("namingTitle")}
			description={t("namingDescription")}
			searchKeywords={[t("namingTitle"), t("namingDescription"), "user name", "agent name"]}
		>
			<div className="space-y-3">
				<div>
					<label
						htmlFor="settings-user-name"
						className="mb-1 block text-sm font-medium text-foreground"
					>
						{t("namingUserLabel")}
					</label>
					<input
						id="settings-user-name"
						type="text"
						className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
						placeholder={t("namingUserPlaceholder")}
						value={userName}
						onChange={(e) => setUserName(e.target.value)}
						onBlur={handleSave}
						disabled={isLoading}
					/>
				</div>

				<div>
					<label
						htmlFor="settings-agent-name"
						className="mb-1 block text-sm font-medium text-foreground"
					>
						{t("namingAgentLabel")}
					</label>
					<input
						id="settings-agent-name"
						type="text"
						className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
						placeholder={t("namingAgentPlaceholder")}
						value={agentName}
						onChange={(e) => setAgentName(e.target.value)}
						onBlur={handleSave}
						disabled={isLoading}
					/>
					<p className="mt-1 text-xs text-muted-foreground">
						{t("namingAgentHint")}
					</p>
				</div>
			</div>
		</SettingsSection>
	);
}
