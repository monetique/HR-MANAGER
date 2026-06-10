import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Calendar, Upload, FileText, X } from 'lucide-react'
import { leavesAPI } from '../api/client'
import api from '../api/client'
import { useAuthStore } from '../store/authStore'
import toast from 'react-hot-toast'
import { differenceInBusinessDays, addDays } from 'date-fns'

export default function LeaveRequestPage() {
  const navigate  = useNavigate()
  const { employee } = useAuthStore()
  const qc        = useQueryClient()

  const [form, setForm] = useState({
    leave_type_id: '',
    start_date: '',
    end_date: '',
    reason: '',
    certificate_path: '',
    half_day: false,
    half_day_period: 'matin',
    half_day_start: false,
    half_day_end: false,
  })
  const [certFile, setCertFile]   = useState(null)
  const [uploading, setUploading] = useState(false)

  const { data: typesData } = useQuery({
    queryKey: ['leave-types'],
    queryFn: () => leavesAPI.types().then(r => r.data),
  })

  const { data: balances } = useQuery({
    queryKey: ['balances', employee?.id],
    queryFn: () => leavesAPI.balances(employee?.id, new Date().getFullYear()).then(r => r.data.balances),
    enabled: !!employee?.id,
  })

  const mutation = useMutation({
    mutationFn: (data) => leavesAPI.create(data),
    onSuccess: () => {
      toast.success('Demande soumise avec succès !')
      qc.invalidateQueries(['leaves'])
      navigate('/leaves')
    },
    onError: err => toast.error(err.response?.data?.error || 'Erreur lors de la soumission'),
  })

  const estimatedDays = (() => {
    if (form.half_day) return 0.5;
    if (!form.start_date || !form.end_date) return 0;
    let days = Math.max(0, differenceInBusinessDays(new Date(form.end_date), new Date(form.start_date)) + 1);
    if (form.half_day_start) days -= 0.5;
    if (form.half_day_end)   days -= 0.5;
    return Math.max(0.5, days);
  })()

  const handleFileChange = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setCertFile(file)
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const { data } = await api.post('/uploads/certificate', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setForm(f => ({ ...f, certificate_path: data.filename }))
      toast.success('Certificat uploadé')
    } catch(err) {
      toast.error(err.response?.data?.error || 'Erreur upload')
      setCertFile(null)
    } finally { setUploading(false) }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (isSickLeave && !form.certificate_path) {
      toast.error('Le certificat médical est obligatoire pour un congé maladie')
      return
    }
    if (!form.leave_type_id || !form.start_date || !form.end_date) {
      toast.error('Veuillez remplir tous les champs obligatoires')
      return
    }
    mutation.mutate({
      ...form,
      days_count: estimatedDays
    })
  }

  const leaveTypes = typesData?.leave_types || []
  const selectedType = leaveTypes.find(t => t.id === parseInt(form.leave_type_id))
  const isSickLeave = selectedType?.code === '0550'
  const isExitAuth = selectedType?.code === '0480'
  const isAnnualLeave = selectedType?.code === '0454'

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/leaves')} className="text-gray-400 hover:text-gray-200">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold">Nouvelle demande de congé</h1>
      </div>

      {/* Soldes */}
      {balances && (
        <div className="card">
          <h2 className="text-sm font-medium text-gray-400 mb-3">Mes soldes disponibles</h2>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Annuel',       available: balances.annual_total - balances.annual_taken },
              { label: 'Maladie',      available: balances.sick_total - balances.sick_taken },
              { label: 'Exceptionnel', available: balances.exceptional_total - balances.exceptional_taken },
            ].map(item => (
              <div key={item.label} className="text-center p-3 bg-gray-800/50 rounded-lg">
                <p className="text-xl font-bold text-white">{item.available}</p>
                <p className="text-xs text-gray-400 mt-0.5">{item.label}</p>
                <p className="text-xs text-gray-500">jours</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="card space-y-5">
        <div>
          <label className="label">Type de congé *</label>
          <select className="input" value={form.leave_type_id} onChange={e => setForm({...form, leave_type_id: e.target.value})} required>
            <option value="">Sélectionner un type</option>
            {leaveTypes.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        {/* Option demi-journée */}
        {isAnnualLeave && (
          <div className="p-3 bg-gray-800/50 rounded-lg space-y-3">
            {/* Demi-journée unique */}
            <label className="flex items-center gap-3 cursor-pointer">
              <div
                onClick={() => setForm(f => ({ ...f, half_day: !f.half_day, half_day_start: false, half_day_end: false, end_date: !f.half_day ? f.start_date : f.end_date }))}
                className={`relative w-10 h-5 rounded-full transition-colors ${form.half_day ? 'bg-blue-600' : 'bg-gray-600'}`}
              >
                <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.half_day ? 'translate-x-5' : ''}`} />
              </div>
              <span className="text-sm text-gray-300 font-medium">Demi-journée uniquement (0.5j)</span>
            </label>
            {form.half_day && (
              <div className="flex gap-3 ml-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="half_day_period" value="matin"
                    checked={form.half_day_period === 'matin'}
                    onChange={e => setForm({...form, half_day_period: e.target.value})} />
                  <span className="text-gray-300 text-sm">🌅 Matin</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="half_day_period" value="apremidi"
                    checked={form.half_day_period === 'apremidi'}
                    onChange={e => setForm({...form, half_day_period: e.target.value})} />
                  <span className="text-gray-300 text-sm">🌇 Après-midi</span>
                </label>
              </div>
            )}

          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="label">Date de début *</label>
            <input type="date" className="input" value={form.start_date}
              onChange={e => setForm({...form, start_date: e.target.value, end_date: form.half_day ? e.target.value : form.end_date})}
              min={new Date().toISOString().split('T')[0]} required />
            {!form.half_day && form.start_date && (
              <div className="flex gap-4 px-1">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-400">
                  <input type="radio" name="start_period" value="matin"
                    checked={!form.half_day_start}
                    onChange={() => setForm(f => ({...f, half_day_start: false}))} />
                  🌅 Matin
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-400">
                  <input type="radio" name="start_period" value="apremidi"
                    checked={form.half_day_start}
                    onChange={() => setForm(f => ({...f, half_day_start: true}))} />
                  🌇 Après-midi
                </label>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <label className="label">Date de fin *</label>
            <input type="date" className="input"
              value={form.half_day ? form.start_date : form.end_date}
              onChange={e => setForm({...form, end_date: e.target.value})}
              min={form.start_date || new Date().toISOString().split('T')[0]}
              disabled={form.half_day}
              required />
            {!form.half_day && form.end_date && (
              <div className="flex gap-4 px-1">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-400">
                  <input type="radio" name="end_period" value="matin"
                    checked={form.half_day_end}
                    onChange={() => setForm(f => ({...f, half_day_end: true}))} />
                  🌅 Matin
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-400">
                  <input type="radio" name="end_period" value="apremidi"
                    checked={!form.half_day_end}
                    onChange={() => setForm(f => ({...f, half_day_end: false}))} />
                  🌇 Après-midi
                </label>
              </div>
            )}
          </div>
        </div>

        {estimatedDays > 0 && (
          <div className="flex items-center gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <Calendar size={16} className="text-blue-400" />
            <p className="text-sm text-blue-300">
              Durée estimée : <strong>{form.half_day ? '0.5 jour (demi-journée ' + (form.half_day_period === 'matin' ? 'matin' : 'après-midi') + ')' : estimatedDays + ' jour(s) ouvrable(s)'}</strong>
            </p>
          </div>
        )}

        <div>
          {/* Certificat médical — obligatoire pour congé maladie */}
          {/* Autorisation de sortie */}
          {isExitAuth && (
            <div className="card space-y-4 border border-teal-500/30">
              <h3 className="text-sm font-medium text-teal-400">Details de l autorisation de sortie</h3>
              <div>
                <label className="label">Periode *</label>
                <div className="flex gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="exit_period" value="matin"
                      checked={form.exit_period === 'matin'}
                      onChange={e => setForm({...form, exit_period: e.target.value})} />
                    <span className="text-gray-300 text-sm">Matin</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="exit_period" value="apremidi"
                      checked={form.exit_period === 'apremidi'}
                      onChange={e => setForm({...form, exit_period: e.target.value})} />
                    <span className="text-gray-300 text-sm">Apres-midi</span>
                  </label>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Heure de sortie *</label>
                  <input type="time" className="input" value={form.exit_time}
                    onChange={e => setForm({...form, exit_time: e.target.value})} />
                </div>
                <div>
                  <label className="label">Heure de retour * (max 2h)</label>
                  <input type="time" className="input" value={form.return_time}
                    onChange={e => setForm({...form, return_time: e.target.value})} />
                </div>
              </div>
            </div>
          )}

          {isSickLeave && (
            <div>
              <label className="label">
                Certificat médical *
                <span className="text-red-400 ml-1 text-xs">obligatoire</span>
              </label>
              <div className="mt-1">
                {!certFile ? (
                  <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-gray-600 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-blue-500/5 transition-colors">
                    <Upload size={24} className="text-gray-400 mb-2" />
                    <p className="text-sm text-gray-400">Cliquez pour uploader</p>
                    <p className="text-xs text-gray-500 mt-1">PDF, JPG, PNG — max 5MB</p>
                    <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png"
                      onChange={handleFileChange} />
                  </label>
                ) : (
                  <div className="flex items-center gap-3 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                    <FileText size={18} className="text-green-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-green-400 font-medium truncate">{certFile.name}</p>
                      <p className="text-xs text-gray-500">{uploading ? 'Upload en cours...' : 'Certificat uploadé ✓'}</p>
                    </div>
                    <button type="button" onClick={() => { setCertFile(null); setForm(f => ({...f, certificate_path: ''})) }}
                      className="text-gray-400 hover:text-red-400">
                      <X size={16} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
          <label className="label">Motif (optionnel)</label>
          <textarea className="input h-24 resize-none" placeholder="Précisez le motif de votre demande..."
            value={form.reason} onChange={e => setForm({...form, reason: e.target.value})} />
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={() => navigate('/leaves')} className="btn-secondary flex-1">
            Annuler
          </button>
          <button type="submit" disabled={mutation.isPending} className="btn-primary flex-1">
            {mutation.isPending ? 'Soumission...' : 'Soumettre la demande'}
          </button>
        </div>
      </form>
    </div>
  )
}
