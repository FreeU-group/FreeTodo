"use client"

import { CalendarDays, LayoutPanelLeft } from "lucide-react"
import { useUiStore } from "@/lib/store/ui-store"
import { cn } from "@/lib/utils"

interface BottomDockProps {
  className?: string
}

export function BottomDock({ className }: BottomDockProps) {
  const { isCalendarOpen, isBoardOpen, toggleCalendar, toggleBoard } = useUiStore()

  return (
    <div
      className={cn(
        "pointer-events-auto fixed inset-x-0 bottom-4 z-30 flex justify-center",
        className
      )}
    >
      <div className="flex items-center gap-3 rounded-full bg-card border border-border px-4 py-2 shadow-lg backdrop-blur">
        <button
          type="button"
          onClick={toggleCalendar}
          className={cn(
            "flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
            isCalendarOpen
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          )}
        >
          <CalendarDays className="h-4 w-4" />
          <span>日历</span>
        </button>

        <button
          type="button"
          onClick={toggleBoard}
          className={cn(
            "flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
            isBoardOpen
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          )}
        >
          <LayoutPanelLeft className="h-4 w-4" />
          <span>看板</span>
        </button>
      </div>
    </div>
  )
}
