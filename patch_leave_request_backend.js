const fs = require('fs');
const path = '/data/applications/hr-manager/backend/routes/leaves.js';
let code = fs.readFileSync(path, 'utf8');

// 1. Ajouter half_day et half_day_period dans le destructuring du POST
code = code.replace(
  "  const { leave_type_id, start_date, end_date, reason, certificate_path, exit_period, exit_time, return_time } = req.body;",
  "  const { leave_type_id, start_date, end_date, reason, certificate_path, exit_period, exit_time, return_time, half_day, half_day_period } = req.body;"
);

// 2. Remplacer le calcul des jours pour gérer half_day
code = code.replace(
  "    const days = await countWorkDays(start_date, end_date);\n    if (days <= 0) return res.status(400).json({ success: false, error: 'Aucun jour ouvrable dans cette période' });",
  "    let days;\n    if (half_day) {\n      // Vérifier que le jour est ouvrable\n      const workCheck = await countWorkDays(start_date, start_date);\n      if (workCheck <= 0) return res.status(400).json({ success: false, error: 'Ce jour n est pas ouvrable' });\n      days = 0.5;\n    } else {\n      days = await countWorkDays(start_date, end_date);\n      if (days <= 0) return res.status(400).json({ success: false, error: 'Aucun jour ouvrable dans cette periode' });\n    }"
);

// 3. Ajouter half_day et half_day_period dans l'INSERT (colonne et valeur)
// D'abord ajouter les colonnes si elles n'existent pas (via ALTER TABLE)
// Puis modifier l'INSERT
code = code.replace(
  "      INSERT INTO leave_requests (employee_id, leave_type_id, start_date, end_date, days_count, reason, total_steps, document_path, exit_period, exit_time, return_time)\n      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,\n      [req.user.id, leave_type_id, start_date, end_date, days, reason, steps, certificate_path || null, exit_period || null, exit_time || null, return_time || null]",
  "      INSERT INTO leave_requests (employee_id, leave_type_id, start_date, end_date, days_count, reason, total_steps, document_path, exit_period, exit_time, return_time, half_day, half_day_period)\n      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,\n      [req.user.id, leave_type_id, start_date, end_date, days, reason, steps, certificate_path || null, exit_period || null, exit_time || null, return_time || null, half_day ? true : false, half_day ? (half_day_period || 'matin') : null]"
);

fs.writeFileSync(path, code);
console.log('OK leaves.js patche');
