import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { User, Lock, Save, ArrowLeft } from 'lucide-react'
import { authAPI } from '../api/client'
import { useAuthStore } from '../store/authStore'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

export default function ProfilePage() {
  const { employee } = useAuthStore()
  const navigate = useNavigate()
  const [pwdForm, setPwdForm] = useState({ currentPassword: '', newPassword: '', confirm: '' })
  const [pwdError, setPwdError] = useState('')

  const pwdMutation = useMutation({
    mutationFn: (data) => authAPI.changePassword(data.currentPassword, data.newPassword),
    onSuccess: () => { toast.success('Mot de passe modifié'); setPwdForm({ currentPassword: '', newPassword: '', confirm: '' }) },
    onError: err => toast.error(err.response?.data?.error || 'Erreur'),
  })

  const handlePwdSubmit = (e) => {
    e.preventDefault()
    if (pwdForm.newPassword !== pwdForm.confirm) {
      setPwdError('Les mots de passe ne correspondent pas')
      return
    }
    if (pwdForm.newPassword.length < 6) {
      setPwdError('Le mot de passe doit contenir au moins 6 caractères')
      return
    }
    setPwdError('')
    pwdMutation.mutate(pwdForm)
  }

  const roleLabel = { superadmin: 'Super Administrateur', rh: 'Responsable RH', manager: 'Manager', employee: 'Employé' }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-gray-200 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold">Mon profil</h1>
      </div>

      {/* Info */}
      <div className="card">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 bg-blue-600/20 rounded-full flex items-center justify-center">
            <span className="text-blue-400 text-2xl font-bold">
              {employee?.first_name?.[0]}{employee?.last_name?.[0]}
            </span>
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">{employee?.first_name} {employee?.last_name}</h2>
            <p className="text-gray-400 text-sm">{roleLabel[employee?.role]}</p>
            <p className="text-gray-500 text-xs font-mono mt-0.5">Matricule : {employee?.matricule}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          {[
            { label: 'Email',         value: employee?.email },
            { label: 'Unité',         value: employee?.unit_name || '—' },
            { label: 'Poste',         value: employee?.position_title || '—' },
            { label: 'Manager',       value: employee?.manager_name || '—' },
            { label: 'Date d\'embauche', value: employee?.hire_date ? format(new Date(employee.hire_date), 'dd/MM/yyyy') : '—' },
            { label: 'Téléphone',     value: employee?.phone || '—' },
          ].map(item => (
            <div key={item.label} className="p-3 bg-gray-800/50 rounded-lg">
              <p className="text-gray-500 text-xs mb-1">{item.label}</p>
              <p className="text-gray-200">{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Change password */}
      <div className="card">
        <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
          <Lock size={16} className="text-blue-400" />
          Changer le mot de passe
        </h2>
        <form onSubmit={handlePwdSubmit} className="space-y-4">
          <div>
            <label className="label">Mot de passe actuel</label>
            <input type="password" className="input" value={pwdForm.currentPassword}
              onChange={e => setPwdForm({...pwdForm, currentPassword: e.target.value})} required />
          </div>
          <div>
            <label className="label">Nouveau mot de passe</label>
            <input type="password" className="input" value={pwdForm.newPassword}
              onChange={e => setPwdForm({...pwdForm, newPassword: e.target.value})} required />
          </div>
          <div>
            <label className="label">Confirmer le nouveau mot de passe</label>
            <input type="password" className="input" value={pwdForm.confirm}
              onChange={e => setPwdForm({...pwdForm, confirm: e.target.value})} required />
          </div>
          {pwdError && <p className="text-red-400 text-sm">{pwdError}</p>}
          <button type="submit" disabled={pwdMutation.isPending} className="btn-primary flex items-center gap-2">
            <Save size={16} />
            {pwdMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </form>
      </div>
    </div>
  )
}
