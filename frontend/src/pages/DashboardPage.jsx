import React, { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Users, Clock, Calendar, FileText, AlertCircle, Megaphone } from 'lucide-react'
import api, { dashboardAPI, leavesAPI } from '../api/client'
import { useAuthStore } from '../store/authStore'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

function StatCard({ icon: Icon, label, value, color = 'blue' }) {
  const colors = {
    blue:   'bg-blue-500/10 text-blue-400',
    green:  'bg-green-500/10 text-green-400',
    red:    'bg-red-500/10 text-red-400',
    yellow: 'bg-yellow-500/10 text-yellow-400',
    purple: 'bg-purple-500/10 text-purple-400',
  }
  return (
    <div className="card flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${colors[color]}`}>
        <Icon size={22} />
      </div>
      <div>
        <p className="text-2xl font-bold text-white">{value ?? '—'}</p>
        <p className="text-sm text-gray-400">{label}</p>
      </div>
    </div>
  )
}

function StatusBadge({ status }) {
  const map = {
    pending:     { label: 'En cours',        cls: 'bg-yellow-500/10 text-yellow-400' },
    in_progress: { label: 'Prise en charge', cls: 'bg-blue-500/10 text-blue-400'    },
    closed:      { label: 'Clôturée',        cls: 'bg-green-500/10 text-green-400'  },
    rejected:    { label: 'Rejetée',         cls: 'bg-red-500/10 text-red-400'      },
    approved:    { label: 'Approuvé',        cls: 'bg-green-500/10 text-green-400'  },
    cancelled:   { label: 'Annulé',          cls: 'bg-gray-500/10 text-gray-400'    },
  }
  const s = map[status] || { label: status, cls: 'bg-gray-500/10 text-gray-400' }
  return <span className={`badge ${s.cls}`}>{s.label}</span>
}

const TYPE_LABELS = {
  formation:           'Demande de formation',
  avance:              'Avance sur salaire',
  attestation_salaire: 'Attestation de salaire',
  attestation_travail: 'Attestation de travail',
}
function getTypeLabel(type) { return TYPE_LABELS[type] || type }

function HRStatusBadge({ status }) {
  const map = {
    pending:     { label: '🟡 En cours',        cls: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30' },
    in_progress: { label: '🔵 Prise en charge', cls: 'bg-blue-500/10 text-blue-400 border border-blue-500/30'      },
    closed:      { label: '✅ Clôturée',         cls: 'bg-green-500/10 text-green-400 border border-green-500/30'   },
    rejected:    { label: '❌ Rejetée',          cls: 'bg-red-500/10 text-red-400 border border-red-500/30'         },
  }
  const s = map[status] || { label: status, cls: 'bg-gray-500/10 text-gray-400' }
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.cls}`}>{s.label}</span>
}

export default function DashboardPage() {
  const { employee, hasRole } = useAuthStore()
  const today = format(new Date(), 'EEEE d MMMM yyyy', { locale: fr })

  const isRHOrAdmin = hasRole('superadmin', 'rh')
  const isManager   = hasRole('manager')
  const isAssistant = hasRole('hr_assistant')

  // RH, admin ET manager voient le dashboard complet
  const showRHDashboard = isRHOrAdmin || isManager

  // Privilèges chargés depuis hr_assistant_privileges (individuel)
  const [priv, setPriv] = useState({})
  useEffect(() => {
    if (isAssistant && employee?.id) {
      api.get(`/config/assistant-privileges/${employee.id}`)
        .then(r => setPriv(r.data.privileges || {}))
        .catch(() => {})
    }
  }, [isAssistant, employee?.id])

  const can = (key) => isRHOrAdmin || isManager || (isAssistant && priv[key] === true)

  // ── Queries ────────────────────────────────────────────
  const { data: stats } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => dashboardAPI.stats().then(r => r.data.stats),
    refetchInterval: 60000,
    enabled: showRHDashboard || (isAssistant && priv.hr_assistant_can_view_employees === true),
  })

  const { data: leavesData } = useQuery({
    queryKey: ['leaves-recent'],
    queryFn: () => leavesAPI.list({ status: 'pending' }).then(r => r.data),
    enabled: showRHDashboard || (isAssistant && priv.hr_assistant_can_view_leaves === true),
  })

  const { data: hrRequestsData } = useQuery({
    queryKey: ['hr-requests-dashboard'],
    queryFn: () => api.get('/hr').then(r => r.data),
    refetchInterval: 60000,
  })

  const { data: announceData } = useQuery({
    queryKey: ['announcements'],
    queryFn: () => api.get('/announcements').then(r => r.data),
  })
  const latestAnnounce = announceData?.announcements?.find(a => !a.is_read) || announceData?.announcements?.[0]

  const { data: scheduleStats } = useQuery({
    queryKey: ['schedule-stats', employee?.id],
    queryFn: () => api.get('/attendance/stats-by-schedule/' + employee?.id, { params: { year: new Date().getFullYear() } }).then(r => r.data),
    enabled: !!employee?.id,
  })

  const { data: balances } = useQuery({
    queryKey: ['balances', employee?.id],
    queryFn: () => leavesAPI.balances(employee?.id, new Date().getFullYear()).then(r => r.data.balances),
    enabled: !!employee?.id,
  })

  const hrRequests     = hrRequestsData?.requests || []
  const hrPending      = hrRequests.filter(r => r.status === 'pending' || r.status === 'in_progress')
  const hrPendingCount = hrPending.length

  const hrToShow = (showRHDashboard || can('hr_assistant_can_view_hr_requests'))
    ? hrPending
    : hrRequests.slice(0, 5)

  // ── Stat cards ─────────────────────────────────────────
  const statCards = []
  if (showRHDashboard || can('hr_assistant_can_view_employees')) {
    statCards.push({ icon: Users,       label: 'Employés actifs',      value: stats?.total_employees,           color: 'blue'   })
    statCards.push({ icon: Clock,       label: "Présents aujourd'hui", value: stats?.today_attendance?.present, color: 'green'  })
    statCards.push({ icon: AlertCircle, label: "Absents aujourd'hui",  value: stats?.today_attendance?.absent,  color: 'red'    })
  }
  if (showRHDashboard || can('hr_assistant_can_view_hr_requests')) {
    statCards.push({ icon: FileText, label: 'Demandes RH en cours', value: hrPendingCount, color: 'yellow' })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white">Bonjour, {employee?.first_name} 👋</h1>
        <p className="text-gray-400 text-sm capitalize mt-1">{today}</p>
      </div>

      {/* Stat cards */}
      {statCards.length > 0 && (
        <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-${Math.min(statCards.length, 4)} gap-4`}>
          {statCards.map((s, i) => <StatCard key={i} {...s} />)}
        </div>
      )}

      <div className={`grid grid-cols-1 ${!isAssistant ? "lg:grid-cols-2" : ""} gap-6`}>

        {/* Soldes congés — toujours visible */}
        {balances && (
          <div className="card">
            <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
              <Calendar size={18} className="text-blue-400" />
              Mes soldes de congés {new Date().getFullYear()}
            </h2>
            <div className="space-y-3">
              {[
                { label: 'Congé annuel',       taken: balances.annual_taken,      total: balances.annual_total,      color: 'bg-blue-500' },
                { label: 'Congé maladie',      taken: balances.sick_taken,        total: balances.sick_total,        color: 'bg-red-500' },
              ].map(item => {
                const pct = Math.min(100, (item.taken / item.total) * 100)
                const remaining = item.total - item.taken
                return (
                  <div key={item.label}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-300">{item.label}</span>
                      <span className="text-gray-400">{remaining} j restants</span>
                    </div>
                    <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                      <div className={`h-full ${item.color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Espace RH */}
        {latestAnnounce && (
          <div className="card">
            <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
              <Megaphone size={18} className="text-blue-400" />
              Espace RH
            </h2>
            <div className="p-3 rounded-lg bg-gray-800/50 border-l-2 border-l-blue-500">
              <div className="flex items-center justify-between">
                <p className="font-medium text-gray-200 text-sm">{latestAnnounce.title}</p>
                {!latestAnnounce.is_read && <span className="w-2 h-2 bg-blue-500 rounded-full" />}
              </div>
              <p className="text-gray-400 text-xs mt-1">{latestAnnounce.content.substring(0, 120)}...</p>
              <a href="/announcements" className="text-blue-400 hover:text-blue-300 text-xs mt-2 inline-block">
                Voir toutes les annonces
              </a>
            </div>
          </div>
        )}

        {/* Demandes RH */}
        {(showRHDashboard || can('hr_assistant_can_view_hr_requests') || (!isAssistant && !showRHDashboard)) && (
          <div className="card">
            <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
              <FileText size={18} className="text-yellow-400" />
              {(showRHDashboard || can('hr_assistant_can_view_hr_requests')) ? 'Demandes RH à traiter' : 'Mes demandes RH'}
              {(showRHDashboard || can('hr_assistant_can_view_hr_requests')) && hrPendingCount > 0 && (
                <span className="ml-auto text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full border border-yellow-500/30">
                  {hrPendingCount} en attente
                </span>
              )}
            </h2>
            {hrToShow.length ? (
              <div className="space-y-2">
                {hrToShow.slice(0, 6).map(req => (
                  <div key={req.id} className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg hover:bg-gray-800/80 transition-colors">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-200 truncate">
                        {(showRHDashboard || can('hr_assistant_can_view_hr_requests')) ? req.employee_name : getTypeLabel(req.type)}
                      </p>
                      <p className="text-xs text-gray-400">
                        {(showRHDashboard || can('hr_assistant_can_view_hr_requests')) ? getTypeLabel(req.type) : format(new Date(req.created_at), 'dd/MM/yyyy')}
                      </p>
                    </div>
                    <div className="ml-3 flex-shrink-0">
                      <HRStatusBadge status={req.status} />
                    </div>
                  </div>
                ))}
                {hrToShow.length > 6 && (
                  <p className="text-xs text-gray-500 text-center pt-1">+ {hrToShow.length - 6} autres demandes</p>
                )}
              </div>
            ) : (
              <p className="text-gray-500 text-sm text-center py-6">
                {(showRHDashboard || can('hr_assistant_can_view_hr_requests')) ? 'Aucune demande en attente' : 'Aucune demande RH soumise'}
              </p>
            )}
            <a href="/hr-requests" className="block mt-3 text-center text-xs text-blue-400 hover:text-blue-300">
              Voir toutes les demandes →
            </a>
          </div>
        )}

        {/* Demandes de congés */}
        {(showRHDashboard || can('hr_assistant_can_view_leaves')) && (
          <div className="card">
            <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
              <Calendar size={18} className="text-yellow-400" />
              Demandes de congés en attente
            </h2>
            {leavesData?.requests?.length ? (
              <div className="space-y-2">
                {leavesData.requests.slice(0, 5).map(req => (
                  <div key={req.id} className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-gray-200">{req.employee_name}</p>
                      <p className="text-xs text-gray-400">{req.leave_type_name} — {req.days_count} j</p>
                      <p className="text-xs text-gray-500">
                        {format(new Date(req.start_date), 'dd/MM/yyyy')} → {format(new Date(req.end_date), 'dd/MM/yyyy')}
                      </p>
                    </div>
                    <StatusBadge status={req.status} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm text-center py-6">Aucune demande en attente</p>
            )}
          </div>
        )}
      </div>

      {/* Cumul mensuel — toujours visible */}
      {scheduleStats?.monthly && scheduleStats.monthly.length > 0 && (
        <div className="card">
          <h2 className="text-base font-semibold mb-4">Cumul mensuel {new Date().getFullYear()}</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left px-3 py-2 text-gray-400 font-medium">Mois</th>
                  <th className="text-center px-3 py-2 text-gray-400 font-medium">Jours</th>
                  <th className="text-center px-3 py-2 text-gray-400 font-medium">H. travaillées</th>
                  <th className="text-center px-3 py-2 text-gray-400 font-medium">H. requises</th>
                  <th className="text-center px-3 py-2 text-gray-400 font-medium">Écart</th>
                </tr>
              </thead>
              <tbody>
                {scheduleStats.monthly.map((m, i) => {
                  const ecart = parseFloat(m.total_heures||0) - parseFloat(m.heures_requises||0)
                  const ecartStr = (ecart >= 0 ? '+' : '') + ecart.toFixed(2) + 'h'
                  const ecartColor = ecart >= 0 ? 'text-green-400' : 'text-red-400'
                  return (
                    <tr key={i} className="table-row">
                      <td className="px-3 py-2 text-gray-200 font-medium">{m.mois}</td>
                      <td className="px-3 py-2 text-center text-gray-300">{m.nb_jours}</td>
                      <td className="px-3 py-2 text-center text-blue-300 font-mono">{m.total_heures}h</td>
                      <td className="px-3 py-2 text-center text-gray-400 font-mono">{m.heures_requises}h</td>
                      <td className={`px-3 py-2 text-center font-mono font-bold ${ecartColor}`}>{ecartStr}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Alertes congés maladie — RH/admin/manager */}
      {showRHDashboard && stats?.sick_alerts && stats.sick_alerts.length > 0 && (
        <div className="card">
          <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
            <AlertCircle size={18} className="text-red-400" />
            Alertes congés maladie
          </h2>
          <div className="space-y-2">
            {stats.sick_alerts.map((a, i) => (
              <div key={i} className={[
                'flex items-center justify-between p-3 rounded-lg border',
                a.statut === 'DEPASSE'   ? 'bg-red-500/10 border-red-500/30' :
                a.statut === 'ATTENTION' ? 'bg-orange-500/10 border-orange-500/30' :
                'bg-yellow-500/10 border-yellow-500/30'
              ].join(' ')}>
                <div className="flex items-center gap-3">
                  <AlertCircle size={16} className={
                    a.statut === 'DEPASSE' ? 'text-red-400' :
                    a.statut === 'ATTENTION' ? 'text-orange-400' : 'text-yellow-400'
                  } />
                  <div>
                    <p className="text-sm font-medium text-gray-200">{a.nom || 'Moi'}</p>
                    <p className="text-xs text-gray-500">{a.matricule}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={['text-sm font-bold',
                    a.statut === 'DEPASSE' ? 'text-red-400' :
                    a.statut === 'ATTENTION' ? 'text-orange-400' : 'text-yellow-400'
                  ].join(' ')}>{a.sick_taken}j / {a.sick_total}j</p>
                  <p className="text-xs text-gray-500">{a.restant}j restants</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pointage du jour — RH/admin/manager */}
      {showRHDashboard && stats?.today_attendance && (
        <div className="card">
          <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
            <Clock size={18} className="text-green-400" />
            Pointage aujourd'hui
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Présents', value: stats.today_attendance.present,  color: 'text-green-400'  },
              { label: 'Absents',  value: stats.today_attendance.absent,   color: 'text-red-400'    },
              { label: 'Retards',  value: stats.today_attendance.late,     color: 'text-yellow-400' },
              { label: 'En congé', value: stats.today_attendance.on_leave, color: 'text-blue-400'   },
            ].map(item => (
              <div key={item.label} className="text-center p-3 bg-gray-800/50 rounded-lg">
                <p className={`text-2xl font-bold ${item.color}`}>{item.value || 0}</p>
                <p className="text-xs text-gray-400 mt-1">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
