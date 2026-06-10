import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, Eye, EyeOff } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { authAPI } from '../api/client'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd]   = useState(false)
  const [loading, setLoading]   = useState(false)
  const { setAuth }             = useAuthStore()
  const navigate                = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const { data } = await authAPI.login(email, password)
      setAuth(data.employee, data.token, data.refreshToken)
      toast.success(`Bienvenue, ${data.employee.first_name} !`)
      navigate('/')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Identifiants invalides')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Users size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">HR Manager</h1>
          <p className="text-gray-400 mt-1">Monétique Tunisie</p>
        </div>

        {/* Form */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-6">Connexion</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                className="input"
                placeholder="votre@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div>
              <label className="label">Mot de passe</label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  className="input pr-10"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
                <button type="button" onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200">
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
              {loading ? 'Connexion...' : 'Se connecter'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
