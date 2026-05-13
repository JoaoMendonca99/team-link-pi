"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"

type ThemeContextValue = {
  darkMode: boolean
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [darkMode, setDarkMode] = useState(false)

  useEffect(() => {
    const saved = window.localStorage.getItem("theme")
    const prefers = window.matchMedia("(prefers-color-scheme: dark)").matches
    const initial = saved === "dark" || (!saved && prefers)
    setDarkMode(initial)
    document.documentElement.classList.toggle("dark", initial)
  }, [])

  const toggleTheme = useCallback(() => {
    setDarkMode((previous) => {
      const next = !previous
      document.documentElement.classList.toggle("dark", next)
      window.localStorage.setItem("theme", next ? "dark" : "light")
      return next
    })
  }, [])

  const value = useMemo(
    () => ({
      darkMode,
      toggleTheme,
    }),
    [darkMode, toggleTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useThemeMode(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error("useThemeMode deve ser usado dentro de ThemeProvider")
  }
  return context
}
