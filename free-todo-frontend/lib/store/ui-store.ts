import { create } from "zustand"

interface UiStoreState {
  isCalendarOpen: boolean
  isBoardOpen: boolean
  toggleCalendar: () => void
  toggleBoard: () => void
}

export const useUiStore = create<UiStoreState>((set) => ({
  isCalendarOpen: true,
  isBoardOpen: true,
  toggleCalendar: () =>
    set((state) => ({
      isCalendarOpen: !state.isCalendarOpen || !state.isBoardOpen,
      isBoardOpen: state.isBoardOpen || !state.isCalendarOpen
    })),
  toggleBoard: () =>
    set((state) => ({
      isBoardOpen: !state.isBoardOpen || !state.isCalendarOpen,
      isCalendarOpen: state.isCalendarOpen || !state.isBoardOpen
    }))
}))
