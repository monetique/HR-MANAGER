import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Star, Target, X, Check, BarChart2, Award, FileText } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import api from '../api/client'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const CATEGORY_LABELS = {
  directeur:     'Directeur',
  chef_division: 'Chef de Division',
  cadre:         'Cadre',
  employe:       'Employé',
}

const STATUS_CAMPAIGN = {
  draft:  { label: 'Brouillon', cls: 'bg-gray-500/10 text-gray-400' },
  active: { label: 'Active',    cls: 'bg-green-500/10 text-green-400' },
  closed: { label: 'Clôturée',  cls: 'bg-red-500/10 text-red-400' },
}

const STATUS_EVAL = {
  pending:         { label: 'En attente',      cls: 'bg-yellow-500/10 text-yellow-400' },
  in_progress:     { label: 'En cours',        cls: 'bg-blue-500/10 text-blue-400' },
  submitted:       { label: 'Soumise',         cls: 'bg-purple-500/10 text-purple-400' },
  pending_manager: { label: 'Attente manager', cls: 'bg-orange-500/10 text-orange-400' },
  rh_approved:     { label: 'Approuvée RH',    cls: 'bg-green-500/10 text-green-400' },
  completed:       { label: 'Complétée',       cls: 'bg-green-500/10 text-green-400' },
  rejected:        { label: 'Rejetée',         cls: 'bg-red-500/10 text-red-400' },
}

function ScoreBadge({ score, total }) {
  if (score === null || score === undefined) return <span className="text-gray-500 text-sm">—</span>
  const s   = parseFloat(score)
  const max = parseFloat(total || 20)
  const pct = (s / max) * 100
  const color = pct >= 80 ? 'text-green-400' : pct >= 60 ? 'text-blue-400' : pct >= 40 ? 'text-yellow-400' : 'text-red-400'
  return <span className={`font-bold text-lg ${color}`}>{s.toFixed(2)}<span className="text-gray-500 text-sm">/{max}</span></span>
}

// ─── Formulaire évaluation ───────────────────────────────────────────────────
function EvaluationForm({ evalId, onClose, readOnly }) {
  const qc = useQueryClient()
  const [scores, setScores]             = useState({})
  const [comments, setComments]         = useState({})
  const [globalComment, setGlobalComment] = useState('')
  const [loaded, setLoaded]             = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['evaluation-detail', evalId],
    queryFn: () => api.get('/evaluations/' + evalId).then(r => r.data),
  })

  React.useEffect(() => {
    if (data && !loaded) {
      const s = {}
      const c = {}
      ;(data.scores || []).forEach(sc => {
        s[sc.criteria_id] = sc.score
        c[sc.criteria_id] = sc.comment || ''
      })
      setScores(s)
      setComments(c)
      setGlobalComment(data.evaluation?.comment || '')
      setLoaded(true)
    }
  }, [data, loaded])

  const saveMutation = useMutation({
    mutationFn: (d) => api.put('/evaluations/' + evalId, d),
    onSuccess: () => { toast.success('Évaluation enregistrée'); qc.invalidateQueries(['evaluations']); onClose() },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur')
  })

  const validateMutation = useMutation({
    mutationFn: ({ action, comment }) => api.post(`/evaluations/${evalId}/validate`, { action, comment }),
    onSuccess: () => { toast.success('Validation enregistrée'); qc.invalidateQueries(['evaluations']); onClose() },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur')
  })

  const handleSubmit = (status) => {
    const scoreList = Object.entries(scores).map(([criteria_id, score]) => ({
      criteria_id: parseInt(criteria_id),
      score: parseFloat(score) || 0,
      comment: comments[criteria_id] || ''
    }))
    saveMutation.mutate({ scores: scoreList, comment: globalComment, status })
  }

  const handlePDF = async () => {
    if (!data) return
    const ev    = data.evaluation
    const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageW = doc.internal.pageSize.getWidth()
    const now   = new Date().toLocaleDateString('fr-FR')

    // En-tête
    doc.setFillColor(30, 41, 59)
    doc.rect(0, 0, pageW, 30, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text('Fiche d\'Évaluation', 14, 13)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text(`${ev.employee_name} — ${CATEGORY_LABELS[ev.employee_category] || ev.grid_label}`, 14, 22)
    doc.text(`Généré le ${now}`, pageW - 58, 22)

    let y = 38
    doc.setTextColor(30, 41, 59)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text(`Campagne: ${ev.campaign_title}`, 14, y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(100)
    doc.text(`Évaluateur: ${ev.evaluator_name}  |  Statut: ${STATUS_EVAL[ev.status]?.label || ev.status}`, 14, y + 6)
    y += 16

    ;(data.sections || []).forEach(section => {
      if (y > 250) { doc.addPage(); y = 20 }
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(59, 130, 246)
      doc.text(section.name, 14, y)
      y += 4

      const rows = (section.criteria || []).map(c => {
        const score = scores[c.id] !== undefined ? scores[c.id] : (data.scores?.find(s => s.criteria_id === c.id)?.score ?? '—')
        return [
          `${c.code ? c.code + ' — ' : ''}${c.label}`,
          `${c.max_points} pts`,
          score !== '—' ? `${parseFloat(score).toFixed(2)} / ${c.max_points}` : '—',
        ]
      })

      autoTable(doc, {
        startY: y,
        head: [['Critère', 'Barème', 'Note']],
        body: rows,
        theme: 'striped',
        headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 8, fontStyle: 'bold' },
        bodyStyles: { fontSize: 8 },
        columnStyles: { 0: { cellWidth: 130 }, 1: { cellWidth: 20, halign: 'center' }, 2: { cellWidth: 25, halign: 'center', fontStyle: 'bold' } },
        margin: { left: 14, right: 14 },
      })
      y = doc.lastAutoTable.finalY + 8
    })

    if (y > 260) { doc.addPage(); y = 20 }
    const totalScore = Object.values(scores).reduce((a, b) => a + (parseFloat(b) || 0), 0)
    doc.setFillColor(30, 41, 59)
    doc.rect(14, y, pageW - 28, 14, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text(`Score total: ${totalScore.toFixed(2)} / ${ev.total_points || 20}`, pageW / 2, y + 9, { align: 'center' })
    y += 20

    if (globalComment) {
      doc.setTextColor(80)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'italic')
      doc.text(`Commentaire: ${globalComment}`, 14, y)
    }

    // Pied de page + logo sur toutes les pages
    const pageCount = doc.internal.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFontSize(7)
      doc.setTextColor(150)
      doc.text(`Page ${i}/${pageCount}`, pageW / 2, 290, { align: 'center' })
      doc.text('Monétique Tunisie — HR Manager', 14, 290)
      doc.text(now, pageW - 14, 290, { align: 'right' })
    }

    doc.save(`evaluation-${ev.employee_name?.replace(/ /g, '-')}-${ev.campaign_title?.replace(/ /g, '-')}.pdf`)
  }

  if (isLoading) return <div className="text-center py-10 text-gray-500">Chargement...</div>
  if (!data) return null

  const ev       = data.evaluation
  const sections = data.sections || []
  const kpis     = data.kpis || {}
  const isReadOnly = readOnly || ['completed', 'rh_approved'].includes(ev?.status)

  const totalScore = sections.reduce((total, section) => {
    return total + (section.criteria || []).reduce((st, c) => st + (parseFloat(scores[c.id]) || 0), 0)
  }, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-white text-lg">{ev.employee_name}</h2>
          <p className="text-gray-400 text-sm">
            {ev.campaign_title} • <span className="ml-1 text-blue-400">{CATEGORY_LABELS[ev.employee_category] || ev.grid_label}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handlePDF} className="btn-secondary flex items-center gap-2 text-sm">
            <FileText size={14} /> PDF
          </button>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-200"><X size={20} /></button>
        </div>
      </div>

      {kpis && (
        <div className="card">
          <h3 className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
            <BarChart2 size={16} className="text-blue-400" /> Présence (année en cours)
          </h3>
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Présents',    value: kpis.present,   color: 'text-green-400' },
              { label: 'Retards',     value: kpis.late,      color: 'text-yellow-400' },
              { label: 'Absents',     value: kpis.absent,    color: 'text-red-400' },
              { label: 'Moy. heures', value: kpis.avg_hours ? kpis.avg_hours + 'h' : '—', color: 'text-blue-400' },
            ].map(k => (
              <div key={k.label} className="text-center p-3 bg-gray-800/50 rounded-lg">
                <p className={`text-xl font-bold ${k.color}`}>{k.value ?? 0}</p>
                <p className="text-xs text-gray-500 mt-1">{k.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card bg-blue-500/5 border border-blue-500/20">
        <div className="flex items-center justify-between">
          <span className="text-gray-400 text-sm">Score en cours</span>
          <ScoreBadge score={totalScore} total={ev.total_points || 20} />
        </div>
        <div className="mt-2 h-2 bg-gray-800 rounded-full overflow-hidden">
          <div className="h-full bg-blue-500 rounded-full transition-all"
            style={{ width: `${Math.min((totalScore / (ev.total_points || 20)) * 100, 100)}%` }} />
        </div>
      </div>

      {sections.map(section => (
        <div key={section.id} className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-blue-400 text-sm uppercase tracking-wide">{section.name}</h3>
            <span className="text-xs text-gray-500">
              {(section.criteria || []).reduce((s, c) => s + (parseFloat(scores[c.id]) || 0), 0).toFixed(2)}
              {' / '}
              {(section.criteria || []).reduce((s, c) => s + parseFloat(c.max_points), 0).toFixed(2)} pts
            </span>
          </div>
          <div className="space-y-4">
            {(section.criteria || []).map(c => (
              <div key={c.id} className="border-b border-gray-800 pb-4 last:border-0 last:pb-0">
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div className="flex-1">
                    {c.code && <span className="text-xs text-blue-400 font-mono mr-2">{c.code}</span>}
                    <span className="text-gray-200 text-sm">{c.label}</span>
                  </div>
                  <span className="text-xs text-gray-500 whitespace-nowrap">/ {c.max_points} pts</span>
                </div>
                {!isReadOnly ? (
                  <div className="flex items-center gap-3">
                    <input type="number" min="0" max={c.max_points} step="0.25"
                      className="input w-24 text-center font-bold text-blue-400"
                      value={scores[c.id] ?? ''} placeholder="0"
                      onChange={e => {
                        const val = Math.min(parseFloat(e.target.value) || 0, parseFloat(c.max_points))
                        setScores(s => ({ ...s, [c.id]: val }))
                      }} />
                    <input type="text" className="input flex-1 text-xs"
                      placeholder="Commentaire optionnel..."
                      value={comments[c.id] || ''}
                      onChange={e => setComments(cm => ({ ...cm, [c.id]: e.target.value }))} />
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <span className="text-blue-400 font-bold">
                      {scores[c.id] !== undefined ? `${parseFloat(scores[c.id]).toFixed(2)} / ${c.max_points}` : '—'}
                    </span>
                    {comments[c.id] && <span className="text-gray-500 text-xs italic">{comments[c.id]}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="card">
        <label className="label">Commentaire général</label>
        <textarea className="input h-24 resize-none" value={globalComment}
          onChange={e => setGlobalComment(e.target.value)} disabled={isReadOnly}
          placeholder="Observations générales, points forts, axes d'amélioration..." />
      </div>

      {!isReadOnly && (
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">Annuler</button>
          <button onClick={() => handleSubmit('in_progress')} className="btn-secondary flex-1">Sauvegarder brouillon</button>
          <button onClick={() => handleSubmit('submitted')} className="btn-primary flex-1 flex items-center justify-center gap-2">
            <Check size={16} /> Soumettre
          </button>
        </div>
      )}

      {['submitted', 'pending_manager'].includes(ev?.status) && (
        <div className="card border border-yellow-500/30">
          <h3 className="text-sm font-medium text-yellow-400 mb-3">Action requise — Validation</h3>
          <div className="flex gap-3">
            <button onClick={() => validateMutation.mutate({ action: 'rejected', comment: globalComment })} className="btn-danger flex-1">✗ Rejeter</button>
            <button onClick={() => validateMutation.mutate({ action: 'approved', comment: globalComment })} className="btn-primary flex-1">✓ Approuver</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Onglet Évaluations ──────────────────────────────────────────────────────
function EvaluationsTab() {
  const { hasRole } = useAuthStore()
  const [selectedEval, setSelectedEval] = useState(null)
  const [filterStatus, setFilterStatus] = useState('')

  const { data } = useQuery({
    queryKey: ['evaluations', filterStatus],
    queryFn: () => api.get('/evaluations', { params: { status: filterStatus || undefined } }).then(r => r.data),
  })

  const evaluations = data?.evaluations || []
  const isEmployee  = !hasRole('superadmin', 'rh', 'manager')

  if (selectedEval) {
    return <EvaluationForm evalId={selectedEval.id} readOnly={selectedEval.readOnly} onClose={() => setSelectedEval(null)} />
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-white">Évaluations</h2>
        <select className="input w-44" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Tous les statuts</option>
          {Object.entries(STATUS_EVAL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {evaluations.length === 0 ? (
        <div className="card text-center py-12">
          <Award size={40} className="text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">Aucune évaluation</p>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-4 py-3 text-gray-400">Employé</th>
                <th className="text-left px-4 py-3 text-gray-400">Catégorie</th>
                <th className="text-left px-4 py-3 text-gray-400">Campagne</th>
                <th className="text-left px-4 py-3 text-gray-400">Statut</th>
                <th className="text-left px-4 py-3 text-gray-400">Score</th>
                <th className="text-left px-4 py-3 text-gray-400">Action</th>
              </tr>
            </thead>
            <tbody>
              {evaluations.map(e => (
                <tr key={e.id} className="table-row">
                  <td className="px-4 py-3">
                    <p className="text-gray-200 font-medium">{e.employee_name}</p>
                    <p className="text-gray-500 text-xs">{e.matricule}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="badge bg-blue-500/10 text-blue-400 text-xs">{CATEGORY_LABELS[e.employee_category] || '—'}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-300 text-xs">{e.campaign_title}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${STATUS_EVAL[e.status]?.cls || 'bg-gray-500/10 text-gray-400'}`}>{STATUS_EVAL[e.status]?.label || e.status}</span>
                  </td>
                  <td className="px-4 py-3"><ScoreBadge score={e.current_score} total={e.total_points} /></td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setSelectedEval({ id: e.id, readOnly: isEmployee || ['completed','rh_approved'].includes(e.status) })}
                      className="btn-primary py-1 px-3 text-xs"
                    >
                      {isEmployee || ['completed','rh_approved'].includes(e.status) ? 'Voir'
                        : ['pending_manager','submitted'].includes(e.status) && hasRole('superadmin','rh','manager') ? 'Valider'
                        : 'Évaluer'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Onglet Campagnes ────────────────────────────────────────────────────────
function CampaignsTab() {
  const qc = useQueryClient()
  const { hasRole } = useAuthStore()
  const isRH = hasRole('superadmin', 'rh')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', deadline: '', employee_ids: [] })

  const { data: campaigns } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => api.get('/evaluations/campaigns').then(r => r.data),
  })
  const { data: empData } = useQuery({
    queryKey: ['my-employees'],
    queryFn: () => api.get('/evaluations/my-employees').then(r => r.data),
    enabled: isRH,
  })

  const createMutation = useMutation({
    mutationFn: (d) => api.post('/evaluations/campaigns', d),
    onSuccess: () => { toast.success('Campagne créée'); qc.invalidateQueries(['campaigns']); setShowForm(false) }
  })
  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => api.put(`/evaluations/campaigns/${id}/status`, { status }),
    onSuccess: () => { toast.success('Statut mis à jour'); qc.invalidateQueries(['campaigns']) }
  })

  const employees = (empData?.employees || []).sort((a, b) => a.first_name.localeCompare(b.first_name))
  const toggleEmp = (id) => setForm(f => ({
    ...f,
    employee_ids: f.employee_ids.includes(id) ? f.employee_ids.filter(e => e !== id) : [...f.employee_ids, id]
  }))

  const byCategory = employees.reduce((acc, e) => {
    const cat = e.employee_category || 'non_defini'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(e)
    return acc
  }, {})

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-white">Campagnes d'évaluation</h2>
        {isRH && (
          <button onClick={() => setShowForm(true)} className="btn-primary text-sm flex items-center gap-2">
            <Plus size={14} /> Nouvelle campagne
          </button>
        )}
      </div>

      {showForm && isRH && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-white">Nouvelle campagne</h3>
            <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-200"><X size={18} /></button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Titre *</label>
              <input className="input" value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="Ex: Évaluation annuelle 2026" />
            </div>
            <div>
              <label className="label">Date limite</label>
              <input type="date" className="input" value={form.deadline} onChange={e => setForm({...form, deadline: e.target.value})} />
            </div>
            <div className="col-span-2">
              <label className="label">Description</label>
              <textarea className="input h-16 resize-none" value={form.description} onChange={e => setForm({...form, description: e.target.value})} />
            </div>
          </div>
          <div>
            <label className="label">Employés à évaluer ({form.employee_ids.length} sélectionné(s))</label>
            <div className="space-y-3 max-h-64 overflow-y-auto p-2 bg-gray-800/50 rounded-lg">
              {Object.entries(byCategory).map(([cat, emps]) => (
                <div key={cat}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-blue-400 uppercase">{CATEGORY_LABELS[cat] || cat}</span>
                    <button type="button" onClick={() => {
                      const ids = emps.map(e => e.id)
                      const allSelected = ids.every(id => form.employee_ids.includes(id))
                      setForm(f => ({ ...f, employee_ids: allSelected ? f.employee_ids.filter(id => !ids.includes(id)) : [...new Set([...f.employee_ids, ...ids])] }))
                    }} className="text-xs text-gray-400 hover:text-blue-400">Tout sélectionner</button>
                  </div>
                  <div className="grid grid-cols-2 gap-1 pl-2">
                    {emps.map(e => (
                      <label key={e.id} className="flex items-center gap-2 cursor-pointer p-1 hover:bg-gray-700/50 rounded">
                        <input type="checkbox" checked={form.employee_ids.includes(e.id)} onChange={() => toggleEmp(e.id)} />
                        <span className="text-sm text-gray-300">{e.first_name} {e.last_name}</span>
                        <span className="text-xs text-gray-500">{e.matricule}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">Annuler</button>
            <button onClick={() => createMutation.mutate(form)} className="btn-primary flex-1">Créer la campagne</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {(campaigns?.campaigns || []).map(c => {
          const total     = parseInt(c.total_evaluations) || 0
          const completed = parseInt(c.completed_evaluations) || 0
          const progress  = total > 0 ? Math.round(completed / total * 100) : 0
          return (
            <div key={c.id} className="card">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-semibold text-white">{c.title}</h3>
                    <span className={`badge ${STATUS_CAMPAIGN[c.status]?.cls}`}>{STATUS_CAMPAIGN[c.status]?.label}</span>
                  </div>
                  <p className="text-gray-400 text-xs mb-3">
                    Créé par {c.created_by_name} • {format(new Date(c.created_at), 'dd MMM yyyy', { locale: fr })}
                    {c.deadline && ` • Deadline: ${format(new Date(c.deadline), 'dd MMM yyyy', { locale: fr })}`}
                  </p>
                  {c.description && <p className="text-gray-400 text-sm mb-3">{c.description}</p>}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
                    </div>
                    <span className="text-xs text-gray-400">{completed}/{total} ({progress}%)</span>
                  </div>
                </div>
                {isRH && c.status === 'active' && (
                  <button onClick={() => statusMutation.mutate({ id: c.id, status: 'closed' })} className="btn-secondary text-xs ml-4">Clôturer</button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Page principale ─────────────────────────────────────────────────────────
export default function EvaluationsPage() {
  const { hasRole } = useAuthStore()
  const [tab, setTab] = useState('evaluations')

  const tabs = [
    { id: 'evaluations', label: 'Évaluations', icon: Star },
    ...(hasRole('superadmin', 'rh', 'manager') ? [{ id: 'campaigns', label: 'Campagnes', icon: Target }] : []),
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Évaluations des compétences</h1>
        <p className="text-gray-400 text-sm mt-1">Gérez les campagnes d'évaluation par catégorie</p>
      </div>
      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'}`}>
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>
      {tab === 'evaluations' && <EvaluationsTab />}
      {tab === 'campaigns'   && <CampaignsTab />}
    </div>
  )
}
