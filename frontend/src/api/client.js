import axios from 'axios'
import { useAuthStore } from '../store/authStore'

const api = axios.create({ baseURL: '/api', withCredentials: true })

api.interceptors.request.use(config => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  res => res,
  async err => {
    const original = err.config
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true
      const { refreshToken, setAuth, logout } = useAuthStore.getState()
      if (refreshToken) {
        try {
          const { data } = await axios.post('/api/auth/refresh', { refreshToken })
          setAuth(useAuthStore.getState().employee, data.token, data.refreshToken)
          original.headers.Authorization = `Bearer ${data.token}`
          return api(original)
        } catch { logout() }
      }
    }
    return Promise.reject(err)
  }
)

export default api

// ── Auth ───────────────────────────────────────────────────
export const authAPI = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  me: () => api.get('/auth/me'),
  changePassword: (currentPassword, newPassword) => api.post('/auth/change-password', { currentPassword, newPassword }),
}

// ── Employees ──────────────────────────────────────────────
export const employeesAPI = {
  list: (params) => api.get('/employees', { params }),
  get: (id) => api.get(`/employees/${id}`),
  create: (data) => api.post('/employees', data),
  update: (id, data) => api.put(`/employees/${id}`, data),
  delete: (id) => api.delete(`/employees/${id}`),
}

// ── Leaves ─────────────────────────────────────────────────
export const leavesAPI = {
  list: (params) => api.get('/leaves', { params }),
  create: (data) => api.post('/leaves', data),
  validate: (id, action, comment) => api.put(`/leaves/${id}/validate`, { action, comment }),
  cancel: (id, cancel_reason) => api.put(`/leaves/${id}/cancel`, { cancel_reason }),
  balances: (employeeId, year) => api.get(`/leaves/balances/${employeeId}`, { params: { year } }),
  calendar: (start, end) => api.get('/leaves/calendar', { params: { start, end } }),
  types: () => api.get('/leaves/types'),
}

// ── Attendance ─────────────────────────────────────────────
export const attendanceAPI = {
  list: (params) => api.get('/attendance', { params }),
  sync: (date_from, date_to) => api.post('/attendance/sync', { date_from, date_to }),
  stats: (employeeId, month, year) => api.get(`/attendance/stats/${employeeId}`, { params: { month, year } }),
  manual: (data) => api.post('/attendance/manual', data),
}

// ── Org ────────────────────────────────────────────────────
export const orgAPI = {
  levels: () => api.get('/org/levels'),
  units: () => api.get('/org/units'),
  unitTree: (id) => api.get(`/org/units/${id}/tree`),
  createUnit: (data) => api.post('/org/units', data),
  updateUnit: (id, data) => api.put(`/org/units/${id}`, data),
  deleteUnit: (id) => api.delete(`/org/units/${id}`),
  positions: () => api.get('/org/positions'),
  createPosition: (data) => api.post('/org/positions', data),
}

// ── HR Requests ────────────────────────────────────────────
export const hrAPI = {
  list: (params) => api.get('/hr', { params }),
  create: (data) => api.post('/hr', data),
  process: (id, action, comment) => api.put(`/hr/${id}/process`, { action, comment }),
  updateStatus: (id, new_status, comment) => api.put(`/hr/${id}/status`, { new_status, comment }),
  getDetail: (id) => api.get(`/hr/${id}`),
}

// ── Notifications ──────────────────────────────────────────
export const notifAPI = {
  list: () => api.get('/notifications'),
  read: (id) => api.put(`/notifications/${id}/read`),
  readAll: () => api.put('/notifications/read-all'),
}

// ── Dashboard ──────────────────────────────────────────────
export const dashboardAPI = {
  stats: () => api.get('/dashboard'),
}
