import type { Translation } from "./types";

export const zh: Translation = {
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
		chatTitle: "Free Todo - AI 智能助手",
		chatSubtitle: "一个个性化的 AI 聊天应用，帮助您管理待办事项、提高效率。",
		chatQuestion: "今天我能为您做些什么？",
		chatSuggestions: ["旅行", "美食", "项目详情"],
		chatInputPlaceholder: "我正在处理",
		chatSendButton: "发送",
		todoDetailLabel: "待办详情",
		todoDetailPlaceholder: "占位：在这里接入待办详情组件",
		diaryLabel: "日记",
		diaryPlaceholder: "占位：在这里接入日记组件",
		settingsLabel: "设置",
		settingsPlaceholder: "占位：在这里接入设置组件",
		achievementsLabel: "成就",
		achievementsPlaceholder: "占位：在这里接入成就组件",
	},
	bottomDock: {
		calendar: "日历",
		todos: "待办",
		chat: "聊天",
		todoDetail: "待办详情",
		diary: "日记",
		settings: "设置",
		achievements: "成就",
	},
};
