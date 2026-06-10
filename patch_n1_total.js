const fs = require('fs');
const path = '/data/applications/hr-manager/frontend/src/components/LeaveBalanceCard.jsx';
let code = fs.readFileSync(path, 'utf8');

// Corriger : N-1 affiche le solde total dispo = annual_total - annual_taken (toutes périodes confondues)
// = n1Remaining + nRemaining (si versé) = solde global actuel
code = code.replace(
  "  // Solde disponible maintenant = N-1 restant (+ N si versé)\n  const totalDispoNow = n1Remaining + (nGrantPending ? 0 : nRemaining);\n  const low = totalDispoNow <= 3;",
  "  // Solde disponible maintenant = N-1 restant + N restant si déjà versé\n  const totalDispoNow = n1Remaining + (nGrantPending ? 0 : nRemaining);\n  const low = totalDispoNow <= 3;\n  // Total affiché dans le bloc N-1 = solde global disponible\n  const n1DisplayRemaining = totalDispoNow;\n  const n1DisplayTotal = n1Total + (nGrantPending ? 0 : nTotal);\n  const n1DisplayTaken = n1Taken + (nGrantPending ? 0 : nTaken);"
);

// Utiliser n1DisplayRemaining dans l'affichage N-1
code = code.replace(
  "          {fmt(n1Remaining)}\n            <span style={{ fontSize: '14px', fontWeight: 400, marginLeft: '4px', color: '#9ca3af' }}>j</span>",
  "          {fmt(n1DisplayRemaining)}\n            <span style={{ fontSize: '14px', fontWeight: 400, marginLeft: '4px', color: '#9ca3af' }}>j</span>"
);

code = code.replace(
  "          {fmt(n1Taken)}j utilisés / {fmt(n1Total)}j",
  "          {fmt(n1DisplayTaken)}j utilisés / {fmt(n1DisplayTotal)}j"
);

code = code.replace(
  "              width: `${Math.max(0, Math.min(100, pct(n1Taken, n1Total)))}%`,\n              borderRadius: '99px',\n              background: low ? '#ef4444' : '#f59e0b',",
  "              width: `${Math.max(0, Math.min(100, pct(n1DisplayTaken, n1DisplayTotal)))}%`,\n              borderRadius: '99px',\n              background: low ? '#ef4444' : '#f59e0b',"
);

fs.writeFileSync(path, code);
console.log('OK n1 display patche');
