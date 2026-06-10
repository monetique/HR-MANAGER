const cron = require('node-cron');
const { query } = require('../db/postgres');
const { sendRecapToManager } = require('./mail-service');

// ── Calculer la semaine dernière ──────────────────────────
function getLastWeek() {
  const now   = new Date();
  const day   = now.getDay(); // 0=dim, 1=lun...
  const diff  = day === 0 ? 6 : day - 1; // jours depuis lundi
  const lundi = new Date(now);
  lundi.setDate(now.getDate() - diff - 7);
  lundi.setHours(0,0,0,0);
  const dimanche = new Date(lundi);
  dimanche.setDate(lundi.getDate() + 6);
  dimanche.setHours(23,59,59,999);
  return {
    from: lundi.toISOString().split('T')[0],
    to:   dimanche.toISOString().split('T')[0],
    label: `${lundi.toLocaleDateString('fr-FR')} au ${dimanche.toLocaleDateString('fr-FR')}`
  };
}

// ── Récupérer les subordonnés d'un manager ────────────────
async function getSubordinates(managerId) {
  const result = await query(`
    WITH RECURSIVE subordinates AS (
      SELECT id, matricule, first_name, last_name, email, manager_id
      FROM employees WHERE manager_id = $1 AND is_active = true
      UNION ALL
      SELECT e.id, e.matricule, e.first_name, e.last_name, e.email, e.manager_id
      FROM employees e
      INNER JOIN subordinates s ON e.manager_id = s.id
    )
    SELECT * FROM subordinates
  `, [managerId]);
  return result.rows;
}

// ── Envoi du récap à tous les managers ────────────────────
async function sendWeeklyRecap() {
  console.log('📧 Envoi récap hebdomadaire...');
  try {
    const { from, to, label } = getLastWeek();

    // Config SMTP
    const cfgResult = await query("SELECT key, value FROM app_config WHERE key LIKE 'smtp_%' OR key LIKE 'recap_%'");
    const cfg = {};
    cfgResult.rows.forEach(r => cfg[r.key] = r.value);

    if (cfg.recap_enabled !== 'true') {
      console.log('⏭️ Récap désactivé dans la config');
      return;
    }

    // Récupérer tous les managers
    const managers = await query(
      "SELECT id, matricule, first_name, last_name, email FROM employees WHERE role IN ('manager','superadmin','rh') AND is_active=true AND email IS NOT NULL"
    );

    for (const manager of managers.rows) {
      try {
        const subordinates = await getSubordinates(manager.id);
        if (!subordinates.length) continue;

        // Récupérer le pointage de la semaine
        const empIds = subordinates.map(e => e.id);
        const attResult = await query(`
          SELECT * FROM attendance
          WHERE employee_id = ANY($1::int[])
            AND date >= $2::date AND date <= $3::date
        `, [empIds, from, to]);

        const attendanceByEmp = {};
        attResult.rows.forEach(r => {
          if (!attendanceByEmp[r.employee_id]) attendanceByEmp[r.employee_id] = [];
          attendanceByEmp[r.employee_id].push(r);
        });

        await sendRecapToManager(manager, subordinates, attendanceByEmp, label, cfg);
        console.log(`✅ Récap envoyé à ${manager.email}`);
      } catch(e) {
        console.error(`❌ Erreur envoi récap à ${manager.email}:`, e.message);
      }
    }

    console.log('✅ Récap hebdomadaire terminé');
  } catch(e) {
    console.error('❌ Erreur récap hebdomadaire:', e.message);
  }
}

// ── Planifier le cron ─────────────────────────────────────
// Chaque lundi à 07:00 (heure UTC = 06:00 Tunisie UTC+1)
// Mais le conteneur est en UTC, donc on envoie à 06:00 UTC = 07:00 Tunisie
function startCron() {
  cron.schedule('0 6 * * 1', () => {
    sendWeeklyRecap();
  }, { timezone: 'UTC' });
  console.log('⏰ Cron récap hebdomadaire planifié (lundi 07:00 Tunisie)');
}

module.exports = { startCron, sendWeeklyRecap };
