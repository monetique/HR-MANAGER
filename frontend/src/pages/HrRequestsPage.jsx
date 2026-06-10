import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import * as XLSX from 'xlsx';

// ── Constantes ────────────────────────────────────────────────
const API = '/api';

const STATUS_CONFIG = {
  pending: {
    label: 'En cours',
    color: '#f59e0b',
    bg: '#2a1f0a',
    border: '#fde68a',
    icon: '🟡',
    step: 0
  },
  in_progress: {
    label: 'Prise en charge',
    color: '#3b82f6',
    bg: '#0a1628',
    border: '#bfdbfe',
    icon: '🔵',
    step: 1
  },
  closed: {
    label: 'Clôturée',
    color: '#10b981',
    bg: '#0a2015',
    border: '#a7f3d0',
    icon: '✅',
    step: 2
  },
  rejected: {
    label: 'Rejetée',
    color: '#ef4444',
    bg: '#2a0a0a',
    border: '#fecaca',
    icon: '❌',
    step: -1
  },
  approved: {
    label: 'Approuvée',
    color: '#10b981',
    bg: '#0a2015',
    border: '#a7f3d0',
    icon: '✅',
    step: 2
  }
};

const STEPS = [
  { key: 'pending',     label: 'En cours' },
  { key: 'in_progress', label: 'Prise en charge' },
  { key: 'closed',      label: 'Clôturée' }
];

const HR_TYPES = [
  { value: 'Attestation de travail',         label: 'Attestation de travail' },
  { value: 'Attestation de salaire',         label: 'Attestation de salaire' },
  { value: 'Congé exceptionnel',             label: 'Congé exceptionnel' },
  { value: 'Avance sur salaire',             label: 'Avance sur salaire' },
  { value: 'Mutation / Changement de poste', label: 'Mutation / Changement de poste' },
  { value: 'Ordre de mission',               label: 'Ordre de mission' },
  { value: 'Certificat médical',             label: 'Certificat médical' },
  { value: 'Demande de formation',           label: 'Demande de formation' },
  { value: 'Avance remboursable - Aïd Seghir',  label: 'Avance remboursable - Aïd Seghir' },
  { value: 'Avance remboursable - Aïd el Kébir', label: 'Avance remboursable - Aïd el Kébir' },
  { value: 'Autre',                               label: 'Autre' },
];

// Mapping anciens types snake_case → libellés lisibles
const TYPE_LABELS = {
  formation:            'Demande de formation',
  avance:               'Avance sur salaire',
  attestation_salaire:  'Attestation de salaire',
  attestation_travail:  'Attestation de travail',
};

function getTypeLabel(type) {
  if (TYPE_LABELS[type]) return TYPE_LABELS[type];
  const found = HR_TYPES.find(t => t.value === type);
  return found ? found.label : type;
}


// ── Utilitaires ───────────────────────────────────────────────
function fmt(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || { label: status, color: '#94a3b8', bg: '#f9fafb', border: '#e5e7eb', icon: '○' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
      borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 600
    }}>
      <span>{cfg.icon}</span> {cfg.label}
    </span>
  );
}

// ── Timeline ──────────────────────────────────────────────────
function StatusTimeline({ currentStatus, history = [] }) {
  const currentStep = STATUS_CONFIG[currentStatus]?.step ?? 0;

  return (
    <div style={{ padding: '16px 0' }}>
      {/* Barre de progression */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24, position: 'relative' }}>
        {STEPS.map((step, i) => {
          const isDone    = i < currentStep;
          const isCurrent = i === currentStep;
          const cfg       = STATUS_CONFIG[step.key];
          const dotColor  = isCurrent ? cfg.color : isDone ? '#10b981' : '#d1d5db';
          return (
            <div key={step.key} style={{ flex: i < STEPS.length - 1 ? 1 : 0, display: 'flex', alignItems: 'center' }}>
              {/* Dot */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 80 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: isCurrent ? cfg.color : isDone ? '#10b981' : '#f3f4f6',
                  border: `2px solid ${dotColor}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, transition: 'all .3s',
                  boxShadow: isCurrent ? `0 0 0 4px ${cfg.color}22` : 'none'
                }}>
                  {isDone ? <span style={{ color: '#fff', fontSize: 14 }}>✓</span>
                          : isCurrent ? <span style={{ color: '#fff', fontSize: 12 }}>●</span>
                          : <span style={{ color: '#d1d5db', fontSize: 12 }}>○</span>}
                </div>
                <span style={{ marginTop: 6, fontSize: 11, fontWeight: isCurrent ? 700 : 400, color: isCurrent ? cfg.color : isDone ? '#374151' : '#9ca3af', textAlign: 'center', whiteSpace: 'nowrap' }}>
                  {step.label}
                </span>
              </div>
              {/* Ligne de connexion */}
              {i < STEPS.length - 1 && (
                <div style={{ flex: 1, height: 3, background: isDone ? '#10b981' : '#e5e7eb', margin: '0 4px', marginBottom: 20, borderRadius: 2, transition: 'background .3s' }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Historique détaillé */}
      {history.length > 0 && (
        <div>
          <p style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Historique
          </p>
          <div style={{ borderLeft: '2px solid #e5e7eb', paddingLeft: 16 }}>
            {history.map((h, i) => {
              const cfg = STATUS_CONFIG[h.new_status] || {};
              return (
                <div key={i} style={{ marginBottom: 12, position: 'relative' }}>
                  <div style={{
                    position: 'absolute', left: -21, top: 4,
                    width: 10, height: 10, borderRadius: '50%',
                    background: cfg.color || '#d1d5db',
                    border: '2px solid #fff',
                    boxShadow: '0 0 0 2px ' + (cfg.color || '#d1d5db') + '44'
                  }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <StatusBadge status={h.new_status} />
                    <span style={{ fontSize: 12, color: '#64748b' }}>{fmt(h.created_at)}</span>
                    {h.changed_by_name && (
                      <span style={{ fontSize: 12, color: '#94a3b8' }}>par <strong>{h.changed_by_name}</strong></span>
                    )}
                  </div>
                  {h.comment && (
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: '#cbd5e1', fontStyle: 'italic', background: '#151c2c', borderRadius: 6, padding: '6px 10px' }}>
                      💬 {h.comment}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Modal détail / suivi ──────────────────────────────────────
function RequestDetailModal({ request, onClose, onStatusChange, canChangeStatus }) {
  const [history, setHistory]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [newStatus, setNewStatus] = useState('');
  const [comment, setComment]     = useState('');
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');

  useEffect(() => {
    fetchHistory();
  }, [request.id]);

  async function fetchHistory() {
    setLoading(true);
    try {
      const token = useAuthStore.getState().token;
      const res = await fetch(`${API}/hr-requests/${request.id}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.success) setHistory(data.history || []);
    } catch { /* silent */ }
    setLoading(false);
  }

  async function handleStatusChange() {
    if (!newStatus) return;
    setSaving(true);
    setError('');
    try {
      const token = useAuthStore.getState().token;
      const res = await fetch(`${API}/hr-requests/${request.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ new_status: newStatus, comment })
      });
      const data = await res.json();
      if (data.success) {
        onStatusChange(request.id, newStatus, data.request);
        setNewStatus('');
        setComment('');
        fetchHistory();
      } else {
        setError(data.error || 'Erreur lors de la mise à jour');
      }
    } catch {
      setError('Erreur réseau');
    }
    setSaving(false);
  }

  // Statuts suivants autorisés
  const nextStatuses = {
    pending:     [{ value: 'in_progress', label: '🔵 Prise en charge' }, { value: 'closed', label: '✅ Clôturée' }, { value: 'rejected', label: '❌ Rejetée' }],
    in_progress: [{ value: 'pending', label: '🟡 En cours' }, { value: 'closed', label: '✅ Clôturée' }, { value: 'rejected', label: '❌ Rejetée' }],
    closed:      [],
    rejected:    []
  };
  const allowed = nextStatuses[request.status] || [];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div style={{ background: '#1a2236', borderRadius: 16, width: '100%', maxWidth: 580, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.18)' }}>

        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg, #1e3a5f, #2563eb)', padding: '24px 28px', borderRadius: '16px 16px 0 0', color: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p style={{ margin: '0 0 4px', fontSize: 12, color: '#93c5fd', fontWeight: 500 }}>
                Demande #{String(request.id).padStart(5, '0')}
              </p>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{getTypeLabel(request.type)}</h2>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#bfdbfe' }}>{request.employee_name}</p>
            </div>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontSize: 18 }}>×</button>
          </div>
        </div>

        <div style={{ padding: '24px 28px' }}>
          {/* Info demande */}
          <div style={{ background: '#0f172a', border: '1px solid #2d3748', borderRadius: 10, padding: 16, marginBottom: 24 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: 13 }}>
              <div><span style={{ color: '#64748b' }}>Date soumission</span><br /><strong>{fmtDate(request.created_at)}</strong></div>
              <div><span style={{ color: '#64748b' }}>Statut</span><br /><StatusBadge status={request.status} /></div>
              {request.validator_name && (
                <div><span style={{ color: '#64748b' }}>Traité par</span><br /><strong>{request.validator_name}</strong></div>
              )}
              {request.status_updated_at && (
                <div><span style={{ color: '#64748b' }}>Dernière MAJ</span><br /><strong>{fmtDate(request.status_updated_at)}</strong></div>
              )}
            </div>
            {request.description && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #2d3748' }}>
                <p style={{ margin: '0 0 4px', fontSize: 12, color: '#64748b' }}>Description</p>
                <p style={{ margin: 0, fontSize: 13, color: '#cbd5e1' }}>{request.description}</p>
              </div>
            )}
            {request.status_comment && (
              <div style={{ marginTop: 8 }}>
                <p style={{ margin: '0 0 4px', fontSize: 12, color: '#64748b' }}>Commentaire RH</p>
                <p style={{ margin: 0, fontSize: 13, color: '#cbd5e1', fontStyle: 'italic' }}>{request.status_comment}</p>
              </div>
            )}
          </div>

          {/* Timeline */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: 20, color: '#64748b' }}>Chargement...</div>
          ) : (
            <StatusTimeline currentStatus={request.status} history={history} />
          )}

          {/* Changer statut (RH uniquement) */}
          {canChangeStatus && allowed.length > 0 && (
            <div style={{ marginTop: 20, background: '#0a1628', border: '1px solid #1e3a5f', borderRadius: 10, padding: 16 }}>
              <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, color: '#0369a1' }}>Mettre à jour le statut</p>
              <select
                value={newStatus}
                onChange={e => setNewStatus(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #1e3a5f', marginBottom: 10, fontSize: 13, background: '#0f172a', color: '#f1f5f9', colorScheme: 'dark' }}
              >
                <option value="">— Choisir un statut —</option>
                {allowed.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <textarea
                placeholder="Commentaire (optionnel)..."
                value={comment}
                onChange={e => setComment(e.target.value)}
                rows={2}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #1e3a5f', fontSize: 13, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', color: '#cbd5e1', background: '#1e2535' }}
              />
              {error && <p style={{ margin: '6px 0 0', fontSize: 12, color: '#ef4444' }}>{error}</p>}
              <button
                onClick={handleStatusChange}
                disabled={!newStatus || saving}
                style={{
                  marginTop: 10, padding: '8px 20px', background: newStatus ? '#2563eb' : '#e5e7eb',
                  color: newStatus ? '#fff' : '#9ca3af', border: 'none', borderRadius: 8,
                  fontSize: 13, fontWeight: 600, cursor: newStatus ? 'pointer' : 'not-allowed', transition: 'all .2s'
                }}
              >
                {saving ? 'Enregistrement...' : 'Mettre à jour'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Modal nouvelle demande ─────────────────────────────────────
function NewRequestModal({ onClose, onCreated }) {
  const [form, setForm]     = useState({ type: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  async function handleSubmit() {
    if (!form.type) return setError('Veuillez choisir un type de demande.');
    setSaving(true);
    setError('');
    try {
      const token = useAuthStore.getState().token;
      const res = await fetch(`${API}/hr-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (data.success) { onCreated(data.request); onClose(); }
      else setError(data.error || 'Erreur lors de la création');
    } catch { setError('Erreur réseau'); }
    setSaving(false);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div style={{ background: '#1a2236', borderRadius: 16, width: '100%', maxWidth: 480, boxShadow: '0 24px 64px rgba(0,0,0,0.18)' }}>
        <div style={{ background: 'linear-gradient(135deg, #1e3a5f, #2563eb)', padding: '24px 28px', borderRadius: '16px 16px 0 0', color: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Nouvelle demande RH</h2>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontSize: 18 }}>×</button>
          </div>
        </div>
        <div style={{ padding: '24px 28px' }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>Type de demande *</label>
            <select
              value={form.type}
              onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #374151', fontSize: 13, boxSizing: 'border-box', background: '#0f172a', color: '#f1f5f9', colorScheme: 'dark' }}
            >
              <option value="">— Sélectionner —</option>
              {HR_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>Description / Motif</label>
            <textarea
              placeholder="Décrivez votre demande..."
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={4}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #374151', fontSize: 13, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', color: '#cbd5e1', background: '#1e2535' }}
            />
          </div>
          {error && <p style={{ margin: '0 0 12px', fontSize: 12, color: '#ef4444' }}>{error}</p>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={{ padding: '9px 18px', background: '#1e2535', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>Annuler</button>
            <button onClick={handleSubmit} disabled={saving} style={{ padding: '9px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              {saving ? 'Envoi...' : 'Soumettre la demande'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Panneau Statistiques RH ───────────────────────────────────
function StatsPanel() {
  const [filters, setFilters] = useState({ date_from: '', date_to: '', type: '', status: '' });
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const STATUS_LABELS_FR = { pending: 'En cours', in_progress: 'Prise en charge', closed: 'Clôturée', rejected: 'Rejetée' };
  const TYPE_OPTIONS = [
    'Attestation de travail', 'Attestation de salaire', 'Congé exceptionnel',
    'Avance sur salaire', 'Mutation / Changement de poste', 'Ordre de mission',
    'Certificat médical', 'Demande de formation',
    'Avance remboursable - Aïd Seghir', 'Avance remboursable - Aïd el Kébir', 'Autre'
  ];

  async function fetchStats() {
    setLoading(true); setError('');
    try {
      const token = useAuthStore.getState().token;
      const p = new URLSearchParams();
      if (filters.date_from) p.append('date_from', filters.date_from);
      if (filters.date_to)   p.append('date_to',   filters.date_to);
      if (filters.type)      p.append('type',      filters.type);
      if (filters.status)    p.append('status',    filters.status);
      const res  = await fetch(`/api/hr-requests/stats?${p}`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (json.success) setData(json);
      else setError(json.error || 'Erreur');
    } catch { setError('Erreur réseau'); }
    setLoading(false);
  }

  useEffect(() => { fetchStats(); }, []);

  function exportExcel() {
    if (!data?.details?.length) return;
    const rows = data.details.map(r => ({
      'N°':             String(r.id).padStart(5, '0'),
      'Matricule':      r.matricule,
      'Employé':        r.employee_name,
      'Type':           r.type,
      'Statut':         STATUS_LABELS_FR[r.status] || r.status,
      'Description':    r.description || '',
      'Traité par':     r.validator_name || '',
      'Commentaire RH': r.validator_comment || '',
      'Date soumission': r.created_at ? new Date(r.created_at).toLocaleDateString('fr-FR') : '',
      'Date MAJ':       r.status_updated_at ? new Date(r.status_updated_at).toLocaleDateString('fr-FR') : '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Demandes RH');
    // Largeurs colonnes
    ws['!cols'] = [8,12,24,30,16,40,20,30,16,16].map(w => ({ wch: w }));
    XLSX.writeFile(wb, `demandes-rh-${new Date().toISOString().split('T')[0]}.xlsx`);
  }

  function exportPDF() {
    if (!data?.details?.length) return;
    const win = window.open('', '_blank');
    const rows = data.details.map(r => `
      <tr>
        <td>#${String(r.id).padStart(5,'0')}</td>
        <td>${r.matricule}</td>
        <td>${r.employee_name}</td>
        <td>${r.type}</td>
        <td><span style="color:${r.status==='closed'?'#16a34a':r.status==='rejected'?'#dc2626':r.status==='in_progress'?'#2563eb':'#d97706'}">${STATUS_LABELS_FR[r.status]||r.status}</span></td>
        <td>${r.validator_name||'—'}</td>
        <td>${r.created_at?new Date(r.created_at).toLocaleDateString('fr-FR'):'—'}</td>
      </tr>`).join('');
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>Demandes RH</title>
      <style>
        body{font-family:Arial,sans-serif;padding:20px;font-size:12px}
        h1{color:#1e3a5f;font-size:18px;margin-bottom:4px}
        p{color:#6b7280;margin:0 0 16px}
        table{width:100%;border-collapse:collapse}
        th{background:#1e3a5f;color:#fff;padding:8px;text-align:left;font-size:11px}
        td{padding:7px 8px;border-bottom:1px solid #e5e7eb;font-size:11px}
        tr:nth-child(even) td{background:#f8fafc}
        .kpis{display:flex;gap:16px;margin-bottom:20px;flex-wrap:wrap}
        .kpi{background:#f1f5f9;border-radius:8px;padding:10px 16px;min-width:100px}
        .kpi-val{font-size:22px;font-weight:700;color:#1e3a5f}
        .kpi-lbl{font-size:11px;color:#6b7280}
        @media print{button{display:none}}
      </style></head><body>
      <h1>📋 Statistiques Demandes RH</h1>
      <p>Exporté le ${new Date().toLocaleDateString('fr-FR')} ${filters.date_from?'| Du '+filters.date_from:''} ${filters.date_to?'au '+filters.date_to:''}</p>
      <div class="kpis">
        <div class="kpi"><div class="kpi-val">${data.kpis.total}</div><div class="kpi-lbl">Total</div></div>
        <div class="kpi"><div class="kpi-val" style="color:#d97706">${data.kpis.pending}</div><div class="kpi-lbl">En cours</div></div>
        <div class="kpi"><div class="kpi-val" style="color:#2563eb">${data.kpis.in_progress}</div><div class="kpi-lbl">Prise en charge</div></div>
        <div class="kpi"><div class="kpi-val" style="color:#16a34a">${data.kpis.closed}</div><div class="kpi-lbl">Clôturées</div></div>
        <div class="kpi"><div class="kpi-val" style="color:#dc2626">${data.kpis.rejected}</div><div class="kpi-lbl">Rejetées</div></div>
      </div>
      <table>
        <thead><tr><th>N°</th><th>Matricule</th><th>Employé</th><th>Type</th><th>Statut</th><th>Traité par</th><th>Date</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <script>window.onload=()=>window.print()</script>
      </body></html>`);
    win.document.close();
  }

  const s = { background:'#0f172a', border:'1px solid #1e2d45', borderRadius:12, padding:16, marginBottom:12 };

  return (
    <div>
      {/* Filtres */}
      <div style={{...s, display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:12, alignItems:'end'}}>
        <div>
          <label style={{fontSize:12,color:'#94a3b8',display:'block',marginBottom:4}}>Date début</label>
          <input type="date" value={filters.date_from}
            onChange={e => setFilters(f=>({...f,date_from:e.target.value}))}
            style={{width:'100%',padding:'8px 10px',borderRadius:8,border:'1px solid #2d3748',background:'#1e2535',color:'#f1f5f9',fontSize:13,boxSizing:'border-box'}} />
        </div>
        <div>
          <label style={{fontSize:12,color:'#94a3b8',display:'block',marginBottom:4}}>Date fin</label>
          <input type="date" value={filters.date_to}
            onChange={e => setFilters(f=>({...f,date_to:e.target.value}))}
            style={{width:'100%',padding:'8px 10px',borderRadius:8,border:'1px solid #2d3748',background:'#1e2535',color:'#f1f5f9',fontSize:13,boxSizing:'border-box'}} />
        </div>
        <div>
          <label style={{fontSize:12,color:'#94a3b8',display:'block',marginBottom:4}}>Type de demande</label>
          <select value={filters.type} onChange={e=>setFilters(f=>({...f,type:e.target.value}))}
            style={{width:'100%',padding:'8px 10px',borderRadius:8,border:'1px solid #2d3748',background:'#1e2535',color:'#f1f5f9',fontSize:13,boxSizing:'border-box'}}>
            <option value="">Tous les types</option>
            {TYPE_OPTIONS.map(t=><option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label style={{fontSize:12,color:'#94a3b8',display:'block',marginBottom:4}}>Statut</label>
          <select value={filters.status} onChange={e=>setFilters(f=>({...f,status:e.target.value}))}
            style={{width:'100%',padding:'8px 10px',borderRadius:8,border:'1px solid #2d3748',background:'#1e2535',color:'#f1f5f9',fontSize:13,boxSizing:'border-box'}}>
            <option value="">Tous les statuts</option>
            <option value="pending">En cours</option>
            <option value="in_progress">Prise en charge</option>
            <option value="closed">Clôturée</option>
            <option value="rejected">Rejetée</option>
          </select>
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <button onClick={fetchStats} style={{padding:'8px 16px',background:'#2563eb',color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer'}}>
            🔍 Filtrer
          </button>
          <button onClick={()=>setFilters({date_from:'',date_to:'',type:'',status:''})}
            style={{padding:'8px 12px',background:'#374151',color:'#d1d5db',border:'none',borderRadius:8,fontSize:13,cursor:'pointer'}}>
            ✕ Reset
          </button>
        </div>
      </div>

      {loading && <div style={{textAlign:'center',padding:32,color:'#64748b'}}>⏳ Chargement...</div>}
      {error   && <div style={{padding:12,background:'#2a0a0a',border:'1px solid #dc2626',borderRadius:8,color:'#ef4444',fontSize:13}}>{error}</div>}

      {data && !loading && (
        <>
          {/* KPIs */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:10,marginBottom:16}}>
            {[
              {label:'Total',       val:data.kpis.total,       color:'#6366f1'},
              {label:'En cours',    val:data.kpis.pending,     color:'#f59e0b'},
              {label:'Prise en charge', val:data.kpis.in_progress, color:'#3b82f6'},
              {label:'Clôturées',   val:data.kpis.closed,      color:'#10b981'},
              {label:'Rejetées',    val:data.kpis.rejected,    color:'#ef4444'},
            ].map(k=>(
              <div key={k.label} style={{background:'#0f172a',border:`1px solid ${k.color}33`,borderRadius:10,padding:'14px 16px'}}>
                <div style={{fontSize:26,fontWeight:800,color:k.color}}>{k.val}</div>
                <div style={{fontSize:11,color:'#94a3b8',marginTop:2}}>{k.label}</div>
              </div>
            ))}
          </div>

          {/* Par type */}
          {data.by_type?.length > 0 && (
            <div style={{...s, marginBottom:16}}>
              <p style={{margin:'0 0 12px',fontSize:13,fontWeight:600,color:'#cbd5e1'}}>📊 Répartition par type</p>
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {data.by_type.map(t=>{
                  const pct = data.kpis.total > 0 ? Math.round((t.total/data.kpis.total)*100) : 0;
                  return (
                    <div key={t.type}>
                      <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:4}}>
                        <span style={{color:'#e2e8f0'}}>{t.type}</span>
                        <span style={{color:'#94a3b8'}}>{t.total} ({pct}%)</span>
                      </div>
                      <div style={{height:6,background:'#1e2535',borderRadius:99,overflow:'hidden'}}>
                        <div style={{height:'100%',width:`${pct}%`,background:'#2563eb',borderRadius:99,transition:'width .5s'}}/>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Boutons export */}
          <div style={{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap'}}>
            <button onClick={exportExcel}
              style={{padding:'9px 18px',background:'#16a34a',color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',gap:6}}>
              📥 Exporter Excel
            </button>
            <button onClick={exportPDF}
              style={{padding:'9px 18px',background:'#dc2626',color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',gap:6}}>
              🖨️ Exporter PDF
            </button>
            <span style={{fontSize:12,color:'#64748b',alignSelf:'center'}}>{data.details?.length || 0} demande(s)</span>
          </div>

          {/* Tableau détail */}
          {data.details?.length > 0 && (
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                <thead>
                  <tr style={{background:'#0f172a'}}>
                    {['N°','Matricule','Employé','Type','Statut','Traité par','Date'].map(h=>(
                      <th key={h} style={{padding:'10px 12px',textAlign:'left',color:'#94a3b8',fontWeight:600,borderBottom:'1px solid #1e2d45',whiteSpace:'nowrap'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.details.map((r,i)=>{
                    const sc = {pending:'#f59e0b',in_progress:'#3b82f6',closed:'#10b981',rejected:'#ef4444'};
                    return (
                      <tr key={r.id} style={{background:i%2===0?'#0f172a':'#111827'}}>
                        <td style={{padding:'9px 12px',color:'#bfdbfe'}}>#{String(r.id).padStart(5,'0')}</td>
                        <td style={{padding:'9px 12px',color:'#e2e8f0'}}>{r.matricule}</td>
                        <td style={{padding:'9px 12px',color:'#e2e8f0',whiteSpace:'nowrap'}}>{r.employee_name}</td>
                        <td style={{padding:'9px 12px',color:'#cbd5e1',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.type}</td>
                        <td style={{padding:'9px 12px'}}>
                          <span style={{fontSize:11,padding:'2px 8px',borderRadius:20,background:sc[r.status]+'22',color:sc[r.status],fontWeight:600}}>
                            {STATUS_LABELS_FR[r.status]||r.status}
                          </span>
                        </td>
                        <td style={{padding:'9px 12px',color:'#94a3b8'}}>{r.validator_name||'—'}</td>
                        <td style={{padding:'9px 12px',color:'#64748b',whiteSpace:'nowrap'}}>{r.created_at?new Date(r.created_at).toLocaleDateString('fr-FR'):'—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}



// ── Page principale ───────────────────────────────────────────
export default function HRRequestsPage() {
  const [requests, setRequests]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [selected, setSelected]         = useState(null);
  const [showNew, setShowNew]           = useState(false);
  const [hrPrivileges, setHrPrivileges] = useState({});
  const [activeTab, setActiveTab]       = useState('list');
  const [user, setUser]                 = useState(null);

  useEffect(() => {
    const u = useAuthStore.getState().employee;
    setUser(u);
    fetchRequests();
    // Charger privilèges si hr_assistant
    if (u?.role === 'hr_assistant' && u?.id) {
      fetch(`/api/config/assistant-privileges/${u.id}`, {
        headers: { Authorization: `Bearer ${useAuthStore.getState().token}` }
      }).then(r => r.json()).then(d => {
        if (d.success) setHrPrivileges(d.privileges || {});
      }).catch(() => {});
    }
  }, []);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const token = useAuthStore.getState().token;
      const url   = filterStatus ? `${API}/hr-requests?status=${filterStatus}` : `${API}/hr-requests`;
      const res   = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data  = await res.json();
      if (data.success) setRequests(data.requests || []);
    } catch { /* silent */ }
    setLoading(false);
  }, [filterStatus]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const canChangeStatus = user?.role === 'rh' || user?.role === 'superadmin' ||
    (user?.role === 'hr_assistant' && hrPrivileges['hr_assistant_can_change_hr_status'] === true);
  const canViewAll = user?.role === 'rh' || user?.role === 'superadmin' ||
    (user?.role === 'hr_assistant' && hrPrivileges['hr_assistant_can_view_hr_requests'] === true);
  const canViewStats = user?.role === 'rh' || user?.role === 'superadmin' ||
    (user?.role === 'hr_assistant' && hrPrivileges['hr_assistant_can_view_hr_requests'] === true);

  function handleStatusChange(id, newStatus, updatedReq) {
    setRequests(prev => prev.map(r => r.id === id ? { ...r, ...updatedReq } : r));
    if (selected?.id === id) setSelected(prev => ({ ...prev, ...updatedReq }));
  }

  // Stats
  const stats = {
    total:       requests.length,
    pending:     requests.filter(r => r.status === 'pending').length,
    in_progress: requests.filter(r => r.status === 'in_progress').length,
    closed:      requests.filter(r => r.status === 'closed').length,
    rejected:    requests.filter(r => r.status === 'rejected').length,
  };

  const filtered = filterStatus ? requests.filter(r => r.status === filterStatus) : requests;

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* En-tête */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#f1f5f9' }}>Demandes RH</h1>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: '#94a3b8' }}>Suivi de vos demandes auprès du service RH</p>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
          {canViewStats && (
            <div style={{display:'flex',background:'#1e2535',borderRadius:10,padding:3,gap:2}}>
              {canViewStats && [{key:'list',label:'📋 Liste'},{key:'stats',label:'📊 Statistiques'}].map(t=>(
                <button key={t.key} onClick={()=>setActiveTab(t.key)}
                  style={{padding:'7px 14px',borderRadius:8,border:'none',fontSize:13,fontWeight:activeTab===t.key?700:400,
                    background:activeTab===t.key?'#2563eb':'transparent',
                    color:activeTab===t.key?'#fff':'#94a3b8',cursor:'pointer',transition:'all .2s'}}>
                  {t.label}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => setShowNew(true)}
            style={{ padding: '10px 20px', background: 'linear-gradient(135deg,#1e3a5f,#2563eb)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
          >
            + Nouvelle demande
          </button>
        </div>
      </div>

      {activeTab === 'stats' && canViewStats ? <StatsPanel /> : <>
      {/* Cartes stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total',          value: stats.total,       color: '#6366f1', bg: '#1a1528', key: '' },
          { label: 'En cours',       value: stats.pending,     color: '#f59e0b', bg: '#2a1f0a', key: 'pending' },
          { label: 'Prise en charge',value: stats.in_progress, color: '#3b82f6', bg: '#0a1628', key: 'in_progress' },
          { label: 'Clôturées',      value: stats.closed,      color: '#10b981', bg: '#0a2015', key: 'closed' },
          { label: 'Rejetées',       value: stats.rejected,    color: '#ef4444', bg: '#2a0a0a', key: 'rejected' }
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.color}22`, borderRadius: 12, padding: '16px 18px', cursor: 'pointer' }}
            onClick={() => setFilterStatus(s.key)}>
            <div style={{ fontSize: 26, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {[{ value: '', label: 'Toutes' }, ...STEPS.map(s => ({ value: s.key, label: s.label })), { value: 'rejected', label: '❌ Rejetées' }].map(f => (
          <button key={f.value}
            onClick={() => setFilterStatus(f.value)}
            style={{
              padding: '6px 14px', borderRadius: 20, fontSize: 13, cursor: 'pointer', border: 'none', fontWeight: filterStatus === f.value ? 700 : 400,
              background: filterStatus === f.value ? '#2563eb' : '#2d3748',
              color: filterStatus === f.value ? '#fff' : '#e2e8f0'
            }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Liste */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#64748b' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>⏳</div>
          <p>Chargement...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#64748b', background: '#151c2c', borderRadius: 12, border: '1px dashed #2d3748' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>📋</div>
          <p style={{ margin: 0, fontSize: 14 }}>Aucune demande trouvée</p>
          <p style={{ margin: '4px 0 0', fontSize: 13 }}>Cliquez sur "Nouvelle demande" pour en soumettre une.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(req => {
            const cfg = STATUS_CONFIG[req.status] || {};
            return (
              <div key={req.id}
                onClick={() => setSelected(req)}
                style={{
                  background: '#1e2535', border: '1px solid #2d3748', borderRadius: 12, padding: '16px 20px',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 16,
                  transition: 'all .2s', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                  borderLeft: `4px solid ${cfg.color || '#e5e7eb'}`
                }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'}
                onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)'}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: 14, color: '#f1f5f9' }}>{getTypeLabel(req.type)}</span>
                    <StatusBadge status={req.status} />
                  </div>
                  {canChangeStatus && (
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#94a3b8' }}>
                      👤 {req.employee_name} ({req.matricule})
                    </p>
                  )}
                  {req.description && (
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 400 }}>
                      {req.description}
                    </p>
                  )}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ margin: 0, fontSize: 11, color: '#64748b' }}>{fmtDate(req.created_at)}</p>
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: '#bfdbfe', background: '#eff6ff', padding: '2px 8px', borderRadius: 20 }}>
                    #{String(req.id).padStart(5, '0')}
                  </p>
                </div>
                <span style={{ color: '#d1d5db', fontSize: 18 }}>›</span>
              </div>
            );
          })}
        </div>
      )}

      </> }

      {/* Modals */}
      {selected && (
        <RequestDetailModal
          request={selected}
          onClose={() => setSelected(null)}
          onStatusChange={handleStatusChange}
          canChangeStatus={canChangeStatus}
        />
      )}
      {showNew && (
        <NewRequestModal
          onClose={() => setShowNew(false)}
          onCreated={req => { setRequests(prev => [req, ...prev]); }}
        />
      )}
    </div>
  );
}
