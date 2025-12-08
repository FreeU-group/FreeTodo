import type { Locale } from "@/lib/store/locale";

const translations = {
	zh: {
		language: {
			zh: "中文",
			en: "English",
		},
		theme: {
			light: "浅色",
			dark: "深色",
			system: "跟随系统",
		},
		layout: {
			currentLanguage: "当前语言",
			currentTheme: "当前主题",
			userSettings: "用户设置",
		},
		page: {
			title: "Free Todo Canvas",
			subtitle:
				"日历视图与待办视图并列排布，可通过底部 Dock 快速切换与组合，并支持拖拽调整宽度。",
			calendarLabel: "日历视图",
			calendarPlaceholder: "占位：在这里接入日历组件",
			todosLabel: "待办视图",
			todosPlaceholder: "占位：在这里接入 Todo 待办",
			chatLabel: "AI 聊天",
			chatPlaceholder: "占位：在这里接入 AI 聊天组件",
		},
		bottomDock: {
			calendar: "日历",
			todos: "待办",
			chat: "聊天",
		},
	},
	en: {
		language: {
			zh: "中文",
			en: "English",
		},
		theme: {
			light: "Light",
			dark: "Dark",
			system: "System",
		},
		layout: {
			currentLanguage: "Current Language",
			currentTheme: "Current Theme",
			userSettings: "User Settings",
		},
		page: {
			title: "Free Todo Canvas",
			subtitle:
				"Calendar and Todos view side by side. Toggle via bottom dock and resize panels by dragging the handle.",
			calendarLabel: "Calendar View",
			calendarPlaceholder: "Placeholder: plug a calendar component here",
			todosLabel: "Todos View",
			todosPlaceholder: "Placeholder: plug a Todo list here",
			chatLabel: "AI Chat",
			chatPlaceholder: "Placeholder: plug an AI chat component here",
		},
		bottomDock: {
			calendar: "Calendar",
			todos: "Todos",
			chat: "Chat",
		},
	},
};

export function useTranslations(locale: Locale) {
	const validLocale: Locale =
		locale === "zh" || locale === "en" ? locale : "zh";
	return translations[validLocale];
}
