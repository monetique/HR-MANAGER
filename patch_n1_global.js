const fs = require('fs');
const path = '/data/applications/hr-manager/backend/routes/leaves.js';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(
  "    // Objet N-1 (données reconstituées depuis carried_over)\n    const annualN1 = carriedOver > 0 ? {\n      year:                yearN1,\n      annual_total:        carriedOver,\n      annual_taken:        n1Taken,\n      annual_remaining:    n1Remaining,\n      annual_carried_over: 0,\n      annual_granted:      carriedOver,\n    } : null;",
  "    // Objet N-1 : affiche le solde global disponible (carried_over + granted - totalTaken)\n    const globalTotal     = carriedOver + grantedRaw;\n    const globalRemaining = Math.max(0, globalTotal - totalTaken);\n    const annualN1 = carriedOver > 0 ? {\n      year:                yearN1,\n      annual_total:        globalTotal,\n      annual_taken:        totalTaken,\n      annual_remaining:    globalRemaining,\n      annual_carried_over: carriedOver,\n      annual_granted:      carriedOver,\n    } : null;"
);

fs.writeFileSync(path, code);
console.log('OK n1 global patche');
