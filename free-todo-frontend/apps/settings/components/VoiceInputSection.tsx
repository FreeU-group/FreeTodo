"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { useSaveConfig } from "@/lib/query";
import { toastError, toastSuccess } from "@/lib/toast";
import { SettingsSection } from "./SettingsSection";

interface VoiceInputSectionProps {
	config: Record<string, unknown> | undefined;
	loading?: boolean;
}

const DEFAULT_HOTKEY = "AltRight";
const DEFAULT_LANGUAGE = "zh";

const HOTKEY_OPTIONS = [
	{ value: "AltRight", labelKey: "hotkeyRightAlt" },
	{ value: "AltLeft", labelKey: "hotkeyLeftAlt" },
	{ value: "ShiftRight", labelKey: "hotkeyRightShift" },
	{ value: "ShiftLeft", labelKey: "hotkeyLeftShift" },
	{ value: "CtrlRight", labelKey: "hotkeyRightCtrl" },
	{ value: "CtrlLeft", labelKey: "hotkeyLeftCtrl" },
];
const LANGUAGE_OPTIONS = [
	{ value: "zh", labelKey: "languageZh" },
	{ value: "en", labelKey: "languageEn" },
	{ value: "auto", labelKey: "languageAuto" },
];

/**
 * 语音输入快捷键设置
 */
export function VoiceInputSection({
	config,
	loading = false,
}: VoiceInputSectionProps) {
	const tSettings = useTranslations("page.settings");
	const tVoice = useTranslations("voiceInput");
	const saveConfigMutation = useSaveConfig();

	const [hotkey, setHotkey] = useState(DEFAULT_HOTKEY);
	const [language, setLanguage] = useState(DEFAULT_LANGUAGE);
	const lastSaveTimeRef = useRef<number>(0);

	useEffect(() => {
		if (!config) return;
		const now = Date.now();
		if (now - lastSaveTimeRef.current < 500) return;
		const savedHotkey = config.voiceInputHotkey;
		if (typeof savedHotkey === "string" && savedHotkey.trim()) {
			setHotkey(savedHotkey);
		} else {
			setHotkey(DEFAULT_HOTKEY);
		}
		const savedLanguage = config.voiceInputLanguage;
		if (typeof savedLanguage === "string" && savedLanguage.trim()) {
			setLanguage(savedLanguage);
		} else {
			setLanguage(DEFAULT_LANGUAGE);
		}
	}, [config]);

	const isLoading = loading || saveConfigMutation.isPending;

	const handleHotkeyChange = async (nextValue: string) => {
		setHotkey(nextValue);
		try {
			lastSaveTimeRef.current = Date.now();
			await saveConfigMutation.mutateAsync({
				data: {
					voiceInputHotkey: nextValue,
				},
			});
			toastSuccess(tSettings("voiceInputHotkeySaved"));
		} catch (error) {
			console.error("保存语音输入快捷键失败:", error);
			const errorMsg = error instanceof Error ? error.message : String(error);
			toastError(tSettings("saveFailed", { error: errorMsg }));
			lastSaveTimeRef.current = 0;
		}
	};

	const handleLanguageChange = async (nextValue: string) => {
		setLanguage(nextValue);
		try {
			lastSaveTimeRef.current = Date.now();
			await saveConfigMutation.mutateAsync({
				data: {
					voiceInputLanguage: nextValue,
				},
			});
			toastSuccess(tSettings("voiceInputLanguageSaved"));
		} catch (error) {
			console.error("保存语音输入语言失败:", error);
			const errorMsg = error instanceof Error ? error.message : String(error);
			toastError(tSettings("saveFailed", { error: errorMsg }));
			lastSaveTimeRef.current = 0;
		}
	};

	return (
		<SettingsSection
			title={tSettings("voiceInputTitle")}
			description={tSettings("voiceInputDescription")}
		>
			<div className="space-y-3">
				<div className="flex items-center justify-between gap-4">
					<label
						htmlFor="voice-input-hotkey"
						className="text-sm font-medium text-foreground"
					>
						{tSettings("voiceInputHotkeyLabel")}
					</label>
					<select
						id="voice-input-hotkey"
						value={hotkey}
						onChange={(e) => handleHotkeyChange(e.target.value)}
						disabled={isLoading}
						className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
					>
						{HOTKEY_OPTIONS.map((option) => (
							<option key={option.value} value={option.value}>
								{tVoice(option.labelKey)}
							</option>
						))}
					</select>
				</div>
				<div className="flex items-center justify-between gap-4">
					<label
						htmlFor="voice-input-language"
						className="text-sm font-medium text-foreground"
					>
						{tSettings("voiceInputLanguageLabel")}
					</label>
					<select
						id="voice-input-language"
						value={language}
						onChange={(e) => handleLanguageChange(e.target.value)}
						disabled={isLoading}
						className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
					>
						{LANGUAGE_OPTIONS.map((option) => (
							<option key={option.value} value={option.value}>
								{tVoice(option.labelKey)}
							</option>
						))}
					</select>
				</div>
			</div>
			<p className="mt-2 text-xs text-muted-foreground">
				{tSettings("voiceInputHotkeyHint")}
			</p>
			<p className="mt-1 text-xs text-muted-foreground">
				{tSettings("voiceInputLanguageHint")}
			</p>
		</SettingsSection>
	);
}
