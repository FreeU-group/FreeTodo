"use client";

import { useTranslations } from "next-intl";
import { useConfig } from "@/lib/query";

const DEFAULT_HOTKEY = "AltRight";
const DEFAULT_LANGUAGE = "zh";

const HOTKEY_LABEL_KEYS: Record<string, string> = {
	AltRight: "hotkeyRightAlt",
	AltLeft: "hotkeyLeftAlt",
	ShiftRight: "hotkeyRightShift",
	ShiftLeft: "hotkeyLeftShift",
	CtrlRight: "hotkeyRightCtrl",
	CtrlLeft: "hotkeyLeftCtrl",
};

export function useVoiceHotkey() {
	const tVoice = useTranslations("voiceInput");
	const { data: config } = useConfig();
	const hotkeyCode =
		(typeof config?.voiceInputHotkey === "string" &&
			config.voiceInputHotkey.trim()) ||
		DEFAULT_HOTKEY;
	const language =
		(typeof config?.voiceInputLanguage === "string" &&
			config.voiceInputLanguage.trim()) ||
		DEFAULT_LANGUAGE;
	const labelKey = HOTKEY_LABEL_KEYS[hotkeyCode] ?? HOTKEY_LABEL_KEYS.AltRight;
	const hotkeyLabel = tVoice(labelKey);

	return { hotkeyCode, hotkeyLabel, language };
}
