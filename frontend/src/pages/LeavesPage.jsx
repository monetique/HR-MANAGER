import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, CheckCircle, XCircle, Clock, Filter, Search, Download } from 'lucide-react'
import { leavesAPI } from '../api/client'
import { useAuthStore } from '../store/authStore'
import LeaveBalanceCard from '../components/LeaveBalanceCard'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import toast from 'react-hot-toast'

function StatusBadge({ status }) {
  const map = {
    pending:  { label: 'En attente', cls: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' },
    approved: { label: 'Approuvé',   cls: 'bg-green-500/10 text-green-400 border border-green-500/20'   },
    rejected: { label: 'Rejeté',     cls: 'bg-red-500/10 text-red-400 border border-red-500/20'         },
    cancelled:{ label: 'Annulé',     cls: 'bg-gray-500/10 text-gray-400 border border-gray-500/20'      },
  }
  const s = map[status] || { label: status, cls: 'bg-gray-500/10 text-gray-400' }
  return <span className={`badge ${s.cls}`}>{s.label}</span>
}

function ValidateModal({ request, onClose, onSubmit }) {
  const [action, setAction]   = useState('approved')
  const [comment, setComment] = useState('')
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-md">
        <h3 className="text-lg font-semibold mb-4">Traiter la demande</h3>
        <div className="space-y-4">
          <div>
            <p className="text-sm text-gray-400">Employé : <span className="text-gray-200">{request.employee_name}</span></p>
            <p className="text-sm text-gray-400">Type : <span className="text-gray-200">{request.leave_type_name}</span></p>
            <p className="text-sm text-gray-400">Durée : <span className="text-gray-200">{request.days_count} jour(s)</span></p>
            <p className="text-sm text-gray-400">Période : <span className="text-gray-200">
              {format(new Date(request.start_date), 'dd/MM/yyyy')} → {format(new Date(request.end_date), 'dd/MM/yyyy')}
            </span></p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setAction('approved')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${action === 'approved' ? 'bg-green-600 border-green-600 text-white' : 'border-gray-700 text-gray-400 hover:bg-gray-800'}`}>
              ✓ Approuver
            </button>
            <button onClick={() => setAction('rejected')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${action === 'rejected' ? 'bg-red-600 border-red-600 text-white' : 'border-gray-700 text-gray-400 hover:bg-gray-800'}`}>
              ✗ Rejeter
            </button>
          </div>
          <div>
            <label className="label">Commentaire {action === 'rejected' ? '(requis)' : '(optionnel)'}</label>
            <textarea className="input h-20 resize-none" value={comment} onChange={e => setComment(e.target.value)} placeholder="Votre commentaire..." />
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="btn-secondary flex-1">Annuler</button>
            <button onClick={() => onSubmit(request.id, action, comment)} className="btn-primary flex-1">Confirmer</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LeavesPage() {
  const { employee, hasRole, token } = useAuthStore()
  const qc = useQueryClient()
  const [status, setStatus]   = useState('')
  const [search, setSearch]   = useState('')
  const [selected, setSelected] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['leaves', status],
    queryFn: () => leavesAPI.list({ status: status || undefined }).then(r => r.data),
  })

  const validateMutation = useMutation({
    mutationFn: ({ id, action, comment }) => leavesAPI.validate(id, action, comment),
    onSuccess: (_, { action }) => {
      toast.success(action === 'approved' ? 'Demande approuvée ✓' : 'Demande rejetée')
      qc.invalidateQueries(['leaves'])
      setSelected(null)
    },
    onError: err => toast.error(err.response?.data?.error || 'Erreur'),
  })

  const cancelMutation = useMutation({
    mutationFn: ({id, cancel_reason}) => leavesAPI.cancel(id, cancel_reason),
    onSuccess: () => { toast.success('Demande annulée'); qc.invalidateQueries(['leaves']) },
  })

  const canValidate = hasRole('superadmin', 'rh', 'manager')

  const requests = (data?.requests || []).filter(r =>
    !search || r.employee_name?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Congés</h1>
        <Link to="/leaves/new" className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Nouvelle demande
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-8 w-48" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input w-40" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">Tous les statuts</option>
          <option value="pending">En attente</option>
          <option value="approved">Approuvés</option>
          <option value="rejected">Rejetés</option>
          <option value="cancelled">Annulés</option>
        </select>
      </div>

      {/* Soldes de congés */}
      <LeaveBalanceCard employeeId={employee?.id} />

      {/* Table */}
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Employé</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Type</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Période</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Jours</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Étape</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Statut</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Certificat</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="text-center py-10 text-gray-500">Chargement...</td></tr>
              ) : requests.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-10 text-gray-500">Aucune demande</td></tr>
              ) : requests.map(req => (
                <tr key={req.id} className="table-row">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-200">{req.employee_name}</p>
                    <p className="text-xs text-gray-500">{req.matricule}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ background: req.color }} />
                      {req.leave_type_name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-300">
                    {format(new Date(req.start_date), 'dd/MM/yy')} → {format(new Date(req.end_date), 'dd/MM/yy')}
                  </td>
                  <td className="px-4 py-3 text-gray-300">{req.days_count} j</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{req.current_step - 1}/{req.total_steps}</td>
                  <td className="px-4 py-3"><StatusBadge status={req.status} /></td>
                  <td className="px-4 py-3">
                    {req.document_path && (
                      <button onClick={async () => {
                        try {

                          const res = await fetch('/api/uploads/certificate/' + req.document_path, {
                            headers: { Authorization: 'Bearer ' + token }
                          })
                          const blob = await res.blob()
                          const url = URL.createObjectURL(blob)
                          const a = document.createElement('a')
                          a.href = url
                          a.download = req.document_path
                          document.body.appendChild(a)
                          a.click()
                          document.body.removeChild(a)
                          setTimeout(() => URL.revokeObjectURL(url), 1000)
                        } catch(e) { alert('Erreur téléchargement') }
                      }} className="flex items-center gap-1 text-blue-400 hover:text-blue-300 text-xs">
                        <Download size={14} />
                        Certificat
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {canValidate && req.status === 'pending' && 
                        !(employee?.role === 'manager' && req.leave_type_code === '0550') &&
                        !(employee?.role === 'manager' && req.employee_manager_id !== employee?.id) && (
                        <button onClick={() => setSelected(req)} className="btn-primary py-1 px-2 text-xs">
                          Traiter
                        </button>
                      )}
                      {(
                        (req.employee_id === employee?.id && ['pending','approved'].includes(req.status) && req.start_date > new Date().toISOString().split('T')[0]) ||
                        (['superadmin','rh'].includes(employee?.role) && ['pending','approved'].includes(req.status) && req.start_date > new Date().toISOString().split('T')[0])
                       ) && (
                        <button onClick={() => {
                          const reason = ['superadmin','rh'].includes(employee?.role) ? window.prompt('Motif d annulation (optionnel):') : null;
                          if (reason === undefined) return; // annulé par l'utilisateur
                          cancelMutation.mutate({ id: req.id, cancel_reason: reason });
                        }} className="btn-secondary py-1 px-2 text-xs">
                          Annuler
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <ValidateModal
          request={selected}
          onClose={() => setSelected(null)}
          onSubmit={(id, action, comment) => validateMutation.mutate({ id, action, comment })}
        />
      )}
    </div>
  )
}
