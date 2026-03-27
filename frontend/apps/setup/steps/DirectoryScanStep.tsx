"use client";

import { Check, FolderKanban, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAnalyzeFiles, useDefaultDirectory, useScanDirectory } from "@/lib/query/setup";
import { useSetupStore } from "@/lib/store/setup-store";

interface DirectoryScanStepProps {
	onNext: () => void;
	onBack: () => void;
}

function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(ts: number): string {
	return new Date(ts * 1000).toLocaleDateString("zh-CN", {
		month: "short",
		day: "numeric",
	});
}

export function DirectoryScanStep({ onNext, onBack }: DirectoryScanStepProps) {
	const t = useTranslations("onboarding");
	const {
		scanDirectory,
		setScanDirectory,
		setGuessedUserName,
		setInitialProfile,
		setUserName,
		userNameManuallySet,
	} = useSetupStore();
	const scanMutation = useScanDirectory();
	const analyzeMutation = useAnalyzeFiles();
	const { data: defaultDirData } = useDefaultDirectory();
	const [scanned, setScanned] = useState(false);
	const [error, setError] = useState("");
	const analyzeTriggered = useRef(false);

	const defaultDir = defaultDirData?.directory || "~/Desktop";

	const dir = scanDirectory || defaultDir;

	const handleScan = async () => {
		setError("");
		setScanDirectory(dir);
		analyzeTriggered.current = false;
		try {
			const res = await scanMutation.mutateAsync({ directory: dir, maxFiles: 200 });
			if (!res.valid) {
				setError(t("directoryInvalidPath"));
				setScanned(false);
			} else {
				setScanned(true);
			}
		} catch {
			setError(t("directoryScanFailed"));
			setScanned(false);
		}
	};

	const files = scanMutation.data?.files ?? [];
	const filenames = useMemo(() => files.map((f) => f.name), [files]);

	useEffect(() => {
		if (!scanned || filenames.length === 0 || analyzeTriggered.current) return;
		analyzeTriggered.current = true;

		analyzeMutation.mutate(
			{ filenames, directory: dir },
			{
				onSuccess: (data) => {
					if (data.guessed_name) {
						setGuessedUserName(data.guessed_name);
						if (!userNameManuallySet) {
							setUserName(data.guessed_name);
						}
					}
					if (data.initial_profile) {
						setInitialProfile(data.initial_profile);
					}
				},
			},
		);
	}, [
		analyzeMutation,
		dir,
		filenames,
		scanned,
		setGuessedUserName,
		setInitialProfile,
		setUserName,
		userNameManuallySet,
	]);

	const extCounts: Record<string, number> = {};
	for (const f of files) {
		const ext = f.ext || t("directoryNoExtension");
		extCounts[ext] = (extCounts[ext] || 0) + 1;
	}
	const topExts = Object.entries(extCounts)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 6);

	return (
		<div className="flex w-full max-w-lg flex-col gap-5">
			<div className="text-center">
				<div className="mb-4 flex justify-center">
					<div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/20 text-primary">
						<FolderKanban className="h-6 w-6" />
					</div>
				</div>
				<h2 className="text-xl font-bold text-white">{t("directoryTitle")}</h2>
				<p className="mt-1 text-sm text-white/60">
					{t("directoryDescription")}
				</p>
			</div>

			<div className="flex gap-2">
				<input
					type="text"
					className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none transition focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
					placeholder={defaultDir}
					value={scanDirectory}
					onChange={(e) => {
						setScanDirectory(e.target.value);
						setScanned(false);
						setError("");
					}}
				/>
				<button
					type="button"
					onClick={handleScan}
					disabled={scanMutation.isPending}
					className="shrink-0 flex items-center justify-center rounded-lg bg-primary/80 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-primary disabled:opacity-40"
					title={t("directoryScan")}
				>
					{scanMutation.isPending ? (
						<div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white" />
					) : (
						<Check className="h-5 w-5" />
					)}
				</button>
			</div>

			{error && (
				<div className="rounded-lg bg-red-500/10 px-3 py-2 text-sm font-medium text-red-400">
					{error}
				</div>
			)}

			{/* Scan results */}
			{scanned && scanMutation.data && (
				<div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
					<div className="flex items-center justify-between text-sm">
						<span className="text-white/70">
							{t("directoryFileCount", { count: scanMutation.data.file_count })}
						</span>
						<span className="text-xs text-white/40">
							{t("directoryScanDuration", { time: scanMutation.data.scan_time_ms })}
						</span>
					</div>

					{/* Extension summary */}
					{topExts.length > 0 && (
						<div className="flex flex-wrap gap-1.5">
							{topExts.map(([ext, count]) => (
								<span
									key={ext}
									className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary/80"
								>
									{ext} × {count}
								</span>
							))}
						</div>
					)}

					{/* Recent files list */}
					<div className="max-h-36 space-y-1 overflow-y-auto">
						{files.slice(0, 20).map((f) => (
							<div
								key={`${f.name}-${f.modified}-${f.size}`}
								className="flex items-center justify-between text-xs"
							>
								<span className="truncate text-white/70" style={{ maxWidth: "70%" }}>
									{f.name}
								</span>
								<span className="shrink-0 text-white/30">
									{formatSize(f.size)} · {formatTime(f.modified)}
								</span>
							</div>
						))}
					</div>
				</div>
			)}

			{/* AI analysis status */}
			{scanned && analyzeMutation.isPending && (
				<div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
					<Sparkles className="h-4 w-4 animate-pulse text-primary" />
					<span className="text-sm text-white/70">{t("directoryAnalyzing")}</span>
				</div>
			)}
			{scanned && analyzeMutation.isSuccess && analyzeMutation.data?.guessed_name && (
				<div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
					<Sparkles className="h-4 w-4 text-emerald-400" />
					<span className="text-sm text-white/70">
						{t("directoryGuessedName", { name: analyzeMutation.data.guessed_name })}
					</span>
				</div>
			)}
			{scanned && analyzeMutation.isSuccess && !analyzeMutation.data?.guessed_name && (
				<div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
					<Sparkles className="h-4 w-4 text-white/40" />
					<span className="text-sm text-white/50">{t("directoryAnalyzeComplete")}</span>
				</div>
			)}

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
					onClick={onNext}
					disabled={!scanned}
					className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-bold text-white shadow-lg shadow-primary/20 transition hover:brightness-110 disabled:opacity-40"
				>
					{t("nextBtn")}
				</button>
			</div>
		</div>
	);
}
