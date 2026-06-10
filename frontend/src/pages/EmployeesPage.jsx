import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Edit, UserX, UserCheck, KeyRound } from 'lucide-react'
import api, { employeesAPI, orgAPI } from '../api/client'
import { useAuthStore } from '../store/authStore'
import toast from 'react-hot-toast'

// ── Modal réinitialisation mot de passe ───────────────────
function ResetPasswordModal({ employee, onClose }) {
  const [newPassword, setNewPassword] = useState('REDACTED_PASSWORD')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  const handleReset = async () => {
    if (!newPassword || newPassword.length < 6) {
      toast.error('Le mot de passe doit contenir au moins 6 caractères')
      return
    }
    setSaving(true)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/auth/reset-password/${employee.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ newPassword })
      })
      const data = await res.json()
      if (data.success) {
        setDone(true)
        toast.success(data.message)
      } else {
        toast.error(data.error || 'Erreur')
      }
    } catch {
      toast.error('Erreur réseau')
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-md">
        <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
          <KeyRound size={18} className="text-yellow-400" />
          Réinitialiser le mot de passe
        </h3>
        <p className="text-gray-400 text-sm mb-5">
          Employé : <strong className="text-gray-200">{employee.first_name} {employee.last_name}</strong>
          <span className="text-gray-500 ml-2">({employee.matricule})</span>
        </p>

        {!done ? (
          <div className="space-y-4">
            <div>
              <label className="label">Nouveau mot de passe</label>
              <input
                type="text"
                className="input"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Nouveau mot de passe"
              />
              <p className="text-xs text-gray-500 mt-1">Laissez <code className="text-blue-400">REDACTED_PASSWORD</code> pour le mot de passe par défaut</p>
            </div>
            <div className="flex gap-3">
              <button onClick={onClose} className="btn-secondary flex-1">Annuler</button>
              <button onClick={handleReset} disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
                <KeyRound size={15} />
                {saving ? 'Réinitialisation...' : 'Réinitialiser'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 text-center">
              <p className="text-green-400 font-semibold mb-1">✅ Mot de passe réinitialisé</p>
              <p className="text-gray-300 text-sm">Nouveau mot de passe :</p>
              <code className="text-yellow-400 text-lg font-bold">{newPassword}</code>
              <p className="text-gray-500 text-xs mt-2">Communiquez ce mot de passe à l'employé</p>
            </div>
            <button onClick={onClose} className="btn-primary w-full">Fermer</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Modal employé ─────────────────────────────────────────
function EmployeeModal({ employee, onClose, onSave }) {
  const [form, setForm] = useState(employee || {
    matricule: '', first_name: '', last_name: '', email: '',
    password: '', role: 'employee', org_unit_id: '', manager_id: '',
    employee_category: '', hire_date: '', phone: '', regime_id: '',
    departure_date: '', departure_reason: '', departure_note: '',
  })

  const { data: unitsData }   = useQuery({ queryKey: ['org-units'],     queryFn: () => orgAPI.units().then(r => r.data) })
  const { data: regimesData } = useQuery({ queryKey: ['regimes'],       queryFn: () => api.get('/employees/regimes').then(r => r.data) })
  const { data: empData }     = useQuery({ queryKey: ['employees-all'], queryFn: () => employeesAPI.list({}).then(r => r.data) })

  const isEdit = !!employee?.id
  const s = v => setForm(f => ({ ...f, ...v }))

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="card w-full max-w-lg my-4">
        <h3 className="text-lg font-semibold mb-5">{isEdit ? 'Modifier' : 'Nouvel employé'}</h3>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Matricule *</label>
              <input className="input" value={form.matricule} onChange={e => s({matricule: e.target.value})} required disabled={isEdit} />
            </div>
            <div>
              <label className="label">Rôle</label>
              <select className="input" value={form.role} onChange={e => s({role: e.target.value})}>
                <option value="employee">Employé</option>
                <option value="hr_assistant">Assistante RH</option>
                <option value="manager">Manager</option>
                <option value="rh">Responsable RH</option>
                <option value="superadmin">Super Admin</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Prénom *</label>
              <input className="input" value={form.first_name} onChange={e => s({first_name: e.target.value})} required />
            </div>
            <div>
              <label className="label">Nom *</label>
              <input className="input" value={form.last_name} onChange={e => s({last_name: e.target.value})} required />
            </div>
          </div>
          <div>
            <label className="label">Email *</label>
            <input type="email" className="input" value={form.email} onChange={e => s({email: e.target.value})} required />
          </div>
          {!isEdit && (
            <div>
              <label className="label">Mot de passe</label>
              <input type="password" className="input" value={form.password} onChange={e => s({password: e.target.value})} placeholder="Laissez vide pour défaut (REDACTED_PASSWORD)" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Unité organisationnelle</label>
              <select className="input" value={form.org_unit_id || ''} onChange={e => s({org_unit_id: e.target.value})}>
                <option value="">Sélectionner</option>
                {unitsData?.units?.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Manager direct</label>
              <select className="input" value={form.manager_id || ''} onChange={e => s({manager_id: e.target.value})}>
                <option value="">Aucun</option>
                {empData?.employees
                  ?.filter(e => ['manager','rh','superadmin'].includes(e.role))
                  .sort((a,b) => a.first_name.localeCompare(b.first_name))
                  .map(e => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)
                }
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Catégorie d'évaluation</label>
              <select className="input" value={form.employee_category || ''} onChange={e => s({employee_category: e.target.value})}>
                <option value="">-- Sélectionner --</option>
                <option value="directeur">Directeur</option>
                <option value="chef_division">Chef de Division</option>
                <option value="cadre">Cadre</option>
                <option value="employe">Employé</option>
              </select>
            </div>
            <div>
              <label className="label">Date d'embauche</label>
              <input type="date" className="input" value={form.hire_date ? form.hire_date.toString().slice(0,10) : ''} onChange={e => s({hire_date: e.target.value})} />
            </div>
            <div>
              <label className="label">Régime de travail</label>
              <select className="input" value={form.regime_id ? String(form.regime_id) : ''} onChange={e => s({regime_id: e.target.value})}>
                <option value="">-- Sélectionner --</option>
                {(regimesData?.regimes || []).map(r => (
                  <option key={r.id} value={String(r.id)}>{r.name} ({r.hours_per_week}h/sem)</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Téléphone</label>
              <input className="input" value={form.phone || ''} onChange={e => s({phone: e.target.value})} />
            </div>
          </div>

          {/* Informations de départ */}
          <div className="border-t border-gray-700 pt-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Informations de départ</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Date de départ</label>
                <input type="date" className="input" value={form.departure_date ? form.departure_date.toString().slice(0,10) : ''}
                  onChange={e => s({departure_date: e.target.value})} />
              </div>
              <div>
                <label className="label">Motif de départ</label>
                <select className="input" value={form.departure_reason || ''} onChange={e => s({departure_reason: e.target.value})}>
                  <option value="">— Sélectionner —</option>
                  <option value="retraite">Retraite</option>
                  <option value="fin_contrat">Fin de contrat</option>
                  <option value="demission">Démission</option>
                  <option value="licenciement">Licenciement</option>
                  <option value="mutation">Mutation externe</option>
                  <option value="deces">Décès</option>
                  <option value="autre">Autre</option>
                </select>
              </div>
            </div>
            <div className="mt-3">
              <label className="label">Note de départ</label>
              <textarea className="input h-16 resize-none" value={form.departure_note || ''}
                onChange={e => s({departure_note: e.target.value})}
                placeholder="Informations complémentaires..." />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="btn-secondary flex-1">Annuler</button>
            <button onClick={() => onSave(form)} className="btn-primary flex-1">
              {isEdit ? 'Enregistrer' : 'Créer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Page principale ───────────────────────────────────────
export default function EmployeesPage() {
  const { hasRole } = useAuthStore()
  const qc = useQueryClient()
  const [search, setSearch]                 = useState('')
  const [modal, setModal]                   = useState(null)
  const [resetModal, setResetModal]         = useState(null)
  const [filterRole, setFilterRole]         = React.useState('')
  const [filterCategory, setFilterCategory] = React.useState('')
  const [filterStatus, setFilterStatus]     = React.useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['employees'],
    queryFn: () => employeesAPI.list({}).then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (data) => employeesAPI.create(data),
    onSuccess: () => { toast.success('Employé créé'); qc.invalidateQueries(['employees']); setModal(null) },
    onError: err => toast.error(err.response?.data?.error || 'Erreur'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }) => employeesAPI.update(id, data),
    onSuccess: () => { toast.success('Modifié'); qc.invalidateQueries(['employees']); setModal(null) },
    onError: err => toast.error(err.response?.data?.error || 'Erreur'),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active, ...rest }) => employeesAPI.update(id, { ...rest, is_active: !is_active }),
    onSuccess: () => { toast.success('Mis à jour'); qc.invalidateQueries(['employees']) },
  })

  const roleLabel = {
    superadmin:   'Super Admin',
    rh:           'RH',
    hr_assistant: 'Assistante RH',
    manager:      'Manager',
    employee:     'Employé'
  }
  const roleColor = {
    superadmin:   'bg-purple-500/10 text-purple-400',
    rh:           'bg-blue-500/10 text-blue-400',
    hr_assistant: 'bg-pink-500/10 text-pink-400',
    manager:      'bg-green-500/10 text-green-400',
    employee:     'bg-gray-500/10 text-gray-400'
  }

  const employees = (data?.employees || []).filter(e => {
    const matchSearch   = !search || `${e.first_name} ${e.last_name} ${e.matricule} ${e.email}`.toLowerCase().includes(search.toLowerCase())
    const matchRole     = !filterRole     || e.role === filterRole
    const matchCategory = !filterCategory || e.employee_category === filterCategory
    const matchStatus   = filterStatus === '' || (filterStatus === 'actif' ? e.is_active : !e.is_active)
    return matchSearch && matchRole && matchCategory && matchStatus
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Employés</h1>
          <p className="text-gray-400 text-sm mt-1">
            {employees.length} employé{employees.length > 1 ? 's' : ''} affiché{employees.length > 1 ? 's' : ''}
            {data?.employees?.length !== employees.length ? ` sur ${data?.employees?.length} au total` : ' au total'}
          </p>
        </div>
        {hasRole('superadmin', 'rh') && (
          <button onClick={() => setModal('new')} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Nouvel employé
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-8 w-56" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input w-44" value={filterRole} onChange={e => setFilterRole(e.target.value)}>
          <option value="">Tous les rôles</option>
          <option value="employee">Employé</option>
          <option value="hr_assistant">Assistante RH</option>
          <option value="manager">Manager</option>
          <option value="rh">RH</option>
          <option value="superadmin">Super Admin</option>
        </select>
        <select className="input w-44" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
          <option value="">Toutes catégories</option>
          <option value="directeur">Directeur</option>
          <option value="chef_division">Chef de Division</option>
          <option value="cadre">Cadre</option>
          <option value="employe">Employé</option>
        </select>
        <select className="input w-36" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Tous statuts</option>
          <option value="actif">Actifs</option>
          <option value="inactif">Inactifs</option>
        </select>
        {(filterRole || filterCategory || filterStatus || search) && (
          <button onClick={() => { setFilterRole(''); setFilterCategory(''); setFilterStatus(''); setSearch('') }}
            className="text-xs text-gray-400 hover:text-red-400">
            ✕ Réinitialiser
          </button>
        )}
      </div>

      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Employé</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Matricule</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Rôle</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Unité</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Manager</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Catégorie</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Régime</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Statut</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={9} className="text-center py-10 text-gray-500">Chargement...</td></tr>
              ) : employees.map(emp => (
                <tr key={emp.id} className="table-row">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-600/20 rounded-full flex items-center justify-center shrink-0">
                        <span className="text-blue-400 text-xs font-bold">{emp.first_name?.[0]}{emp.last_name?.[0]}</span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-200">{emp.first_name} {emp.last_name}</p>
                        <p className="text-xs text-gray-500">{emp.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-300 font-mono text-xs">{emp.matricule}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${roleColor[emp.role] || 'bg-gray-500/10 text-gray-400'}`}>
                      {roleLabel[emp.role] || emp.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{emp.unit_name || '—'}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{emp.manager_name || '—'}</td>
                  <td className="px-4 py-3">
                    {emp.employee_category ? (
                      <span className="badge bg-blue-500/10 text-blue-400 text-xs">
                        {emp.employee_category === 'directeur'     ? 'Directeur'
                        : emp.employee_category === 'chef_division' ? 'Chef Division'
                        : emp.employee_category === 'cadre'         ? 'Cadre'
                        : emp.employee_category === 'employe'       ? 'Employé'
                        : emp.employee_category}
                      </span>
                    ) : <span className="text-gray-600 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {emp.regime_name
                      ? <span className="badge bg-blue-500/10 text-blue-400 text-xs">{emp.regime_code}</span>
                      : <span className="text-gray-600 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${emp.is_active ? 'bg-green-500/10 text-green-400' : 'bg-gray-500/10 text-gray-500'}`}>
                      {emp.is_active ? 'Actif' : emp.departure_reason ? `Inactif — ${emp.departure_reason.replace('_',' ')}` : 'Inactif'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {hasRole('superadmin', 'rh') && (
                      <div className="flex gap-2">
                        <button onClick={() => setModal(emp)}
                          className="text-gray-400 hover:text-blue-400" title="Modifier">
                          <Edit size={15} />
                        </button>
                        <button onClick={() => setResetModal(emp)}
                          className="text-gray-400 hover:text-yellow-400" title="Réinitialiser mot de passe">
                          <KeyRound size={15} />
                        </button>
                        <button onClick={() => toggleMutation.mutate(emp)}
                          className={`${emp.is_active ? 'text-gray-400 hover:text-red-400' : 'text-gray-400 hover:text-green-400'}`}
                          title={emp.is_active ? 'Désactiver' : 'Activer'}>
                          {emp.is_active ? <UserX size={15} /> : <UserCheck size={15} />}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <EmployeeModal
          employee={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSave={(form) => modal === 'new'
            ? createMutation.mutate(form)
            : updateMutation.mutate({ id: modal.id, ...form })
          }
        />
      )}

      {resetModal && (
        <ResetPasswordModal
          employee={resetModal}
          onClose={() => setResetModal(null)}
        />
      )}
    </div>
  )
}
