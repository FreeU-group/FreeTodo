import type { Locale } from "@/lib/store/locale"

const translations = {
  zh: {
    language: {
      zh: "中文",
      en: "English"
    },
    theme: {
      light: "浅色",
      dark: "深色",
      system: "跟随系统"
    },
    layout: {
      currentLanguage: "当前语言",
      currentTheme: "当前主题"
    },
    page: {
      title: "Free Todo Canvas",
      subtitle: "日历视图与看板视图并列排布，可通过底部 Dock 快速切换与组合，并支持拖拽调整宽度。",
      calendarLabel: "日历视图",
      calendarPlaceholder: "占位：在这里接入日历组件",
      boardLabel: "看板视图",
      boardPlaceholder: "占位：在这里接入 Todo 看板"
    },
    bottomDock: {
      calendar: "日历",
      board: "看板"
    }
  },
  en: {
    language: {
      zh: "中文",
      en: "English"
    },
    theme: {
      light: "Light",
      dark: "Dark",
      system: "System"
    },
    layout: {
      currentLanguage: "Current Language",
      currentTheme: "Current Theme"
    },
    page: {
      title: "Free Todo Canvas",
      subtitle:
        "Calendar and Kanban view side by side. Toggle via bottom dock and resize panels by dragging the handle.",
      calendarLabel: "Calendar View",
      calendarPlaceholder: "Placeholder: plug a calendar component here",
      boardLabel: "Kanban Board",
      boardPlaceholder: "Placeholder: plug a Todo board here"
    },
    bottomDock: {
      calendar: "Calendar",
      board: "Board"
    }
  }
}

export function useTranslations(locale: Locale) {
  return translations[locale]
}
