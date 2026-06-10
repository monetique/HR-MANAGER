import React, { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Pin, Plus, Trash2, FileText, X, Megaphone, BookOpen, Calendar, Info, CheckCircle, ChevronDown, ChevronRight } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import api from '../api/client'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import toast from 'react-hot-toast'

const TYPES = {
  info:       { label: 'Information',     color: 'bg-blue-500/10 text-blue-400 border-blue-500/20',      icon: Info },
  newsletter: { label: 'Newsletter',      color: 'bg-purple-500/10 text-purple-400 border-purple-500/20', icon: BookOpen },
  event:      { label: 'Vie associative', color: 'bg-green-500/10 text-green-400 border-green-500/20',    icon: Calendar },
  welcome:    { label: 'Bienvenue',       color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20', icon: Megaphone },
}

export default function AnnouncementsPage() {
  const { hasRole, token } = useAuthStore()
  const qc = useQueryClient()

  const isRH = hasRole('superadmin', 'rh')
  const isAssistant = hasRole('hr_assistant')

  const [canManageAnnouncements, setCanManageAnnouncements] = useState(false)

  useEffect(() => {
    if (isAssistant) {
      api.get('/config/general').then(r => {
        setCanManageAnnouncements(r.data.config?.hr_assistant_can_view_announcements === 'true')
      }).catch(() => {})
    }
  }, [isAssistant])

  // Peut créer/supprimer/épingler des annonces
  const canCreate = isRH || (isAssistant && canManageAnnouncements)

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', content: '', type: 'info', is_pinned: false })
  const [file, setFile] = useState(null)
  const [expandedMonths, setExpandedMonths] = useState({})

  const { data, isLoading } = useQuery({
    queryKey: ['announcements'],
    queryFn: () => api.get('/announcements').then(r => r.data),
    refetchInterval: 30000,
  })

  const createMutation = useMutation({
    mutationFn: (fd) => api.post('/announcements', fd, { headers: { 'Content-Type': 'multipart/form-data' } }),
    onSuccess: () => {
      toast.success('Annonce publiée')
      qc.invalidateQueries(['announcements'])
      setShowForm(false)
      setForm({ title: '', content: '', type: 'info', is_pinned: false })
      setFile(null)
    }
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/announcements/${id}`),
    onSuccess: () => { toast.success('Supprimée'); qc.invalidateQueries(['announcements']) }
  })

  const pinMutation = useMutation({
    mutationFn: ({ id, ...d }) => api.put(`/announcements/${id}`, d),
    onSuccess: () => qc.invalidateQueries(['announcements'])
  })

  const readMutation = useMutation({
    mutationFn: (id) => api.post(`/announcements/${id}/read`),
    onSuccess: () => qc.invalidateQueries(['announcements'])
  })

  const handleSubmit = () => {
    if (!form.title || !form.content) return toast.error('Titre et contenu obligatoires')
    const fd = new FormData()
    Object.entries(form).forEach(([k,v]) => fd.append(k, v))
    if (file) fd.append('file', file)
    createMutation.mutate(fd)
  }

  const announcements = data?.announcements || []

  const pinned = announcements.filter(a => a.is_pinned)
  const others  = announcements.filter(a => !a.is_pinned)

  const grouped = useMemo(() => {
    const map = {}
    others.forEach(a => {
      const key = format(new Date(a.created_at), 'MMMM yyyy', { locale: fr })
      if (!map[key]) map[key] = []
      map[key].push(a)
    })
    return map
  }, [others])

  const months = Object.keys(grouped)
  const toggleMonth = (m) => setExpandedMonths(p => ({ ...p, [m]: !p[m] }))
  const isExpanded = (m) => expandedMonths[m] !== false

  const AnnouncementCard = ({ a }) => {
    const typeInfo = TYPES[a.type] || TYPES.info
    const Icon = typeInfo.icon
    return (
      <div className={`card transition-all ${!a.is_read ? 'border-l-2 border-l-blue-500' : ''} ${a.is_pinned ? 'border border-yellow-500/30' : ''}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1">
            <div className={`p-2 rounded-lg border shrink-0 ${typeInfo.color}`}>
              <Icon size={16} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                {a.is_pinned && <Pin size={12} className="text-yellow-400" />}
                {!a.is_read && <span className="w-2 h-2 bg-blue-500 rounded-full" />}
                <h3 className="font-semibold text-white">{a.title}</h3>
                <span className={`badge border text-xs ${typeInfo.color}`}>{typeInfo.label}</span>
              </div>
              <p className="text-gray-400 text-xs mt-1">
                Par <span className="text-gray-300">{a.author_name}</span> •{' '}
                {format(new Date(a.created_at), 'dd MMMM yyyy à HH:mm', { locale: fr })}
              </p>
              <p className="text-gray-300 text-sm mt-3 leading-relaxed whitespace-pre-wrap">{a.content}</p>
              {a.attachment && (
                <button onClick={async () => {
                  const res = await fetch(`/api/announcements/attachment/${a.attachment}`, {
                    headers: { Authorization: 'Bearer ' + token }
                  })
                  const blob = await res.blob()
                  const url = URL.createObjectURL(blob)
                  const link = document.createElement('a')
                  link.href = url; link.download = a.attachment; link.click()
                }} className="mt-3 flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm">
                  <FileText size={14} /> Télécharger la pièce jointe
                </button>
              )}
              {!a.is_read && (
                <button onClick={() => readMutation.mutate(a.id)}
                  className="mt-3 flex items-center gap-2 text-green-400 hover:text-green-300 text-xs">
                  <CheckCircle size={13} /> Marquer comme lu
                </button>
              )}
            </div>
          </div>
          {canCreate && (
            <div className="flex gap-2 shrink-0">
              <button onClick={() => pinMutation.mutate({
                id: a.id, title: a.title, content: a.content,
                type: a.type, is_pinned: !a.is_pinned, is_active: true
              })} className={`p-1.5 rounded ${a.is_pinned ? 'text-yellow-400' : 'text-gray-500 hover:text-yellow-400'}`}>
                <Pin size={15} />
              </button>
              <button onClick={() => deleteMutation.mutate(a.id)}
                className="p-1.5 rounded text-gray-500 hover:text-red-400">
                <Trash2 size={15} />
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Espace RH</h1>
          <p className="text-gray-400 text-sm mt-1">Annonces et informations de la direction RH</p>
        </div>
        {canCreate && (
          <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Nouvelle annonce
          </button>
        )}
      </div>

      {/* Formulaire */}
      {showForm && canCreate && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-white">Nouvelle annonce</h2>
            <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-200"><X size={18} /></button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Titre *</label>
              <input className="input" value={form.title}
                onChange={e => setForm({...form, title: e.target.value})} placeholder="Titre de l'annonce" />
            </div>
            <div>
              <label className="label">Type</label>
              <select className="input" value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
                {Object.entries(TYPES).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Contenu *</label>
            <textarea className="input h-32 resize-none" value={form.content}
              onChange={e => setForm({...form, content: e.target.value})} placeholder="Contenu de l'annonce..." />
          </div>
          <div className="flex items-center gap-6">
            <label className="cursor-pointer">
              <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                onChange={e => setFile(e.target.files[0])} />
              <span className="btn-secondary text-sm flex items-center gap-2">
                <FileText size={14} /> {file ? file.name : 'Joindre un fichier'}
              </span>
            </label>
            {file && <button onClick={() => setFile(null)} className="text-red-400"><X size={14} /></button>}
            <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-300">
              <input type="checkbox" checked={form.is_pinned}
                onChange={e => setForm({...form, is_pinned: e.target.checked})} />
              <Pin size={14} /> Épingler
            </label>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">Annuler</button>
            <button onClick={handleSubmit} disabled={createMutation.isPending} className="btn-primary flex-1">
              {createMutation.isPending ? 'Publication...' : 'Publier'}
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-10 text-gray-500">Chargement...</div>
      ) : announcements.length === 0 ? (
        <div className="card text-center py-12">
          <Megaphone size={40} className="text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">Aucune annonce pour le moment</p>
        </div>
      ) : (
        <div className="space-y-6">
          {pinned.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-yellow-400 flex items-center gap-2">
                <Pin size={14} /> Épinglées
              </h2>
              {pinned.map(a => <AnnouncementCard key={a.id} a={a} />)}
            </div>
          )}

          {months.map(month => (
            <div key={month}>
              <button onClick={() => toggleMonth(month)}
                className="flex items-center gap-2 text-sm font-medium text-gray-300 hover:text-white mb-3 capitalize">
                {isExpanded(month) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                {month}
                <span className="text-gray-500 text-xs">({grouped[month].length})</span>
                {grouped[month].some(a => !a.is_read) && (
                  <span className="w-2 h-2 bg-blue-500 rounded-full" />
                )}
              </button>
              {isExpanded(month) && (
                <div className="space-y-3">
                  {grouped[month].map(a => <AnnouncementCard key={a.id} a={a} />)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
