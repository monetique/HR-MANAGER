import jsPDF from 'jspdf'
import toast from 'react-hot-toast'
import autoTable from 'jspdf-autotable'
import React, { useState, useMemo, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import { Download, Users, Calendar, TrendingUp, AlertTriangle, Filter, FileText, ChevronLeft, ChevronRight, BarChart2 } from 'lucide-react'
import api from '../api/client'
import { useAuthStore } from '../store/authStore'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isWeekend, parseISO, isWithinInterval } from 'date-fns'
import { fr } from 'date-fns/locale'

const COLORS = ['#3b82f6','#22c55e','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#ec4899']
const LEAVE_COLORS = ['#3b82f6','#22c55e','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#ec4899','#14b8a6','#a855f7']

function KpiCard({ icon: Icon, label, value, color }) {
  return (
    <div className="card flex items-center gap-4">
      <div className={`p-3 rounded-xl ${color}`}><Icon size={20} className="text-white" /></div>
      <div>
        <p className="text-gray-400 text-xs">{label}</p>
        <p className="text-white font-bold text-xl">{value ?? '—'}</p>
      </div>
    </div>
  )
}

// ── Onglet Statistiques ───────────────────────────────────
function StatsTab({ employees, leaveTypes }) {
  const currentYear = new Date().getFullYear()
  const [filters, setFilters] = useState({ year: currentYear, date_from: '', date_to: '', employee_id: '', leave_type_id: '' })
  const [appliedFilters, setAppliedFilters] = useState({ year: currentYear })

  const { data: stats, isLoading } = useQuery({
    queryKey: ['leave-stats', appliedFilters],
    queryFn: () => api.get('/leaves/stats', { params: appliedFilters }).then(r => r.data),
  })

  const kpis = stats?.kpis || {}
  const byType = stats?.by_type || []
  const topEmployees = stats?.top_employees || []
  const monthly = stats?.monthly || []
  const details = stats?.details || []

  const applyFilters = () => {
    const f = { ...filters }
    if (!f.date_from || !f.date_to) { delete f.date_from; delete f.date_to }
    if (!f.employee_id) delete f.employee_id
    if (!f.leave_type_id) delete f.leave_type_id
    setAppliedFilters(f)
  }

  const resetFilters = () => {
    setFilters({ year: currentYear, date_from: '', date_to: '', employee_id: '', leave_type_id: '' })
    setAppliedFilters({ year: currentYear })
  }

  const exportCSV = () => {
    const headers = ['Matricule','Nom','Unite','Type','Code','Debut','Fin','Jours','Statut']
    const rows = [...details].sort((a,b) => (a.matricule||'').localeCompare(b.matricule||'')).map(d => [d.matricule, d.nom, d.unite || '', d.type_conge, d.code, d.start_date?.slice(0,10), d.end_date?.slice(0,10), d.days_count, d.status])
    const csv = [headers, ...rows].map(r => r.join(';')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `stats_conges_${appliedFilters.year || currentYear}.csv`; a.click()
  }

  const handlePDF = async () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageW = doc.internal.pageSize.getWidth()
    const now = new Date().toLocaleDateString('fr-FR')
    doc.setFillColor(30, 41, 59); doc.rect(0, 0, pageW, 28, 'F')
    doc.setTextColor(255, 255, 255); doc.setFontSize(16); doc.setFont('helvetica', 'bold')
    doc.text('Statistiques Congés', 14, 12)
    doc.setFontSize(9); doc.setFont('helvetica', 'normal')
    doc.text('Monétique Tunisie — HR Manager', 14, 20)
    doc.text(`Généré le ${now}`, pageW - 14, 20, { align: 'right' })
    let y = 34
    doc.setTextColor(80, 80, 80); doc.setFontSize(8)
    doc.text(`Filtres: Année: ${appliedFilters.year}`, 14, y); y += 10
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 41, 59)
    doc.text('Indicateurs clés', 14, y); y += 4
    autoTable(doc, {
      startY: y,
      head: [['Indicateur', 'Valeur']],
      body: [['Employés concernés', String(kpis.nb_employes ?? '0')], ['Total jours approuvés', kpis.total_jours ? `${kpis.total_jours} j` : '0 j'], ['Durée moyenne', kpis.moy_duree ? `${kpis.moy_duree} j` : '0 j'], ['En attente', String(kpis.total_en_attente ?? '0')]],
      theme: 'grid', headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 9, fontStyle: 'bold' }, bodyStyles: { fontSize: 9 },
      columnStyles: { 0: { cellWidth: 80 }, 1: { cellWidth: 40, halign: 'center', fontStyle: 'bold' } }, margin: { left: 14, right: 14 }
    })
    y = doc.lastAutoTable.finalY + 10
    if (byType.length > 0) {
      doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 41, 59); doc.text('Répartition par type', 14, y); y += 4
      autoTable(doc, { startY: y, head: [['Type', 'Nb demandes', 'Total jours']], body: byType.map(t => [t.type_conge || '—', String(t.nb_demandes ?? '—'), t.total_jours ? `${t.total_jours} j` : '—']), theme: 'striped', headStyles: { fillColor: [59, 130, 246], textColor: 255, fontSize: 9, fontStyle: 'bold' }, bodyStyles: { fontSize: 9 }, margin: { left: 14, right: 14 } })
      y = doc.lastAutoTable.finalY + 10
    }
    if (details.length > 0) {
      if (y > 200) { doc.addPage(); y = 20 }
      doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 41, 59); doc.text(`Détail des demandes (${details.length})`, 14, y); y += 4
      autoTable(doc, { startY: y, head: [['Matricule', 'Nom', 'Unité', 'Type', 'Début', 'Fin', 'Jours', 'Statut']], body: [...details].sort((a,b) => (a.matricule||'').localeCompare(b.matricule||'')).map(d => [d.matricule || '—', d.nom || '—', d.unite || '—', d.type_conge || '—', d.start_date?.slice(0,10) || '—', d.end_date?.slice(0,10) || '—', String(d.days_count ?? '—'), d.status === 'approved' ? 'Approuvé' : d.status === 'pending' ? 'En attente' : 'Rejeté']), theme: 'striped', headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 7, fontStyle: 'bold' }, bodyStyles: { fontSize: 7 }, columnStyles: { 7: { halign: 'center' } }, margin: { left: 14, right: 14 } })
    }
    const pageCount = doc.internal.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) { doc.setPage(i); doc.setFontSize(7); doc.setTextColor(150, 150, 150); doc.text(`Page ${i} / ${pageCount}`, pageW / 2, 290, { align: 'center' }); doc.text('Monétique Tunisie — HR Manager', 14, 290); doc.text(now, pageW - 14, 290, { align: 'right' }) }
    doc.save(`stats-conges-${appliedFilters.year || currentYear}.pdf`)
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-2 justify-end">
        <button onClick={exportCSV} className="btn-secondary flex items-center gap-2"><FileText size={16} /> Export CSV</button>
        <button onClick={handlePDF} className="btn-secondary flex items-center gap-2"><Download size={16} /> PDF</button>
      </div>
      <div className="card space-y-4">
        <h2 className="font-semibold text-white flex items-center gap-2"><Filter size={16} /> Filtres</h2>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <div><label className="label">Année</label>
            <select className="input" value={filters.year} onChange={e => setFilters({...filters, year: e.target.value})}>
              {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div><label className="label">Date début</label><input type="date" className="input" value={filters.date_from} onChange={e => setFilters({...filters, date_from: e.target.value})} /></div>
          <div><label className="label">Date fin</label><input type="date" className="input" value={filters.date_to} onChange={e => setFilters({...filters, date_to: e.target.value})} /></div>
          <div><label className="label">Employé</label>
            <select className="input" value={filters.employee_id} onChange={e => setFilters({...filters, employee_id: e.target.value})}>
              <option value="">Tous</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.first_name} {e.last_name} — {e.matricule}</option>)}
            </select>
          </div>
          <div><label className="label">Type congé</label>
            <select className="input" value={filters.leave_type_id} onChange={e => setFilters({...filters, leave_type_id: e.target.value})}>
              <option value="">Tous</option>
              {leaveTypes.map(lt => <option key={lt.id} value={lt.id}>{lt.name}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={resetFilters} className="btn-secondary">Réinitialiser</button>
          <button onClick={applyFilters} className="btn-primary flex items-center gap-2"><Filter size={14} /> Appliquer</button>
        </div>
      </div>
      {isLoading ? <div className="text-center py-10 text-gray-500">Chargement...</div> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard icon={Users}         label="Employés concernés"    value={kpis.nb_employes}                                    color="bg-blue-600" />
            <KpiCard icon={Calendar}      label="Total jours approuvés" value={kpis.total_jours ? kpis.total_jours + ' j' : '0 j'} color="bg-green-600" />
            <KpiCard icon={TrendingUp}    label="Durée moyenne"         value={kpis.moy_duree   ? kpis.moy_duree   + ' j' : '0 j'} color="bg-purple-600" />
            <KpiCard icon={AlertTriangle} label="En attente"            value={kpis.total_en_attente}                               color="bg-yellow-600" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card">
              <h2 className="font-semibold text-white mb-4">Jours par type de congé</h2>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={byType} margin={{ top:5, right:10, left:0, bottom:60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="type_conge" tick={{ fill:'#9ca3af', fontSize:10 }} angle={-35} textAnchor="end" interval={0} />
                  <YAxis tick={{ fill:'#9ca3af', fontSize:11 }} />
                  <Tooltip contentStyle={{ backgroundColor:'#1f2937', border:'1px solid #374151', borderRadius:'8px' }} />
                  <Bar dataKey="total_jours" name="Jours" radius={[4,4,0,0]}>{byType.map((_,i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="card">
              <h2 className="font-semibold text-white mb-4">Répartition par type</h2>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={byType} dataKey="total_jours" nameKey="type_conge" cx="50%" cy="50%" outerRadius={90} label={({ percent }) => percent > 0.05 ? `${(percent*100).toFixed(0)}%` : ''}>
                    {byType.map((_,i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor:'#1f2937', border:'1px solid #374151', borderRadius:'8px' }} />
                  <Legend formatter={(v) => <span style={{color:'#9ca3af',fontSize:'11px'}}>{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            {monthly.length > 0 && (
              <div className="card lg:col-span-2">
                <h2 className="font-semibold text-white mb-4">Evolution mensuelle</h2>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={monthly} margin={{ top:5, right:10, left:0, bottom:5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="mois" tick={{ fill:'#9ca3af', fontSize:11 }} />
                    <YAxis tick={{ fill:'#9ca3af', fontSize:11 }} />
                    <Tooltip contentStyle={{ backgroundColor:'#1f2937', border:'1px solid #374151', borderRadius:'8px' }} />
                    <Legend formatter={(v) => <span style={{color:'#9ca3af',fontSize:'11px'}}>{v}</span>} />
                    <Line type="monotone" dataKey="total_jours" name="Total jours" stroke="#3b82f6" strokeWidth={2} dot={{ fill:'#3b82f6' }} />
                    <Line type="monotone" dataKey="nb_maladie"  name="Maladie"     stroke="#ef4444" strokeWidth={2} dot={{ fill:'#ef4444' }} />
                    <Line type="monotone" dataKey="nb_annuel"   name="Congé annuel" stroke="#22c55e" strokeWidth={2} dot={{ fill:'#22c55e' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
          {!appliedFilters.employee_id && topEmployees.length > 0 && (
            <div className="card">
              <h2 className="font-semibold text-white mb-4 flex items-center gap-2"><AlertTriangle size={16} className="text-yellow-400" /> Top 10 — Plus de jours de congé annuel</h2>
              <table className="w-full text-sm">
                <thead><tr className="border-b border-gray-800">
                  <th className="text-left px-3 py-2 text-gray-400">#</th>
                  <th className="text-left px-3 py-2 text-gray-400">Employé</th>
                  <th className="text-left px-3 py-2 text-gray-400">Unité</th>
                  <th className="text-center px-3 py-2 text-gray-400">Nb demandes</th>
                  <th className="text-center px-3 py-2 text-gray-400">Total jours</th>
                  <th className="text-center px-3 py-2 text-gray-400">Maladie</th>
                </tr></thead>
                <tbody>
                  {topEmployees.map((e, i) => (
                    <tr key={i} className="table-row">
                      <td className="px-3 py-2 text-gray-500 text-xs">{i+1}</td>
                      <td className="px-3 py-2"><p className="text-gray-200 font-medium">{e.nom}</p><p className="text-gray-500 text-xs">{e.matricule}</p></td>
                      <td className="px-3 py-2 text-gray-400 text-xs">{e.unite || '—'}</td>
                      <td className="px-3 py-2 text-center text-gray-300">{e.nb_demandes}</td>
                      <td className="px-3 py-2 text-center"><span className={`font-bold ${parseInt(e.total_jours) > 15 ? 'text-red-400' : parseInt(e.total_jours) > 10 ? 'text-yellow-400' : 'text-green-400'}`}>{e.total_jours || 0} j</span></td>
                      <td className="px-3 py-2 text-center text-red-400">{e.nb_maladie}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {details.length > 0 && (
            <div className="card overflow-hidden p-0">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
                <h2 className="font-semibold text-white">Détail des demandes ({details.length})</h2>
              </div>
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-900">
                    <tr className="border-b border-gray-800">
                      <th className="text-left px-3 py-2 text-gray-400">Matricule</th>
                      <th className="text-left px-3 py-2 text-gray-400">Nom</th>
                      <th className="text-left px-3 py-2 text-gray-400">Unité</th>
                      <th className="text-left px-3 py-2 text-gray-400">Type</th>
                      <th className="text-center px-3 py-2 text-gray-400">Début</th>
                      <th className="text-center px-3 py-2 text-gray-400">Fin</th>
                      <th className="text-center px-3 py-2 text-gray-400">Jours</th>
                      <th className="text-center px-3 py-2 text-gray-400">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {details.map((d, i) => (
                      <tr key={i} className="table-row">
                        <td className="px-3 py-2 text-gray-400 text-xs font-mono">{d.matricule}</td>
                        <td className="px-3 py-2 text-gray-200">{d.nom}</td>
                        <td className="px-3 py-2 text-gray-500 text-xs">{d.unite || '—'}</td>
                        <td className="px-3 py-2 text-gray-300 text-xs">{d.type_conge}</td>
                        <td className="px-3 py-2 text-center text-gray-300 text-xs font-mono">{d.start_date?.slice(0,10)}</td>
                        <td className="px-3 py-2 text-center text-gray-300 text-xs font-mono">{d.end_date?.slice(0,10)}</td>
                        <td className="px-3 py-2 text-center text-blue-400 font-bold">{d.days_count}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`badge text-xs ${d.status === 'approved' ? 'bg-green-500/10 text-green-400' : d.status === 'pending' ? 'bg-yellow-500/10 text-yellow-400' : 'bg-red-500/10 text-red-400'}`}>
                            {d.status === 'approved' ? 'Approuvé' : d.status === 'pending' ? 'En attente' : 'Rejeté'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Onglet Planning Calendrier ────────────────────────────
function PlanningTab({ employees, leaveTypes }) {
  const today = new Date()
  const [currentDate, setCurrentDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [filterEmp,    setFilterEmp]   = useState('')
  const [filterType,   setFilterType]  = useState('')
  const [filterStatus, setFilterStatus]= useState('')
  const [tooltip,      setTooltip]     = useState(null)

  const monthStart = startOfMonth(currentDate)
  const monthEnd   = endOfMonth(currentDate)

  const { data: leavesData } = useQuery({
    queryKey: ['leaves-planning', format(currentDate, 'yyyy-MM')],
    queryFn: () => api.get('/leaves', { params: { date_from: format(monthStart, 'yyyy-MM-dd'), date_to: format(monthEnd, 'yyyy-MM-dd') } }).then(r => r.data),
  })

  const allLeaves = useMemo(() => {
    let leaves = leavesData?.requests || []
    if (filterEmp)    leaves = leaves.filter(l => String(l.employee_id) === filterEmp)
    if (filterType)   leaves = leaves.filter(l => String(l.leave_type_id) === filterType)
    if (filterStatus) leaves = leaves.filter(l => l.status === filterStatus)
    return leaves
  }, [leavesData, filterEmp, filterType, filterStatus])

  const empColorMap = useMemo(() => {
    const map = {}; let idx = 0
    allLeaves.forEach(l => { if (!map[l.employee_id]) map[l.employee_id] = LEAVE_COLORS[idx++ % LEAVE_COLORS.length] })
    return map
  }, [allLeaves])

  const days = eachDayOfInterval({ start: monthStart, end: monthEnd })

  const getLeavesForDay = (day) => allLeaves.filter(l => {
    try { return isWithinInterval(day, { start: parseISO(l.start_date), end: parseISO(l.end_date) }) } catch { return false }
  })

  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))
  const firstDayOfWeek = (monthStart.getDay() + 6) % 7
  const weekDays = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex flex-wrap gap-3 items-end">
          <div><label className="label">Employé</label>
            <select className="input w-48" value={filterEmp} onChange={e => setFilterEmp(e.target.value)}>
              <option value="">Tous</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
            </select>
          </div>
          <div><label className="label">Type de congé</label>
            <select className="input w-44" value={filterType} onChange={e => setFilterType(e.target.value)}>
              <option value="">Tous</option>
              {leaveTypes.map(lt => <option key={lt.id} value={lt.id}>{lt.name}</option>)}
            </select>
          </div>
          <div><label className="label">Statut</label>
            <select className="input w-36" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">Tous</option>
              <option value="approved">Approuvé</option>
              <option value="pending">En attente</option>
              <option value="rejected">Rejeté</option>
            </select>
          </div>
          {(filterEmp || filterType || filterStatus) && (
            <button onClick={() => { setFilterEmp(''); setFilterType(''); setFilterStatus('') }} className="text-xs text-gray-400 hover:text-red-400">✕ Réinitialiser</button>
          )}
        </div>
      </div>

      {Object.keys(empColorMap).length > 0 && (
        <div className="flex flex-wrap gap-3">
          {Object.entries(empColorMap).map(([empId, color]) => {
            const emp = employees.find(e => String(e.id) === empId)
            if (!emp) return null
            return (
              <div key={empId} className="flex items-center gap-1.5">
                <div style={{ width:12, height:12, borderRadius:3, background:color }} />
                <span className="text-xs text-gray-400">{emp.first_name} {emp.last_name}</span>
              </div>
            )
          })}
          <div className="flex items-center gap-3 ml-4 border-l border-gray-700 pl-4">
            <div className="flex items-center gap-1.5"><div style={{ width:12, height:12, borderRadius:3, background:'#22c55e' }} /><span className="text-xs text-gray-400">Approuvé</span></div>
            <div className="flex items-center gap-1.5"><div style={{ width:12, height:12, borderRadius:3, background:'#f59e0b', opacity:0.7 }} /><span className="text-xs text-gray-400">En attente</span></div>
            <div className="flex items-center gap-1.5"><div style={{ width:12, height:12, borderRadius:3, background:'#6b7280', opacity:0.4 }} /><span className="text-xs text-gray-400">Rejeté</span></div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"><ChevronLeft size={18} /></button>
          <h2 className="font-bold text-white text-lg capitalize">{format(currentDate, 'MMMM yyyy', { locale: fr })}</h2>
          <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"><ChevronRight size={18} /></button>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {weekDays.map(d => <div key={d} className="text-center text-xs font-medium text-gray-500 py-2">{d}</div>)}
          {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`e-${i}`} className="h-20 rounded-lg bg-gray-900/30" />)}
          {days.map(day => {
            const dayLeaves  = getLeavesForDay(day)
            const isToday    = format(day, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')
            const isWeekend_ = isWeekend(day)
            return (
              <div key={day.toISOString()} className={`h-20 rounded-lg p-1 relative border transition-colors ${isToday ? 'border-blue-500 bg-blue-500/5' : isWeekend_ ? 'border-gray-800 bg-gray-900/50' : 'border-gray-800 bg-gray-900/30'}`}>
                <span className={`text-xs font-medium ${isToday ? 'text-blue-400' : isWeekend_ ? 'text-gray-600' : 'text-gray-400'}`}>{format(day, 'd')}</span>
                <div className="mt-0.5 space-y-0.5 overflow-hidden">
                  {dayLeaves.slice(0, 3).map((leave, i) => {
                    const color = empColorMap[leave.employee_id] || '#6b7280'
                    const alpha = leave.status === 'approved' ? 'dd' : leave.status === 'pending' ? '99' : '44'
                    const emp   = employees.find(e => e.id === leave.employee_id)
                    return (
                      <div key={i} style={{ background: color + alpha, borderLeft: `2px solid ${color}` }}
                        className="text-xs px-1 py-0.5 rounded-r truncate cursor-pointer hover:opacity-80"
                        onMouseEnter={(e) => setTooltip({ leave, emp, x: e.clientX, y: e.clientY })}
                        onMouseLeave={() => setTooltip(null)}>
                        <span style={{ color:'#fff', fontSize:10 }}>{emp?.first_name?.charAt(0)}{emp?.last_name?.charAt(0)}</span>
                      </div>
                    )
                  })}
                  {dayLeaves.length > 3 && <div className="text-xs text-gray-500 text-center">+{dayLeaves.length - 3}</div>}
                </div>
              </div>
            )
          })}
        </div>

        {tooltip && (
          <div className="fixed z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-xl p-3 text-sm pointer-events-none"
            style={{ left: tooltip.x + 12, top: tooltip.y - 10, maxWidth: 240 }}>
            <p className="font-semibold text-white">{tooltip.emp?.first_name} {tooltip.emp?.last_name}</p>
            <p className="text-gray-400 text-xs">{tooltip.emp?.unit_name}</p>
            <p className="text-blue-400 text-xs mt-1">{tooltip.leave.leave_type_name}</p>
            <p className="text-gray-300 text-xs">{tooltip.leave.start_date?.slice(0,10)} → {tooltip.leave.end_date?.slice(0,10)}</p>
            <p className="text-gray-400 text-xs">{tooltip.leave.days_count} jour(s)</p>
            <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full ${tooltip.leave.status === 'approved' ? 'bg-green-500/20 text-green-400' : tooltip.leave.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'}`}>
              {tooltip.leave.status === 'approved' ? 'Approuvé' : tooltip.leave.status === 'pending' ? 'En attente' : 'Rejeté'}
            </span>
          </div>
        )}
      </div>

      {allLeaves.length > 0 && (
        <div className="card overflow-hidden p-0">
          <div className="px-4 py-3 border-b border-gray-800">
            <h2 className="font-semibold text-white">Congés du mois — {format(currentDate, 'MMMM yyyy', { locale: fr })}</h2>
          </div>
          <div className="overflow-x-auto max-h-64 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-900">
                <tr className="border-b border-gray-800">
                  <th className="text-left px-3 py-2 text-gray-400">Employé</th>
                  <th className="text-left px-3 py-2 text-gray-400">Type</th>
                  <th className="text-center px-3 py-2 text-gray-400">Début</th>
                  <th className="text-center px-3 py-2 text-gray-400">Fin</th>
                  <th className="text-center px-3 py-2 text-gray-400">Jours</th>
                  <th className="text-center px-3 py-2 text-gray-400">Statut</th>
                </tr>
              </thead>
              <tbody>
                {allLeaves.map((l, i) => (
                  <tr key={i} className="table-row">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div style={{ width:8, height:8, borderRadius:2, background: empColorMap[l.employee_id] }} />
                        <span className="text-gray-200">{l.employee_name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-gray-400 text-xs">{l.leave_type_name}</td>
                    <td className="px-3 py-2 text-center text-gray-300 text-xs font-mono">{l.start_date?.slice(0,10)}</td>
                    <td className="px-3 py-2 text-center text-gray-300 text-xs font-mono">{l.end_date?.slice(0,10)}</td>
                    <td className="px-3 py-2 text-center text-blue-400 font-bold">{l.days_count}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`badge text-xs ${l.status === 'approved' ? 'bg-green-500/10 text-green-400' : l.status === 'pending' ? 'bg-yellow-500/10 text-yellow-400' : 'bg-red-500/10 text-red-400'}`}>
                        {l.status === 'approved' ? 'Approuvé' : l.status === 'pending' ? 'En attente' : 'Rejeté'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Modal Modifier Solde ─────────────────────────────────────
function EditBalanceModal({ balance, onClose, onSave }) {
  const [form, setForm] = useState({
    annual_total: parseFloat(balance.annual_total) || 0,
    annual_taken: parseFloat(balance.annual_taken) || 0,
    sick_total:   parseFloat(balance.sick_total) || 15,
    sick_taken:   parseFloat(balance.sick_taken) || 0,
  })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      const token = useAuthStore.getState().token
      const res = await fetch(`/api/leaves/admin-balance/${balance.balance_id || balance.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form, year: balance.year })
      })
      const data = await res.json()
      if (data.success) { toast.success('Solde mis à jour'); onSave(); onClose(); }
      else toast.error(data.error || 'Erreur')
    } catch { toast.error('Erreur réseau') }
    setSaving(false)
  }

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000}}>
      <div className="card" style={{width:440,maxWidth:'95vw'}}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-white">Modifier solde — {balance.first_name} {balance.last_name}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">×</button>
        </div>
        <p className="text-xs text-gray-500 font-mono mb-4">{balance.matricule}</p>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Annuel — Total</label>
              <input type="number" step="0.5" min="0" className="input"
                value={form.annual_total}
                onChange={e => setForm(f => ({...f, annual_total: parseFloat(e.target.value)||0}))} />
            </div>
            <div>
              <label className="label">Annuel — Pris</label>
              <input type="number" step="0.5" min="0" className="input"
                value={form.annual_taken}
                onChange={e => setForm(f => ({...f, annual_taken: parseFloat(e.target.value)||0}))} />
            </div>
            <div>
              <label className="label">Maladie — Total</label>
              <input type="number" step="0.5" min="0" className="input"
                value={form.sick_total}
                onChange={e => setForm(f => ({...f, sick_total: parseFloat(e.target.value)||0}))} />
            </div>
            <div>
              <label className="label">Maladie — Pris</label>
              <input type="number" step="0.5" min="0" className="input"
                value={form.sick_taken}
                onChange={e => setForm(f => ({...f, sick_taken: parseFloat(e.target.value)||0}))} />
            </div>
          </div>
          <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-sm space-y-1">
            <p className="text-blue-300">Restant annuel : <strong>{Math.max(0, form.annual_total - form.annual_taken).toFixed(1)}j</strong></p>
            <p className="text-blue-300">Restant maladie : <strong>{Math.max(0, form.sick_total - form.sick_taken).toFixed(1)}j</strong></p>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="btn-secondary flex-1">Annuler</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Onglet Soldes ─────────────────────────────────────────
function SoldesTab() {
  const [editBalance, setEditBalance] = useState(null)
  const { hasRole } = useAuthStore()
  const canEdit = hasRole('superadmin', 'rh')
  const queryClient = useQueryClient()
  const currentYear = new Date().getFullYear()
  const [year,        setYear]        = useState(currentYear)
  const [search,      setSearch]      = useState('')
  const [filterAlert, setFilterAlert] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['team-balances', year],
    refetchOnMount: true,
    queryFn: () => api.get('/leaves/team-balances', { params: { year } }).then(r => r.data),
  })

  const balances = useMemo(() => {
    let rows = data?.balances || []
    if (search)      rows = rows.filter(b => `${b.first_name} ${b.last_name} ${b.matricule}`.toLowerCase().includes(search.toLowerCase()))
    if (filterAlert) rows = rows.filter(b => (b.annual_total - b.annual_taken) <= 3)
    return rows
  }, [data, search, filterAlert])

  const exportCSV = () => {
    const headers = ['Matricule','Nom','Unité','Annuel Total','Annuel Pris','Annuel Restant','Maladie Total','Maladie Pris','Maladie Restant','Exceptionnel Total','Exceptionnel Pris','Exceptionnel Restant']
    const rows = balances.map(b => [
      b.matricule, `${b.first_name} ${b.last_name}`, b.unit_name || '',
      b.annual_total, b.annual_taken, (b.annual_total - b.annual_taken).toFixed(2),
      b.sick_total, b.sick_taken, (b.sick_total - b.sick_taken).toFixed(2),
      b.exceptional_total, b.exceptional_taken, (b.exceptional_total - b.exceptional_taken).toFixed(2),
    ])
    const csv = [headers, ...rows].map(r => r.join(';')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `soldes_conges_${year}.csv`; a.click()
  }

  const handlePDF = () => {
    const doc   = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const pageW = doc.internal.pageSize.getWidth()
    const now   = new Date().toLocaleDateString('fr-FR')

    // En-tête
    doc.setFillColor(30, 41, 59); doc.rect(0, 0, pageW, 25, 'F')
    doc.setTextColor(255, 255, 255); doc.setFontSize(14); doc.setFont('helvetica', 'bold')
    doc.text(`Soldes Congés ${year}`, 14, 10)
    doc.setFontSize(9); doc.setFont('helvetica', 'normal')
    doc.text('Monétique Tunisie — HR Manager', 14, 18)
    doc.text(`Généré le ${now}`, pageW - 14, 18, { align: 'right' })

    autoTable(doc, {
      startY: 30,
      head: [['Matricule', 'Employé', 'Unité', 'C.Ann. Total', 'C.Ann. Pris', 'C.Ann. Restant', 'Mal. Total', 'Mal. Pris', 'Mal. Restant', 'Exc. Total', 'Exc. Pris', 'Exc. Restant']],
      body: balances.map(b => [
        b.matricule,
        `${b.first_name} ${b.last_name}`,
        b.unit_name || '—',
        parseFloat(b.annual_total).toFixed(1) + 'j',
        parseFloat(b.annual_taken).toFixed(1) + 'j',
        (parseFloat(b.annual_total) - parseFloat(b.annual_taken)).toFixed(1) + 'j',
        parseFloat(b.sick_total).toFixed(1) + 'j',
        parseFloat(b.sick_taken).toFixed(1) + 'j',
        (parseFloat(b.sick_total) - parseFloat(b.sick_taken)).toFixed(1) + 'j',
        parseFloat(b.exceptional_total).toFixed(1) + 'j',
        parseFloat(b.exceptional_taken).toFixed(1) + 'j',
        (parseFloat(b.exceptional_total) - parseFloat(b.exceptional_taken)).toFixed(1) + 'j',
      ]),
      theme: 'striped',
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 7, fontStyle: 'bold' },
      bodyStyles: { fontSize: 7 },
      columnStyles: {
        5: { fontStyle: 'bold' }, // Annuel restant
        8: { fontStyle: 'bold' }, // Maladie restant
        11: { fontStyle: 'bold' }, // Exceptionnel restant
      },
      didParseCell: (data) => {
        // Colorer en rouge si restant <= 3j
        if ([5, 8, 11].includes(data.column.index) && data.section === 'body') {
          const val = parseFloat(data.cell.raw)
          if (val <= 3) { data.cell.styles.textColor = [220, 38, 38] }
        }
      },
      margin: { left: 10, right: 10 },
    })

    const pageCount = doc.internal.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFontSize(7); doc.setTextColor(150, 150, 150)
      doc.text(`Page ${i} / ${pageCount}`, pageW / 2, 205, { align: 'center' })
      doc.text('Monétique Tunisie — HR Manager', 14, 205)
      doc.text(now, pageW - 14, 205, { align: 'right' })
    }
    doc.save(`soldes-conges-${year}.pdf`)
  }

  function BalanceBar({ taken, total, color }) {
    const pct = total > 0 ? Math.min(100, (taken / total) * 100) : 0
    const remaining = parseFloat(total) - parseFloat(taken)
    const isLow = remaining <= 3
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${isLow ? 'bg-red-500' : color}`} style={{ width: `${pct}%` }} />
        </div>
        <span className={`text-xs font-mono whitespace-nowrap ${isLow ? 'text-red-400 font-bold' : 'text-gray-400'}`}>
          {remaining.toFixed(1)}j / {parseFloat(total).toFixed(1)}j{isLow && ' ⚠️'}
        </span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end justify-between">
        <div className="flex gap-3 items-end flex-wrap">
          <div>
            <label className="label">Année</label>
            <select className="input w-28" value={year} onChange={e => setYear(e.target.value)}>
              {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Rechercher</label>
            <input className="input w-48" placeholder="Nom, matricule..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-300 mb-1">
            <input type="checkbox" checked={filterAlert} onChange={e => setFilterAlert(e.target.checked)} className="accent-red-500" />
            <span className="text-red-400">⚠️ Solde critique (≤ 3j)</span>
          </label>
        </div>
        <div className="flex gap-2 mb-1">
          <button onClick={exportCSV} className="btn-secondary flex items-center gap-2">
            <FileText size={16} /> Export CSV
          </button>
          <button onClick={handlePDF} className="btn-secondary flex items-center gap-2">
            <Download size={16} /> PDF
          </button>
        </div>
      </div>

      {isLoading ? <div className="text-center py-10 text-gray-500">Chargement...</div> : (
        <>
          <div className="grid grid-cols-3 gap-4">
            <div className="card text-center">
              <p className="text-2xl font-bold text-blue-400">{balances.length}</p>
              <p className="text-xs text-gray-400 mt-1">Employés</p>
            </div>
            <div className="card text-center">
              <p className="text-2xl font-bold text-red-400">{balances.filter(b => (parseFloat(b.annual_total) - parseFloat(b.annual_taken)) <= 3).length}</p>
              <p className="text-xs text-gray-400 mt-1">Soldes critiques (≤ 3j)</p>
            </div>
            <div className="card text-center">
              <p className="text-2xl font-bold text-green-400">
                {balances.length > 0 ? (balances.reduce((s,b) => s + parseFloat(b.annual_total) - parseFloat(b.annual_taken), 0) / balances.length).toFixed(1) : '—'}j
              </p>
              <p className="text-xs text-gray-400 mt-1">Moyenne restante annuel</p>
            </div>
          </div>

          <div className="card overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 bg-gray-900">
                    <th className="text-left px-4 py-3 text-gray-400">Employé</th>
                    <th className="text-left px-4 py-3 text-gray-400">Unité</th>
                    <th className="px-4 py-3 text-blue-400 text-left" style={{minWidth:160}}>Congé annuel</th>
                    <th className="px-4 py-3 text-red-400 text-left"  style={{minWidth:160}}>Maladie</th>
                    <th className="px-4 py-3 text-yellow-400 text-left" style={{minWidth:160}}>Exceptionnel</th>
                  </tr>
                </thead>
                <tbody>
                  {balances.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-10 text-gray-500">Aucune donnée</td></tr>
                  ) : balances.map((b, i) => (
                    <tr key={i} className="table-row">
                      <td className="px-4 py-3">
                        <p className="text-gray-200 font-medium">{b.first_name} {b.last_name}</p>
                        <p className="text-gray-500 text-xs font-mono">{b.matricule}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{b.unit_name || '—'}</td>
                      <td className="px-4 py-3 pr-6"><BalanceBar taken={b.annual_taken}     total={b.annual_total}     color="bg-blue-500" /></td>
                      <td className="px-4 py-3 pr-6"><BalanceBar taken={b.sick_taken}        total={b.sick_total}        color="bg-red-500" /></td>
                      <td className="px-4 py-3 pr-6"><BalanceBar taken={b.exceptional_taken} total={b.exceptional_total} color="bg-yellow-500" /></td>
                      {canEdit && (
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => setEditBalance(b)}
                            className="text-xs text-blue-400 hover:text-blue-300 border border-blue-500/30 px-2 py-1 rounded-lg">
                            ✏️ Modifier
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      {editBalance && (
        <EditBalanceModal
          balance={editBalance}
          onClose={() => setEditBalance(null)}
          onSave={() => { setEditBalance(null); queryClient.invalidateQueries(['team-balances', year]); }}
        />
      )}
    </div>
  )
}

// ── Onglet Audit ─────────────────────────────────────────────
function AuditTab() {
  const [logs, setLogs]       = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = useAuthStore.getState().token
    fetch('/api/leaves/audit-logs?limit=200', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d.success) setLogs(d.logs || []); setLoading(false); })
      .catch(() => setLoading(false))
  }, [])

  const fmt = (d) => d ? new Date(d).toLocaleString('fr-FR') : '—'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">Journal des modifications de soldes</h2>
        <span className="text-xs text-gray-500">{logs.length} entrée(s)</span>
      </div>
      {loading ? (
        <div className="text-center py-10 text-gray-500">Chargement...</div>
      ) : logs.length === 0 ? (
        <div className="text-center py-10 text-gray-500">Aucune modification enregistrée</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="px-4 py-3 text-left text-gray-400 font-medium">Date</th>
                <th className="px-4 py-3 text-left text-gray-400 font-medium">Employé</th>
                <th className="px-4 py-3 text-left text-gray-400 font-medium">Modifié par</th>
                <th className="px-4 py-3 text-left text-gray-400 font-medium">Avant</th>
                <th className="px-4 py-3 text-left text-gray-400 font-medium">Après</th>
                <th className="px-4 py-3 text-left text-gray-400 font-medium">IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log, i) => (
                <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{fmt(log.created_at)}</td>
                  <td className="px-4 py-3">
                    <p className="text-gray-200 font-medium">{log.employee_name}</p>
                    <p className="text-gray-500 text-xs font-mono">{log.matricule}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-gray-300">{log.performed_by_name}</p>
                    <p className="text-gray-500 text-xs font-mono">{log.performed_by_matricule}</p>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <div className="space-y-1">
                      <p className="text-gray-400">Annuel : <span className="text-red-400">{parseFloat(log.old_values?.annual_total||0).toFixed(1)}j total / {parseFloat(log.old_values?.annual_taken||0).toFixed(1)}j pris</span></p>
                      <p className="text-gray-400">Maladie : <span className="text-red-400">{parseFloat(log.old_values?.sick_total||0).toFixed(1)}j total / {parseFloat(log.old_values?.sick_taken||0).toFixed(1)}j pris</span></p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <div className="space-y-1">
                      <p className="text-gray-400">Annuel : <span className="text-green-400">{parseFloat(log.new_values?.annual_total||0).toFixed(1)}j total / {parseFloat(log.new_values?.annual_taken||0).toFixed(1)}j pris</span></p>
                      <p className="text-gray-400">Maladie : <span className="text-green-400">{parseFloat(log.new_values?.sick_total||0).toFixed(1)}j total / {parseFloat(log.new_values?.sick_taken||0).toFixed(1)}j pris</span></p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 font-mono">{log.ip_address || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Page principale ───────────────────────────────────────
export default function LeaveStatsPage() {
  const { hasRole } = useAuthStore()
  const [activeTab, setActiveTab] = useState('stats')

  const { data: empData } = useQuery({
    queryKey: ['employees-list'],
    queryFn: () => api.get('/employees').then(r => r.data),
  })
  const { data: ltData } = useQuery({
    queryKey: ['leave-types'],
    queryFn: () => api.get('/leaves/types').then(r => r.data),
  })

  const employees  = (empData?.employees || [])
    .filter(e => e.is_active && e.role !== 'superadmin' && !e.matricule?.startsWith('ADM'))
    .sort((a, b) => (a.matricule || '').localeCompare(b.matricule || ''))
  const leaveTypes = ltData?.leave_types || []

  const tabs = [
    { id: 'stats',    label: 'Statistiques', icon: BarChart2  },
    { id: 'planning', label: 'Planning',      icon: Calendar   },
    { id: 'soldes',   label: 'Soldes',        icon: Users      },
  ...(hasRole('superadmin','rh') ? [{ id: 'audit', label: 'Audit', icon: FileText }] : []),
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Statistiques Congés</h1>
        <p className="text-gray-400 text-sm mt-1">Analyse des congés, planning et soldes</p>
      </div>
      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.id ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'}`}>
            <tab.icon size={15} /> {tab.label}
          </button>
        ))}
      </div>
      {activeTab === 'stats'    && <StatsTab    employees={employees} leaveTypes={leaveTypes} />}
      {activeTab === 'planning' && <PlanningTab employees={employees} leaveTypes={leaveTypes} />}
      {activeTab === 'soldes'   && <SoldesTab />}
      {activeTab === 'audit'    && <AuditTab />}
    </div>
  )
}
