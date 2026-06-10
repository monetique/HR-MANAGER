import React, { useState, useEffect } from 'react'
import { Clock, Settings, Calendar, Mail, FileText, Plus, Star, Users, Shield } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../api/client'
import { useAuthStore } from '../store/authStore'
import toast from 'react-hot-toast'
import SchedulesSettings from '../components/settings/SchedulesSettings'
import EvalGridConfig from '../components/settings/EvalGridConfig'
import MailSettings from '../components/settings/MailSettings'
import LeaveTypesSettings from '../components/settings/LeaveTypesSettings'

const tabs = [
  { id: 'schedules',    label: 'Horaires de travail', icon: Clock },
  { id: 'eval_grids',  label: 'Grilles évaluation',  icon: Star },
  { id: 'holidays',    label: 'Jours fériés',         icon: Calendar },
  { id: 'general',     label: 'Général',              icon: Settings },
  { id: 'mail',        label: 'Email',                icon: Mail },
  { id: 'leaves',      label: 'Types de congé',       icon: FileText },
  { id: 'versement',   label: 'Versement Congés',     icon: Calendar },
  { id: 'hr_assistant',label: 'Assistante RH',        icon: Users },
]

// ── Jours fériés ──────────────────────────────────────────
function HolidaysTab() {
  const qc = useQueryClient()
  const [form, setForm] = useState({ name: '', date_from: '', date_to: '' })

  const { data, isLoading } = useQuery({
    queryKey: ['holidays'],
    queryFn: () => api.get('/config/holidays').then(r => r.data),
  })

  const addMutation = useMutation({
    mutationFn: (data) => api.post('/config/holidays', data),
    onSuccess: () => { toast.success('Jour férié ajouté'); qc.invalidateQueries(['holidays']); setForm({ name: '', date_from: '', date_to: '' }) },
    onError: err => toast.error(err.response?.data?.error || 'Erreur'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/config/holidays/${id}`),
    onSuccess: () => { toast.success('Supprimé'); qc.invalidateQueries(['holidays']) },
  })

  return (
    <div className="space-y-4">
      <div className="card">
        <h3 className="text-sm font-medium text-gray-300 mb-4">Ajouter un jour férié</h3>
        <div className="flex gap-3">
          <input className="input flex-1" placeholder="Nom du jour férié"
            value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
          <input type="date" className="input w-36" placeholder="Du"
            value={form.date_from} onChange={e => setForm({...form, date_from: e.target.value})} />
          <input type="date" className="input w-36" placeholder="Au"
            value={form.date_to} onChange={e => setForm({...form, date_to: e.target.value || form.date_from})} />
          <button onClick={() => addMutation.mutate(form)} className="btn-primary px-4"
            disabled={!form.name || !form.date_from}>
            Ajouter
          </button>
        </div>
      </div>
      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left px-4 py-3 text-gray-400 font-medium">Nom</th>
              <th className="text-left px-4 py-3 text-gray-400 font-medium">Date</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={3} className="text-center py-8 text-gray-500">Chargement...</td></tr>
            ) : data?.holidays?.length === 0 ? (
              <tr><td colSpan={3} className="text-center py-8 text-gray-500">Aucun jour férié</td></tr>
            ) : data?.holidays?.map(h => (
              <tr key={h.id} className="table-row">
                <td className="px-4 py-3 text-gray-200">{h.name}</td>
                <td className="px-4 py-3 text-gray-300">
                  {new Date(h.date).toLocaleDateString('fr-FR')}
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => deleteMutation.mutate(h.id)}
                    className="text-gray-500 hover:text-red-400 text-xs">
                    Supprimer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Config générale ───────────────────────────────────────
function GeneralTab() {
  const [config, setConfig] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/config/general').then(r => setConfig(r.data.config || {})).catch(() => {})
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      await api.put('/config/general', config)
      toast.success('Configuration enregistrée')
    } catch(e) {
      toast.error('Erreur')
    } finally { setSaving(false) }
  }

  return (
    <div className="card max-w-lg space-y-4">
      <h3 className="text-sm font-medium text-gray-300">Paramètres généraux</h3>
      <div>
        <label className="label">Nom de la société</label>
        <input className="input" value={config.company_name || ''}
          onChange={e => setConfig({...config, company_name: e.target.value})} />
      </div>
      <div>
        <label className="label">Préavis minimum congé (jours)</label>
        <input type="number" className="input" value={config.leave_min_days_notice || 2} min="0"
          onChange={e => setConfig({...config, leave_min_days_notice: e.target.value})} />
      </div>
      <div>
        <label className="label">Nombre de valideurs par défaut</label>
        <select className="input" value={config.validation_steps || 2}
          onChange={e => setConfig({...config, validation_steps: e.target.value})}>
          <option value="1">1 valideur</option>
          <option value="2">2 valideurs</option>
          <option value="3">3 valideurs</option>
        </select>
      </div>
      <button onClick={save} disabled={saving} className="btn-primary">
        {saving ? 'Enregistrement...' : 'Enregistrer'}
      </button>
    </div>
  )
}

// ── Onglet Versement Congés ───────────────────────────────
function VersementTab() {
  const qc = useQueryClient()
  const { hasRole } = useAuthStore()
  const isRH = hasRole('superadmin', 'rh')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ year: new Date().getFullYear(), versement_date: '', nb_jours: 22, note: '' })
  const [editId, setEditId] = useState(null)

  const { data } = useQuery({
    queryKey: ['versement-config'],
    queryFn: () => api.get('/leaves/versement-config').then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (d) => api.post('/leaves/versement-config', d),
    onSuccess: () => { toast.success('Configuration créée'); qc.invalidateQueries(['versement-config']); setShowForm(false) }
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, ...d }) => api.put('/leaves/versement-config/' + id, d),
    onSuccess: () => { toast.success('Configuration mise à jour'); qc.invalidateQueries(['versement-config']); setEditId(null) }
  })

  const executeMutation = useMutation({
    mutationFn: (id) => api.post('/leaves/versement-config/' + id + '/execute'),
    onSuccess: (res) => { toast.success(res.data.message); qc.invalidateQueries(['versement-config']) },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur')
  })

  const configs = data?.configs || []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-white">Versement annuel des congés</h2>
          <p className="text-gray-400 text-sm mt-1">Configurez et déclenchez le versement annuel des jours de congé</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Nouvelle config
        </button>
      </div>

      {showForm && (
        <div className="card space-y-4 border border-blue-500/30">
          <h3 className="font-medium text-white">Nouvelle configuration versement</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Année</label>
              <input type="number" className="input" value={form.year}
                onChange={e => setForm({...form, year: e.target.value})} />
            </div>
            <div>
              <label className="label">Date de versement</label>
              <input type="date" className="input" value={form.versement_date}
                onChange={e => setForm({...form, versement_date: e.target.value})} />
            </div>
            <div>
              <label className="label">Nombre de jours à verser</label>
              <input type="number" step="0.5" className="input" value={form.nb_jours}
                onChange={e => setForm({...form, nb_jours: e.target.value})} />
            </div>
            <div>
              <label className="label">Note</label>
              <input className="input" value={form.note}
                onChange={e => setForm({...form, note: e.target.value})}
                placeholder="Ex: Versement annuel congés 2026" />
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">Annuler</button>
            <button onClick={() => createMutation.mutate(form)} className="btn-primary flex-1">Créer</button>
          </div>
        </div>
      )}

      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left px-4 py-3 text-gray-400 font-medium">Année</th>
              <th className="text-left px-4 py-3 text-gray-400 font-medium">Date versement</th>
              <th className="text-center px-4 py-3 text-gray-400 font-medium">Nb jours</th>
              <th className="text-left px-4 py-3 text-gray-400 font-medium">Statut</th>
              <th className="text-left px-4 py-3 text-gray-400 font-medium">Exécuté par</th>
              <th className="text-left px-4 py-3 text-gray-400 font-medium">Note</th>
              <th className="text-left px-4 py-3 text-gray-400 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {configs.map(c => (
              <tr key={c.id} className="table-row">
                <td className="px-4 py-3 text-gray-200 font-bold">{c.year}</td>
                <td className="px-4 py-3 text-gray-300">
                  {editId === c.id ? (
                    <input type="date" className="input text-xs h-8"
                      defaultValue={c.versement_date?.slice(0,10)}
                      onChange={e => setForm({...form, versement_date: e.target.value})} />
                  ) : c.versement_date?.slice(0,10)}
                </td>
                <td className="px-4 py-3 text-center">
                  {editId === c.id ? (
                    <input type="number" step="0.5" className="input text-xs h-8 w-20"
                      defaultValue={c.nb_jours}
                      onChange={e => setForm({...form, nb_jours: e.target.value})} />
                  ) : <span className="text-blue-400 font-bold">{c.nb_jours}j</span>}
                </td>
                <td className="px-4 py-3">
                  <span className={c.status === 'executed'
                    ? 'badge bg-green-500/10 text-green-400'
                    : 'badge bg-yellow-500/10 text-yellow-400'}>
                    {c.status === 'executed' ? '✓ Effectué' : 'En attente'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">
                  {c.executed_by_name || '—'}
                  {c.executed_at && <span className="block text-gray-600">{c.executed_at?.slice(0,10)}</span>}
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">{c.note || '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    {c.status === 'pending' && (
                      <>
                        {editId === c.id ? (
                          <>
                            <button onClick={() => updateMutation.mutate({ id: c.id, ...form })}
                              className="btn-primary text-xs py-1 px-2">Sauvegarder</button>
                            <button onClick={() => setEditId(null)}
                              className="btn-secondary text-xs py-1 px-2">Annuler</button>
                          </>
                        ) : (
                          <button onClick={() => { setEditId(c.id); setForm({versement_date: c.versement_date?.slice(0,10), nb_jours: c.nb_jours, note: c.note}) }}
                            className="btn-secondary text-xs py-1 px-2">Modifier</button>
                        )}
                        {isRH && (
                          <button
                            onClick={() => {
                              if (window.confirm('Confirmer le versement de ' + c.nb_jours + 'j pour tous les employés actifs ?'))
                                executeMutation.mutate(c.id)
                            }}
                            disabled={executeMutation.isPending}
                            className="btn-success text-xs py-1 px-2">
                            ▶ Exécuter
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Onglet Assistante RH ──────────────────────────────────
function HrAssistantTab() {
  const [employees, setEmployees]     = useState([])
  const [assistants, setAssistants]   = useState([])
  const [selectedEmp, setSelectedEmp] = useState('')
  const [editingId, setEditingId]     = useState(null)
  const [privMap, setPrivMap]         = useState({})
  const [saving, setSaving]           = useState(null)

  const PRIVILEGES = [
    { key: 'hr_assistant_can_view_hr_requests',   label: 'Voir les demandes RH' },
    { key: 'hr_assistant_can_change_hr_status',   label: 'Changer statut des demandes RH' },
    { key: 'hr_assistant_can_view_leaves',        label: 'Voir les congés' },
    { key: 'hr_assistant_can_view_employees',     label: 'Voir les employés' },
    { key: 'hr_assistant_can_view_announcements', label: 'Accès aux annonces' },
  ]

  const loadData = async () => {
    try {
      const empRes = await api.get('/employees')
      const all = empRes.data.employees || []
      setEmployees(all.filter(e => !['hr_assistant','superadmin','rh'].includes(e.role) && e.is_active))
      const assts = all.filter(e => e.role === 'hr_assistant' && e.is_active)
      setAssistants(assts)
      const map = {}
      await Promise.all(assts.map(async a => {
        try {
          const r = await api.get(`/config/assistant-privileges/${a.id}`)
          map[a.id] = r.data.privileges || {}
        } catch { map[a.id] = {} }
      }))
      setPrivMap(map)
    } catch { toast.error('Erreur de chargement') }
  }

  useEffect(() => { loadData() }, [])

  const savePrivileges = async (empId) => {
    setSaving(empId)
    try {
      await api.put(`/config/assistant-privileges/${empId}`, { privileges: privMap[empId] || {} })
      toast.success('Privilèges enregistrés')
      setEditingId(null)
    } catch { toast.error('Erreur') }
    finally { setSaving(null) }
  }

  const togglePriv = (empId, key, val) => {
    setPrivMap(prev => ({ ...prev, [empId]: { ...prev[empId], [key]: val } }))
  }

  const addAssistant = async () => {
    if (!selectedEmp) return
    try {
      const emp = employees.find(e => String(e.id) === String(selectedEmp))
      await api.put(`/employees/${selectedEmp}`, {
        first_name: emp.first_name, last_name: emp.last_name,
        email: emp.email, role: 'hr_assistant',
        position_id: emp.position_id, org_unit_id: emp.org_unit_id,
        manager_id: emp.manager_id, hire_date: emp.hire_date,
        phone: emp.phone, is_active: emp.is_active
      })
      toast.success('Assistante RH ajoutée')
      setSelectedEmp('')
      await loadData()
    } catch { toast.error("Erreur lors de l\'ajout") }
  }

  const removeAssistant = async (emp) => {
    try {
      await api.put(`/employees/${emp.id}`, {
        first_name: emp.first_name, last_name: emp.last_name,
        email: emp.email, role: 'employee',
        position_id: emp.position_id, org_unit_id: emp.org_unit_id,
        manager_id: emp.manager_id, hire_date: emp.hire_date,
        phone: emp.phone, is_active: emp.is_active
      })
      toast.success('Rôle retiré')
      await loadData()
    } catch { toast.error('Erreur') }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="card space-y-4">
        <h3 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
          <Users size={16} className="text-blue-400" />
          Assistantes RH
        </h3>
        <div className="flex gap-3">
          <select className="input flex-1" value={selectedEmp} onChange={e => setSelectedEmp(e.target.value)}>
            <option value="">— Sélectionner un employé —</option>
            {employees.map(e => (
              <option key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.matricule})</option>
            ))}
          </select>
          <button onClick={addAssistant} disabled={!selectedEmp} className="btn-primary px-4">Ajouter</button>
        </div>

        {assistants.length > 0 ? (
          <div className="space-y-4">
            {assistants.map(a => (
              <div key={a.id} className="bg-blue-500/10 border border-blue-500/20 rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3">
                  <div>
                    <span className="text-gray-200 font-medium">{a.first_name} {a.last_name}</span>
                    <span className="text-gray-500 text-xs ml-2">({a.matricule})</span>
                    <span className="ml-2 text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">Assistante RH</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setEditingId(editingId === a.id ? null : a.id)}
                      className="text-xs text-blue-400 hover:text-blue-300 border border-blue-500/30 px-3 py-1 rounded-lg">
                      {editingId === a.id ? 'Fermer' : '⚙️ Privilèges'}
                    </button>
                    <button onClick={() => removeAssistant(a)} className="text-xs text-red-400 hover:text-red-300">
                      Retirer
                    </button>
                  </div>
                </div>
                {editingId === a.id && (
                  <div className="border-t border-blue-500/20 px-4 py-4 bg-gray-900/50 space-y-3">
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Privilèges de {a.first_name}</p>
                    {PRIVILEGES.map(p => (
                      <label key={p.key} className="flex items-center gap-3 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={privMap[a.id]?.[p.key] === true}
                          onChange={e => togglePriv(a.id, p.key, e.target.checked)}
                          className="w-4 h-4 rounded accent-blue-500"
                        />
                        <span className="text-gray-300 text-sm group-hover:text-white">{p.label}</span>
                      </label>
                    ))}
                    <button onClick={() => savePrivileges(a.id)} disabled={saving === a.id} className="btn-primary text-sm mt-2">
                      {saving === a.id ? 'Enregistrement...' : 'Enregistrer'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">Aucune assistante RH configurée</p>
        )}
      </div>
    </div>
  )
}
// ── Page principale ───────────────────────────────────────
export default function ConfigPage() {
  const [activeTab, setActiveTab] = useState('schedules')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Configuration</h1>
        <p className="text-gray-400 text-sm mt-1">Paramètres de l'application RH</p>
      </div>

      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 flex-wrap">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
            }`}>
            <tab.icon size={15} />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'schedules'    && <SchedulesSettings />}
      {activeTab === 'eval_grids'  && <EvalGridConfig />}
      {activeTab === 'holidays'    && <HolidaysTab />}
      {activeTab === 'general'     && <GeneralTab />}
      {activeTab === 'mail'        && <MailSettings />}
      {activeTab === 'versement'   && <VersementTab />}
      {activeTab === 'leaves'      && <LeaveTypesSettings />}
      {activeTab === 'hr_assistant'&& <HrAssistantTab key='hr_assistant' />}
    </div>
  )
}
