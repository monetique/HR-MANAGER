import ConfigPage from './pages/ConfigPage'
import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import AppLayout from './components/layout/AppLayout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import EmployeesPage from './pages/EmployeesPage'
import LeavesPage from './pages/LeavesPage'
import LeaveRequestPage from './pages/LeaveRequestPage'
import AttendancePage from './pages/AttendancePage'
import OrgPage from './pages/OrgPage'
import HrRequestsPage from './pages/HrRequestsPage'
import ProfilePage from './pages/ProfilePage'
import RecapPage from './pages/RecapPage'
import AnnouncementsPage from './pages/AnnouncementsPage'
import EvaluationsPage from './pages/EvaluationsPage'
import LeaveStatsPage from './pages/LeaveStatsPage'

function PrivateRoute({ children, roles }) {
  const { token, employee } = useAuthStore()
  if (!token) return <Navigate to="/login" replace />
  if (roles && !roles.includes(employee?.role)) return <Navigate to="/" replace />
  return children
}

export default function App() {
  const { token } = useAuthStore()
  return (
    <Routes>
      <Route path="/login" element={token ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/" element={<PrivateRoute><AppLayout /></PrivateRoute>}>
        <Route index element={<DashboardPage />} />
        <Route path="employees" element={<PrivateRoute roles={['superadmin','rh','manager']}><EmployeesPage /></PrivateRoute>} />
        <Route path="leaves" element={<LeavesPage />} />
        <Route path="leaves/new" element={<LeaveRequestPage />} />
        <Route path="attendance" element={<AttendancePage />} />
        <Route path="org" element={<PrivateRoute roles={['superadmin','rh']}><OrgPage /></PrivateRoute>} />
        <Route path="hr-requests" element={<HrRequestsPage />} />
        <Route path="profile" element={<ProfilePage />} />
	<Route path="config" element={<PrivateRoute roles={['superadmin','rh']}><ConfigPage /></PrivateRoute>} />
	<Route path="recap" element={<PrivateRoute roles={['superadmin','rh','manager']}><RecapPage /></PrivateRoute>} />
     <Route path="announcements" element={<AnnouncementsPage />} />
     <Route path="leave-stats" element={<PrivateRoute roles={['superadmin','rh','manager','hr_assistant']}><LeaveStatsPage /></PrivateRoute>} />
     <Route path="evaluations" element={<PrivateRoute roles={['superadmin','rh','manager','employee','hr_assistant']}><EvaluationsPage /></PrivateRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
