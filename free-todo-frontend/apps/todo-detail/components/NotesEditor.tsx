"use client";

import { Mic } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ChangeEvent, useState } from "react";
import { SectionHeader } from "@/components/common/layout/SectionHeader";
import { useVoiceHotkey } from "@/lib/hooks/useVoiceHotkey";
import { useVoiceInput } from "@/lib/hooks/useVoiceInput";

interface NotesEditorProps {
	value: string;
	show: boolean;
	onToggle: () => void;
	onChange: (value: string) => void;
	onBlur?: () => void;
	notesRef: React.RefObject<HTMLTextAreaElement | null>;
	adjustHeight: () => void;
}

export function NotesEditor({
	value,
	show,
	onToggle,
	onChange,
	onBlur,
	notesRef,
	adjustHeight,
}: NotesEditorProps) {
	const t = useTranslations("todoDetail");
	const tVoice = useTranslations("voiceInput");
	const [isHovered, setIsHovered] = useState(false);
	const [voiceStatus, setVoiceStatus] = useState<"recording" | "transcribing" | null>(
		null,
	);
	const { hotkeyCode, hotkeyLabel, language } = useVoiceHotkey();
	const voice = useVoiceInput({
		onText: (text) => {
			const next = value.trim() ? `${value} ${text}` : text;
			onChange(next);
			requestAnimationFrame(adjustHeight);
		},
		targetRef: notesRef,
		language: language === "auto" ? undefined : language,
		hotkeyCode,
		onStatusChange: setVoiceStatus,
	});
	const voiceStatusLabel =
		voiceStatus === "recording"
			? tVoice("recording")
			: voiceStatus === "transcribing"
				? tVoice("transcribing")
				: null;
	const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
		onChange(event.target.value);
		requestAnimationFrame(adjustHeight);
	};

	const handleBlur = () => {
		onBlur?.();
	};

	return (
		<div
			role="group"
			className="mb-8"
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
		>
			<SectionHeader
				title={t("notesLabel")}
				show={show}
				onToggle={onToggle}
				headerClassName="mb-2"
				isHovered={isHovered}
			/>
			{show && (
				<div className="space-y-2">
					<textarea
						ref={notesRef}
						value={value}
						onChange={handleChange}
						onBlur={handleBlur}
						placeholder={t("notesPlaceholder")}
						className="w-full min-h-[120px] resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
					/>
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={voice.toggleRecording}
							className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							aria-label={
								voice.isRecording
									? tVoice("stopRecording")
									: tVoice("startRecording")
							}
							title={tVoice("shortcutHint", { key: hotkeyLabel })}
						>
							<Mic className="h-4 w-4" />
						</button>
						{voiceStatusLabel && (
							<span className="text-xs text-muted-foreground">
								{voiceStatusLabel}
							</span>
						)}
						{voice.error && (
							<span className="text-xs text-red-500">
								{voice.error === "unsupported"
									? tVoice("unsupported")
									: voice.error === "permission"
										? tVoice("permissionDenied")
										: voice.error === "empty"
											? tVoice("empty")
											: tVoice("uploadFailed")}
							</span>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
