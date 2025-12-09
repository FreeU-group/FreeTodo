export type Translation = {
	language: {
		zh: string;
		en: string;
	};
	theme: {
		light: string;
		dark: string;
		system: string;
	};
	layout: {
		currentLanguage: string;
		currentTheme: string;
		userSettings: string;
	};
	page: {
		title: string;
		subtitle: string;
		calendarLabel: string;
		calendarPlaceholder: string;
		todosLabel: string;
		todosPlaceholder: string;
		chatLabel: string;
		chatPlaceholder: string;
		todoDetailLabel: string;
		todoDetailPlaceholder: string;
		diaryLabel: string;
		diaryPlaceholder: string;
		settingsLabel: string;
		settingsPlaceholder: string;
		achievementsLabel: string;
		achievementsPlaceholder: string;
	};
	bottomDock: {
		calendar: string;
		todos: string;
		chat: string;
		todoDetail: string;
		diary: string;
		settings: string;
		achievements: string;
	};
};
