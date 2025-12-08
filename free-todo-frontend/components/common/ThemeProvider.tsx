"use client"

import { useEffect } from "react"
import { useThemeStore } from "@/lib/store/theme"

interface ThemeProviderProps {
  children: React.ReactNode
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const theme = useThemeStore((state) => state.theme)
  const hasHydrated = useThemeStore((state) => state._hasHydrated)

  useEffect(() => {
    if (!hasHydrated) {
      // fallback：在首次渲染时也设置一次，避免无效状态
      useThemeStore.setState({ _hasHydrated: true })
    }

    const root = window.document.documentElement

    const expectedTheme =
      theme === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : theme

    root.classList.remove("light", "dark")
    root.classList.add(expectedTheme)
  }, [theme, hasHydrated])

  useEffect(() => {
    if (theme !== "system") return

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")

    const handleChange = () => {
      const root = window.document.documentElement
      root.classList.remove("light", "dark")
      const systemTheme = mediaQuery.matches ? "dark" : "light"
      root.classList.add(systemTheme)
    }

    mediaQuery.addEventListener("change", handleChange)
    return () => mediaQuery.removeEventListener("change", handleChange)
  }, [theme])

  return <>{children}</>
}
