import React, { useState, useEffect } from 'react'
import { Mail, Send, Clock, Users, CheckCircle, AlertCircle } from 'lucide-react'
import api from '../../api/client'
import toast from 'react-hot-toast'

export default function MailSettings() {
  const [smtp, setSmtp] = useState({
    smtp_host: '',
    smtp_port: '587',
    smtp_secure: 'false',
    smtp_user: '',
    smtp_password: '',
    smtp_from: '',
    smtp_from_name: 'HR Manager',
  })

  const [recap, setRecap] = useState({
    recap_enabled: 'true',
    recap_day: '1',       // 1 = lundi
    recap_hour: '7',
    recap_subject: 'Récapitulatif hebdomadaire de votre équipe',
  })

  const [saving, setSaving]   = useState(false)
  const [testing, setTesting] = useState(false)
  const [testEmail, setTestEmail] = useState('')
  const [testResult, setTestResult] = useState(null)

  useEffect(() => {
    api.get('/config/general').then(r => {
      const c = r.data.config || {}
      setSmtp(prev => ({ ...prev, ...Object.fromEntries(Object.entries(c).filter(([k]) => k.startsWith('smtp_'))) }))
      setRecap(prev => ({ ...prev, ...Object.fromEntries(Object.entries(c).filter(([k]) => k.startsWith('recap_'))) }))
    }).catch(() => {})
  }, [])

  const saveSmtp = async () => {
    setSaving(true)
    try {
      await api.put('/config/general', { ...smtp, ...recap })
      toast.success('Configuration mail enregistrée')
    } catch(e) {
      toast.error('Erreur lors de la sauvegarde')
    } finally { setSaving(false) }
  }

  const sendTest = async () => {
    if (!testEmail) { toast.error('Entrez un email de test'); return }
    setTesting(true)
    setTestResult(null)
    try {
      const { data } = await api.post('/config/mail/test', { email: testEmail })
      setTestResult({ success: true, message: data.message || 'Email envoyé avec succès' })
      toast.success('Email de test envoyé')
    } catch(e) {
      setTestResult({ success: false, message: e.response?.data?.error || 'Erreur envoi' })
      toast.error('Échec envoi email de test')
    } finally { setTesting(false) }
  }

  const sendNow = async () => {
    try {
      await api.post('/config/mail/recap-now')
      toast.success('Récap envoyé manuellement aux managers')
    } catch(e) {
      toast.error(e.response?.data?.error || 'Erreur envoi récap')
    }
  }

  const days = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi']

  return (
    <div className="space-y-6">
      {/* Config SMTP */}
      <div className="card space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Mail size={18} className="text-blue-400" />
          <h2 className="text-sm font-semibold text-white">Configuration SMTP</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Serveur SMTP</label>
            <input className="input" placeholder="mail.entreprise.com"
              value={smtp.smtp_host} onChange={e => setSmtp({...smtp, smtp_host: e.target.value})} />
          </div>
          <div>
            <label className="label">Port</label>
            <select className="input" value={smtp.smtp_port} onChange={e => setSmtp({...smtp, smtp_port: e.target.value})}>
              <option value="25">25 (SMTP)</option>
              <option value="465">465 (SSL)</option>
              <option value="587">587 (TLS)</option>
            </select>
          </div>
          <div>
            <label className="label">Utilisateur SMTP</label>
            <input className="input" placeholder="user@entreprise.com"
              value={smtp.smtp_user} onChange={e => setSmtp({...smtp, smtp_user: e.target.value})} />
          </div>
          <div>
            <label className="label">Mot de passe SMTP</label>
            <input className="input" type="password" placeholder="••••••••"
              value={smtp.smtp_password} onChange={e => setSmtp({...smtp, smtp_password: e.target.value})} />
          </div>
          <div>
            <label className="label">Email expéditeur</label>
            <input className="input" placeholder="noreply@entreprise.com"
              value={smtp.smtp_from} onChange={e => setSmtp({...smtp, smtp_from: e.target.value})} />
          </div>
          <div>
            <label className="label">Nom expéditeur</label>
            <input className="input" placeholder="HR Manager"
              value={smtp.smtp_from_name} onChange={e => setSmtp({...smtp, smtp_from_name: e.target.value})} />
          </div>
          <div className="flex items-center gap-3">
            <input type="checkbox" id="smtp_secure" checked={smtp.smtp_secure === 'true'}
              onChange={e => setSmtp({...smtp, smtp_secure: e.target.checked ? 'true' : 'false'})}
              className="rounded" />
            <label htmlFor="smtp_secure" className="text-sm text-gray-300">Connexion sécurisée (SSL/TLS)</label>
          </div>
        </div>

        {/* Test SMTP */}
        <div className="border-t border-gray-800 pt-4">
          <p className="text-xs text-gray-500 mb-3">Tester la configuration en envoyant un email de test</p>
          <div className="flex gap-3">
            <input className="input flex-1" placeholder="email@test.com"
              value={testEmail} onChange={e => setTestEmail(e.target.value)} />
            <button onClick={sendTest} disabled={testing}
              className="btn-secondary flex items-center gap-2 px-4">
              <Send size={14} />
              {testing ? 'Envoi...' : 'Tester'}
            </button>
          </div>
          {testResult && (
            <div className={`flex items-center gap-2 mt-3 text-sm ${testResult.success ? 'text-green-400' : 'text-red-400'}`}>
              {testResult.success ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
              {testResult.message}
            </div>
          )}
        </div>
      </div>

      {/* Config récap hebdomadaire */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Clock size={18} className="text-blue-400" />
            <h2 className="text-sm font-semibold text-white">Récapitulatif hebdomadaire automatique</h2>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="recap_enabled" checked={recap.recap_enabled === 'true'}
              onChange={e => setRecap({...recap, recap_enabled: e.target.checked ? 'true' : 'false'})}
              className="rounded" />
            <label htmlFor="recap_enabled" className="text-sm text-gray-300">Activé</label>
          </div>
        </div>

        <div className={`space-y-4 ${recap.recap_enabled !== 'true' ? 'opacity-50 pointer-events-none' : ''}`}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="label">Jour d'envoi</label>
              <select className="input" value={recap.recap_day}
                onChange={e => setRecap({...recap, recap_day: e.target.value})}>
                {days.map((d,i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Heure d'envoi</label>
              <select className="input" value={recap.recap_hour}
                onChange={e => setRecap({...recap, recap_hour: e.target.value})}>
                {Array.from({length:24},(_,i) => (
                  <option key={i} value={i}>{String(i).padStart(2,'0')}:00</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Objet du mail</label>
              <input className="input" value={recap.recap_subject}
                onChange={e => setRecap({...recap, recap_subject: e.target.value})} />
            </div>
          </div>

          <div className="flex items-center gap-2 p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
            <Users size={16} className="text-blue-400 shrink-0" />
            <p className="text-xs text-blue-300">
              Chaque {days[parseInt(recap.recap_day)]} à {String(recap.recap_hour).padStart(2,'0')}h00, 
              un récapitulatif PDF de la semaine précédente sera envoyé automatiquement à chaque manager 
              avec la liste de présence de son équipe.
            </p>
          </div>

          {/* Envoi manuel */}
          <div className="border-t border-gray-800 pt-4">
            <p className="text-xs text-gray-500 mb-3">Envoyer le récapitulatif maintenant (semaine en cours)</p>
            <button onClick={sendNow} className="btn-secondary flex items-center gap-2">
              <Send size={14} /> Envoyer maintenant aux managers
            </button>
          </div>
        </div>
      </div>

      {/* Bouton sauvegarder */}
      <button onClick={saveSmtp} disabled={saving} className="btn-primary">
        {saving ? 'Enregistrement...' : 'Enregistrer la configuration'}
      </button>
    </div>
  )
}
