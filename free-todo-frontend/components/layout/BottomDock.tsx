"use client"

import { CalendarDays, LayoutPanelLeft, type LucideIcon } from "lucide-react"
import { useUiStore } from "@/lib/store/ui-store"
import { cn } from "@/lib/utils"

interface BottomDockProps {
  className?: string
}

interface DockItem {
  id: string
  icon: LucideIcon
  label: string
  isActive: boolean
  onClick: () => void
  group?: string
}

export function BottomDock({ className }: BottomDockProps) {
  const { isCalendarOpen, isBoardOpen, toggleCalendar, toggleBoard } = useUiStore()

  const DOCK_ITEMS: DockItem[] = [
    {
      id: "calendar",
      icon: CalendarDays,
      label: "日历",
      isActive: isCalendarOpen,
      onClick: toggleCalendar,
      group: "views"
    },
    {
      id: "board",
      icon: LayoutPanelLeft,
      label: "看板",
      isActive: isBoardOpen,
      onClick: toggleBoard,
      group: "views"
    }
  ]

  // 按组分组，用于添加分隔符
  const groupedItems = DOCK_ITEMS.reduce(
    (acc, item) => {
      const group = item.group || "default"
      if (!acc[group]) {
        acc[group] = []
      }
      acc[group].push(item)
      return acc
    },
    {} as Record<string, DockItem[]>
  )

  const groups = Object.values(groupedItems)
  const hasMultipleGroups = groups.length > 1

  return (
    <div
      className={cn(
        "pointer-events-auto fixed bottom-6 left-1/2 z-50 -translate-x-1/2",
        className
      )}
    >
      <div
        className={cn(
          "flex items-center gap-1 rounded-xl",
          "bg-white/80 dark:bg-zinc-900/80",
          "backdrop-blur-md",
          "border border-zinc-200 dark:border-zinc-800",
          "shadow-lg",
          "px-2 py-1.5"
        )}
      >
        {groups.map((groupItems, groupIndex) => (
          <div key={groupIndex} className="flex items-center gap-1">
            {groupIndex > 0 && hasMultipleGroups && (
              <div className="h-6 w-[1px] bg-zinc-300 dark:bg-zinc-700 mx-1" />
            )}
            {groupItems.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={item.onClick}
                  className={cn(
                    "flex items-center justify-center",
                    "h-10 w-10 rounded-lg",
                    "transition-all duration-200",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
                    item.isActive
                      ? "bg-blue-600 text-white shadow-md shadow-blue-600/20 hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-600/30"
                      : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100"
                  )}
                  title={item.label}
                  aria-label={item.label}
                  aria-pressed={item.isActive}
                >
                  <Icon className="h-5 w-5" />
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
