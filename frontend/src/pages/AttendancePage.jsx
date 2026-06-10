import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, Search, Eye, ArrowRightCircle, ArrowLeftCircle, TrendingUp, Clock, Users, AlertTriangle } from 'lucide-react'
import { attendanceAPI, employeesAPI } from '../api/client'
import api from '../api/client'
import { useAuthStore } from '../store/authStore'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { fr } from 'date-fns/locale'
import toast from 'react-hot-toast'
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts'

// ── Couleurs ───────────────────────────────────────────────
const COLORS = {
  present:  '#22c55e',
  absent:   '#ef4444',
  late:     '#f59e0b',
  on_leave: '#3b82f6',
  half_day: '#a855f7',
}

// ── Badge statut ───────────────────────────────────────────
function ScheduleIcon({ code }) {
  if (code === 'ramadhan') return <span title="Horaire Ramadhan">🌙</span>
  if (code === 'summer')   return <span title="Horaire Été">☀️</span>
  return <span title="Horaire Normal">🏢</span>
}


function StatusBadge({ status }) {
  const map = {
    present:  { label: 'Présent',  cls: 'bg-green-500/10 text-green-400'  },
    absent:   { label: 'Absent',   cls: 'bg-red-500/10 text-red-400'      },
    late:     { label: 'Retard',   cls: 'bg-yellow-500/10 text-yellow-400'},
    on_leave:    { label: 'Congé',       cls: 'bg-blue-500/10 text-blue-400'    },
    half_day:    { label: 'Mi-temps',    cls: 'bg-purple-500/10 text-purple-400'},
    teletravail: { label: 'Télétravail', cls: 'bg-teal-500/10 text-teal-400'    },
    holiday:     { label: 'Jour Férié',  cls: 'bg-pink-500/10 text-pink-400'     },
    mission:     { label: 'Mission',     cls: 'bg-yellow-500/10 text-yellow-400' },
    formation:   { label: 'Formation',   cls: 'bg-green-500/10 text-green-400'  },
    seminaire:   { label: 'Séminaire',   cls: 'bg-indigo-500/10 text-indigo-400'},
  }
  const s = map[status] || { label: status, cls: 'bg-gray-500/10 text-gray-400' }
  return <span className={`badge ${s.cls}`}>{s.label}</span>
}

// ── Modal détail badgeages ─────────────────────────────────
function DetailModal({ record, onClose }) {
  const [events, setEvents] = useState(null)
  const [loading, setLoading] = useState(true)

  React.useEffect(() => {
    const dateStr = String(record.date).split('T')[0]
    api.get(`/attendance/detail/${record.emp_matricule}/${dateStr}`)
      .then(r => { setEvents(r.data.events); setLoading(false) })
      .catch(() => { toast.error('Erreur chargement détail'); setLoading(false) })
  }, [record])

  const dateStr = String(record.date).split('T')[0]

  function getPairs(events) {
    const pairs = [], MIN = 5
    let pendingIn = null
    for (const e of (events || [])) {
      if (e.type === 'IN') { pendingIn = e }
      else if (e.type === 'OUT' && pendingIn) {
        const [h1,m1] = pendingIn.time.split(':').map(Number)
        const [h2,m2] = e.time.split(':').map(Number)
        const mins = (h2*60+m2) - (h1*60+m1)
        pairs.push({ in: pendingIn, out: e, duration: mins > 0 ? mins : 0, parasite: mins < MIN })
        pendingIn = null
      }
    }
    if (pendingIn) pairs.push({ in: pendingIn, out: null, duration: null, parasite: false })
    return pairs
  }

  const pairs = getPairs(events)
  const rawTotal = pairs.filter(p => !p.parasite).reduce((s,p) => s + (p.duration||0), 0)
  // Deduction pause dejeuner 12h-13h (meme logique que backend)
  const isContinuous = !record.schedule_type || record.schedule_type === 'ramadan' || record.schedule_type === 'summer'
  const hasMidayBreak = pairs.filter(p => !p.parasite).some(function(p) {
    if (!p.out) return false
    const [oh, om] = p.out.time.split(':').map(Number)
    const [ih, im] = p.in.time.split(':').map(Number)
    const outMin = oh * 60 + om
    const inMin  = ih * 60 + im
    return (outMin >= 720 && outMin <= 780) || (inMin >= 720 && inMin <= 780)
  })
  const total = (!isContinuous && rawTotal > 240 && !hasMidayBreak)
    ? Math.max(0, rawTotal - 60)
    : rawTotal

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-lg flex flex-col" style={{maxHeight: '90vh'}}>
        {/* Header fixe */}
        <div className="flex items-center justify-between mb-5 flex-shrink-0">
          <div>
            <h3 className="text-base font-semibold text-white">{record.employee_name}</h3>
            <p className="text-sm text-gray-400 mt-0.5">
              {format(new Date(dateStr), 'EEEE d MMMM yyyy', { locale: fr })}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl flex-shrink-0 ml-4">✕</button>
        </div>
        {/* Contenu scrollable */}
        <div className="overflow-y-auto flex-1">

        {loading ? (
          <div className="text-center py-8 text-gray-500">Chargement...</div>
        ) : !events?.length ? (
          <div className="text-center py-8 text-gray-500">Aucun badgeage</div>
        ) : (
          <>
            <div className="space-y-2 mb-5">
              {events.map((e, i) => {
                const pair = pairs.find(p => p.in?.time === e.time || p.out?.time === e.time)
                const isParasite = pair?.parasite
                return (
                  <div key={i} className={`flex items-center gap-3 p-3 rounded-lg ${isParasite ? 'bg-gray-800/30 opacity-50' : 'bg-gray-800/50'}`}>
                    {e.type === 'IN'
                      ? <ArrowRightCircle size={18} className="text-green-400 shrink-0" />
                      : <ArrowLeftCircle  size={18} className="text-red-400 shrink-0" />}
                    <span className={`text-sm font-mono font-bold ${e.type==='IN' ? 'text-green-400' : 'text-red-400'}`}>
                      {e.time}
                    </span>
                    <span className={`text-xs badge ${e.type==='IN' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                      {e.type==='IN' ? 'Entrée' : 'Sortie'}
                    </span>
                    {isParasite && <span className="text-xs text-gray-500 italic">passage ignoré</span>}
                    {e.controller && <span className="text-xs text-gray-500 ml-auto">{e.controller}</span>}
                  </div>
                )
              })}
            </div>
            {pairs.length > 0 && (
              <div className="border-t border-gray-800 pt-4">
                <p className="text-xs text-gray-500 mb-3">Plages de présence</p>
                <div className="space-y-2">
                  {pairs.filter(p => !p.parasite).map((p, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-green-400 font-mono">{p.in.time}</span>
                        <span className="text-gray-600">→</span>
                        <span className={`font-mono ${p.out ? 'text-red-400' : 'text-gray-500'}`}>
                          {p.out ? p.out.time : 'En cours...'}
                        </span>
                      </div>
                      <span className="text-gray-300 font-medium">
                        {p.duration !== null ? `${Math.floor(p.duration/60)}h${String(p.duration%60).padStart(2,'0')}` : '—'}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-800">
                  <span className="text-sm text-gray-400">Total présence</span>
                  <span className="text-white font-bold">{Math.floor(total/60)}h{String(total%60).padStart(2,'0')}</span>
                </div>
              </div>
            )}
          </>
        )}
        </div>{/* fin contenu scrollable */}
      </div>
    </div>
  )
}

// ── KPI Cards ──────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sub, color='blue' }) {
  const colors = {
    blue:   'bg-blue-500/10 text-blue-400',
    green:  'bg-green-500/10 text-green-400',
    red:    'bg-red-500/10 text-red-400',
    yellow: 'bg-yellow-500/10 text-yellow-400',
    purple: 'bg-purple-500/10 text-purple-400',
  }
  return (
    <div className="card flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${colors[color]}`}>
        <Icon size={22} />
      </div>
      <div>
        <p className="text-2xl font-bold text-white">{value ?? '—'}</p>
        <p className="text-sm text-gray-400">{label}</p>
        {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ── Page principale ────────────────────────────────────────
export default function AttendancePage() {
  const { hasRole, employee } = useAuthStore()
  const qc = useQueryClient()
  const today = new Date()

  const [dateFrom, setDateFrom] = useState(format(startOfMonth(today), 'yyyy-MM-dd'))
  const [dateTo,   setDateTo]   = useState(format(endOfMonth(today),   'yyyy-MM-dd'))
  const [empId,    setEmpId]    = useState('')
  const [search,   setSearch]   = useState('')
  const [syncing,  setSyncing]  = useState(false)
  const [detail,   setDetail]   = useState(null)

  const isManager = hasRole('manager', 'superadmin', 'rh')

  // ── Données pointage ──────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ['attendance', dateFrom, dateTo, empId],
    queryFn: () => attendanceAPI.list({ date_from: dateFrom, date_to: dateTo, employee_id: empId||undefined }).then(r => r.data),
  })

  const { data: empData } = useQuery({
    queryKey: ['employees-list'],
    queryFn: () => employeesAPI.list({}).then(r => r.data),
    enabled: isManager,
  })

  const { data: statsData } = useQuery({
    queryKey: ['attendance-stats', empId||employee?.id, today.getMonth()+1, today.getFullYear()],
    queryFn: () => attendanceAPI.stats(empId||employee?.id, today.getMonth()+1, today.getFullYear()).then(r => r.data.stats),
    enabled: !!(empId||employee?.id),
  })

  // ── KPI calculés depuis les données du mois ───────────────
  const monthRecords = data?.attendance || []

  // Répartition pour camembert
  const pieData = React.useMemo(() => {
    const counts = { present:0, absent:0, late:0, on_leave:0 }
    monthRecords.forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++ })
    return [
      { name: 'Présent',  value: counts.present,  color: COLORS.present  },
      { name: 'Absent',   value: counts.absent,   color: COLORS.absent   },
      { name: 'Retard',   value: counts.late,     color: COLORS.late     },
      { name: 'Congé',    value: counts.on_leave, color: COLORS.on_leave },
    ].filter(d => d.value > 0)
  }, [monthRecords])

  // Heures travaillées par employé (barres)
  const hoursPerEmployee = React.useMemo(() => {
    const map = {}
    monthRecords.forEach(r => {
      if (!map[r.employee_name]) map[r.employee_name] = { name: r.employee_name.split(' ').pop(), heures: 0 }
      map[r.employee_name].heures += parseFloat(r.worked_hours || 0)
    })
    return Object.values(map).map(e => ({ ...e, heures: parseFloat(e.heures.toFixed(1)) }))
      .sort((a,b) => b.heures - a.heures)
  }, [monthRecords])

  // Top 3 retards
  const topRetards = React.useMemo(() => {
    const map = {}
    monthRecords.forEach(r => {
      if (r.late_morning || r.late_afternoon) {
        if (!map[r.employee_name]) map[r.employee_name] = { name: r.employee_name, retards: 0, minutes: 0 }
        map[r.employee_name].retards++
        map[r.employee_name].minutes += parseInt(r.delay_minutes || 0)
      }
    })
    return Object.values(map).sort((a,b) => b.retards - a.retards).slice(0,3)
  }, [monthRecords])

  // Taux de ponctualité
  const totalJours   = monthRecords.length
  const joursRetard  = monthRecords.filter(r => r.status === 'late').length
  const tauxPonct    = totalJours > 0 ? Math.round(((totalJours - joursRetard) / totalJours) * 100) : 100

  // Présents aujourd'hui
  const todayStr     = format(today, 'yyyy-MM-dd')
  const todayRecords = monthRecords.filter(r => String(r.date).split('T')[0] === todayStr)
  const presentAujourdhui = todayRecords.filter(r => r.status === 'present' || r.status === 'late').length
  const absentAujourdhui  = todayRecords.filter(r => r.status === 'absent').length
  const retardAujourdhui  = todayRecords.filter(r => r.status === 'late').length

  const handleSync = async () => {
    setSyncing(true)
    try {
      const { data } = await attendanceAPI.sync(dateFrom, dateTo)
      toast.success(data.message)
      qc.invalidateQueries(['attendance'])
      qc.invalidateQueries(['attendance-stats'])
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur synchronisation')
    } finally { setSyncing(false) }
  }

  const records = monthRecords.filter(r =>
    !search || r.employee_name?.toLowerCase().includes(search.toLowerCase()) || r.emp_matricule?.includes(search)
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold">Pointage</h1>
        {hasRole('superadmin', 'rh') && (
          <button onClick={handleSync} disabled={syncing} className="btn-primary flex items-center gap-2">
            <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Synchronisation...' : 'Sync Pointeuse'}
          </button>
        )}
      </div>

      {/* KPI du jour */}
      {isManager && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard icon={Users}        label="Présents aujourd'hui"  value={presentAujourdhui} color="green"  />
          <KpiCard icon={AlertTriangle} label="Absents aujourd'hui"  value={absentAujourdhui}  color="red"    />
          <KpiCard icon={Clock}        label="Retards aujourd'hui"   value={retardAujourdhui}  color="yellow" />
          <KpiCard icon={TrendingUp}   label="Taux ponctualité mois" value={`${tauxPonct}%`}   color="blue"
            sub={`${joursRetard} retard(s) sur ${totalJours} jours`} />
        </div>
      )}

      {/* Graphiques — manager uniquement */}
      {isManager && monthRecords.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Camembert répartition */}
          <div className="card">
            <h2 className="text-sm font-semibold text-gray-300 mb-4">Répartition présence — {format(new Date(dateFrom), 'MMMM yyyy', { locale: fr })}</h2>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                  dataKey="value" paddingAngle={3}>
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(v, n) => [v + ' jours', n]}
                  contentStyle={{ background:'#1f2937', border:'1px solid #374151', borderRadius:'8px' }}
                  itemStyle={{ color:'#f9fafb' }} />
                <Legend formatter={v => <span className="text-xs text-gray-400">{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Barres heures par employé */}
          <div className="card">
            <h2 className="text-sm font-semibold text-gray-300 mb-4">Heures travaillées par employé</h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={hoursPerEmployee} margin={{ top:5, right:10, left:-10, bottom:5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="name" tick={{ fill:'#9ca3af', fontSize:11 }} />
                <YAxis tick={{ fill:'#9ca3af', fontSize:11 }} unit="h" />
                <Tooltip
                  contentStyle={{ background:'#1f2937', border:'1px solid #374151', borderRadius:'8px' }}
                  itemStyle={{ color:'#f9fafb' }}
                  formatter={v => [v + 'h', 'Heures']} />
                <Bar dataKey="heures" fill="#3b82f6" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Top 3 retards */}
      {isManager && topRetards.length > 0 && (
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
            <AlertTriangle size={16} className="text-yellow-400" />
            Top retards du mois
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {topRetards.map((emp, i) => (
              <div key={i} className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                  i===0 ? 'bg-yellow-500/20 text-yellow-400' :
                  i===1 ? 'bg-gray-500/20 text-gray-400' :
                          'bg-orange-500/20 text-orange-400'
                }`}>
                  {i+1}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-200">{emp.name}</p>
                  <p className="text-xs text-gray-500">{emp.retards} retard(s) — {emp.minutes} min cumulées</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filtres */}
      <div className="flex flex-wrap gap-3">
        <input type="date" className="input w-40" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <input type="date" className="input w-40" value={dateTo}   onChange={e => setDateTo(e.target.value)} />
        {isManager && (
          <select className="input w-48" value={empId} onChange={e => setEmpId(e.target.value)}>
            <option value="">Tous les employés</option>
            {empData?.employees?.map(e => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
          </select>
        )}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-8 w-44" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Tableau */}
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Employé</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Date</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Entrée</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Sortie</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Heures</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Anomalies</th>
                <th className="text-center px-4 py-3 text-gray-400 font-medium">Horaire</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Statut</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Détail</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={9} className="text-center py-10 text-gray-500">Chargement...</td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-10 text-gray-500">Aucune donnée</td></tr>
              ) : records.map(r => (
                <tr key={r.id} className="table-row">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-200">{r.employee_name}</p>
                    <p className="text-xs text-gray-500 font-mono">{r.emp_matricule}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-300">
                    {format(new Date(String(r.date).split('T')[0]), 'EEE dd/MM', { locale: fr })}
                  </td>
                  <td className="px-4 py-3 text-gray-300 font-mono">{r.check_in  || '—'}</td>
                  <td className="px-4 py-3 text-gray-300 font-mono">{r.check_out || '—'}</td>
                  <td className="px-4 py-3 text-gray-300">{r.worked_hours ? `${r.worked_hours}h` : '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {r.late_morning         && <span className="badge bg-yellow-500/10 text-yellow-400 text-xs">Retard M.</span>}
                      {r.late_afternoon       && <span className="badge bg-orange-500/10 text-orange-400 text-xs">Retard APM</span>}
                      {r.early_leave_morning  && <span className="badge bg-red-500/10 text-red-400 text-xs">Sortie ant. M.</span>}
                      {r.early_leave_afternoon&& <span className="badge bg-red-500/10 text-red-400 text-xs">Sortie ant. S.</span>}
                      {r.recovered            && <span className="badge bg-green-500/10 text-green-400 text-xs">Récupéré</span>}
                      {!r.late_morning && !r.late_afternoon && !r.early_leave_morning && !r.early_leave_afternoon && (
                        <span className="text-gray-600 text-xs">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center text-lg">
                    <ScheduleIcon code={r.schedule_code || 'normal'} />
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-3">
                    {r.source !== 'manual' && (
                      <button onClick={() => setDetail(r)}
                        className="text-gray-400 hover:text-blue-400 transition-colors">
                        <Eye size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {detail && <DetailModal record={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}
