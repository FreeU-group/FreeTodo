"use client"

import { useMemo } from "react"

import { BottomDock } from "@/components/layout/BottomDock"
import { PanelContainer } from "@/components/layout/PanelContainer"
import { useUiStore } from "@/lib/store/ui-store"

export default function HomePage() {
  const { isCalendarOpen, isBoardOpen } = useUiStore()

  const layoutState = useMemo(() => {
    const bothClosed = !isCalendarOpen && !isBoardOpen

    if (bothClosed) {
      return {
        showCalendar: true,
        showBoard: true,
        calendarFull: true,
        boardFull: false
      }
    }

    if (isCalendarOpen && !isBoardOpen) {
      return {
        showCalendar: true,
        showBoard: false,
        calendarFull: true,
        boardFull: false
      }
    }

    if (!isCalendarOpen && isBoardOpen) {
      return {
        showCalendar: false,
        showBoard: true,
        calendarFull: false,
        boardFull: true
      }
    }

    return {
      showCalendar: true,
      showBoard: true,
      calendarFull: false,
      boardFull: false
    }
  }, [isCalendarOpen, isBoardOpen])

  return (
    <main className="relative flex min-h-screen flex-col bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.15),_transparent_60%),_radial-gradient(circle_at_bottom,_rgba(52,211,153,0.12),_transparent_55%)]" />

      <div className="relative z-10 flex flex-1 flex-col px-4 pb-20 pt-6 md:px-6 lg:px-10">
        <header className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-slate-50 md:text-xl">
              Free Todo Canvas
            </h1>
            <p className="mt-1 text-xs text-slate-400 md:text-sm">
              日历视图与看板视图并列排布，可通过底部 Dock 快速切换与组合。
            </p>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 gap-3 rounded-2xl border border-slate-800/80 bg-slate-950/60 p-3 shadow-inner shadow-slate-900/80 backdrop-blur">
          <PanelContainer variant="calendar" isVisible={layoutState.showCalendar} fullWidth={layoutState.calendarFull}>
            <div className="flex h-full flex-col rounded-xl border border-slate-800 bg-slate-900/70 p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-medium text-slate-100 md:text-base">Calendar View</h2>
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
                  占位：在这里接入日历组件
                </span>
              </div>
              <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-slate-700/80 bg-slate-900/60 text-xs text-slate-500 md:text-sm">
                Calendar canvas area
              </div>
            </div>
          </PanelContainer>

          <PanelContainer variant="board" isVisible={layoutState.showBoard} fullWidth={layoutState.boardFull}>
            <div className="flex h-full flex-col rounded-xl border border-slate-800 bg-slate-900/70 p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-medium text-slate-100 md:text-base">Kanban Board</h2>
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
                  占位：在这里接入 Todo 看板
                </span>
              </div>
              <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-slate-700/80 bg-slate-900/60 text-xs text-slate-500 md:text-sm">
                Board canvas area
              </div>
            </div>
          </PanelContainer>
        </div>
      </div>

      <BottomDock />
    </main>
  )
}
