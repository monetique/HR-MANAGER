import React from 'react'
import { useThemeStore } from './store/themeStore'

// Initialiser le thème au démarrage
const savedTheme = JSON.parse(localStorage.getItem('hr-theme') || '{}')
const isDark = savedTheme?.state?.isDark !== false // dark par défaut
if (isDark) document.documentElement.classList.add('dark')
else document.documentElement.classList.remove('dark')
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import App from './App'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30000 } }
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <App />
      <Toaster position="top-right" toastOptions={{
        style: { background: '#1f2937', color: '#f9fafb', border: '1px solid #374151' }
      }}/>
    </BrowserRouter>
  </QueryClientProvider>
)
