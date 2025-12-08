"use client"

import { User } from "lucide-react"

export function UserAvatar() {
  return (
    <button
      type="button"
      className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      title="用户设置"
      aria-label="用户设置"
    >
      <User className="h-5 w-5" />
    </button>
  )
}
