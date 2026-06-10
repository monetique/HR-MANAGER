const fs = require('fs');
const path = '/data/applications/hr-manager/backend/server.js';
let code = fs.readFileSync(path, 'utf8');

const cronVersement = `
  // ── Cron versement annuel congés (tous les jours à 06:00 Tunisie) ──
  cron.schedule('0 5 * * *', async () => {
    try {
      const { query } = require('./db/postgres');
      const today = new Date().toISOString().split('T')[0];
      // Chercher un versement pending dont la date est aujourd'hui ou dépassée
      const cfg = await query(
        "SELECT * FROM leave_versement_config WHERE status='pending' AND versement_date <= $1 LIMIT 1",
        [today]
      );
      if (!cfg.rows.length) return;
      const c = cfg.rows[0];
      const employees = await query("SELECT id FROM employees WHERE is_active=true AND role != 'superadmin'");
      for (const emp of employees.rows) {
        const prevYear = c.year - 1;
        const prev = await query(
          'SELECT COALESCE(annual_total, 22) - COALESCE(annual_taken, 0) AS annual_remaining FROM leave_balances WHERE employee_id=$1 AND year=$2',
          [emp.id, prevYear]
        );
        const carriedOver   = parseFloat(prev.rows[0]?.annual_remaining ?? 0);
        const annualGranted = parseFloat(c.nb_jours);
        const annualTotal   = carriedOver + annualGranted;
        const current = await query('SELECT id FROM leave_balances WHERE employee_id=$1 AND year=$2', [emp.id, c.year]);
        if (current.rows.length) {
          await query(
            'UPDATE leave_balances SET annual_total=$1, annual_carried_over=$2, annual_granted=$3, updated_at=NOW() WHERE employee_id=$4 AND year=$5',
            [annualTotal, carriedOver, annualGranted, emp.id, c.year]
          );
        } else {
          await query(
            'INSERT INTO leave_balances (employee_id, year, annual_total, annual_taken, annual_carried_over, annual_granted, sick_total, sick_taken, sick_granted, exceptional_total, exceptional_taken) VALUES ($1,$2,$3,0,$4,$5,15,0,15,0,0)',
            [emp.id, c.year, annualTotal, carriedOver, annualGranted]
          );
        }
      }
      await query(
        "UPDATE leave_versement_config SET status='executed', executed_at=NOW() WHERE id=$1",
        [c.id]
      );
      console.log('[cron-versement] Versement ' + c.nb_jours + 'j effectué pour ' + employees.rows.length + ' employés — ' + today);
    } catch (err) {
      console.error('[cron-versement] Erreur:', err.message);
    }
  });
  console.log('Scheduler versement congés démarré (06:00 Tunisie)');
`;

// Insérer avant le scheduler recap
code = code.replace(
  "  console.log('Scheduler pointage démarré (toutes les 5 min)');",
  "  console.log('Scheduler pointage démarré (toutes les 5 min)');\n" + cronVersement
);

fs.writeFileSync(path, code);
console.log('OK cron versement patche');
