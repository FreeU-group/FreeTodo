"use client";

import { FolderOpen, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useSaveConfig } from "@/lib/query";
import { toastError, toastSuccess } from "@/lib/toast";
import { SettingsSection } from "./SettingsSection";

interface DirectoryScanSectionProps {
	config: Record<string, unknown> | undefined;
	loading?: boolean;
}

async function addWorkspaceApi(
	directory: string,
): Promise<{ success: boolean; directory: string; error?: string }> {
	const res = await fetch("/api/setup/add-workspace", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ directory }),
	});
	if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
	return res.json();
}

export function DirectoryScanSection({
	config,
	loading = false,
}: DirectoryScanSectionProps) {
	const t = useTranslations("page.settings");
	const saveConfigMutation = useSaveConfig();

	const [directories, setDirectories] = useState<string[]>([]);
	const [defaultWorkspace, setDefaultWorkspace] = useState("");
	const [newDir, setNewDir] = useState("");

	const isLoading = loading || saveConfigMutation.isPending;

	useEffect(() => {
		if (config) {
			const dirs = (config.setupScanDirectories as string[]) || [];
			setDirectories(dirs);
			setDefaultWorkspace(
				(config.agnoDefaultWorkspace as string) || dirs[0] || "",
			);
		}
	}, [config]);

	const handleAdd = async () => {
		const trimmed = newDir.trim();
		if (!trimmed || directories.includes(trimmed)) return;

		try {
			const result = await addWorkspaceApi(trimmed);
			if (!result.success) {
				toastError(result.error || t("directorySaveFailed", { error: "unknown" }));
				return;
			}
			setDirectories((prev) =>
				prev.includes(result.directory) ? prev : [...prev, result.directory],
			);
			setDefaultWorkspace(result.directory);
			setNewDir("");
			toastSuccess(t("directorySaved"));
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			toastError(t("directorySaveFailed", { error: msg }));
		}
	};

	const persistDirectories = async (
		nextDirs: string[],
		nextDefault?: string,
	) => {
		const workspace =
			nextDefault ??
			(nextDirs.includes(defaultWorkspace)
				? defaultWorkspace
				: nextDirs[0] || "");
		try {
			await saveConfigMutation.mutateAsync({
				data: {
					setupScanDirectories: nextDirs,
					agnoDefaultWorkspace: workspace,
				},
			});
			setDirectories(nextDirs);
			setDefaultWorkspace(workspace);
			toastSuccess(t("directorySaved"));
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			toastError(t("directorySaveFailed", { error: msg }));
		}
	};

	const handleRemove = async (dir: string) => {
		const nextDirs = directories.filter((d) => d !== dir);
		await persistDirectories(nextDirs);
	};

	const handleDefaultChange = async (dir: string) => {
		await persistDirectories(directories, dir);
	};

	return (
		<SettingsSection
			title={t("directoryTitle")}
			description={t("directoryDescription")}
			searchKeywords={[t("directoryTitle"), "scan", "directory", "workspace"]}
		>
			<div className="space-y-3">
				{directories.length > 0 ? (
					<ul className="space-y-2">
						{directories.map((dir) => (
							<li
								key={dir}
								className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2"
							>
								<div className="flex items-center gap-2 overflow-hidden">
									<FolderOpen className="h-4 w-4 shrink-0 text-primary" />
									<span className="truncate text-sm">{dir}</span>
									{dir === defaultWorkspace && (
										<span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
											{t("directoryDefault")}
										</span>
									)}
								</div>
								<div className="flex items-center gap-1">
									{dir !== defaultWorkspace && (
										<button
											type="button"
											onClick={() => handleDefaultChange(dir)}
											disabled={isLoading}
											className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
										>
											{t("directorySetDefault")}
										</button>
									)}
									<button
										type="button"
										onClick={() => handleRemove(dir)}
										disabled={isLoading}
										className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
									>
										<Trash2 className="h-3.5 w-3.5" />
									</button>
								</div>
							</li>
						))}
					</ul>
				) : (
					<p className="text-sm text-muted-foreground">
						{t("directoryEmpty")}
					</p>
				)}

				<div className="flex items-center gap-2">
					<input
						type="text"
						className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
						placeholder={t("directoryAddPlaceholder")}
						value={newDir}
						onChange={(e) => setNewDir(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") handleAdd();
						}}
						disabled={isLoading}
					/>
					<button
						type="button"
						onClick={handleAdd}
						disabled={isLoading || !newDir.trim()}
						className="flex shrink-0 items-center gap-1 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
					>
						<Plus className="h-4 w-4" />
						{t("directoryAddBtn")}
					</button>
				</div>
			</div>
		</SettingsSection>
	);
}
