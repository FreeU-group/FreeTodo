"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import type { PointerEvent as ReactPointerEvent } from "react"

import { BottomDock } from "@/components/layout/BottomDock"
import { PanelContainer } from "@/components/layout/PanelContainer"
import { LanguageToggle } from "@/components/common/LanguageToggle"
import { ThemeToggle } from "@/components/common/ThemeToggle"
import { UserAvatar } from "@/components/common/UserAvatar"
import { useLocaleStore } from "@/lib/store/locale"
import { useTranslations } from "@/lib/i18n"
import { useUiStore } from "@/lib/store/ui-store"

export default function HomePage() {
  const { isCalendarOpen, isBoardOpen, calendarWidth, setCalendarWidth } = useUiStore()
  const [isDragging, setIsDragging] = useState(false)
  const { locale } = useLocaleStore()
  const t = useTranslations(locale)

  const containerRef = useRef<HTMLDivElement | null>(null)

  const layoutState = useMemo(() => {
    if (isCalendarOpen && isBoardOpen) {
      return {
        showCalendar: true,
        showBoard: true,
        calendarWidth,
        boardWidth: 1 - calendarWidth,
        showResizeHandle: true
      }
    }

    if (isCalendarOpen && !isBoardOpen) {
      return {
        showCalendar: true,
        showBoard: false,
        calendarWidth: 1,
        boardWidth: 0,
        showResizeHandle: false
      }
    }

    if (!isCalendarOpen && isBoardOpen) {
      return {
        showCalendar: false,
        showBoard: true,
        calendarWidth: 0,
        boardWidth: 1,
        showResizeHandle: false
      }
    }

    return {
      showCalendar: true,
      showBoard: false,
      calendarWidth: 1,
      boardWidth: 0,
      showResizeHandle: false
    }
  }, [isCalendarOpen, isBoardOpen, calendarWidth])

  const handleDragAtClientX = useCallback(
    (clientX: number) => {
      const container = containerRef.current
      if (!container) return

      const rect = container.getBoundingClientRect()
      if (rect.width <= 0) return

      const relativeX = clientX - rect.left
      const ratio = relativeX / rect.width
      setCalendarWidth(ratio)
    },
    [setCalendarWidth]
  )

  const handleResizePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()

    setIsDragging(true)
    handleDragAtClientX(event.clientX)

    const handlePointerMove = (moveEvent: PointerEvent) => {
      handleDragAtClientX(moveEvent.clientX)
    }

    const handlePointerUp = () => {
      setIsDragging(false)
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
  }

  return (
    <main className="relative flex h-screen flex-col overflow-hidden bg-background">
      <div className="relative z-10 flex h-full flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-4">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold tracking-tight text-foreground">
              {t.page.title}
            </h1>
          </div>

          <div className="flex items-center gap-1">
            <ThemeToggle />
            <LanguageToggle />
            <UserAvatar />
          </div>
        </header>

        <div
          ref={containerRef}
          className="flex min-h-0 flex-1 gap-0 overflow-hidden"
        >
          <PanelContainer
            variant="calendar"
            isVisible={layoutState.showCalendar}
            width={layoutState.calendarWidth}
          >
            <div className="flex h-full flex-col bg-background">
              <div className="flex h-10 shrink-0 items-center border-b border-border bg-muted/30 px-4">
                <h2 className="text-sm font-medium text-foreground">
                  {t.page.calendarLabel}
                </h2>
              </div>
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                {t.page.calendarPlaceholder}
              </div>
            </div>
          </PanelContainer>

          {layoutState.showResizeHandle ? (
            <div
              role="separator"
              aria-orientation="vertical"
              onPointerDown={handleResizePointerDown}
              className={`flex items-stretch justify-center transition-all duration-200 ${
                isDragging
                  ? "w-2 cursor-col-resize px-1"
                  : "w-1 cursor-col-resize px-0.5"
              }`}
            >
              <div
                className={`h-full rounded-full transition-all duration-200 ${
                  isDragging
                    ? "w-1 bg-primary shadow-[0_0_8px_hsl(var(--primary))]"
                    : "w-px bg-border"
                }`}
              />
            </div>
          ) : null}

          <PanelContainer
            variant="board"
            isVisible={layoutState.showBoard}
            width={layoutState.boardWidth}
          >
            <div className="flex h-full flex-col bg-background">
              <div className="flex h-10 shrink-0 items-center border-b border-border bg-muted/30 px-4">
                <h2 className="text-sm font-medium text-foreground">
                  {t.page.boardLabel}
                </h2>
              </div>
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                {t.page.boardPlaceholder}
              </div>
            </div>
          </PanelContainer>
        </div>
      </div>

      <BottomDock />
    </main>
  )
}
