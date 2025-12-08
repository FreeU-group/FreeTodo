import { create } from "zustand";

interface UiStoreState {
	isCalendarOpen: boolean;
	isTodosOpen: boolean;
	isChatOpen: boolean;
	calendarWidth: number;
	chatWidth: number;
	toggleCalendar: () => void;
	toggleTodos: () => void;
	toggleChat: () => void;
	setCalendarWidth: (width: number) => void;
	setChatWidth: (width: number) => void;
}

const MIN_PANEL_WIDTH = 0.2;
const MAX_PANEL_WIDTH = 0.8;

function clampWidth(width: number): number {
	if (Number.isNaN(width)) return 0.5;
	if (width < MIN_PANEL_WIDTH) return MIN_PANEL_WIDTH;
	if (width > MAX_PANEL_WIDTH) return MAX_PANEL_WIDTH;
	return width;
}

export const useUiStore = create<UiStoreState>((set) => ({
	isCalendarOpen: true,
	isTodosOpen: true,
	isChatOpen: false,
	calendarWidth: 0.5,
	chatWidth: 0.3,
	toggleCalendar: () =>
		set((state) => {
			// 当前只有日历打开 => 打开待办，形成双面板
			if (state.isCalendarOpen && !state.isTodosOpen) {
				return {
					isCalendarOpen: true,
					isTodosOpen: true,
				};
			}

			// 当前只有待办打开 => 打开日历，形成双面板
			if (!state.isCalendarOpen && state.isTodosOpen) {
				return {
					isCalendarOpen: true,
					isTodosOpen: true,
				};
			}

			// 当前双面板 => 关闭日历，仅保留待办
			return {
				isCalendarOpen: false,
				isTodosOpen: true,
			};
		}),
	toggleTodos: () =>
		set((state) => {
			// 当前只有待办打开 => 打开日历，形成双面板
			if (!state.isCalendarOpen && state.isTodosOpen) {
				return {
					isCalendarOpen: true,
					isTodosOpen: true,
				};
			}

			// 当前只有日历打开 => 打开待办，形成双面板
			if (state.isCalendarOpen && !state.isTodosOpen) {
				return {
					isCalendarOpen: true,
					isTodosOpen: true,
				};
			}

			// 当前双面板 => 关闭待办，仅保留日历
			return {
				isCalendarOpen: true,
				isTodosOpen: false,
			};
		}),
	toggleChat: () =>
		set((state) => ({
			isChatOpen: !state.isChatOpen,
		})),
	setCalendarWidth: (width: number) =>
		set((state) => {
			if (!state.isCalendarOpen || !state.isTodosOpen) {
				return state;
			}

			return {
				calendarWidth: clampWidth(width),
			};
		}),
	setChatWidth: (width: number) =>
		set((state) => {
			if (!state.isTodosOpen || !state.isChatOpen) {
				return state;
			}

			// chatWidth 是相对于总宽度的比例，需要转换为相对于剩余空间的比例
			// 但为了简化，我们直接使用总宽度的比例，并确保在合理范围内
			const clampedWidth = clampWidth(width);
			return {
				chatWidth: clampedWidth,
			};
		}),
}));
