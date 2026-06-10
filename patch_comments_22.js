const fs = require('fs');
const path = '/data/applications/hr-manager/backend/routes/leaves.js';
let code = fs.readFileSync(path, 'utf8');

// Corriger les commentaires 21j -> 22j
code = code.replace(/jours versés cette année \(21j\)/g, 'jours versés cette année (22j)');
code = code.replace(/granted \(21j\)/g, 'granted (22j)');
code = code.replace(/versement N \(21j\)/g, 'versement N (22j)');

fs.writeFileSync(path, code);
console.log('OK commentaires 22j patche');
