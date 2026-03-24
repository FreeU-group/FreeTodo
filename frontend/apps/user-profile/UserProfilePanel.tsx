"use client";

import type { LucideIcon } from "lucide-react";
import {
	Briefcase,
	Clock,
	Heart,
	Loader2,
	Minimize2,
	RefreshCw,
	Target,
	UserCircle,
	Users,
	Zap,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";

import { PanelHeader } from "@/components/common/layout/PanelHeader";
import { cn } from "@/lib/utils";

function renderInlineMarkdown(text: string): ReactNode {
	const parts = text.split(/(\*\*[^*]+\*\*)/g);
	if (parts.length === 1) return text;
	return parts.map((part) => {
		const bold = part.match(/^\*\*(.+)\*\*$/);
		if (bold) {
			return (
				<strong key={part} className="font-semibold text-foreground">
					{bold[1]}
				</strong>
			);
		}
		return part;
	});
}

interface ProfileSection {
	key: string;
	title: string;
	content: string;
	icon: LucideIcon;
}

const SECTION_ICON_MAP: Record<string, LucideIcon> = {
	"身份与角色": UserCircle,
	"基本信息": UserCircle,
	"工作模式": Clock,
	"当前重点": Target,
	"社交网络": Users,
	"社交关系": Users,
	"偏好与习惯": Heart,
	"近期状态": Zap,
};

const SECTION_COLOR_MAP: Record<string, string> = {
	"身份与角色": "text-blue-500 bg-blue-500/10",
	"基本信息": "text-blue-500 bg-blue-500/10",
	"工作模式": "text-amber-500 bg-amber-500/10",
	"当前重点": "text-red-500 bg-red-500/10",
	"社交网络": "text-green-500 bg-green-500/10",
	"社交关系": "text-green-500 bg-green-500/10",
	"偏好与习惯": "text-purple-500 bg-purple-500/10",
	"近期状态": "text-teal-500 bg-teal-500/10",
};

function parseProfileMarkdown(markdown: string): {
	header: string;
	lastUpdate: string;
	sections: ProfileSection[];
} {
	const lines = markdown.split("\n");
	let header = "";
	let lastUpdate = "";
	const sections: ProfileSection[] = [];
	const sectionCounts = new Map<string, number>();
	let currentTitle = "";
	let currentLines: string[] = [];

	const flushSection = () => {
		if (currentTitle && currentLines.length > 0) {
			const content = currentLines.join("\n").trim();
			if (content) {
				const icon = SECTION_ICON_MAP[currentTitle] ?? Briefcase;
				const nextCount = (sectionCounts.get(currentTitle) ?? 0) + 1;
				sectionCounts.set(currentTitle, nextCount);
				sections.push({
					key: `${currentTitle}-${nextCount}`,
					title: currentTitle,
					content,
					icon,
				});
			}
		}
		currentLines = [];
	};

	for (const line of lines) {
		if (line.startsWith("# ")) {
			header = line.replace("# ", "").trim();
			continue;
		}

		if (line.startsWith("> 最后更新：")) {
			lastUpdate = line.replace("> 最后更新：", "").trim();
			continue;
		}
		if (line.startsWith("> 状态：") || line.startsWith("> ")) {
			continue;
		}

		const h2Match = line.match(/^##\s+(.+)/);
		if (h2Match) {
			flushSection();
			const raw = h2Match[1].trim();
			currentTitle = raw.replace(/[（(].+?[）)]/g, "").trim();
			continue;
		}

		if (currentTitle) {
			currentLines.push(line);
		}
	}
	flushSection();

	return { header, lastUpdate, sections };
}

function ProfileSectionCard({ section }: { section: ProfileSection }) {
	const Icon = section.icon;
	const colorClass =
		SECTION_COLOR_MAP[section.title] ?? "text-muted-foreground bg-muted/50";
	const parts = colorClass.split(" ");
	const iconColor = parts[0];
	const iconBg = parts[1];

	const contentLines = section.content
		.split("\n")
		.filter((l) => l.trim() !== "");

	return (
		<div className="group rounded-lg border border-border bg-card p-4 transition-all hover:shadow-md">
			<div className="mb-3 flex items-center gap-2.5">
				<div
					className={cn(
						"flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
						iconBg,
					)}
				>
					<Icon className={cn("h-4.5 w-4.5", iconColor)} />
				</div>
				<h3 className="text-sm font-semibold text-foreground">
					{section.title}
				</h3>
			</div>
			<div className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
				{contentLines.map((line, idx) => {
					const trimmed = line.replace(/^[-*]\s*/, "").trim();
					if (!trimmed) return null;

					const boldMatch = trimmed.match(/^\*\*(.+?)\*\*[：:]\s*(.+)$/);
					if (boldMatch) {
						return (
							<div key={`${section.title}-${idx}`} className="flex gap-1.5">
								<span className="shrink-0 font-medium text-foreground">
									{boldMatch[1]}：
								</span>
								<span>{renderInlineMarkdown(boldMatch[2])}</span>
							</div>
						);
					}

					if (line.match(/^[-*]\s/)) {
						return (
							<div key={`${section.title}-${idx}`} className="flex gap-2">
								<span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
								<span>{renderInlineMarkdown(trimmed)}</span>
							</div>
						);
					}

					return (
						<p key={`${section.title}-${idx}`}>{renderInlineMarkdown(trimmed)}</p>
					);
				})}
			</div>
		</div>
	);
}

export function UserProfilePanel() {
	const t = useTranslations("page");
	const tProfile = useTranslations("userProfile");

	const [profileContent, setProfileContent] = useState<string>("");
	const [loading, setLoading] = useState(true);
	const [updating, setUpdating] = useState(false);
	const [consolidating, setConsolidating] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const fetchProfile = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			const resp = await fetch("/api/memory/profile");
			if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
			const data = await resp.json();
			setProfileContent(data.content || "");
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setLoading(false);
		}
	}, []);

	const triggerUpdate = useCallback(async () => {
		try {
			setUpdating(true);
			const resp = await fetch("/api/memory/profile/update", {
				method: "POST",
			});
			if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
			await fetchProfile();
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setUpdating(false);
		}
	}, [fetchProfile]);

	const triggerConsolidate = useCallback(async () => {
		try {
			setConsolidating(true);
			const resp = await fetch("/api/memory/profile/consolidate", {
				method: "POST",
			});
			if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
			const data = await resp.json();
			if (data.content) {
				setProfileContent(data.content);
			} else {
				await fetchProfile();
			}
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setConsolidating(false);
		}
	}, [fetchProfile]);

	useEffect(() => {
		fetchProfile();
	}, [fetchProfile]);

	const parsed = profileContent
		? parseProfileMarkdown(profileContent)
		: null;

	const isEmpty = !parsed || parsed.sections.length === 0;
	const charCount = profileContent.length;
	const isBloated = charCount > 3000;
	const busy = updating || consolidating;

	return (
		<div className="relative flex h-full flex-col overflow-hidden bg-background">
			<PanelHeader
				icon={UserCircle}
				title={t("userProfileLabel")}
				actions={
					<div className="flex items-center gap-1">
						{isBloated && !isEmpty && (
							<button
								type="button"
								onClick={triggerConsolidate}
								disabled={busy}
								className={cn(
									"flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
									"text-amber-600 hover:bg-amber-500/10 hover:text-amber-700",
									"dark:text-amber-400 dark:hover:text-amber-300",
									"disabled:pointer-events-none disabled:opacity-50",
								)}
								aria-label={tProfile("consolidate")}
							>
						<Minimize2
							className={cn("h-3.5 w-3.5", consolidating && "animate-spin")}
						/>
								{tProfile("consolidate")}
							</button>
						)}
						<button
							type="button"
							onClick={triggerUpdate}
							disabled={busy}
							className={cn(
								"flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
								"text-muted-foreground hover:bg-muted/50 hover:text-foreground",
								"disabled:pointer-events-none disabled:opacity-50",
							)}
							aria-label={tProfile("refresh")}
						>
							<RefreshCw
								className={cn("h-3.5 w-3.5", updating && "animate-spin")}
							/>
							{tProfile("refresh")}
						</button>
					</div>
				}
			/>

			<div className="flex-1 overflow-y-auto px-4 py-5">
				{loading && (
					<div className="flex h-full items-center justify-center">
						<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
					</div>
				)}

				{error && !loading && (
					<div className="flex h-full flex-col items-center justify-center gap-3 text-center">
						<div className="rounded-full bg-destructive/10 p-3">
							<UserCircle className="h-8 w-8 text-destructive" />
						</div>
						<p className="text-sm text-muted-foreground">
							{tProfile("loadError")}
						</p>
						<button
							type="button"
							onClick={fetchProfile}
							className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
						>
							{tProfile("retry")}
						</button>
					</div>
				)}

				{!loading && !error && isEmpty && (
					<div className="flex h-full flex-col items-center justify-center gap-4 text-center">
						<div className="relative">
							<div className="absolute inset-0 rounded-full bg-primary/20 blur-2xl" />
							<div className="relative rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 p-6">
								<UserCircle className="h-12 w-12 text-white" />
							</div>
						</div>
						<h3 className="text-lg font-semibold text-foreground">
							{tProfile("emptyTitle")}
						</h3>
						<p className="max-w-sm text-sm text-muted-foreground">
							{tProfile("emptyDescription")}
						</p>
						<button
							type="button"
							onClick={triggerUpdate}
							disabled={updating}
							className={cn(
								"flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90",
								"disabled:pointer-events-none disabled:opacity-50",
							)}
						>
							{updating && (
								<Loader2 className="h-4 w-4 animate-spin" />
							)}
							{tProfile("generateNow")}
						</button>
					</div>
				)}

				{!loading && !error && parsed && !isEmpty && (
					<div className="space-y-4">
						<div className="flex items-center justify-between">
							{parsed.lastUpdate && (
								<div className="flex items-center gap-2 text-xs text-muted-foreground">
									<Clock className="h-3.5 w-3.5" />
									<span>
										{tProfile("lastUpdated", { time: parsed.lastUpdate })}
									</span>
								</div>
							)}
							<span
								className={cn(
									"rounded-full px-2 py-0.5 text-[11px] font-medium",
									isBloated
										? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
										: "bg-muted text-muted-foreground",
								)}
							>
								{tProfile("charCount", { count: charCount })}
							</span>
						</div>

						{isBloated && (
							<button
								type="button"
								onClick={triggerConsolidate}
								disabled={busy}
								className={cn(
									"flex w-full items-center justify-center gap-2 rounded-lg border border-amber-300/50 bg-amber-50/50 px-3 py-2 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100/50",
									"dark:border-amber-500/20 dark:bg-amber-500/5 dark:text-amber-300 dark:hover:bg-amber-500/10",
									"disabled:pointer-events-none disabled:opacity-50",
								)}
							>
								{consolidating ? (
									<Loader2 className="h-3.5 w-3.5 animate-spin" />
								) : (
									<Minimize2 className="h-3.5 w-3.5" />
								)}
								{tProfile("bloatWarning")}
							</button>
						)}

						<div className="grid grid-cols-1 gap-3">
							{parsed.sections.map((section) => (
								<ProfileSectionCard
									key={section.key}
									section={section}
								/>
							))}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
