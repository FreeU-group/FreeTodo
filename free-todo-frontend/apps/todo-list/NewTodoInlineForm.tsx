"use client";

import { Mic, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { useVoiceHotkey } from "@/lib/hooks/useVoiceHotkey";
import { useVoiceInput } from "@/lib/hooks/useVoiceInput";

interface NewTodoInlineFormProps {
	value: string;
	onChange: (value: string) => void;
	onSubmit: (e?: React.FormEvent) => void;
	onCancel: () => void;
}

export function NewTodoInlineForm({
	value,
	onChange,
	onSubmit,
	onCancel,
}: NewTodoInlineFormProps) {
	const t = useTranslations("todoList");
	const tVoice = useTranslations("voiceInput");
	const inputRef = useRef<HTMLInputElement>(null);
	const [voiceStatus, setVoiceStatus] = useState<"recording" | "transcribing" | null>(
		null,
	);
	const { hotkeyCode, hotkeyLabel, language } = useVoiceHotkey();
	const voice = useVoiceInput({
		onText: (text) => {
			const next = value.trim() ? `${value} ${text}` : text;
			onChange(next);
		},
		targetRef: inputRef,
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

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	useEffect(() => {
		if (value === "") {
			inputRef.current?.focus();
		}
	}, [value]);

	return (
		<div className="space-y-1">
			<form
				onSubmit={onSubmit}
				onReset={onCancel}
				className="group flex items-center gap-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 transition-colors focus-within:border-primary focus-within:bg-background focus-within:ring-2 focus-within:ring-primary/40"
				onClick={() => inputRef.current?.focus()}
				onKeyDown={(e) => {
					// Handle container key events without blocking input submission.
					if (e.currentTarget !== e.target) return;
					if (e.key === " ") {
						e.preventDefault();
						inputRef.current?.focus();
						return;
					}
					if (e.key === "Enter") {
						inputRef.current?.focus();
					}
				}}
			>
				<Plus className="h-4 w-4 text-muted-foreground group-focus-within:text-primary" />
				<input
					ref={inputRef}
					type="text"
					value={value}
					onChange={(e) => onChange(e.target.value)}
					placeholder={t("addTodo")}
					className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
					required
				/>
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
				<button type="submit" className="sr-only">
					{t("submit")}
				</button>
				<button type="reset" className="sr-only">
					{t("reset")}
				</button>
			</form>
			{voiceStatusLabel && (
				<div className="text-xs text-muted-foreground">
					{voiceStatusLabel}
				</div>
			)}
			{voice.error && (
				<div className="text-xs text-red-500">
					{voice.error === "unsupported"
						? tVoice("unsupported")
						: voice.error === "permission"
							? tVoice("permissionDenied")
							: voice.error === "empty"
								? tVoice("empty")
								: tVoice("uploadFailed")}
				</div>
			)}
		</div>
	);
}
