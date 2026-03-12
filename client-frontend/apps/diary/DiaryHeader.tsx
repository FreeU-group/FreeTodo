"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";
import type { JournalDraft } from "@/apps/diary/types";

interface DiaryHeaderProps {
	draft: JournalDraft;
	tagInput: string;
	onNameChange: (value: string) => void;
	onTagInputChange: (value: string) => void;
	onTagsCommit: (value: string) => void;
	onAutoSave: (options?: {
		tagValue?: string;
		draftOverride?: Partial<JournalDraft>;
	}) => void;
}

export function DiaryHeader({
	draft,
	tagInput,
	onNameChange,
	onTagInputChange,
	onTagsCommit,
	onAutoSave,
}: DiaryHeaderProps) {
	const t = useTranslations("journalPanel");
	const titleId = useId();
	const tagsId = useId();

	return (
		<div className="grid gap-3">
			<div className="grid gap-3 md:grid-cols-[2fr,1fr]">
				<div className="space-y-1">
					<label
						htmlFor={titleId}
						className="text-xs font-medium text-muted-foreground"
					>
						{t("titleLabel")}
					</label>
					<input
						id={titleId}
						value={draft.name}
						onChange={(event) => onNameChange(event.target.value)}
						onBlur={(event) =>
							onAutoSave({ draftOverride: { name: event.currentTarget.value } })
						}
						placeholder={t("titlePlaceholder")}
						className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
					/>
				</div>
				<div className="space-y-1">
					<label
						htmlFor={tagsId}
						className="text-xs font-medium text-muted-foreground"
					>
						{t("tagsLabel")}
					</label>
					<input
						id={tagsId}
						value={tagInput}
						onChange={(event) => onTagInputChange(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								event.preventDefault();
								onTagsCommit(event.currentTarget.value);
								onAutoSave({ tagValue: event.currentTarget.value });
							}
						}}
						onBlur={(event) => {
							onTagsCommit(event.target.value);
							onAutoSave({ tagValue: event.target.value });
						}}
						placeholder={t("tagsPlaceholder")}
						className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
					/>
					{draft.tags.length > 0 && (
						<div className="flex flex-wrap gap-2">
							{draft.tags.map((tag) => (
								<span
									key={tag}
									className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
								>
									{tag}
								</span>
							))}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
