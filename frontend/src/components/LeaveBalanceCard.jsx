// frontend/src/components/LeaveBalanceCard.jsx
import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';

export default function LeaveBalanceCard({ employeeId }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const { token } = useAuthStore();

  useEffect(() => {
    setLoading(true);
    const url = employeeId
      ? `/api/leaves/balances-summary?employee_id=${employeeId}`
      : `/api/leaves/balances-summary`;

    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [employeeId, token]);

  if (loading) return (
    <div style={{ padding: '16px', color: '#9ca3af', fontSize: '14px' }}>
      Chargement des soldes...
    </div>
  );

  if (error) return (
    <div style={{ padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', color: '#ef4444', fontSize: '14px' }}>
      Erreur : {error}
    </div>
  );

  if (!data?.annual) return null;

  const { annual } = data;
  const { next_grant_date, n1, n } = annual;
  const currentYear = new Date().getFullYear();

  const formatDate = (d) => new Date(d).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric'
  });

  const fmt = (v) => {
    const num = parseFloat(v);
    return Number.isInteger(num) ? String(num) : num.toFixed(1).replace('.0', '');
  };

  const pct = (taken, total) => total > 0 ? Math.round((taken / total) * 100) : 0;

  // Calcul solde total disponible (N-1 restant + N si actif)
  const n1Remaining  = n1 ? parseFloat(n1.annual_remaining) : 0;
  const n1Total      = n1 ? parseFloat(n1.annual_total) : 0;
  const n1Taken      = n1 ? parseFloat(n1.annual_taken) : 0;
  const nGrantPending = n ? n.grant_pending : true;
  const nTotal       = n ? parseFloat(n.annual_total) : 0;
  const nGranted     = n ? parseFloat(n.annual_granted) : 0;
  const nTaken       = n ? parseFloat(n.annual_taken) : 0;
  const nRemaining   = n ? parseFloat(n.annual_remaining) : 0;

  // Logique affichage :
  // - Si n1 existe (carried_over > 0) → N-1 Actif, N grisé si grant_pending
  // - Si n1 null mais solde sur N → afficher N comme "solde actuel" dans bloc N-1, N grisé
  const hasN1 = !!n1;
  const n1IsActive = hasN1;
  const nIsActive  = !hasN1 && !nGrantPending;

  // Solde disponible maintenant
  const totalDispoNow = hasN1 ? n1Remaining : nRemaining;
  const low = totalDispoNow <= 3;

  // Bloc N-1 : si pas de carried_over, afficher le solde actuel de N
  const n1DisplayRemaining = hasN1 ? n1Remaining : nRemaining;
  const n1DisplayTotal     = hasN1 ? n1Total     : nTotal;
  const n1DisplayTaken     = hasN1 ? n1Taken     : nTaken;

  const cardStyle = {
    background: '#1e2433',
    border: '1px solid #2d3548',
    borderRadius: '16px',
    overflow: 'hidden',
    marginBottom: '16px',
  };

  const headerStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 16px',
    background: '#161b2e',
    borderBottom: '1px solid #2d3548',
  };

  const blockStyle = (isActive, isN1) => ({
    flex: 1,
    padding: '16px',
    borderRadius: '12px',
    background: isActive
      ? isN1 ? 'rgba(245,158,11,0.08)' : 'rgba(59,130,246,0.08)'
      : 'rgba(255,255,255,0.02)',
    border: isActive
      ? isN1 ? '1px solid rgba(245,158,11,0.25)' : '1px solid rgba(59,130,246,0.25)'
      : '1px solid rgba(255,255,255,0.05)',
    opacity: isActive ? 1 : 0.55,
    transition: 'all 0.2s',
  });

  const barBg = {
    height: '4px',
    background: 'rgba(255,255,255,0.08)',
    borderRadius: '99px',
    overflow: 'hidden',
    marginTop: '10px',
  };

  return (
    <div style={cardStyle}>

      {/* Header */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: '#e5e7eb' }}>
            Congé annuel
          </span>
          <span style={{
            fontSize: '11px', padding: '2px 8px', borderRadius: '20px',
            background: 'rgba(99,102,241,0.15)', color: '#818cf8', fontWeight: 600
          }}>
            cumulatif
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#6b7280' }}>
          {hasN1 && nGrantPending && (<><span style={{ width: '7px', height: '7px', borderRadius: '50%', display: 'inline-block', background: '#f59e0b' }}/>
          <span>Déduction sur N-1</span>
          <span style={{ color: '#374151' }}>|</span></>)}
          <span style={{ color: '#6b7280' }}>
            {nGrantPending ? '🎁 ' + formatDate(next_grant_date) : 'ℹ️ Prochain versement : ' + formatDate((currentYear + 1) + '-06-01')}
          </span>
        </div>
      </div>

      {/* Colonnes N-1 / N */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', padding: '12px' }}>

        {/* N-1 — Solde disponible maintenant */}
        <div style={blockStyle(n1IsActive, true)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              📁 N-1
            </span>
            <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '20px', background: n1IsActive ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.08)', color: n1IsActive ? '#f59e0b' : '#6b7280' }}>
              {n1IsActive ? 'Actif' : '—'}
            </span>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 700, lineHeight: 1, marginBottom: '4px', color: n1IsActive ? (low ? '#ef4444' : '#f59e0b') : '#4b5563' }}>
            {fmt(n1DisplayRemaining)}
            <span style={{ fontSize: '14px', fontWeight: 400, marginLeft: '4px', color: '#9ca3af' }}>j</span>
          </div>
          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
            {fmt(n1DisplayTaken)}j utilisés
          </div>
          <div style={barBg}>
            <div style={{
              height: '100%',
              width: `${Math.max(0, Math.min(100, pct(n1DisplayTaken, n1DisplayTotal)))}%`,
              borderRadius: '99px',
              background: low ? '#ef4444' : '#f59e0b',
              transition: 'width 0.5s ease',
            }} />
          </div>
        </div>

        {/* N — Prochain versement (uniquement avant le versement) */}
        {nGrantPending && <div style={blockStyle(nIsActive, false)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              ✅ N
            </span>
            <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '20px', background: nIsActive ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.08)', color: nIsActive ? '#3b82f6' : '#6b7280' }}>
              {nIsActive ? 'Actif' : '—'}
            </span>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 700, lineHeight: 1, marginBottom: '4px', color: nIsActive ? '#3b82f6' : '#4b5563' }}>
            {fmt(nGrantPending ? nTotal : nRemaining)}
            <span style={{ fontSize: '14px', fontWeight: 400, marginLeft: '4px', color: '#9ca3af' }}>j</span>
          </div>
          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
            {fmt(nTaken)}j utilisés / {fmt(nTotal)}j
          </div>
          <div style={{ fontSize: '11px', color: '#6b7280' }}>
            🎁 {fmt(nGranted)}j versés le {formatDate(next_grant_date)}
          </div>
          <div style={barBg}>
            <div style={{
              height: '100%',
              width: `${Math.max(0, Math.min(100, pct(nTaken, nTotal)))}%`,
              borderRadius: '99px',
              background: nIsActive ? '#3b82f6' : '#374151',
              transition: 'width 0.5s ease',
            }} />
          </div>
        </div>}

      </div>
    </div>
  );
}
