"use client";

import { ImageIcon, Loader2, Sparkles } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
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
	onCopyToOriginal: (content: string) => void;
	isGeneratingAi: boolean;
	isAutoLinking: boolean;
	hasJournalId: boolean;
	illustrationExists: boolean;
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
	onCopyToOriginal,
	isGeneratingAi,
	isAutoLinking,
	hasJournalId,
	illustrationExists,
	illustrationGenerating,
}: DiaryEditorProps) {
	const t = useTranslations("journalPanel");

	const isGenerating = isGeneratingAi || illustrationGenerating;

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-4 py-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<DiaryTabs activeTab={activeTab} onChange={onTabChange} />
				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={onGenerateAi}
						disabled={!hasJournalId || isGenerating}
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

			<div className="flex min-h-0 flex-1 flex-col gap-3">
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
					<div className="flex min-h-0 flex-1 flex-col gap-3">
						{/* 插画 */}
						<div className="overflow-hidden rounded-2xl border border-border bg-muted/10">
							{illustrationExists ? (
								<div className="relative w-full">
									<Image
										src={`/api/diary-illustration/image/${selectedDateStr}`}
										alt={t("illustrationAlt")}
										width={800}
										height={800}
										className="w-full object-cover"
										unoptimized
									/>
								</div>
							) : (
								<div
									className={cn(
										"flex items-center gap-2 px-4 py-3 text-xs text-muted-foreground",
										isGenerating && "animate-pulse",
									)}
								>
									<ImageIcon className="h-4 w-4 shrink-0" />
									<span>
										{isGenerating ? t("illustrationGenerating") : t("noIllustration")}
									</span>
								</div>
							)}
						</div>

						{/* AI 文字描述 */}
						<textarea
							value={draft.contentAi}
							readOnly
							placeholder={isGenerating ? t("generatingAi") : t("aiPlaceholder")}
							className="min-h-[160px] flex-1 rounded-xl border border-border bg-muted/20 p-4 text-sm leading-relaxed"
						/>
						{draft.contentAi && (
							<Button
								variant="outline"
								size="sm"
								onClick={() => onCopyToOriginal(draft.contentAi)}
							>
								{t("copyToOriginal")}
							</Button>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
