import type { Translation } from "./types";

export const en: Translation = {
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
		chatTitle: "Free Todo - AI Assistant",
		chatSubtitle:
			"A personalized AI chat app that helps you manage todos and boost productivity.",
		chatQuestion: "How can I help you today?",
		chatSuggestions: ["Travel", "Food", "Project details"],
		chatInputPlaceholder: "I am working on",
		chatSendButton: "Send",
		todoDetailLabel: "Todo Detail",
		todoDetailPlaceholder: "Placeholder: plug a todo detail component here",
		diaryLabel: "Diary",
		diaryPlaceholder: "Placeholder: plug a diary component here",
		settingsLabel: "Settings",
		settingsPlaceholder: "Placeholder: plug a settings component here",
		achievementsLabel: "Achievements",
		achievementsPlaceholder: "Placeholder: plug an achievements component here",
	},
	bottomDock: {
		calendar: "Calendar",
		todos: "Todos",
		chat: "Chat",
		todoDetail: "Todo Detail",
		diary: "Diary",
		settings: "Settings",
		achievements: "Achievements",
	},
};
