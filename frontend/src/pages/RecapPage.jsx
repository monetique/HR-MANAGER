import AttendanceAnalysis from '../components/AttendanceAnalysis'
import React, { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, ChevronDown, ChevronUp, Search } from 'lucide-react'
import { employeesAPI } from '../api/client'
import api from '../api/client'
import { useAuthStore } from '../store/authStore'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line
} from 'recharts'

const fmtH   = h => h ? `${h}h` : '—'
const fmtMin = m => m > 0 ? `${Math.floor(m/60)}h${String(m%60).padStart(2,'0')}` : '—'

const COLORS = {
  present:  '#22c55e',
  absent:   '#ef4444',
  late:     '#f59e0b',
  on_leave: '#3b82f6',
}

function Badge({ children, color='gray' }) {
  const cls = {
    green:  'bg-green-500/10 text-green-400',
    red:    'bg-red-500/10 text-red-400',
    yellow: 'bg-yellow-500/10 text-yellow-400',
    blue:   'bg-blue-500/10 text-blue-400',
    gray:   'bg-gray-500/10 text-gray-400',
    orange: 'bg-orange-500/10 text-orange-400',
  }
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls[color]}`}>{children}</span>
}

function computeRecap(records) {
  return {
    present:         records.filter(r => r.status === 'present').length,
    absent:          records.filter(r => r.status === 'absent').length,
    late:            records.filter(r => r.status === 'late').length,
    on_leave:        records.filter(r => r.status === 'on_leave').length,
    recovered:       records.filter(r => r.recovered).length,
    retard_matin:    records.filter(r => r.late_morning).length,
    retard_apm:      records.filter(r => r.late_afternoon).length,
    sortie_ant_mat:  records.filter(r => r.early_leave_morning).length,
    sortie_ant_soir: records.filter(r => r.early_leave_afternoon).length,
    total_heures:    parseFloat(records.reduce((s,r) => s + parseFloat(r.worked_hours||0), 0).toFixed(2)),
    total_retard_min: records.reduce((s,r) => s + parseInt(r.delay_minutes||0), 0),
  }
}

function SummaryRow({ emp, records, expanded, onToggle }) {
  const recap = computeRecap(records)
  return (
    <>
      <tr className="border-b border-gray-800 hover:bg-gray-800/30 cursor-pointer" onClick={onToggle}>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {expanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
            <div>
              <p className="font-medium text-gray-200 text-sm">{emp.first_name} {emp.last_name}</p>
              <p className="text-xs text-gray-500 font-mono">{emp.matricule}</p>
            </div>
          </div>
        </td>
        <td className="px-3 py-3 text-center"><Badge color="green">{recap.present}</Badge></td>
        <td className="px-3 py-3 text-center"><Badge color="red">{recap.absent}</Badge></td>
        <td className="px-3 py-3 text-center"><Badge color="yellow">{recap.late}</Badge></td>
        <td className="px-3 py-3 text-center"><Badge color="blue">{recap.on_leave}</Badge></td>
        <td className="px-3 py-3 text-center"><Badge color="green">{recap.recovered}</Badge></td>
        <td className="px-3 py-3 text-center text-sm text-gray-300">{fmtH(recap.total_heures)}</td>
        <td className="px-3 py-3 text-center text-sm text-yellow-400">{recap.retard_matin}</td>
        <td className="px-3 py-3 text-center text-sm text-orange-400">{recap.retard_apm}</td>
        <td className="px-3 py-3 text-center text-sm text-red-400">{recap.sortie_ant_mat}</td>
        <td className="px-3 py-3 text-center text-sm text-red-400">{recap.sortie_ant_soir}</td>
        <td className="px-3 py-3 text-center text-sm text-yellow-300">{fmtMin(recap.total_retard_min)}</td>
      </tr>
      {expanded && [...records].sort((a,b) => a.date > b.date ? 1 : -1).map(r => (
        <tr key={r.id} className="bg-gray-900/50 border-b border-gray-800/50">
          <td className="px-4 py-2 pl-12 text-xs text-gray-400">
            {format(new Date(String(r.date).split('T')[0]), 'EEE dd/MM', { locale: fr })}
          </td>
          <td className="px-3 py-2 text-center">{r.status==='present'  && <Badge color="green">P</Badge>}</td>
          <td className="px-3 py-2 text-center">{r.status==='absent'   && <Badge color="red">A</Badge>}</td>
          <td className="px-3 py-2 text-center">{r.status==='late'     && <Badge color="yellow">R</Badge>}</td>
          <td className="px-3 py-2 text-center">{r.status==='on_leave' && <Badge color="blue">C</Badge>}</td>
          <td className="px-3 py-2 text-center">{r.recovered && <Badge color="green">✓</Badge>}</td>
          <td className="px-3 py-2 text-center text-xs text-gray-400">
            {r.check_in ? `${r.check_in.slice(0,5)}→${r.check_out ? r.check_out.slice(0,5) : '...'} (${fmtH(r.worked_hours)})` : '—'}
          </td>
          <td className="px-3 py-2 text-center text-xs">{r.late_morning          && <span className="text-yellow-400">✗</span>}</td>
          <td className="px-3 py-2 text-center text-xs">{r.late_afternoon        && <span className="text-orange-400">✗</span>}</td>
          <td className="px-3 py-2 text-center text-xs">{r.early_leave_morning   && <span className="text-red-400">✗</span>}</td>
          <td className="px-3 py-2 text-center text-xs">{r.early_leave_afternoon && <span className="text-red-400">✗</span>}</td>
          <td className="px-3 py-2 text-center text-xs text-yellow-300">
            {r.delay_minutes > 0 ? fmtMin(r.delay_minutes) : '—'}
          </td>
        </tr>
      ))}
    </>
  )
}

async function exportPDF(employees, attendanceByEmp, dateFrom, dateTo) {
  const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const now   = new Date().toLocaleDateString('fr-FR')

  // En-tête
  doc.setFillColor(30, 41, 59)
  doc.rect(0, 0, pageW, 28, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('Récapitulatif Pointage', 14, 12)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text('Monétique Tunisie — HR Manager', 14, 20)
  doc.text(`Généré le ${now}`, pageW - 58, 20)

  let y = 34
  doc.setTextColor(80, 80, 80)
  doc.setFontSize(8)
  doc.text(`Période : ${dateFrom} au ${dateTo}  |  ${employees.length} employé(s)`, 14, y)
  y += 10

  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 41, 59)
  doc.text('Résumé équipe', 14, y)
  y += 4

  const summaryRows = employees.map(emp => {
    const r = computeRecap(attendanceByEmp[emp.id] || [])
    return [
      `${emp.first_name} ${emp.last_name} (${emp.matricule})`,
      String(r.present), String(r.absent), String(r.late), String(r.on_leave),
      String(r.recovered), fmtH(r.total_heures), String(r.retard_matin),
      String(r.retard_apm), String(r.sortie_ant_mat), String(r.sortie_ant_soir),
      fmtMin(r.total_retard_min),
    ]
  })

  autoTable(doc, {
    startY: y,
    head: [['Employé', 'Prés.', 'Abs.', 'Ret.', 'Congé', 'Récup.', 'Heures', 'Ret.M', 'Ret.APM', 'S.Ant.M', 'S.Ant.S', 'Min.Ret']],
    body: summaryRows,
    theme: 'striped',
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 7, fontStyle: 'bold' },
    bodyStyles: { fontSize: 7 },
    columnStyles: {
      0: { cellWidth: 45 },
      1: { halign: 'center', textColor: [22, 163, 74] },
      2: { halign: 'center', textColor: [220, 38, 38] },
      3: { halign: 'center', textColor: [217, 119, 6] },
      4: { halign: 'center', textColor: [59, 130, 246] },
      5: { halign: 'center', textColor: [22, 163, 74] },
      6: { halign: 'center' }, 7: { halign: 'center' }, 8: { halign: 'center' },
      9: { halign: 'center' }, 10: { halign: 'center' }, 11: { halign: 'center' },
    },
    margin: { left: 14, right: 14 },
  })
  y = doc.lastAutoTable.finalY + 10

  employees.forEach(emp => {
    const records = [...(attendanceByEmp[emp.id] || [])].sort((a,b) => a.date > b.date ? 1 : -1)
    if (!records.length) return
    if (y > 230) { doc.addPage(); y = 20 }

    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 41, 59)
    doc.text(`Détail — ${emp.first_name} ${emp.last_name} (${emp.matricule})`, 14, y)
    y += 4

    const detailRows = records.map(r => {
      const dateStr = String(r.date).split('T')[0]
      const statusLabel = { present:'Présent', absent:'Absent', late:'Retard', on_leave:'Congé' }[r.status] || r.status
      return [
        format(new Date(dateStr), 'EEE dd/MM', { locale: fr }),
        r.check_in  ? r.check_in.slice(0,5)  : '—',
        r.check_out ? r.check_out.slice(0,5) : '—',
        fmtH(r.worked_hours), statusLabel,
        r.late_morning          ? '✗' : '',
        r.late_afternoon        ? '✗' : '',
        r.early_leave_morning   ? '✗' : '',
        r.early_leave_afternoon ? '✗' : '',
        r.recovered             ? '✓' : '',
        r.delay_minutes > 0     ? fmtMin(r.delay_minutes) : '—',
      ]
    })

    autoTable(doc, {
      startY: y,
      head: [['Date', 'Entrée', 'Sortie', 'Heures', 'Statut', 'Ret.M', 'Ret.APM', 'S.Ant.M', 'S.Ant.S', 'Récup.', 'Min.Ret']],
      body: detailRows,
      theme: 'striped',
      headStyles: { fillColor: [59, 130, 246], textColor: 255, fontSize: 7, fontStyle: 'bold' },
      bodyStyles: { fontSize: 7 },
      columnStyles: {
        0: { cellWidth: 18 }, 4: { halign: 'center' },
        5: { halign: 'center', textColor: [217, 119, 6] },
        6: { halign: 'center', textColor: [249, 115, 22] },
        7: { halign: 'center', textColor: [220, 38, 38] },
        8: { halign: 'center', textColor: [220, 38, 38] },
        9: { halign: 'center', textColor: [22, 163, 74] },
        10: { halign: 'center' },
      },
      margin: { left: 14, right: 14 },
    })
    y = doc.lastAutoTable.finalY + 10
  })

  // Pied de page + logo sur toutes les pages
  const pageCount = doc.internal.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setTextColor(150, 150, 150)
    doc.text(`Page ${i} / ${pageCount}`, pageW / 2, 290, { align: 'center' })
    doc.text('Monétique Tunisie — HR Manager', 14, 290)
    doc.text(now, pageW - 14, 290, { align: 'right' })
  }

  doc.save(`recap-pointage-${dateFrom}-${dateTo}.pdf`)
}

export default function RecapPage() {
  const { employee } = useAuthStore()
  const today = new Date()
  const [dateFrom, setDateFrom] = useState(today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-01')
  const [dateTo,   setDateTo]   = useState(today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + new Date(today.getFullYear(), today.getMonth()+1, 0).getDate().toString().padStart(2,'0'))
  const [empId,    setEmpId]    = useState('')
  const [search,   setSearch]   = useState('')
  const [expanded, setExpanded] = useState({})

  const { data: empData } = useQuery({
    queryKey: ['employees-list'],
    queryFn: () => employeesAPI.list({}).then(r => r.data),
  })

  const { data: attData, isLoading } = useQuery({
    queryKey: ['attendance-recap', dateFrom, dateTo, empId],
    queryFn: () => api.get('/attendance', { params: { date_from: dateFrom, date_to: dateTo, employee_id: empId || undefined }}).then(r => r.data),
  })

  const attendanceByEmp = useMemo(() => {
    const map = {}
    ;(attData?.attendance || []).forEach(r => {
      if (!map[r.employee_id]) map[r.employee_id] = []
      map[r.employee_id].push(r)
    })
    return map
  }, [attData])

  const allEmployees = (empData?.employees || []).sort((a,b) => a.first_name.localeCompare(b.first_name))
  const filteredEmployees = useMemo(() => {
    const q = search.toLowerCase().trim()
    return allEmployees.filter(e => {
      if (!attendanceByEmp[e.id]?.length) return false
      if (!q) return true
      return e.first_name.toLowerCase().includes(q) || e.last_name.toLowerCase().includes(q) || e.matricule.toLowerCase().includes(q)
    })
  }, [allEmployees, attendanceByEmp, search])

  const pieData = useMemo(() => {
    const counts = { present:0, absent:0, late:0, on_leave:0 }
    Object.values(attendanceByEmp).flat().forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++ })
    return [
      { name:'Présent',  value:counts.present,  color:COLORS.present  },
      { name:'Absent',   value:counts.absent,   color:COLORS.absent   },
      { name:'Retard',   value:counts.late,     color:COLORS.late     },
      { name:'Congé',    value:counts.on_leave, color:COLORS.on_leave },
    ].filter(d => d.value > 0)
  }, [attendanceByEmp])

  const selectedEmp = search.trim() && filteredEmployees.length === 1 ? filteredEmployees[0] : null
  const targetEmpId = empId || (selectedEmp?.id)

  const { data: scheduleStats } = useQuery({
    queryKey: ['schedule-stats-recap', targetEmpId, dateFrom, dateTo],
    queryFn: () => api.get('/attendance/stats-by-schedule/' + targetEmpId, { params: { year: new Date(dateFrom).getFullYear() } }).then(r => r.data),
    enabled: !!targetEmpId,
  })

  const hoursData = useMemo(() => {
    const emps = selectedEmp ? [selectedEmp] : filteredEmployees
    return emps.map(emp => ({ name: emp.last_name, heures: computeRecap(attendanceByEmp[emp.id]||[]).total_heures })).sort((a,b) => b.heures - a.heures)
  }, [filteredEmployees, attendanceByEmp, selectedEmp])

  const evolutionData = useMemo(() => {
    const records = selectedEmp ? (attendanceByEmp[selectedEmp.id] || []) : Object.values(attendanceByEmp).flat()
    const byDate = {}
    records.forEach(r => {
      const d = String(r.date).split('T')[0]
      if (!byDate[d]) byDate[d] = { present:0, absent:0, late:0 }
      if (r.status === 'present') byDate[d].present++
      else if (r.status === 'absent') byDate[d].absent++
      else if (r.status === 'late') byDate[d].late++
    })
    return Object.entries(byDate).sort(([a],[b]) => a > b ? 1 : -1).map(([date, v]) => ({ date: format(new Date(date), 'dd/MM', { locale: fr }), ...v }))
  }, [attendanceByEmp, selectedEmp])

  const toggleExpand = id => setExpanded(p => ({ ...p, [id]: !p[id] }))
  const expandAll    = () => { const a={}; filteredEmployees.forEach(e=>a[e.id]=true); setExpanded(a) }
  const collapseAll  = () => setExpanded({})
  const monthLabel = dateFrom + ' au ' + dateTo

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Récapitulatif Mensuel</h1>
          <p className="text-gray-400 text-sm mt-1">{monthLabel}</p>
        </div>
        <button onClick={() => exportPDF(filteredEmployees, attendanceByEmp, dateFrom, dateTo)} className="btn-primary flex items-center gap-2">
          <Download size={16} /> Exporter PDF
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <input type="date" className="input w-40" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <span className="text-gray-400">au</span>
        <input type="date" className="input w-40" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        <select className="input w-52" value={empId} onChange={e => setEmpId(e.target.value)}>
          <option value="">Tous les employés</option>
          {allEmployees.map(e => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
        </select>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-8 w-52" placeholder="Nom, prénom ou matricule..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button onClick={expandAll}   className="btn-secondary text-xs px-3">Tout déplier</button>
        <button onClick={collapseAll} className="btn-secondary text-xs px-3">Tout replier</button>
      </div>

      {!isLoading && Object.keys(attendanceByEmp).length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="card">
            <h2 className="text-sm font-semibold text-gray-300 mb-4">Répartition globale équipe</h2>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} dataKey="value" paddingAngle={3}>
                  {pieData.map((e,i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip formatter={(v,n) => [v+' jours', n]} contentStyle={{ background:'#1f2937', border:'1px solid #374151', borderRadius:'8px' }} itemStyle={{ color:'#f9fafb' }} />
                <Legend formatter={v => <span className="text-xs text-gray-400">{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="card">
            <h2 className="text-sm font-semibold text-gray-300 mb-4">Heures travaillées par employé</h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={hoursData} margin={{ top:5, right:5, left:-15, bottom:5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="name" tick={{ fill:'#9ca3af', fontSize:10 }} />
                <YAxis tick={{ fill:'#9ca3af', fontSize:10 }} unit="h" />
                <Tooltip contentStyle={{ background:'#1f2937', border:'1px solid #374151', borderRadius:'8px' }} itemStyle={{ color:'#f9fafb' }} formatter={v => [v+'h','Heures']} />
                <Bar dataKey="heures" fill="#3b82f6" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="card">
            <h2 className="text-sm font-semibold text-gray-300 mb-4">Évolution présence sur le mois</h2>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={evolutionData} margin={{ top:5, right:5, left:-15, bottom:5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="date" tick={{ fill:'#9ca3af', fontSize:9 }} interval={4} />
                <YAxis tick={{ fill:'#9ca3af', fontSize:10 }} />
                <Tooltip contentStyle={{ background:'#1f2937', border:'1px solid #374151', borderRadius:'8px' }} itemStyle={{ color:'#f9fafb' }} />
                <Legend formatter={v => <span className="text-xs text-gray-400">{v}</span>} />
                <Line type="monotone" dataKey="present" stroke={COLORS.present} strokeWidth={2} dot={false} name="Présent" />
                <Line type="monotone" dataKey="late"    stroke={COLORS.late}    strokeWidth={2} dot={false} name="Retard" />
                <Line type="monotone" dataKey="absent"  stroke={COLORS.absent}  strokeWidth={2} dot={false} name="Absent" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-4 text-xs text-gray-500">
        <span><span className="text-green-400 font-bold">P</span> Présent</span>
        <span><span className="text-red-400 font-bold">A</span> Absent</span>
        <span><span className="text-yellow-400 font-bold">R</span> Retard</span>
        <span><span className="text-blue-400 font-bold">C</span> Congé</span>
        <span><span className="text-yellow-400">Ret.M</span> Retard matin</span>
        <span><span className="text-orange-400">Ret.APM</span> Retard APM</span>
        <span><span className="text-red-400">S.Ant.M</span> Sortie anticipée matin</span>
        <span><span className="text-red-400">S.Ant.S</span> Sortie anticipée soir</span>
      </div>

      {scheduleStats?.monthly && scheduleStats.monthly.length > 0 && targetEmpId && (
        <div className="card">
          <h2 className="text-base font-semibold mb-4">Cumul mensuel {new Date().getFullYear()}</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-800">
                <th className="text-left px-3 py-2 text-gray-400 font-medium">Mois</th>
                <th className="text-center px-3 py-2 text-gray-400 font-medium">Jours</th>
                <th className="text-center px-3 py-2 text-gray-400 font-medium">H. travaillées</th>
                <th className="text-center px-3 py-2 text-gray-400 font-medium">H. requises</th>
                <th className="text-center px-3 py-2 text-gray-400 font-medium">Écart</th>
              </tr></thead>
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

      {scheduleStats?.stats && scheduleStats.stats.length > 0 && targetEmpId && (
        <div className="card">
          <h2 className="text-base font-semibold mb-4">Pointages par horaire</h2>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-800">
              <th className="text-left px-3 py-2 text-gray-400 font-medium">Type horaire</th>
              <th className="text-center px-3 py-2 text-gray-400 font-medium">Nb jours</th>
              <th className="text-center px-3 py-2 text-gray-400 font-medium">Moy. entrée</th>
              <th className="text-center px-3 py-2 text-gray-400 font-medium">Moy. sortie</th>
              <th className="text-center px-3 py-2 text-gray-400 font-medium">Moy. durée</th>
            </tr></thead>
            <tbody>
              {scheduleStats.stats.map((s, i) => (
                <tr key={i} className="table-row">
                  <td className="px-3 py-2 text-gray-200">{s.horaire || 'Non défini'}</td>
                  <td className="px-3 py-2 text-center text-gray-300">{s.nb_jours}</td>
                  <td className="px-3 py-2 text-center text-blue-300 font-mono">{s.moy_entree || '—'}</td>
                  <td className="px-3 py-2 text-center text-blue-300 font-mono">{s.moy_sortie || '—'}</td>
                  <td className="px-3 py-2 text-center text-green-400 font-mono">{s.moy_duree ? s.moy_duree + 'h' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {scheduleStats?.stats && targetEmpId && (() => {
        const empRecords = attendanceByEmp[targetEmpId] || []
        const recap = computeRecap(empRecords)
        const kpisData = {
          present: empRecords.filter(r => r.status === 'present').length,
          late: empRecords.filter(r => r.status === 'late').length,
          absent: empRecords.filter(r => r.status === 'absent').length,
          teletravail: empRecords.filter(r => r.status === 'teletravail').length,
          on_leave: empRecords.filter(r => r.status === 'on_leave').length,
          avg_hours: recap.total_heures && recap.present ? (recap.total_heures / recap.present).toFixed(2) : null
        }
        return <AttendanceAnalysis kpis={kpisData} scheduleStats={scheduleStats.stats} />
      })()}

      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900">
                <th className="text-left px-4 py-3 text-gray-400 font-medium">
                  Employé {search && <span className="text-blue-400 text-xs">({filteredEmployees.length} résultat{filteredEmployees.length>1?'s':''})</span>}
                </th>
                <th className="px-3 py-3 text-green-400 font-medium text-center">Prés.</th>
                <th className="px-3 py-3 text-red-400 font-medium text-center">Abs.</th>
                <th className="px-3 py-3 text-yellow-400 font-medium text-center">Ret.</th>
                <th className="px-3 py-3 text-blue-400 font-medium text-center">Congé</th>
                <th className="px-3 py-3 text-green-400 font-medium text-center">Récup.</th>
                <th className="px-3 py-3 text-gray-400 font-medium text-center">Heures</th>
                <th className="px-3 py-3 text-yellow-400 font-medium text-center">Ret.M</th>
                <th className="px-3 py-3 text-orange-400 font-medium text-center">Ret.APM</th>
                <th className="px-3 py-3 text-red-400 font-medium text-center">S.Ant.M</th>
                <th className="px-3 py-3 text-red-400 font-medium text-center">S.Ant.S</th>
                <th className="px-3 py-3 text-yellow-300 font-medium text-center">Min.Ret</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={12} className="text-center py-10 text-gray-500">Chargement...</td></tr>
              ) : filteredEmployees.length === 0 ? (
                <tr><td colSpan={12} className="text-center py-10 text-gray-500">{search ? `Aucun résultat pour "${search}"` : 'Aucune donnée'}</td></tr>
              ) : filteredEmployees.map(emp => (
                <SummaryRow key={emp.id} emp={emp} records={attendanceByEmp[emp.id]||[]} expanded={!!expanded[emp.id]} onToggle={() => toggleExpand(emp.id)} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
