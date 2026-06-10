import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useThemeStore = create(persist(
  (set) => ({
    isDark: true,
    toggle: () => set(s => {
      const newDark = !s.isDark
      if (newDark) {
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }
      return { isDark: newDark }
    }),
    init: (isDark) => {
      if (isDark) {
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }
    }
  }),
  { name: 'hr-theme' }
))
