const fs = require('fs');
const path = '/data/applications/hr-manager/backend/routes/leaves.js';
let code = fs.readFileSync(path, 'utf8');

// Revert : utiliser grantedRaw directement sans bloquer sur la date
code = code.replace(
  "    const carriedOver     = parseFloat(row.annual_carried_over);\n    const grantedRaw      = parseFloat(row.annual_granted);\n    const grantDate       = new Date(row.year + '-06-01');\n    const grantedEffectif = today >= grantDate ? grantedRaw : 0;\n    const granted         = grantedEffectif;\n    const totalTaken      = parseFloat(row.annual_taken);",
  "    const carriedOver  = parseFloat(row.annual_carried_over);\n    const grantedRaw   = parseFloat(row.annual_granted);\n    const grantDate    = new Date(row.year + '-06-01');\n    const granted      = grantedRaw;\n    const totalTaken   = parseFloat(row.annual_taken);"
);

// Garder grant_pending pour l'affichage frontend uniquement
code = code.replace(
  "      annual_granted:      grantedEffectif,\n      grant_date:          row.year + '-06-01',\n      grant_pending:       today < grantDate,",
  "      annual_granted:      granted,\n      grant_date:          row.year + '-06-01',\n      grant_pending:       today < grantDate,"
);

fs.writeFileSync(path, code);
console.log('OK revert granted patche');
