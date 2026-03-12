"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { SettingsSection } from "./SettingsSection";

// 使用相对路径，由 Next.js rewrites 代理到后端，避免端口不一致导致 404
const PROXY_CONFIG_API = "/api/crawler/proxy-config";

interface KdlConfigSectionProps {
	loading?: boolean;
}

/**
 * 快代理 (KDL) 配置区块组件
 * 用于配置快代理的 Secert ID、Signature、用户名、密码
 */
export function KdlConfigSection({ loading = false }: KdlConfigSectionProps) {
	const t = useTranslations("page.settings.kdl");
	const [kdlSecertId, setKdlSecertId] = useState("");
	const [kdlSignature, setKdlSignature] = useState("");
	const [kdlUserName, setKdlUserName] = useState("");
	const [kdlUserPwd, setKdlUserPwd] = useState("");
	const [isSaving, setIsSaving] = useState(false);
	const [isLoading, setIsLoading] = useState(true);
	const [message, setMessage] = useState<{
		type: "success" | "error";
		text: string;
	} | null>(null);

	useEffect(() => {
		fetchConfig();
	}, []);

	const fetchConfig = async () => {
		setIsLoading(true);
		try {
			const response = await fetch(PROXY_CONFIG_API);
			if (response.ok) {
				const data = await response.json();
				setKdlSecertId(data.kdl_secert_id || "");
				setKdlSignature(data.kdl_signature || "");
				setKdlUserName(data.kdl_user_name || "");
				setKdlUserPwd(data.kdl_user_pwd || "");
			}
		} catch (error) {
			console.error("[KdlConfig] 加载配置失败:", error);
		} finally {
			setIsLoading(false);
		}
	};

	const saveConfig = async () => {
		setIsSaving(true);
		setMessage(null);
		try {
			const response = await fetch(PROXY_CONFIG_API, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					kdl_secert_id: kdlSecertId,
					kdl_signature: kdlSignature,
					kdl_user_name: kdlUserName,
					kdl_user_pwd: kdlUserPwd,
				}),
			});
			if (response.ok) {
				setMessage({ type: "success", text: t("saveSuccess") });
			} else {
				const err = await response.json();
				setMessage({ type: "error", text: err.detail || t("saveFailed") });
			}
		} catch (error) {
			console.error("[KdlConfig] 保存配置失败:", error);
			setMessage({ type: "error", text: t("saveFailed") });
		} finally {
			setIsSaving(false);
			setTimeout(() => setMessage(null), 3000);
		}
	};

	const isLoadingOrSaving = loading || isSaving || isLoading;
	const inputClassName =
		"w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

	return (
		<SettingsSection title={t("title")} description={t("description")}>
			<div className="space-y-4">
				<div className="grid gap-3">
					<div>
						<label
							htmlFor="kdl-secert-id"
							className="mb-1 block text-sm font-medium text-foreground"
						>
							KDL_SECERT_ID
						</label>
						<input
							id="kdl-secert-id"
							type="text"
							className={inputClassName}
							placeholder={t("secertIdPlaceholder")}
							value={kdlSecertId}
							onChange={(e) => setKdlSecertId(e.target.value)}
							disabled={isLoadingOrSaving}
						/>
					</div>
					<div>
						<label
							htmlFor="kdl-signature"
							className="mb-1 block text-sm font-medium text-foreground"
						>
							KDL_SIGNATURE
						</label>
						<input
							id="kdl-signature"
							type="text"
							className={inputClassName}
							placeholder={t("signaturePlaceholder")}
							value={kdlSignature}
							onChange={(e) => setKdlSignature(e.target.value)}
							disabled={isLoadingOrSaving}
						/>
					</div>
					<div>
						<label
							htmlFor="kdl-user-name"
							className="mb-1 block text-sm font-medium text-foreground"
						>
							KDL_USER_NAME
						</label>
						<input
							id="kdl-user-name"
							type="text"
							className={inputClassName}
							placeholder={t("userNamePlaceholder")}
							value={kdlUserName}
							onChange={(e) => setKdlUserName(e.target.value)}
							disabled={isLoadingOrSaving}
						/>
					</div>
					<div>
						<label
							htmlFor="kdl-user-pwd"
							className="mb-1 block text-sm font-medium text-foreground"
						>
							KDL_USER_PWD
						</label>
						<input
							id="kdl-user-pwd"
							type="password"
							className={inputClassName}
							placeholder={t("userPwdPlaceholder")}
							value={kdlUserPwd}
							onChange={(e) => setKdlUserPwd(e.target.value)}
							disabled={isLoadingOrSaving}
						/>
					</div>
				</div>

				{message && (
					<div
						className={`p-3 rounded-md text-sm ${
							message.type === "success"
								? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
								: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
						}`}
					>
						{message.text}
					</div>
				)}

				<button
					type="button"
					onClick={saveConfig}
					disabled={isLoadingOrSaving}
					className="rounded-md border border-primary bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{isSaving ? t("saving") : t("save")}
				</button>
			</div>
		</SettingsSection>
	);
}
