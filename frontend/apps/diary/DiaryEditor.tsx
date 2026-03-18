"use client";

import { Bot, ImageIcon, Loader2, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { DiaryTabs, type JournalTab } from "@/apps/diary/DiaryTabs";
import type { JournalDraft } from "@/apps/diary/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DiaryEditorProps {
	draft: JournalDraft;
	activeTab: JournalTab;
	onTabChange: (tab: JournalTab) => void;
	onTitleChange: (value: string) => void;
	onTitleBlur: (value: string) => void;
	onUserNotesChange: (value: string) => void;
	onUserNotesBlur: (value: string) => void;
	onContentAiChange: (value: string) => void;
	onContentAiBlur: (value: string) => void;
	onGenerateManga: () => void;
	onGenerateDiaryText: () => void;
	onAutoLink: () => void;
	autoLinkMessage: string | null;
	isGeneratingManga: boolean;
	isGeneratingDiaryText: boolean;
	isAutoLinking: boolean;
	hasJournalId: boolean;
	illustrationUrls: string[];
	illustrationLoading: boolean;
}

export function DiaryEditor({
	draft,
	activeTab,
	onTabChange,
	onTitleChange,
	onTitleBlur,
	onUserNotesChange,
	onUserNotesBlur,
	onContentAiChange,
	onContentAiBlur,
	onGenerateManga,
	onGenerateDiaryText,
	onAutoLink,
	autoLinkMessage,
	isGeneratingManga,
	isGeneratingDiaryText,
	isAutoLinking,
	hasJournalId,
	illustrationUrls,
	illustrationLoading,
}: DiaryEditorProps) {
	const t = useTranslations("journalPanel");
	const [imgKey, setImgKey] = useState(0);
	const hasExistingIllustrations = illustrationUrls.length > 0;

	useEffect(() => {
		if (illustrationUrls.length > 0) {
			setImgKey((value) => value + 1);
		}
	}, [illustrationUrls]);

	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-4">
			<div className="flex flex-wrap items-center justify-between gap-3 shrink-0 mb-4">
				<DiaryTabs activeTab={activeTab} onChange={onTabChange} />
				<div className="flex items-center gap-2">
					{activeTab === "original" && (
						<>
							<Button
								variant="outline"
								size="sm"
								onClick={onGenerateDiaryText}
								disabled={isGeneratingDiaryText}
								className="gap-1.5"
							>
								{isGeneratingDiaryText ? (
									<Loader2 className="h-3.5 w-3.5 animate-spin" />
								) : (
									<Bot className="h-3.5 w-3.5" />
								)}
								{isGeneratingDiaryText
									? t("generatingDiaryText")
									: t("generateDiaryText")}
							</Button>
							<Button
								variant="ghost"
								size="sm"
								onClick={onAutoLink}
								disabled={!hasJournalId || isAutoLinking}
							>
								{isAutoLinking ? t("autoLinking") : t("autoLink")}
							</Button>
						</>
					)}
					{activeTab === "ai" && (
						<Button
							variant="outline"
							size="sm"
							onClick={onGenerateManga}
							disabled={isGeneratingManga}
							className="gap-1.5"
						>
							{isGeneratingManga ? (
								<Loader2 className="h-3.5 w-3.5 animate-spin" />
							) : (
								<Sparkles className="h-3.5 w-3.5" />
							)}
							{isGeneratingManga
								? t("generatingAi")
								: hasExistingIllustrations
									? t("regenerateAi")
									: t("generateAi")}
						</Button>
					)}
				</div>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto">
				{activeTab === "original" && (
					<div className="flex flex-col gap-3">
						<div className="flex min-h-0 flex-col rounded-2xl border border-border bg-background px-4 py-4 shadow-sm">
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
								onBlur={(event) =>
									onUserNotesBlur(event.currentTarget.value)
								}
								placeholder={t("contentPlaceholder")}
								className="mt-3 min-h-[160px] flex-1 resize-none bg-transparent text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/70 focus-visible:outline-none"
							/>
						</div>

						<div className="flex flex-col rounded-2xl border border-border bg-muted/10 px-4 py-4 shadow-sm">
							<div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
								<Bot className="h-3.5 w-3.5" />
								<span>{t("diaryAiTitle")}</span>
							</div>
							<textarea
								value={draft.contentAi}
								onChange={(event) =>
									onContentAiChange(event.target.value)
								}
								onBlur={(event) =>
									onContentAiBlur(event.currentTarget.value)
								}
								placeholder={t("diaryAiPlaceholder")}
								className="min-h-[120px] flex-1 resize-none bg-transparent text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/70 focus-visible:outline-none"
							/>
						</div>
					</div>
				)}

				{activeTab === "ai" && (
					<div className="flex flex-col gap-3">
						{illustrationLoading && illustrationUrls.length === 0 ? (
							<div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border px-4 py-12 text-center">
								<Loader2 className="h-8 w-8 animate-spin text-primary" />
								<p className="text-sm text-muted-foreground">
									{t("loadingIllustrations")}
								</p>
							</div>
						) : illustrationUrls.length > 0 ? (
							illustrationUrls.map((url) => (
								<div
									key={url}
									className="rounded-2xl border border-border"
								>
									{/* eslint-disable-next-line @next/next/no-img-element */}
									<img
										src={`${url}?v=${imgKey}`}
										alt={t("illustrationAlt", {
											index:
												illustrationUrls.indexOf(url) +
												1,
										})}
										className="w-full h-auto rounded-2xl"
									/>
								</div>
							))
						) : (
							<div
								className={cn(
									"flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border px-4 py-12 text-center",
									isGeneratingManga && "animate-pulse",
								)}
							>
								{isGeneratingManga ? (
									<>
										<Loader2 className="h-8 w-8 animate-spin text-primary" />
										<p className="text-sm text-muted-foreground">
											{t("illustrationGenerating")}
										</p>
									</>
								) : (
									<>
										<ImageIcon className="h-8 w-8 text-muted-foreground/30" />
										<p className="text-xs text-muted-foreground">
											{t("noIllustration")}
										</p>
									</>
								)}
							</div>
						)}
					</div>
				)}

				{autoLinkMessage && (
					<div className="mt-3 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
						{autoLinkMessage}
					</div>
				)}
			</div>
		</div>
	);
}
