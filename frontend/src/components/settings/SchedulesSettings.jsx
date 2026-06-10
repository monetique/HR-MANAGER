import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Clock, CheckCircle, Edit, Save, X } from 'lucide-react'
import api from '../../api/client'
import toast from 'react-hot-toast'

function ScheduleCard({ schedule, onActivate, onSave }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(schedule)
  const s = v => setForm(f => ({ ...f, ...v }))

  const isContinuous = !form.afternoon_start

  return (
    <div className={`card border-2 transition-colors ${schedule.is_current ? 'border-blue-500' : 'border-gray-700'}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Clock size={20} className={schedule.is_current ? 'text-blue-400' : 'text-gray-400'} />
          <div>
            <h3 className="font-semibold text-white">{schedule.name}</h3>
            {schedule.is_current && (
              <span className="text-xs text-blue-400 flex items-center gap-1 mt-0.5">
                <CheckCircle size={12} /> Horaire actif
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {!schedule.is_current && (
            <button onClick={() => onActivate(schedule.id)}
              className="btn-primary py-1 px-3 text-xs">
              Activer
            </button>
          )}
          <button onClick={() => setEditing(!editing)}
            className="btn-secondary py-1 px-3 text-xs flex items-center gap-1">
            {editing ? <X size={12} /> : <Edit size={12} />}
            {editing ? 'Annuler' : 'Modifier'}
          </button>
        </div>
      </div>

      {editing ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label text-xs">Début matin</label>
              <input type="time" className="input" value={form.morning_start}
                onChange={e => s({ morning_start: e.target.value })} />
            </div>
            <div>
              <label className="label text-xs">Fin matin</label>
              <input type="time" className="input" value={form.morning_end}
                onChange={e => s({ morning_end: e.target.value })} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" id={`cont-${schedule.id}`} checked={isContinuous}
              onChange={e => s({ afternoon_start: e.target.checked ? null : '13:00', afternoon_end: e.target.checked ? null : '17:00' })}
              className="rounded" />
            <label htmlFor={`cont-${schedule.id}`} className="text-sm text-gray-300">Horaire continu (sans après-midi)</label>
          </div>

          {!isContinuous && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label text-xs">Début après-midi</label>
                <input type="time" className="input" value={form.afternoon_start || ''}
                  onChange={e => s({ afternoon_start: e.target.value })} />
              </div>
              <div>
                <label className="label text-xs">Fin après-midi</label>
                <input type="time" className="input" value={form.afternoon_end || ''}
                  onChange={e => s({ afternoon_end: e.target.value })} />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label text-xs">Tolérance (minutes)</label>
              <input type="number" className="input" value={form.tolerance_min} min="0" max="60"
                onChange={e => s({ tolerance_min: parseInt(e.target.value) })} />
            </div>
            <div>
              <label className="label text-xs">Heures requises</label>
              <input type="number" className="input" value={form.required_hours} min="1" max="12" step="0.5"
                onChange={e => s({ required_hours: parseFloat(e.target.value) })} />
            </div>
          </div>

          {/* Période d'application (pour Ramadhan et Été) */}
          {(form.code === 'ramadhan' || form.code === 'summer') && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label text-xs">Date début (MM-JJ)</label>
                <input className="input text-xs" placeholder="ex: 03-01"
                  value={form.period_start || ''}
                  onChange={e => s({ period_start: e.target.value })} />
              </div>
              <div>
                <label className="label text-xs">Date fin (MM-JJ)</label>
                <input className="input text-xs" placeholder="ex: 04-30"
                  value={form.period_end || ''}
                  onChange={e => s({ period_end: e.target.value })} />
              </div>
            </div>
          )}
          <button onClick={() => { onSave(schedule.id, form); setEditing(false); }}
            className="btn-primary w-full flex items-center justify-center gap-2">
            <Save size={14} /> Enregistrer
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="p-3 bg-gray-800/50 rounded-lg">
            <p className="text-gray-500 text-xs mb-1">Matin</p>
            <p className="text-gray-200 font-mono">{schedule.morning_start} → {schedule.morning_end}</p>
          </div>
          {schedule.afternoon_start ? (
            <div className="p-3 bg-gray-800/50 rounded-lg">
              <p className="text-gray-500 text-xs mb-1">Après-midi</p>
              <p className="text-gray-200 font-mono">{schedule.afternoon_start} → {schedule.afternoon_end}</p>
            </div>
          ) : (
            <div className="p-3 bg-gray-800/50 rounded-lg">
              <p className="text-gray-500 text-xs mb-1">Type</p>
              <p className="text-gray-200">Horaire continu</p>
            </div>
          )}
          <div className="p-3 bg-gray-800/50 rounded-lg">
            <p className="text-gray-500 text-xs mb-1">Tolérance</p>
            <p className="text-gray-200">{schedule.tolerance_min} min</p>
          </div>
          {(schedule.period_start || schedule.period_end) && (
            <div className="p-3 bg-gray-800/50 rounded-lg col-span-2">
              <p className="text-gray-500 text-xs mb-1">Période d application</p>
              <p className="text-gray-200 font-mono">{schedule.period_start} au {schedule.period_end}</p>
            </div>
          )}
          <div className="p-3 bg-gray-800/50 rounded-lg">
            <p className="text-gray-500 text-xs mb-1">Heures requises</p>
            <p className="text-gray-200">{schedule.required_hours}h</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default function SchedulesSettings() {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['schedules'],
    queryFn: () => api.get('/schedules').then(r => r.data),
  })

  const activateMutation = useMutation({
    mutationFn: (id) => api.put(`/schedules/${id}/activate`),
    onSuccess: (_, id) => {
      toast.success('Horaire activé')
      qc.invalidateQueries(['schedules'])
    },
    onError: err => toast.error(err.response?.data?.error || 'Erreur'),
  })

  const saveMutation = useMutation({
    mutationFn: ({ id, data }) => api.put(`/schedules/${id}`, data),
    onSuccess: () => { toast.success('Horaire mis à jour'); qc.invalidateQueries(['schedules']) },
    onError: err => toast.error(err.response?.data?.error || 'Erreur'),
  })

  if (isLoading) return <p className="text-gray-500">Chargement...</p>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Horaires de travail</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            L'horaire actif est utilisé pour le calcul des anomalies lors de la synchronisation
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {data?.schedules?.map(schedule => (
          <ScheduleCard
            key={schedule.id}
            schedule={schedule}
            onActivate={(id) => activateMutation.mutate(id)}
            onSave={(id, formData) => saveMutation.mutate({ id, data: formData })}
          />
        ))}
      </div>

      {/* Légende anomalies */}
      <div className="card mt-4">
        <h3 className="text-sm font-medium text-gray-300 mb-3">Règles de calcul des anomalies</h3>
        <div className="grid grid-cols-2 gap-2 text-xs text-gray-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-yellow-400 rounded-full"></span>
            Retard matin : arrivée après heure début + tolérance
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-orange-400 rounded-full"></span>
            Retard après-midi : retour après 13h + tolérance (horaire normal)
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-red-400 rounded-full"></span>
            Sortie anticipée : départ avant heure fin - tolérance
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-green-400 rounded-full"></span>
            Récupéré : heures travaillées ≥ heures requises
          </div>
        </div>
      </div>
    </div>
  )
}
