"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"

import {resolveTheme,type ThemeMode} from "@/lib/theme"

type ThemeContextValue = {
  setTheme: (theme:ThemeMode) => void
  darkMode: boolean
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [darkMode, setDarkMode] = useState(true)

  useEffect(() => {
    const apply=(theme:ThemeMode)=>{setDarkMode(theme==='dark');document.documentElement.classList.toggle('dark',theme==='dark');document.documentElement.style.colorScheme=theme}
    try { apply(resolveTheme(localStorage.getItem('theme'))) } catch { apply('dark') }
    const sync=(event:StorageEvent)=>{if(event.key==='theme'||event.key===null)apply(resolveTheme(event.newValue))}
    window.addEventListener('storage',sync)
    return()=>window.removeEventListener('storage',sync)
  }, [])
  const setTheme=useCallback((theme:ThemeMode)=>{
    setDarkMode(theme==='dark');document.documentElement.classList.toggle('dark',theme==='dark');document.documentElement.style.colorScheme=theme
    try{localStorage.setItem('theme',theme)}catch{/* Keep the choice for this visit if storage is unavailable. */}
  },[])
  const toggleTheme=useCallback(()=>setTheme(darkMode?'light':'dark'),[darkMode,setTheme])

  const value = useMemo(
    () => ({
      darkMode,
      toggleTheme,
      setTheme,
    }),
    [darkMode, toggleTheme, setTheme],
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
