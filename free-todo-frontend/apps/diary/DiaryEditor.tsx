"use client";

import { ImageIcon, Loader2, Sparkles } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { DiaryTabs, type JournalTab } from "@/apps/diary/DiaryTabs";
import type { JournalDraft } from "@/apps/diary/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DiaryEditorProps {
	draft: JournalDraft;
	activeTab: JournalTab;
	selectedDateStr: string;
	onTabChange: (tab: JournalTab) => void;
	onTitleChange: (value: string) => void;
	onTitleBlur: (value: string) => void;
	onUserNotesChange: (value: string) => void;
	onUserNotesBlur: (value: string) => void;
	onGenerateAi: () => void;
	onAutoLink: () => void;
	isGeneratingAi: boolean;
	isAutoLinking: boolean;
	hasJournalId: boolean;
	illustrationUrls: string[];
	illustrationGenerating: boolean;
}

export function DiaryEditor({
	draft,
	activeTab,
	selectedDateStr,
	onTabChange,
	onTitleChange,
	onTitleBlur,
	onUserNotesChange,
	onUserNotesBlur,
	onGenerateAi,
	onAutoLink,
	isGeneratingAi,
	isAutoLinking,
	hasJournalId,
	illustrationUrls,
	illustrationGenerating,
}: DiaryEditorProps) {
	const t = useTranslations("journalPanel");
	const isGenerating = isGeneratingAi || illustrationGenerating;

	// 加时间戳避免图片缓存
	const [imgKey, setImgKey] = useState(0);
	const refreshImages = useCallback(() => setImgKey((k) => k + 1), []);

	useEffect(() => {
		if (illustrationUrls.length > 0) refreshImages();
	}, [illustrationUrls.length, refreshImages]);

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-4 py-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<DiaryTabs activeTab={activeTab} onChange={onTabChange} />
				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={onGenerateAi}
						disabled={isGenerating}
						className="gap-1.5"
					>
						{isGenerating ? (
							<Loader2 className="h-3.5 w-3.5 animate-spin" />
						) : (
							<Sparkles className="h-3.5 w-3.5" />
						)}
						{isGenerating ? t("generatingAi") : t("generateAi")}
					</Button>
					<Button
						variant="ghost"
						size="sm"
						onClick={onAutoLink}
						disabled={!hasJournalId || isAutoLinking}
					>
						{isAutoLinking ? t("autoLinking") : t("autoLink")}
					</Button>
				</div>
			</div>

			<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
				{activeTab === "original" && (
					<div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-border bg-background px-4 py-4 shadow-sm">
						<input
							value={draft.name}
							onChange={(event) => onTitleChange(event.target.value)}
							onBlur={(event) => onTitleBlur(event.currentTarget.value)}
							placeholder={t("titlePlaceholder")}
							className="text-2xl font-semibold leading-tight text-foreground placeholder:text-muted-foreground/70 focus-visible:outline-none md:text-3xl"
						/>
						<textarea
							value={draft.userNotes}
							onChange={(event) => onUserNotesChange(event.target.value)}
							onBlur={(event) => onUserNotesBlur(event.currentTarget.value)}
							placeholder={t("contentPlaceholder")}
							className="mt-3 min-h-[240px] flex-1 resize-none bg-transparent text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/70 focus-visible:outline-none"
						/>
					</div>
				)}

				{activeTab === "ai" && (
					<div className="flex flex-col gap-3">
						{illustrationUrls.length > 0 ? (
							illustrationUrls.map((url) => (
								<div
									key={url}
									className="overflow-hidden rounded-2xl border border-border"
								>
									<Image
										src={`${url}?v=${imgKey}`}
										alt={t("illustrationAlt")}
										width={800}
										height={1000}
										className="w-full object-cover"
										unoptimized
									/>
								</div>
							))
						) : (
							<div
								className={cn(
									"flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border px-4 py-12 text-center",
									isGenerating && "animate-pulse",
								)}
							>
								{isGenerating ? (
									<>
										<Loader2 className="h-8 w-8 animate-spin text-primary" />
										<p className="text-sm text-muted-foreground">{t("illustrationGenerating")}</p>
									</>
								) : (
									<>
										<ImageIcon className="h-8 w-8 text-muted-foreground/30" />
										<p className="text-xs text-muted-foreground">{t("noIllustration")}</p>
									</>
								)}
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
