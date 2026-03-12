"use client";

import { useTranslations } from "next-intl";
import { DiaryTabs, type JournalTab } from "@/apps/diary/DiaryTabs";
import type { JournalDraft } from "@/apps/diary/types";
import { Button } from "@/components/ui/button";

interface DiaryEditorProps {
	draft: JournalDraft;
	activeTab: JournalTab;
	onTabChange: (tab: JournalTab) => void;
	onTitleChange: (value: string) => void;
	onTitleBlur: (value: string) => void;
	onUserNotesChange: (value: string) => void;
	onUserNotesBlur: (value: string) => void;
	onGenerateObjective: () => void;
	onGenerateAi: () => void;
	onAutoLink: () => void;
	onCopyToOriginal: (content: string) => void;
	autoLinkMessage: string | null;
	isGeneratingObjective: boolean;
	isGeneratingAi: boolean;
	isAutoLinking: boolean;
	hasJournalId: boolean;
}

export function DiaryEditor({
	draft,
	activeTab,
	onTabChange,
	onTitleChange,
	onTitleBlur,
	onUserNotesChange,
	onUserNotesBlur,
	onGenerateObjective,
	onGenerateAi,
	onAutoLink,
	onCopyToOriginal,
	// autoLinkMessage,
	isGeneratingObjective,
	isGeneratingAi,
	isAutoLinking,
	hasJournalId,
}: DiaryEditorProps) {
	const t = useTranslations("journalPanel");

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-4 py-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<DiaryTabs activeTab={activeTab} onChange={onTabChange} />
				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={onGenerateObjective}
						disabled={!hasJournalId || isGeneratingObjective}
					>
						{isGeneratingObjective
							? t("generatingObjective")
							: t("generateObjective")}
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={onGenerateAi}
						disabled={!hasJournalId || isGeneratingAi}
					>
						{isGeneratingAi ? t("generatingAi") : t("generateAi")}
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
				{activeTab === "objective" && (
					<div className="flex min-h-0 flex-1 flex-col gap-2">
						<textarea
							value={draft.contentObjective}
							readOnly
							placeholder={t("objectivePlaceholder")}
							className="min-h-[240px] flex-1 rounded-xl border border-border bg-muted/20 p-4 text-sm leading-relaxed"
						/>
						{draft.contentObjective && (
							<Button
								variant="outline"
								size="sm"
								onClick={() => onCopyToOriginal(draft.contentObjective)}
							>
								{t("copyToOriginal")}
							</Button>
						)}
					</div>
				)}
				{activeTab === "ai" && (
					<div className="flex min-h-0 flex-1 flex-col gap-2">
						<textarea
							value={draft.contentAi}
							readOnly
							placeholder={t("aiPlaceholder")}
							className="min-h-[240px] flex-1 rounded-xl border border-border bg-muted/20 p-4 text-sm leading-relaxed"
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
				{/* {autoLinkMessage && (
					<div className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
						{autoLinkMessage}
					</div>
				)} */}
			</div>
		</div>
	);
}
