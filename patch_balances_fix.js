const fs = require('fs');
const path = '/data/applications/hr-manager/backend/routes/leaves.js';
let code = fs.readFileSync(path, 'utf8');

// Fix 1 : 21 -> 22 partout
code = code.replace(/COALESCE\(annual_total, 21\)/g, 'COALESCE(annual_total, 22)');
code = code.replace(/COALESCE\(annual_granted, 21\)/g, 'COALESCE(annual_granted, 22)');

// Fix 2 : granted effectif = 0 si avant 01/06
code = code.replace(
  "    const carriedOver  = parseFloat(row.annual_carried_over); // solde reporté de N-1\n    const granted      = parseFloat(row.annual_granted);      // versement N (21j)\n    const totalTaken   = parseFloat(row.annual_taken);        // total consommé",
  "    const carriedOver     = parseFloat(row.annual_carried_over);\n    const grantedRaw      = parseFloat(row.annual_granted);\n    const grantDate       = new Date(row.year + '-06-01');\n    const grantedEffectif = today >= grantDate ? grantedRaw : 0;\n    const granted         = grantedEffectif;\n    const totalTaken      = parseFloat(row.annual_taken);"
);

// Fix 3 : annualN avec grant_pending
code = code.replace(
  "    // Objet N (versement de l'année)\n    const annualN = {\n      year:                yearN,\n      annual_total:        granted,\n      annual_taken:        nTaken,\n      annual_remaining:    nRemaining,\n      annual_carried_over: carriedOver,\n      annual_granted:      granted,\n    };",
  "    // Objet N (versement de l'année)\n    const annualN = {\n      year:                yearN,\n      annual_total:        grantedRaw,\n      annual_taken:        nTaken,\n      annual_remaining:    nRemaining,\n      annual_carried_over: carriedOver,\n      annual_granted:      grantedEffectif,\n      grant_date:          row.year + '-06-01',\n      grant_pending:       today < grantDate,\n    };"
);

fs.writeFileSync(path, code);
console.log('OK patch applique');
