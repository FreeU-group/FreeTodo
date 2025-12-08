"use client"

import { motion } from "framer-motion"

import { cn } from "@/lib/utils"

export type PanelVariant = "calendar" | "board"

interface PanelContainerProps {
  variant: PanelVariant
  isVisible: boolean
  width: number
  children: React.ReactNode
  className?: string
}

export function PanelContainer({
  variant,
  isVisible,
  width,
  children,
  className
}: PanelContainerProps) {
  if (!isVisible || width <= 0) {
    return null
  }

  const flexBasis = `${Math.round(width * 1000) / 10}%`

  return (
    <motion.section
      aria-label={variant === "calendar" ? "Calendar Panel" : "Board Panel"}
      className={cn(
        "flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background",
        className
      )}
      style={{
        flexBasis
      }}
      layout
      transition={{ type: "spring", stiffness: 220, damping: 26, mass: 0.9 }}
    >
      {children}
    </motion.section>
  )
}
