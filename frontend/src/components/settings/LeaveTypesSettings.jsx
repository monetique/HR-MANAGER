import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Edit, Save, X, Settings2 } from 'lucide-react'
import api from '../../api/client'
import toast from 'react-hot-toast'

const COLORS = {
  blue:   'bg-blue-500/10 text-blue-400 border-blue-500/30',
  green:  'bg-green-500/10 text-green-400 border-green-500/30',
  red:    'bg-red-500/10 text-red-400 border-red-500/30',
  yellow: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  purple: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  orange: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  pink:   'bg-pink-500/10 text-pink-400 border-pink-500/30',
  gray:   'bg-gray-500/10 text-gray-400 border-gray-500/30',
  teal:   'bg-teal-500/10 text-teal-400 border-teal-500/30',
  indigo: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
}

const EMPTY_TYPE = {
  name: '', code: '', has_balance: false, max_days: '',
  auto_refill: false, refill_date: '06-01', refill_days: 21,
  color: 'blue', requires_validation: true, is_active: true
}

function LeaveTypeRow({ lt, onSave }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(lt)
  const s = v => setForm(f => ({ ...f, ...v }))

  if (!editing) {
    return (
      <tr className="border-b border-gray-800 hover:bg-gray-800/20">
        <td className="px-4 py-3">
          <span className={`badge border ${COLORS[lt.color] || COLORS.blue}`}>{lt.code}</span>
        </td>
        <td className="px-4 py-3 text-gray-200 font-medium">{lt.name}</td>
        <td className="px-4 py-3 text-center">
          {lt.has_balance
            ? <span className="text-green-400 text-xs">✓ {lt.refill_days}j/an ({lt.refill_date})</span>
            : <span className="text-gray-600 text-xs">—</span>}
        </td>
        <td className="px-4 py-3 text-center text-sm text-gray-300">
          {lt.max_days ? `${lt.max_days}j` : '—'}
        </td>
        <td className="px-4 py-3 text-center">
          {lt.requires_validation
            ? <span className="badge bg-blue-500/10 text-blue-400 text-xs">Manager → RH</span>
            : <span className="badge bg-gray-500/10 text-gray-400 text-xs">Automatique</span>}
        </td>
        <td className="px-4 py-3 text-center">
          <span className={`badge text-xs ${lt.is_active ? 'bg-green-500/10 text-green-400' : 'bg-gray-500/10 text-gray-500'}`}>
            {lt.is_active ? 'Actif' : 'Inactif'}
          </span>
        </td>
        <td className="px-4 py-3 text-right">
          <button onClick={() => { setForm(lt); setEditing(true) }}
            className="text-gray-400 hover:text-blue-400 transition-colors">
            <Edit size={15} />
          </button>
        </td>
      </tr>
    )
  }

  return (
    <tr className="border-b border-gray-800 bg-gray-800/30">
      <td className="px-3 py-2">
        <input className="input w-24 text-xs" value={form.code}
          onChange={e => s({ code: e.target.value })} placeholder="0454" />
      </td>
      <td className="px-3 py-2">
        <input className="input text-xs" value={form.name}
          onChange={e => s({ name: e.target.value })} placeholder="Nom du congé" />
      </td>
      <td className="px-3 py-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={!!form.has_balance}
              onChange={e => s({ has_balance: e.target.checked })} />
            <span className="text-xs text-gray-400">Compteur</span>
          </div>
          {form.has_balance && (
            <div className="flex gap-1">
              <input type="number" className="input w-16 text-xs" value={form.refill_days}
                onChange={e => s({ refill_days: parseInt(e.target.value) })} placeholder="21" />
              <input className="input w-20 text-xs" value={form.refill_date}
                onChange={e => s({ refill_date: e.target.value })} placeholder="06-01" />
            </div>
          )}
        </div>
      </td>
      <td className="px-3 py-2">
        <input type="number" className="input w-20 text-xs" value={form.max_days || ''}
          onChange={e => s({ max_days: e.target.value || null })} placeholder="Illimité" />
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <input type="checkbox" checked={!!form.requires_validation}
            onChange={e => s({ requires_validation: e.target.checked })} />
          <span className="text-xs text-gray-400">Validation requise</span>
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="flex gap-2">
          <select className="input text-xs w-24" value={form.color}
            onChange={e => s({ color: e.target.value })}>
            {Object.keys(COLORS).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="flex items-center gap-1">
            <input type="checkbox" checked={!!form.is_active}
              onChange={e => s({ is_active: e.target.checked })} />
            <span className="text-xs text-gray-400">Actif</span>
          </div>
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="flex gap-2">
          <button onClick={() => { onSave(form); setEditing(false) }}
            className="text-green-400 hover:text-green-300"><Save size={15} /></button>
          <button onClick={() => setEditing(false)}
            className="text-gray-400 hover:text-gray-300"><X size={15} /></button>
        </div>
      </td>
    </tr>
  )
}

export default function LeaveTypesSettings() {
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [newType, setNewType] = useState(EMPTY_TYPE)

  const { data, isLoading } = useQuery({
    queryKey: ['leave-types'],
    queryFn: () => api.get('/leaves/types').then(r => r.data),
  })

  const saveMutation = useMutation({
    mutationFn: lt => lt.id
      ? api.put(`/leaves/types/${lt.id}`, lt)
      : api.post('/leaves/types', lt),
    onSuccess: () => {
      toast.success('Type de congé enregistré')
      qc.invalidateQueries(['leave-types'])
      setAdding(false)
      setNewType(EMPTY_TYPE)
    },
    onError: err => toast.error(err.response?.data?.error || 'Erreur'),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Settings2 size={16} className="text-blue-400" />
            Types de congé
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Gérez les types de congé, leurs codes financiers et leurs paramètres
          </p>
        </div>
        <button onClick={() => setAdding(true)} disabled={adding}
          className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={14} /> Nouveau type
        </button>
      </div>

      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900">
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Code</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Libellé</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Compteur</th>
                <th className="text-center px-4 py-3 text-gray-400 font-medium">Jours max</th>
                <th className="text-center px-4 py-3 text-gray-400 font-medium">Validation</th>
                <th className="text-center px-4 py-3 text-gray-400 font-medium">Statut</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {/* Formulaire ajout */}
              {adding && (
                <tr className="border-b border-gray-800 bg-blue-900/10">
                  <td className="px-3 py-2">
                    <input className="input w-24 text-xs" value={newType.code}
                      onChange={e => setNewType({...newType, code: e.target.value})} placeholder="0454" />
                  </td>
                  <td className="px-3 py-2">
                    <input className="input text-xs" value={newType.name}
                      onChange={e => setNewType({...newType, name: e.target.value})} placeholder="Nom du congé" />
                  </td>
                  <td className="px-3 py-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <input type="checkbox" checked={newType.has_balance}
                          onChange={e => setNewType({...newType, has_balance: e.target.checked})} />
                        <span className="text-xs text-gray-400">Compteur</span>
                      </div>
                      {newType.has_balance && (
                        <div className="flex gap-1">
                          <input type="number" className="input w-16 text-xs" value={newType.refill_days}
                            onChange={e => setNewType({...newType, refill_days: parseInt(e.target.value)})} placeholder="21" />
                          <input className="input w-20 text-xs" value={newType.refill_date}
                            onChange={e => setNewType({...newType, refill_date: e.target.value})} placeholder="06-01" />
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" className="input w-20 text-xs" value={newType.max_days || ''}
                      onChange={e => setNewType({...newType, max_days: e.target.value || null})} placeholder="Illimité" />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <input type="checkbox" checked={newType.requires_validation}
                        onChange={e => setNewType({...newType, requires_validation: e.target.checked})} />
                      <span className="text-xs text-gray-400">Validation</span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <select className="input text-xs w-24" value={newType.color}
                      onChange={e => setNewType({...newType, color: e.target.value})}>
                      {Object.keys(COLORS).map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button onClick={() => saveMutation.mutate(newType)}
                        className="text-green-400 hover:text-green-300"><Save size={15} /></button>
                      <button onClick={() => { setAdding(false); setNewType(EMPTY_TYPE) }}
                        className="text-gray-400 hover:text-gray-300"><X size={15} /></button>
                    </div>
                  </td>
                </tr>
              )}

              {isLoading ? (
                <tr><td colSpan={7} className="text-center py-8 text-gray-500">Chargement...</td></tr>
              ) : data?.leave_types?.map(lt => (
                <LeaveTypeRow key={lt.id} lt={lt}
                  onSave={form => saveMutation.mutate(form)} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Info circuit de validation */}
      <div className="card bg-blue-500/5 border border-blue-500/20">
        <h3 className="text-xs font-medium text-blue-400 mb-2">Circuit de validation</h3>
        <p className="text-xs text-gray-400">
          Le circuit actuel est : <strong className="text-gray-200">Manager direct → Responsable RH</strong>.
          Toute demande de congé nécessitant une validation suit ce circuit automatiquement selon la hiérarchie de l'employé.
        </p>
      </div>
    </div>
  )
}
