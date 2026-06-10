import React, { useState, useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Edit, Trash2, Users, Building2, Check, X, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import api, { orgAPI } from '../api/client'
import toast from 'react-hot-toast'

const LEVEL_COLORS = [
  { bg: '#1B9BBF', border: '#1B9BBF', text: '#ffffff', light: '#E8F6FA' },
  { bg: '#7c3aed', border: '#7c3aed', text: '#ffffff', light: '#f3f0ff' },
  { bg: '#059669', border: '#059669', text: '#ffffff', light: '#ecfdf5' },
  { bg: '#d97706', border: '#d97706', text: '#ffffff', light: '#fffbeb' },
  { bg: '#dc2626', border: '#dc2626', text: '#ffffff', light: '#fef2f2' },
]

function getColor(depth) {
  return LEVEL_COLORS[Math.min(depth, LEVEL_COLORS.length - 1)]
}

// Calculer les niveaux depuis level_id (source de vérité)
function assignLevels(units) {
  const map = {}
  // Trouver le level_id min pour normaliser
  const minLevel = Math.min(...units.map(u => u.level_id || 1))
  units.forEach(u => map[u.id] = { ...u, children: [], level: (u.level_id || 1) - minLevel })
  const roots = []
  units.forEach(u => {
    if (u.parent_id && map[u.parent_id]) {
      map[u.parent_id].children.push(map[u.id])
    } else {
      roots.push(map[u.id])
    }
  })
  return { map, roots }
}

// Collecter tous les noeuds par niveau
function getNodesByLevel(roots) {
  const levels = []
  function traverse(nodes) {
    nodes.forEach(n => {
      while (levels.length <= n.level) levels.push([])
      levels[n.level].push(n)
      traverse(n.children)
    })
  }
  traverse(roots)
  return levels
}

// Noeud éditable
function OrgNode({ node, depth, onEdit, onAdd, onDelete, empCount, editing, onStartEdit, onCancelEdit }) {
  const [editName, setEditName] = useState(node.name)
  const [editCode, setEditCode] = useState(node.code || '')
  const color = getColor(depth)
  const isEditing = editing === node.id

  const handleSave = () => {
    onEdit(node.id, { name: editName, code: editCode })
    onCancelEdit()
  }

  return (
    <div className="flex flex-col items-center" style={{ minWidth: 160 }}>
      <div className="relative group w-40">
        {isEditing ? (
          <div className="rounded-xl border-2 p-2 bg-gray-900 space-y-1.5 shadow-xl"
            style={{ borderColor: color.border }}>
            <input className="input text-xs h-7 w-full" value={editName}
              onChange={e => setEditName(e.target.value)} autoFocus />
            <input className="input text-xs h-6 w-full" value={editCode}
              onChange={e => setEditCode(e.target.value)} placeholder="Code" />
            <div className="flex gap-1 pt-0.5">
              <button onClick={onCancelEdit}
                className="flex-1 flex items-center justify-center gap-1 py-1 text-xs text-gray-400 hover:text-gray-200 border border-gray-700 rounded-lg">
                <X size={10} /> Annuler
              </button>
              <button onClick={handleSave}
                className="flex-1 flex items-center justify-center gap-1 py-1 text-xs text-white rounded-lg"
                style={{ backgroundColor: color.bg }}>
                <Check size={10} /> OK
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden shadow-lg border-2 cursor-default"
            style={{ borderColor: color.border }}>
            <div className="px-3 py-2" style={{ backgroundColor: color.bg }}>
              <div className="flex items-center gap-1.5">
                <Building2 size={12} style={{ color: color.text }} />
                <span className="text-xs font-bold leading-tight truncate"
                  style={{ color: color.text }}>{node.name}</span>
              </div>
            </div>
            <div className="px-3 py-1.5 bg-gray-900">
              {node.code && <p className="text-xs text-gray-500 mb-0.5">{node.code}</p>}
              <div className="flex items-center gap-1">
                <Users size={10} className="text-gray-500" />
                <span className="text-xs text-gray-400">{empCount} emp.</span>
              </div>
            </div>
            {/* Actions au hover */}
            <div className="bg-gray-800/80 px-2 py-1 flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => { setEditName(node.name); setEditCode(node.code||''); onStartEdit(node.id) }}
                className="p-0.5 text-gray-400 hover:text-blue-400" title="Modifier">
                <Edit size={12} />
              </button>
              <button onClick={() => onAdd(node.id)}
                className="p-0.5 text-gray-400 hover:text-green-400" title="Ajouter sous-unité">
                <Plus size={12} />
              </button>
              {node.children.length === 0 && empCount === 0 && (
                <button onClick={() => onDelete(node.id)}
                  className="p-0.5 text-gray-400 hover:text-red-400" title="Supprimer">
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Modal ajout
function AddUnitModal({ parentId, units, levels, onClose, onSave }) {
  const [form, setForm] = useState({ name: '', code: '', level_id: '', parent_id: parentId || '' })
  const s = v => setForm(f => ({ ...f, ...v }))
  const parentUnit = units.find(u => u.id === parseInt(parentId))

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-white">Nouvelle unité</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-200"><X size={20} /></button>
        </div>
        {parentUnit && (
          <div className="text-xs text-gray-400 bg-gray-800 rounded-lg px-3 py-2">
            Sous-unité de : <span className="text-blue-400 font-medium">{parentUnit.name}</span>
          </div>
        )}
        <div className="space-y-3">
          <div>
            <label className="label">Nom *</label>
            <input className="input" value={form.name} onChange={e => s({ name: e.target.value })} autoFocus />
          </div>
          <div>
            <label className="label">Code</label>
            <input className="input" value={form.code} onChange={e => s({ code: e.target.value })} />
          </div>
          <div>
            <label className="label">Niveau hiérarchique</label>
            <select className="input" value={form.level_id} onChange={e => s({ level_id: e.target.value })}>
              <option value="">-- Sélectionner --</option>
              {(levels || []).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Unité parente</label>
            <select className="input" value={form.parent_id} onChange={e => s({ parent_id: e.target.value })}>
              <option value="">-- Racine --</option>
              {(units || []).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">Annuler</button>
          <button onClick={() => { if(form.name) onSave(form) }} className="btn-primary flex-1">Créer</button>
        </div>
      </div>
    </div>
  )
}

// Organigramme par niveaux avec SVG pour les lignes
function OrgChart({ roots, allNodes, onEdit, onAdd, onDelete, employees, editing, onStartEdit, onCancelEdit }) {
  const NODE_W = 160
  const NODE_H = 90
  const H_GAP = 24
  const V_GAP = 60

  // Calculer positions x/y pour chaque noeud
  const positions = useMemo(() => {
    const pos = {}

    function calcWidth(node) {
      if (!node.children || node.children.length === 0) return NODE_W
      const childrenWidth = node.children.reduce((sum, c) => sum + calcWidth(c) + H_GAP, -H_GAP)
      return Math.max(NODE_W, childrenWidth)
    }

    function assignPos(node, x, y) {
      // Utiliser le level réel pour la position Y
      const nodeY = node.level * (NODE_H + V_GAP)
      if (!node.children || node.children.length === 0) {
        pos[node.id] = { x: x + NODE_W / 2, y: nodeY }
        return NODE_W
      }
      const totalW = node.children.reduce((sum, c) => sum + calcWidth(c) + H_GAP, -H_GAP)
      pos[node.id] = { x: x + Math.max(NODE_W, totalW) / 2, y: nodeY }
      let cx = x + (Math.max(NODE_W, totalW) - totalW) / 2
      node.children.forEach(c => {
        const cw = calcWidth(c)
        assignPos(c, cx, 0)
        cx += cw + H_GAP
      })
      return Math.max(NODE_W, totalW)
    }

    let x = 0
    roots.forEach(root => {
      const w = assignPos(root, x, 0)
      x += w + H_GAP * 2
    })
    return pos
  }, [roots])

  // Calculer taille totale du SVG
  const maxX = Math.max(...Object.values(positions).map(p => p.x)) + NODE_W / 2 + 20
  const maxY = Math.max(...Object.values(positions).map(p => p.y)) + NODE_H + 20

  // Collecter toutes les connexions parent→enfant
  const connections = []
  function collectConnections(node) {
    if (!node.children) return
    node.children.forEach(child => {
      const p = positions[node.id]
      const c = positions[child.id]
      if (p && c) {
        connections.push({
          x1: p.x, y1: p.y + NODE_H,
          x2: c.x, y2: c.y,
          color: getColor(child.level).bg
        })
      }
      collectConnections(child)
    })
  }
  roots.forEach(r => collectConnections(r))

  const empCountMap = {}
  employees.forEach(e => {
    if (e.org_unit_id && e.is_active) {
      empCountMap[e.org_unit_id] = (empCountMap[e.org_unit_id] || 0) + 1
    }
  })

  return (
    <div style={{ position: 'relative', width: maxX, height: maxY, minHeight: 200 }}>
      {/* SVG pour les connexions */}
      <svg style={{ position: 'absolute', top: 0, left: 0, width: maxX, height: maxY, overflow: 'visible', pointerEvents: 'none' }}>
        {connections.map((c, i) => {
          const midY = (c.y1 + c.y2) / 2
          return (
            <path key={i}
              d={`M ${c.x1} ${c.y1} C ${c.x1} ${midY}, ${c.x2} ${midY}, ${c.x2} ${c.y2}`}
              fill="none" stroke="#374151" strokeWidth="1.5" strokeDasharray="4 2"
            />
          )
        })}
      </svg>

      {/* Noeuds */}
      {Object.values(allNodes).map(node => {
        const p = positions[node.id]
        if (!p) return null
        return (
          <div key={node.id}
            style={{
              position: 'absolute',
              left: p.x - NODE_W / 2,
              top: p.y,
              width: NODE_W,
            }}>
            <OrgNode
              node={node}
              depth={node.level}
              onEdit={onEdit}
              onAdd={onAdd}
              onDelete={onDelete}
              empCount={empCountMap[node.id] || 0}
              editing={editing}
              onStartEdit={onStartEdit}
              onCancelEdit={onCancelEdit}
            />
          </div>
        )
      })}
    </div>
  )
}

// Page principale
export default function OrgPage() {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [addParentId, setAddParentId] = useState(null)
  const [editing, setEditing] = useState(null)
  const [zoom, setZoom] = useState(0.85)

  const { data: unitsData } = useQuery({ queryKey: ['org-units'], queryFn: () => orgAPI.units().then(r => r.data) })
  const { data: levelsData } = useQuery({ queryKey: ['org-levels'], queryFn: () => orgAPI.levels().then(r => r.data) })
  const { data: empData } = useQuery({ queryKey: ['employees-all'], queryFn: () => api.get('/employees').then(r => r.data) })

  const createMutation = useMutation({
    mutationFn: (data) => orgAPI.createUnit(data),
    onSuccess: () => { toast.success('Unité créée'); qc.invalidateQueries(['org-units']); setShowAdd(false) }
  })
  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }) => orgAPI.updateUnit(id, data),
    onSuccess: () => { toast.success('Unité mise à jour'); qc.invalidateQueries(['org-units']) }
  })
  const deleteMutation = useMutation({
    mutationFn: (id) => orgAPI.deleteUnit(id),
    onSuccess: () => { toast.success('Unité supprimée'); qc.invalidateQueries(['org-units']) }
  })

  const units = unitsData?.units || []
  const employees = empData?.employees || []
  const { map: allNodes, roots } = useMemo(() => assignLevels(units), [units])

  const handleEdit = useCallback((id, data) => updateMutation.mutate({ id, ...data }), [updateMutation])
  const handleAdd = useCallback((parentId) => { setAddParentId(parentId); setShowAdd(true) }, [])
  const handleDelete = useCallback((id) => { if (window.confirm('Supprimer ?')) deleteMutation.mutate(id) }, [deleteMutation])

  const levels = useMemo(() => getNodesByLevel(roots), [roots])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Organigramme</h1>
          <p className="text-gray-400 text-sm">{units.length} unités — survolez un noeud pour le modifier</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Légende niveaux */}
          <div className="flex items-center gap-3 mr-4">
            {levels.map((lvl, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getColor(i).bg }} />
                <span className="text-xs text-gray-400">Niv. {i+1} ({lvl.length})</span>
              </div>
            ))}
          </div>
          {/* Zoom */}
          <button onClick={() => setZoom(z => Math.max(0.4, z - 0.1))} className="btn-secondary p-2"><ZoomOut size={16} /></button>
          <span className="text-xs text-gray-400 w-10 text-center">{Math.round(zoom*100)}%</span>
          <button onClick={() => setZoom(z => Math.min(1.5, z + 0.1))} className="btn-secondary p-2"><ZoomIn size={16} /></button>
          <button onClick={() => setZoom(0.85)} className="btn-secondary p-2" title="Réinitialiser"><Maximize2 size={16} /></button>
          <button onClick={() => { setAddParentId(null); setShowAdd(true) }} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Nouvelle unité
          </button>
        </div>
      </div>

      {/* Arbre */}
      <div className="card overflow-auto" style={{ maxHeight: 'calc(100vh - 180px)' }}>
        <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top center', padding: 20, transition: 'transform 0.2s' }}>
          <OrgChart
            roots={roots}
            allNodes={allNodes}
            onEdit={handleEdit}
            onAdd={handleAdd}
            onDelete={handleDelete}
            employees={employees}
            editing={editing}
            onStartEdit={setEditing}
            onCancelEdit={() => setEditing(null)}
          />
        </div>
      </div>

      {showAdd && (
        <AddUnitModal
          parentId={addParentId}
          units={units}
          levels={levelsData?.levels || []}
          onClose={() => setShowAdd(false)}
          onSave={(form) => createMutation.mutate(form)}
        />
      )}
    </div>
  )
}
