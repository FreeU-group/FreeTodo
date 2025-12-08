"use client"

import { cn } from "@/lib/utils"

export type PanelVariant = "calendar" | "board"

interface PanelContainerProps {
  variant: PanelVariant
  isVisible: boolean
  fullWidth: boolean
  children: React.ReactNode
  className?: string
}

export function PanelContainer({
  variant,
  isVisible,
  fullWidth,
  children,
  className
}: PanelContainerProps) {
  if (!isVisible) {
    return null
  }

  return (
    <section
      aria-label={variant === "calendar" ? "Calendar Panel" : "Board Panel"}
      className={cn(
        "flex h-full min-h-0 flex-1 flex-col overflow-hidden border border-slate-800 bg-slate-900/80 p-4 transition-[flex-basis] duration-300 ease-out",
        fullWidth ? "basis-full" : "basis-1/2",
        className
      )}
    >
      {children}
    </section>
  )
}
