import { create } from "zustand"

interface UiStoreState {
  isCalendarOpen: boolean
  isBoardOpen: boolean
  calendarWidth: number
  toggleCalendar: () => void
  toggleBoard: () => void
  setCalendarWidth: (width: number) => void
}

const MIN_PANEL_WIDTH = 0.2
const MAX_PANEL_WIDTH = 0.8

function clampWidth(width: number): number {
  if (Number.isNaN(width)) return 0.5
  if (width < MIN_PANEL_WIDTH) return MIN_PANEL_WIDTH
  if (width > MAX_PANEL_WIDTH) return MAX_PANEL_WIDTH
  return width
}

export const useUiStore = create<UiStoreState>((set) => ({
  isCalendarOpen: true,
  isBoardOpen: true,
  calendarWidth: 0.5,
  toggleCalendar: () =>
    set((state) => {
      // 当前只有日历打开 => 打开看板，形成双面板
      if (state.isCalendarOpen && !state.isBoardOpen) {
        return {
          isCalendarOpen: true,
          isBoardOpen: true
        }
      }

      // 当前只有看板打开 => 打开日历，形成双面板
      if (!state.isCalendarOpen && state.isBoardOpen) {
        return {
          isCalendarOpen: true,
          isBoardOpen: true
        }
      }

      // 当前双面板 => 关闭日历，仅保留看板
      return {
        isCalendarOpen: false,
        isBoardOpen: true
      }
    }),
  toggleBoard: () =>
    set((state) => {
      // 当前只有看板打开 => 打开日历，形成双面板
      if (!state.isCalendarOpen && state.isBoardOpen) {
        return {
          isCalendarOpen: true,
          isBoardOpen: true
        }
      }

      // 当前只有日历打开 => 打开看板，形成双面板
      if (state.isCalendarOpen && !state.isBoardOpen) {
        return {
          isCalendarOpen: true,
          isBoardOpen: true
        }
      }

      // 当前双面板 => 关闭看板，仅保留日历
      return {
        isCalendarOpen: true,
        isBoardOpen: false
      }
    }),
  setCalendarWidth: (width: number) =>
    set((state) => {
      if (!state.isCalendarOpen || !state.isBoardOpen) {
        return state
      }

      return {
        calendarWidth: clampWidth(width)
      }
    })
}))
