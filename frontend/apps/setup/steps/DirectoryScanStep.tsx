"use client";

import { useState } from "react";
import { useSetupStore } from "@/lib/store/setup-store";
import { useScanDirectory } from "@/lib/query/setup";

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
	const { scanDirectory, setScanDirectory } = useSetupStore();
	const scanMutation = useScanDirectory();
	const [scanned, setScanned] = useState(false);

	const defaultDir =
		typeof navigator !== "undefined" && navigator.userAgent.includes("Windows")
			? "C:\\Users\\" +
				(typeof process !== "undefined" ? process.env.USERNAME || "" : "") +
				"\\Desktop"
			: "~/Desktop";

	const dir = scanDirectory || defaultDir;

	const handleScan = async () => {
		setScanDirectory(dir);
		await scanMutation.mutateAsync({ directory: dir, maxFiles: 200 });
		setScanned(true);
	};

	const files = scanMutation.data?.files ?? [];
	const extCounts: Record<string, number> = {};
	for (const f of files) {
		const ext = f.ext || "(无后缀)";
		extCounts[ext] = (extCounts[ext] || 0) + 1;
	}
	const topExts = Object.entries(extCounts)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 6);

	return (
		<div className="flex w-full max-w-lg flex-col gap-5">
			<div className="text-center">
				<div className="mb-2 text-3xl">📂</div>
				<h2 className="text-xl font-bold text-white">扫描工作目录</h2>
				<p className="mt-1 text-sm text-white/60">
					选择一个目录让 Agent 了解你的文件，仅读取文件名，不会访问内容
				</p>
			</div>

			<div className="flex gap-2">
				<input
					type="text"
					className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none transition focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
					placeholder={defaultDir}
					value={scanDirectory}
					onChange={(e) => setScanDirectory(e.target.value)}
				/>
				<button
					type="button"
					onClick={handleScan}
					disabled={scanMutation.isPending}
					className="shrink-0 rounded-lg bg-primary/80 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-primary disabled:opacity-40"
				>
					{scanMutation.isPending ? "扫描中…" : "开始扫描"}
				</button>
			</div>

			{/* Scan results */}
			{scanned && scanMutation.data && (
				<div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
					<div className="flex items-center justify-between text-sm">
						<span className="text-white/70">
							找到 <strong className="text-white">{scanMutation.data.file_count}</strong> 个文件
						</span>
						<span className="text-xs text-white/40">
							耗时 {scanMutation.data.scan_time_ms}ms
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
						{files.slice(0, 20).map((f, i) => (
							<div key={`${f.name}-${i}`} className="flex items-center justify-between text-xs">
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

			<div className="flex gap-3">
				<button
					type="button"
					onClick={onBack}
					className="flex-1 rounded-lg border border-white/10 bg-white/5 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/10"
				>
					上一步
				</button>
				<button
					type="button"
					onClick={onNext}
					className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-bold text-white shadow-lg shadow-primary/20 transition hover:brightness-110"
				>
					{scanned ? "下一步" : "跳过"}
				</button>
			</div>
		</div>
	);
}
