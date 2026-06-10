import React, { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  LayoutDashboard, Users, Calendar, Clock, GitBranch,
  FileText, Bell, LogOut, Menu, Settings, BarChart2,
  Sun, Moon, Megaphone, Award, PieChart
} from 'lucide-react'
import { useThemeStore } from '../../store/themeStore'
import { useAuthStore } from '../../store/authStore'
import { notifAPI } from '../../api/client'
import api from '../../api/client'
import toast from 'react-hot-toast'

// Routes de base visibles par TOUS les rôles (y compris hr_assistant)
// /leaves et /attendance → toujours visibles (congés/pointage personnels)
const BASE_ROUTES = ['/', '/hr-requests', '/announcements', '/evaluations', '/leaves', '/attendance']

// Mapping route → clé de privilège pour hr_assistant (accès données des autres)
const HR_ASSISTANT_PRIVILEGES = {
  '/employees':  'hr_assistant_can_view_employees',
}

const ALL_NAV_ITEMS = [
  { to: '/',              icon: LayoutDashboard, label: 'Tableau de bord',  exact: true },
  { to: '/hr-requests',   icon: FileText,        label: 'Demandes RH' },
  { to: '/announcements', icon: Megaphone,       label: 'Espace RH' },
  { to: '/leaves',        icon: Calendar,        label: 'Congés' },
  { to: '/evaluations',   icon: Award,           label: 'Evaluations' },
  { to: '/attendance',    icon: Clock,           label: 'Pointage' },
  { to: '/org',           icon: GitBranch,       label: 'Organigramme',     roles: ['superadmin','rh'] },
  { to: '/leave-stats',   icon: PieChart,        label: 'Stat Conges',      roles: ['superadmin','rh','manager'] },
  { to: '/recap',         icon: BarChart2,       label: 'Stat Pointage',    roles: ['superadmin','rh','manager'] },
  { to: '/employees',     icon: Users,           label: 'Employés',         roles: ['superadmin','rh','manager'] },
  { to: '/config',        icon: Settings,        label: 'Configuration',    roles: ['superadmin','rh'] },
]


const roleLabel = {
  superadmin:   'Super Admin',
  rh:           'Responsable RH',
  hr_assistant: 'Assistante RH',
  manager:      'Manager',
  employee:     'Employé'
}

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen]   = useState(false)
  const [notifOpen, setNotifOpen]       = useState(false)
  const [hrPrivileges, setHrPrivileges] = useState({})
  const { employee, logout, hasRole }   = useAuthStore()
  const { isDark, toggle }              = useThemeStore()
  const navigate                        = useNavigate()
  const queryClient                     = useQueryClient()

  // Charger les privilèges si hr_assistant
  useEffect(() => {
    if (employee?.role === 'hr_assistant' && employee?.id) {
      api.get(`/config/assistant-privileges/${employee.id}`).then(r => {
        setHrPrivileges(r.data.privileges || {})
      }).catch(() => {})
    }
  }, [employee?.role, employee?.id])

  const { data: notifData } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notifAPI.list().then(r => r.data),
    refetchInterval: 30000,
  })

  const unread = notifData?.unread || 0

  const { data: announceData } = useQuery({
    queryKey: ['announcements-unread'],
    queryFn: () => api.get('/announcements/unread-count').then(r => r.data),
    refetchInterval: 30000,
  })
  const unreadAnnounce = announceData?.count || 0

  const handleLogout = () => {
    logout()
    navigate('/login')
    toast.success('Déconnexion réussie')
  }

  // Filtrage des menus
  const visibleNav = ALL_NAV_ITEMS.filter(item => {
    if (employee?.role === 'hr_assistant') {
      // Routes de base → toujours visibles
      if (BASE_ROUTES.includes(item.to)) return true
      // Routes avec privilège → vérifier dans les privilèges individuels
      const privilegeKey = HR_ASSISTANT_PRIVILEGES[item.to]
      if (!privilegeKey) return false
      return hrPrivileges[privilegeKey] === true
    }
    // Autres rôles : filtrage classique par roles[]
    return !item.roles || item.roles.some(r => hasRole(r))
  })

  return (
    <div className="flex h-screen overflow-hidden bg-gray-950">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-20 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`fixed lg:static inset-y-0 left-0 z-30 w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col transform transition-transform duration-200 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="flex items-center gap-3 px-6 py-5" style={{borderBottom: '1px solid var(--border)'}}>
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Users size={16} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-white">HR Manager</p>
            <p className="text-xs text-gray-500">Monétique Tunisie</p>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {visibleNav.map(item => (
            <NavLink key={item.to} to={item.to} end={item.exact}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100'
                }`}>
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 py-4" style={{borderTop: '1px solid var(--border)'}}>
          <NavLink to="/profile" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-gray-100 transition-colors">
            <div className="w-8 h-8 bg-blue-600/20 rounded-full flex items-center justify-center">
              <span className="text-blue-400 text-xs font-bold">
                {employee?.first_name?.[0]}{employee?.last_name?.[0]}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-gray-200 font-medium truncate">{employee?.first_name} {employee?.last_name}</p>
              <p className="text-gray-500 text-xs">{roleLabel[employee?.role]}</p>
            </div>
          </NavLink>
          <button onClick={handleLogout} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-red-400 hover:bg-gray-800 transition-colors w-full mt-1">
            <LogOut size={16} />
            Déconnexion
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-14 flex items-center px-4 gap-4 shrink-0" style={{backgroundColor: 'var(--header-bg)', borderBottom: '1px solid var(--border)'}}>
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-gray-400 hover:text-gray-100">
            <Menu size={20} />
          </button>
          <div className="flex-1" />

          <div className="flex items-center gap-2">
            <a href="/announcements" className="relative text-gray-400 hover:text-gray-100 p-1 flex items-center justify-center">
              <Megaphone size={18} />
              {unreadAnnounce > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 rounded-full text-xs text-white flex items-center justify-center">
                  {unreadAnnounce > 9 ? '9+' : unreadAnnounce}
                </span>
              )}
            </a>
          </div>
          <div className="relative">
            <button onClick={() => {
              const opening = !notifOpen
              setNotifOpen(opening)
              if (opening && unread > 0) {
                notifAPI.readAll().then(() => {
                  queryClient.invalidateQueries(['notifications'])
                })
              }
            }} className="relative text-gray-400 hover:text-gray-100 p-1">
              <Bell size={20} />
              {unread > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-xs text-white flex items-center justify-center">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </button>
            {notifOpen && (
              <div className="absolute right-0 top-10 w-80 bg-gray-900 border border-gray-700 rounded-xl shadow-xl z-50 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
                  <p className="text-sm font-medium">Notifications</p>
                  <button onClick={() => { notifAPI.readAll(); setNotifOpen(false) }} className="text-xs text-blue-400 hover:text-blue-300">Tout lire</button>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifData?.notifications?.length ? notifData.notifications.slice(0,10).map(n => (
                    <div key={n.id} className={`px-4 py-3 border-b border-gray-200 dark:border-gray-800 text-sm ${!n.is_read ? 'bg-blue-50 dark:bg-blue-900/10' : ''}`}>
                      <p className="font-medium text-gray-200">{n.title}</p>
                      <p className="text-gray-400 text-xs mt-0.5">{n.message}</p>
                    </div>
                  )) : (
                    <p className="px-4 py-6 text-center text-gray-500 text-sm">Aucune notification</p>
                  )}
                </div>
              </div>
            )}
          </div>
          <span className="text-sm text-gray-400">{employee?.first_name} {employee?.last_name}</span>
        </header>

        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
