"use client";

import { BookOpen, CalendarDays } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DiaryEditor } from "@/apps/diary/DiaryEditor";
import type { JournalTab } from "@/apps/diary/DiaryTabs";
import {
	formatDateInput,
	getDayRange,
	normalizeDateOnly,
	parseJournalDate,
	resolveBucketRange,
} from "@/apps/diary/journal-utils";
import type { JournalDraft } from "@/apps/diary/types";
import {
	PanelHeader,
	usePanelActionButtonStyle,
	usePanelIconStyle,
} from "@/components/common/layout/PanelHeader";
import { DateOnlyPickerPopover } from "@/components/date-picker/DateOnlyPickerPopover";
import type {
	JournalAutoLinkRequest,
	JournalCreate,
	JournalGenerateRequest,
} from "@/lib/generated/schemas";
import {
	type JournalView,
	useJournalMutations,
	useJournals,
} from "@/lib/query";
import { useJournalStore } from "@/lib/store/journal-store";
import { useLocaleStore } from "@/lib/store/locale";
import { cn } from "@/lib/utils";

const emptyDraft = (date: Date): JournalDraft => ({
	id: null,
	name: "",
	userNotes: "",
	contentObjective: "",
	contentAi: "",
	mood: "",
	energy: null,
	tags: [],
	relatedTodoIds: [],
	relatedActivityIds: [],
	date: normalizeDateOnly(date),
});

const parseTags = (input: string) =>
	input.split(",").map((tag) => tag.trim()).filter((tag) => tag.length > 0);

export function DiaryPanel() {
	const t = useTranslations("journalPanel");
	const tDatePicker = useTranslations("datePicker");
	const { locale } = useLocaleStore();
	const [selectedDate, setSelectedDate] = useState(() =>
		normalizeDateOnly(new Date()),
	);
	const [draft, setDraft] = useState<JournalDraft>(() =>
		emptyDraft(new Date()),
	);
	const [tagInput, setTagInput] = useState("");
	const [activeTab, setActiveTab] = useState<JournalTab>("original");
	const [autoLinkMessage, setAutoLinkMessage] = useState<string | null>(null);
	const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
	const datePickerRef = useRef<HTMLButtonElement | null>(null);
	const lastSyncKey = useRef<string | null>(null);
	const {
		refreshMode,
		fixedTime,
		workHoursEnd,
		customTime,
		autoLinkEnabled,
		autoGenerateObjectiveEnabled,
		autoGenerateAiEnabled,
	} = useJournalStore();
	const dayRange = useMemo(() => getDayRange(selectedDate), [selectedDate]);
	const bucket = useMemo(
		() =>
			resolveBucketRange(
				new Date(
					selectedDate.getFullYear(),
					selectedDate.getMonth(),
					selectedDate.getDate(),
					12,
					0,
					0,
					0,
				),
				refreshMode,
				fixedTime,
				workHoursEnd,
				customTime,
			),
		[selectedDate, refreshMode, fixedTime, workHoursEnd, customTime],
	);
	const {
		data: journalResponse,
		isLoading: isJournalLoading,
		error: journalError,
	} = useJournals({
		limit: 1,
		offset: 0,
		startDate: dayRange.start.toISOString(),
		endDate: dayRange.end.toISOString(),
	});
	const activeJournal = useMemo(
		() => journalResponse?.journals?.[0] ?? null,
		[journalResponse?.journals],
	);
	const dateLabelFormatter = useMemo(
		() =>
			new Intl.DateTimeFormat(locale, {
				year: "numeric",
				month: "short",
				day: "numeric",
			}),
		[locale],
	);
	const dateButtonStyle = usePanelActionButtonStyle("default", {
		size: "h-7 w-auto",
		textColor: "text-foreground",
		className: "gap-2 px-2 text-xs font-medium",
	});
	const actionIconStyle = usePanelIconStyle("action");
	const {
		createJournal,
		updateJournal,
		autoLinkJournal,
		generateObjective,
		generateAiView,
		isCreating,
		isUpdating,
		isAutoLinking,
		isGeneratingObjective,
		isGeneratingAi,
	} = useJournalMutations();
	const syncDraftFromJournal = useCallback(
		(journal: JournalView) => {
			const journalDate = parseJournalDate(journal.date);
			setDraft({
				id: journal.id,
				name: journal.name ?? "",
				userNotes: journal.userNotes ?? "",
				contentObjective: journal.contentObjective ?? "",
				contentAi: journal.contentAi ?? "",
				mood: journal.mood ?? "",
				energy: journal.energy ?? null,
				tags: (journal.tags ?? []).map((tag) => tag.tagName),
				relatedTodoIds: journal.relatedTodoIds ?? [],
				relatedActivityIds: journal.relatedActivityIds ?? [],
				date: journalDate,
			});
			setSelectedDate(journalDate);
			setTagInput((journal.tags ?? []).map((tag) => tag.tagName).join(", "));
			setAutoLinkMessage(null);
			setActiveTab("original");
		},
		[],
	);
	useEffect(() => {
		if (isJournalLoading) return;
		const syncKey = `${bucket.bucketStart.toISOString()}-${activeJournal?.id ?? "new"}`;
		if (lastSyncKey.current === syncKey) return;
		lastSyncKey.current = syncKey;

		if (activeJournal) {
			const activeDate = parseJournalDate(activeJournal.date);
			const activeTime = activeDate.getTime();
			if (
				activeTime >= dayRange.start.getTime() &&
				activeTime <= dayRange.end.getTime()
			) {
				syncDraftFromJournal(activeJournal);
				return;
			}
		}

		setDraft(emptyDraft(selectedDate));
		setTagInput("");
		setAutoLinkMessage(null);
		setActiveTab("original");
	}, [
		activeJournal,
		bucket.bucketStart,
		dayRange,
		isJournalLoading,
		selectedDate,
		syncDraftFromJournal,
	]);

	const handleDateChange = (value: Date) => {
		const nextDate = normalizeDateOnly(value);
		if (formatDateInput(nextDate) === formatDateInput(selectedDate)) return;
		setSelectedDate(nextDate);
		setDraft(emptyDraft(nextDate));
		setTagInput("");
		setAutoLinkMessage(null);
		setActiveTab("original");
	};

	const buildSavePayload = (
		updatedDraft: JournalDraft,
		tags: string[],
	): JournalCreate => ({
		name: updatedDraft.name || undefined,
		user_notes: updatedDraft.userNotes,
		date: formatDateInput(updatedDraft.date),
		content_format: "markdown",
		content_objective: updatedDraft.contentObjective || null,
		content_ai: updatedDraft.contentAi || null,
		mood: updatedDraft.mood || null,
		energy: updatedDraft.energy,
		day_bucket_start: bucket.bucketStart.toISOString(),
		tags,
		related_todo_ids: updatedDraft.relatedTodoIds,
		related_activity_ids: updatedDraft.relatedActivityIds,
	});
	const runAutoLink = async (
		journalId: number,
		snapshot?: { title: string; content: string; date: Date },
	) => {
		const payload: JournalAutoLinkRequest = {
			journal_id: journalId,
			title: snapshot?.title ?? draft.name,
			content_original: snapshot?.content ?? draft.userNotes,
			date: formatDateInput(snapshot?.date ?? draft.date),
			day_bucket_start: bucket.bucketStart.toISOString(),
			max_items: 3,
		};
		const result = await autoLinkJournal(payload);
		setDraft((prev) => ({
			...prev,
			relatedTodoIds: result.relatedTodoIds,
			relatedActivityIds: result.relatedActivityIds,
		}));
		setAutoLinkMessage(
			t("autoLinkSuccess", {
				todoCount: result.relatedTodoIds.length,
				activityCount: result.relatedActivityIds.length,
			}),
		);
	};
	const runObjectiveGeneration = async (
		journalId: number,
		snapshot?: { title: string; content: string; date: Date },
	) => {
		const payload: JournalGenerateRequest = {
			journal_id: journalId,
			title: snapshot?.title ?? draft.name,
			content_original: snapshot?.content ?? draft.userNotes,
			date: formatDateInput(snapshot?.date ?? draft.date),
			day_bucket_start: bucket.bucketStart.toISOString(),
			language: locale,
		};
		const result = await generateObjective(payload);
		setDraft((prev) => ({ ...prev, contentObjective: result.content }));
		setActiveTab("objective");
	};
	const runAiGeneration = async (
		journalId: number,
		snapshot?: { title: string; content: string; date: Date },
	) => {
		const payload: JournalGenerateRequest = {
			journal_id: journalId,
			title: snapshot?.title ?? draft.name,
			content_original: snapshot?.content ?? draft.userNotes,
			date: formatDateInput(snapshot?.date ?? draft.date),
			day_bucket_start: bucket.bucketStart.toISOString(),
			language: locale,
		};
		const result = await generateAiView(payload);
		setDraft((prev) => ({ ...prev, contentAi: result.content }));
		setActiveTab("ai");
	};
	const handleSave = async (options?: {
		tagsOverride?: string[];
		draftOverride?: Partial<JournalDraft>;
	}) => {
		const tags = options?.tagsOverride ?? parseTags(tagInput);
		const updatedDraft = { ...draft, ...options?.draftOverride, tags };
		setDraft(updatedDraft);
		setTagInput(tags.join(", "));
		const payload = buildSavePayload(updatedDraft, tags);

		let saved = null;
		try {
			if (updatedDraft.id) {
				const { uid: _uid, ...updatePayload } = payload;
				saved = await updateJournal(updatedDraft.id, updatePayload);
			} else {
				saved = await createJournal(payload);
			}
		} catch (_error) {
			setAutoLinkMessage(t("saveFailed"));
			return;
		}

		if (!saved) return;

		const savedDate = parseJournalDate(saved.date);
		setDraft({
			id: saved.id,
			name: saved.name ?? "",
			userNotes: saved.userNotes ?? "",
			contentObjective: saved.contentObjective ?? "",
			contentAi: saved.contentAi ?? "",
			mood: saved.mood ?? "",
			energy: saved.energy ?? null,
			tags: (saved.tags ?? []).map((tag) => tag.tagName),
			relatedTodoIds: saved.relatedTodoIds ?? [],
			relatedActivityIds: saved.relatedActivityIds ?? [],
			date: savedDate,
		});
		setSelectedDate(savedDate);
		setTagInput((saved.tags ?? []).map((tag) => tag.tagName).join(", "));
		setAutoLinkMessage(t("saveSuccess"));

		const snapshot = {
			title: saved.name ?? "",
			content: saved.userNotes ?? "",
			date: savedDate,
		};

		if (autoLinkEnabled) {
			try {
				await runAutoLink(saved.id, snapshot);
			} catch (_error) {
				setAutoLinkMessage(t("autoLinkFailed"));
			}
		}
		if (autoGenerateObjectiveEnabled && !saved.contentObjective) {
			try {
				await runObjectiveGeneration(saved.id, snapshot);
			} catch (_error) {
				setAutoLinkMessage(t("generateFailed"));
			}
		}
		if (autoGenerateAiEnabled && !saved.contentAi) {
			try {
				await runAiGeneration(saved.id, snapshot);
			} catch (_error) {
				setAutoLinkMessage(t("generateFailed"));
			}
		}
	};
	const handleAutoSave = (options?: {
		tagValue?: string;
		draftOverride?: Partial<JournalDraft>;
	}) => {
		if (isCreating || isUpdating) return;
		const tags =
			options?.tagValue !== undefined
				? parseTags(options.tagValue)
				: parseTags(tagInput);
		const draftSnapshot = { ...draft, ...options?.draftOverride, tags };
		const hasContent =
			draftSnapshot.name.trim().length > 0 ||
			draftSnapshot.userNotes.trim().length > 0 ||
			tags.length > 0 ||
			(draftSnapshot.contentObjective ?? "").trim().length > 0 ||
			(draftSnapshot.contentAi ?? "").trim().length > 0;

		if (!draftSnapshot.id && !hasContent) return;
		void handleSave({
			tagsOverride: tags,
			draftOverride: options?.draftOverride,
		});
	};
	const handleCopyToOriginal = (content: string) => {
		setDraft((prev) => {
			const trimmed = content.trim();
			if (!trimmed) return prev;
			const separator = prev.userNotes.trim().length > 0 ? "\n\n" : "";
			return {
				...prev,
				userNotes: `${prev.userNotes}${separator}${trimmed}`,
			};
		});
		setActiveTab("original");
	};
	const handleGenerateObjectiveClick = async () => {
		if (!draft.id) return;
		try {
			await runObjectiveGeneration(draft.id);
		} catch (_error) {
			setAutoLinkMessage(t("generateFailed"));
		}
	};
	const handleGenerateAiClick = async () => {
		if (!draft.id) return;
		try {
			await runAiGeneration(draft.id);
		} catch (_error) {
			setAutoLinkMessage(t("generateFailed"));
		}
	};
	const handleAutoLinkClick = async () => {
		if (!draft.id || isAutoLinking) return;
		try {
			await runAutoLink(draft.id);
		} catch (_error) {
			setAutoLinkMessage(t("autoLinkFailed"));
		}
	};

	if (journalError) {
		const errorMessage =
			journalError instanceof Error
				? journalError.message
				: String(journalError);
		return (
			<div className="flex h-full items-center justify-center text-destructive">
				{t("loadFailed", { error: errorMessage })}
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col overflow-hidden bg-background">
			<PanelHeader
				icon={BookOpen}
				title={t("panelTitle")}
				actions={
					<div className="relative">
						<button
							type="button"
							className={cn(dateButtonStyle, "whitespace-nowrap")}
							aria-label={tDatePicker("pickDate")}
							title={tDatePicker("pickDate")}
							aria-expanded={isDatePickerOpen}
							ref={datePickerRef}
							onClick={() => setIsDatePickerOpen((prev) => !prev)}
						>
							<CalendarDays className={actionIconStyle} />
							<span>{dateLabelFormatter.format(selectedDate)}</span>
						</button>
					</div>
				}
			/>

			<div className="flex min-h-0 flex-1 flex-col">
				{isDatePickerOpen && (
					<DateOnlyPickerPopover
						anchorRef={datePickerRef}
						selectedDate={selectedDate}
						onSelectDate={(value) => handleDateChange(value)}
						onClose={() => setIsDatePickerOpen(false)}
					/>
				)}
				<DiaryEditor
					draft={draft}
					activeTab={activeTab}
					onTabChange={setActiveTab}
					onTitleChange={(value) =>
						setDraft((prev) => ({ ...prev, name: value }))
					}
					onTitleBlur={(value) =>
						handleAutoSave({ draftOverride: { name: value } })
					}
					onUserNotesChange={(value) =>
						setDraft((prev) => ({ ...prev, userNotes: value }))
					}
					onUserNotesBlur={(value) =>
						handleAutoSave({ draftOverride: { userNotes: value } })
					}
					onGenerateObjective={handleGenerateObjectiveClick}
					onGenerateAi={handleGenerateAiClick}
					onAutoLink={handleAutoLinkClick}
					onCopyToOriginal={handleCopyToOriginal}
					autoLinkMessage={autoLinkMessage}
					isGeneratingObjective={isGeneratingObjective}
					isGeneratingAi={isGeneratingAi}
					isAutoLinking={isAutoLinking}
					hasJournalId={Boolean(draft.id)}
				/>
			</div>
		</div>
	);
}
