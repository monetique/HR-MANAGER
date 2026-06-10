import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useAuthStore = create(persist(
  (set, get) => ({
    employee: null,
    token: null,
    refreshToken: null,
    setAuth: (employee, token, refreshToken) => set({ employee, token, refreshToken }),
    logout: () => set({ employee: null, token: null, refreshToken: null }),
    isAuthenticated: () => !!get().token,
    hasRole: (...roles) => roles.includes(get().employee?.role),
  }),
  { name: 'hr-auth' }
))
