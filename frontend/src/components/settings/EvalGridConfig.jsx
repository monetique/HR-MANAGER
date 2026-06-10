import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Edit, Plus, Trash2, Save, X, ChevronDown, ChevronRight, Settings } from 'lucide-react'
import api from '../../api/client'
import toast from 'react-hot-toast'

const CATEGORY_LABELS = {
  directeur:     'Directeur',
  chef_division: 'Chef de Division',
  cadre:         'Cadre',
  employe:       'Employé',
}

const CATEGORY_COLORS = {
  directeur:     'bg-purple-500/10 text-purple-400 border-purple-500/20',
  chef_division: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  cadre:         'bg-green-500/10 text-green-400 border-green-500/20',
  employe:       'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
}

export default function EvalGridConfig() {
  const qc = useQueryClient()
  const [selectedGrid, setSelectedGrid] = useState(null)
  const [expandedSections, setExpandedSections] = useState({})
  const [editSection, setEditSection] = useState(null)
  const [editCriteria, setEditCriteria] = useState(null)
  const [newSection, setNewSection] = useState(null)
  const [newCriteria, setNewCriteria] = useState({})

  const { data, isLoading } = useQuery({
    queryKey: ['eval-grids'],
    queryFn: () => api.get('/evaluations/grids').then(r => r.data),
  })

  const updateSectionMutation = useMutation({
    mutationFn: ({ gridId, sectionId, ...d }) => api.put(`/evaluations/grids/${gridId}/section/${sectionId}`, d),
    onSuccess: () => { toast.success('Section mise à jour'); qc.invalidateQueries(['eval-grids']); setEditSection(null) }
  })

  const addSectionMutation = useMutation({
    mutationFn: ({ gridId, ...d }) => api.post(`/evaluations/grids/${gridId}/section`, d),
    onSuccess: () => { toast.success('Section ajoutée'); qc.invalidateQueries(['eval-grids']); setNewSection(null) }
  })

  const updateCriteriaMutation = useMutation({
    mutationFn: ({ id, ...d }) => api.put(`/evaluations/grids/criteria/${id}`, d),
    onSuccess: () => { toast.success('Critère mis à jour'); qc.invalidateQueries(['eval-grids']); setEditCriteria(null) }
  })

  const addCriteriaMutation = useMutation({
    mutationFn: ({ sectionId, ...d }) => api.post(`/evaluations/grids/section/${sectionId}/criteria`, d),
    onSuccess: (_, vars) => {
      toast.success('Critère ajouté')
      qc.invalidateQueries(['eval-grids'])
      setNewCriteria(nc => ({ ...nc, [vars.sectionId]: null }))
    }
  })

  const deleteCriteriaMutation = useMutation({
    mutationFn: (id) => api.delete(`/evaluations/grids/criteria/${id}`),
    onSuccess: () => { toast.success('Critère désactivé'); qc.invalidateQueries(['eval-grids']) }
  })

  const grids = data?.grids || []
  const grid = grids.find(g => g.id === selectedGrid)

  // Calcul total réel de la grille
  const calcTotal = (g) => {
    if (!g?.sections) return 0
    return g.sections.reduce((total, s) => {
      if (!s.is_active) return total
      return total + (s.criteria || []).reduce((st, c) => st + (c.is_active ? parseFloat(c.max_points) : 0), 0)
    }, 0)
  }

  if (isLoading) return <div className="text-center py-10 text-gray-500">Chargement...</div>

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-bold text-white text-lg flex items-center gap-2">
          <Settings size={20} className="text-blue-400" /> Configuration des grilles d'évaluation
        </h2>
        <p className="text-gray-400 text-sm mt-1">Gérez les sections et critères par catégorie d'employé</p>
      </div>

      {/* Sélection grille */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {grids.map(g => {
          const total = calcTotal(g)
          const isSelected = selectedGrid === g.id
          return (
            <button
              key={g.id}
              onClick={() => setSelectedGrid(isSelected ? null : g.id)}
              className={`card text-left transition-all ${isSelected ? 'ring-2 ring-blue-500' : 'hover:bg-gray-800/70'}`}
            >
              <span className={`badge border text-xs mb-2 inline-block ${CATEGORY_COLORS[g.category]}`}>
                {CATEGORY_LABELS[g.category]}
              </span>
              <p className="text-white font-semibold">{g.label}</p>
              <p className="text-gray-400 text-xs mt-1">
                Total: <span className={`font-bold ${Math.abs(total - 20) < 0.01 ? 'text-green-400' : 'text-red-400'}`}>
                  {total.toFixed(2)} / 20 pts
                </span>
              </p>
              <p className="text-gray-500 text-xs">
                {(g.sections || []).filter(s => s.is_active).length} sections •{' '}
                {(g.sections || []).reduce((n, s) => n + (s.criteria || []).filter(c => c.is_active).length, 0)} critères
              </p>
            </button>
          )
        })}
      </div>

      {/* Détail grille sélectionnée */}
      {grid && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white">
              Grille — <span className={`badge border ${CATEGORY_COLORS[grid.category]}`}>{CATEGORY_LABELS[grid.category]}</span>
            </h3>
            <button
              onClick={() => setNewSection({ gridId: grid.id, name: '', position: 99 })}
              className="btn-primary text-sm flex items-center gap-2"
            >
              <Plus size={14} /> Ajouter section
            </button>
          </div>

          {/* Formulaire nouvelle section */}
          {newSection && (
            <div className="card border border-blue-500/30 space-y-3">
              <h4 className="text-sm font-medium text-blue-400">Nouvelle section</h4>
              <div className="flex gap-3">
                <input
                  className="input flex-1"
                  placeholder="Nom de la section *"
                  value={newSection.name}
                  onChange={e => setNewSection({ ...newSection, name: e.target.value })}
                />
                <input
                  type="number"
                  className="input w-24"
                  placeholder="Ordre"
                  value={newSection.position}
                  onChange={e => setNewSection({ ...newSection, position: parseInt(e.target.value) })}
                />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setNewSection(null)} className="btn-secondary text-sm">Annuler</button>
                <button
                  onClick={() => addSectionMutation.mutate({ gridId: grid.id, name: newSection.name, position: newSection.position })}
                  className="btn-primary text-sm"
                >Ajouter</button>
              </div>
            </div>
          )}

          {/* Sections */}
          {(grid.sections || []).filter(s => s.is_active).sort((a, b) => a.position - b.position).map(section => {
            const isOpen = expandedSections[section.id] !== false
            const sectionTotal = (section.criteria || []).filter(c => c.is_active).reduce((s, c) => s + parseFloat(c.max_points), 0)

            return (
              <div key={section.id} className="card p-0 overflow-hidden">
                {/* Header section */}
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-800/50"
                  onClick={() => setExpandedSections(p => ({ ...p, [section.id]: !isOpen }))}
                >
                  <div className="flex items-center gap-3">
                    {isOpen ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
                    {editSection?.id === section.id ? (
                      <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                        <input
                          className="input text-sm py-1 w-48"
                          value={editSection.name}
                          onChange={e => setEditSection({ ...editSection, name: e.target.value })}
                        />
                        <input
                          type="number"
                          className="input text-sm py-1 w-16"
                          value={editSection.position}
                          onChange={e => setEditSection({ ...editSection, position: parseInt(e.target.value) })}
                        />
                        <button
                          onClick={() => updateSectionMutation.mutate({
                            gridId: grid.id, sectionId: section.id,
                            name: editSection.name, position: editSection.position, is_active: true
                          })}
                          className="text-green-400 hover:text-green-300"
                        ><Save size={14} /></button>
                        <button onClick={() => setEditSection(null)} className="text-gray-400 hover:text-gray-200">
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="font-semibold text-white">{section.name}</span>
                        <span className="text-xs text-gray-500">
                          {(section.criteria || []).filter(c => c.is_active).length} critères •{' '}
                          <span className="text-blue-400 font-medium">{sectionTotal.toFixed(2)} pts</span>
                        </span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => setEditSection({ id: section.id, name: section.name, position: section.position })}
                      className="text-gray-500 hover:text-blue-400 p-1"
                    ><Edit size={13} /></button>
                    <button
                      onClick={() => updateSectionMutation.mutate({
                        gridId: grid.id, sectionId: section.id,
                        name: section.name, position: section.position, is_active: false
                      })}
                      className="text-gray-500 hover:text-red-400 p-1"
                    ><Trash2 size={13} /></button>
                  </div>
                </div>

                {/* Critères */}
                {isOpen && (
                  <div className="border-t border-gray-800">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-800 bg-gray-800/30">
                          <th className="text-left px-4 py-2 text-gray-500 font-normal text-xs w-16">Code</th>
                          <th className="text-left px-4 py-2 text-gray-500 font-normal text-xs">Critère</th>
                          <th className="text-center px-4 py-2 text-gray-500 font-normal text-xs w-28">Note max (pts)</th>
                          <th className="text-center px-4 py-2 text-gray-500 font-normal text-xs w-20">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(section.criteria || []).filter(c => c.is_active).sort((a, b) => a.position - b.position).map(c => (
                          <tr key={c.id} className="border-b border-gray-800/50 last:border-0 hover:bg-gray-800/20">
                            {editCriteria?.id === c.id ? (
                              <td colSpan={4} className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <input
                                    className="input text-xs py-1 w-16"
                                    placeholder="Code"
                                    value={editCriteria.code || ''}
                                    onChange={e => setEditCriteria({ ...editCriteria, code: e.target.value })}
                                  />
                                  <input
                                    className="input text-xs py-1 flex-1"
                                    value={editCriteria.label}
                                    onChange={e => setEditCriteria({ ...editCriteria, label: e.target.value })}
                                  />
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.25"
                                      className="input text-xs py-1 w-20 text-center font-bold text-blue-400"
                                      value={editCriteria.max_points}
                                      onChange={e => setEditCriteria({ ...editCriteria, max_points: parseFloat(e.target.value) })}
                                    />
                                    <span className="text-gray-500 text-xs">pts</span>
                                  </div>
                                  <button
                                    onClick={() => updateCriteriaMutation.mutate(editCriteria)}
                                    className="text-green-400 hover:text-green-300 p-1"
                                  ><Save size={14} /></button>
                                  <button onClick={() => setEditCriteria(null)} className="text-gray-400 p-1">
                                    <X size={14} />
                                  </button>
                                </div>
                              </td>
                            ) : (
                              <>
                                <td className="px-4 py-2.5 text-gray-500 text-xs font-mono">{c.code || '—'}</td>
                                <td className="px-4 py-2.5 text-gray-200 text-sm">{c.label}</td>
                                <td className="px-4 py-2.5 text-center">
                                  <span className="text-blue-400 font-bold">{parseFloat(c.max_points).toFixed(2)}</span>
                                  <span className="text-gray-500 text-xs"> pts</span>
                                </td>
                                <td className="px-4 py-2.5 text-center">
                                  <div className="flex items-center justify-center gap-1">
                                    <button
                                      onClick={() => setEditCriteria({ id: c.id, code: c.code, label: c.label, max_points: c.max_points, position: c.position, is_active: true })}
                                      className="text-gray-500 hover:text-blue-400 p-1"
                                    ><Edit size={13} /></button>
                                    <button
                                      onClick={() => { if (confirm('Supprimer ce critère ?')) deleteCriteriaMutation.mutate(c.id) }}
                                      className="text-gray-500 hover:text-red-400 p-1"
                                    ><Trash2 size={13} /></button>
                                  </div>
                                </td>
                              </>
                            )}
                          </tr>
                        ))}

                        {/* Formulaire nouveau critère */}
                        {newCriteria[section.id] ? (
                          <tr className="border-t border-blue-500/20 bg-blue-500/5">
                            <td colSpan={4} className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <input
                                  className="input text-xs py-1 w-16"
                                  placeholder="Code"
                                  value={newCriteria[section.id].code || ''}
                                  onChange={e => setNewCriteria(n => ({ ...n, [section.id]: { ...n[section.id], code: e.target.value } }))}
                                />
                                <input
                                  className="input text-xs py-1 flex-1"
                                  placeholder="Libellé du critère *"
                                  value={newCriteria[section.id].label || ''}
                                  onChange={e => setNewCriteria(n => ({ ...n, [section.id]: { ...n[section.id], label: e.target.value } }))}
                                />
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.25"
                                    className="input text-xs py-1 w-20 text-center"
                                    placeholder="pts"
                                    value={newCriteria[section.id].max_points || ''}
                                    onChange={e => setNewCriteria(n => ({ ...n, [section.id]: { ...n[section.id], max_points: parseFloat(e.target.value) } }))}
                                  />
                                  <span className="text-gray-500 text-xs">pts</span>
                                </div>
                                <button
                                  onClick={() => addCriteriaMutation.mutate({
                                    sectionId: section.id,
                                    code: newCriteria[section.id].code,
                                    label: newCriteria[section.id].label,
                                    max_points: newCriteria[section.id].max_points || 1,
                                  })}
                                  className="text-green-400 hover:text-green-300 p-1"
                                ><Save size={14} /></button>
                                <button
                                  onClick={() => setNewCriteria(n => ({ ...n, [section.id]: null }))}
                                  className="text-gray-400 p-1"
                                ><X size={14} /></button>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          <tr>
                            <td colSpan={4} className="px-4 py-2">
                              <button
                                onClick={() => setNewCriteria(n => ({ ...n, [section.id]: { code: '', label: '', max_points: 1 } }))}
                                className="text-gray-500 hover:text-blue-400 text-xs flex items-center gap-1"
                              >
                                <Plus size={12} /> Ajouter un critère
                              </button>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>

                    {/* Avertissement total ≠ 20 */}
                    {Math.abs(calcTotal(grid) - 20) > 0.01 && (
                      <div className="px-4 py-2 bg-red-500/10 border-t border-red-500/20">
                        <p className="text-red-400 text-xs">
                          ⚠ Total de la grille: {calcTotal(grid).toFixed(2)} pts — doit être égal à 20 pts
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
