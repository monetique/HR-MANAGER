require('dotenv').config();
const bcrypt = require('bcrypt');
const { pool, query } = require('../db/postgres');

async function seed() {
  console.log('🌱 Seeding HR Manager...');
  try {
    // Unité racine
    const dir = await query(`
      INSERT INTO org_units (name, code, level_id)
      SELECT 'Direction Générale', 'DG', id FROM org_levels WHERE level_order=1
      ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name
      RETURNING id`);
    const dirId = dir.rows[0].id;

    // Département RH
    const deptRH = await query(`
      INSERT INTO org_units (name, code, level_id, parent_id)
      SELECT 'Département RH', 'DRH', id, $2 FROM org_levels WHERE level_order=3
      ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name
      RETURNING id`, [null, dirId]);
    const deptRHId = deptRH.rows[0].id;

    // Département IT
    const deptIT = await query(`
      INSERT INTO org_units (name, code, level_id, parent_id)
      SELECT 'Département IT', 'DIT', id, $2 FROM org_levels WHERE level_order=3
      ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name
      RETURNING id`, [null, dirId]);
    const deptITId = deptIT.rows[0].id;

    // Postes
    const posAdmin = await query(`
      INSERT INTO positions (title, org_unit_id) VALUES ('Administrateur Système', $1)
      ON CONFLICT DO NOTHING RETURNING id`, [deptITId]);
    const posRH = await query(`
      INSERT INTO positions (title, org_unit_id) VALUES ('Responsable RH', $1)
      ON CONFLICT DO NOTHING RETURNING id`, [deptRHId]);

    // Admin
    const adminHash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'Admin@HR2026', 12);
    const admin = await query(`
      INSERT INTO employees (matricule, first_name, last_name, email, password_hash, role, org_unit_id)
      VALUES ('ADM001', 'Super', 'Admin', $1, $2, 'superadmin', $3)
      ON CONFLICT (email) DO UPDATE SET password_hash=EXCLUDED.password_hash
      RETURNING id`, [process.env.ADMIN_EMAIL || 'admin@monetiquetunisie.com', adminHash, dirId]);

    // RH user
    const rhHash = await bcrypt.hash('REDACTED_PASSWORD', 12);
    const rh = await query(`
      INSERT INTO employees (matricule, first_name, last_name, email, password_hash, role, org_unit_id)
      VALUES ('RH001', 'Responsable', 'RH', 'rh@monetiquetunisie.com', $1, 'rh', $2)
      ON CONFLICT (email) DO UPDATE SET password_hash=EXCLUDED.password_hash
      RETURNING id`, [rhHash, deptRHId]);

    // Manager IT
    const mgrHash = await bcrypt.hash('Mgr@HR2026', 12);
    const mgr = await query(`
      INSERT INTO employees (matricule, first_name, last_name, email, password_hash, role, org_unit_id, manager_id)
      VALUES ('MGR001', 'Mohamed', 'Manager', 'manager@monetiquetunisie.com', $1, 'manager', $2, $3)
      ON CONFLICT (email) DO UPDATE SET password_hash=EXCLUDED.password_hash
      RETURNING id`, [mgrHash, deptITId, admin.rows[0].id]);

    // Employé test
    const empHash = await bcrypt.hash('Emp@HR2026', 12);
    const emp = await query(`
      INSERT INTO employees (matricule, first_name, last_name, email, password_hash, role, org_unit_id, manager_id)
      VALUES ('EMP001', 'Ahmed', 'Employé', 'employe@monetiquetunisie.com', $1, 'employee', $2, $3)
      ON CONFLICT (email) DO UPDATE SET password_hash=EXCLUDED.password_hash
      RETURNING id`, [empHash, deptITId, mgr.rows[0].id]);

    // Soldes de congés
    const year = new Date().getFullYear();
    for (const id of [admin.rows[0].id, rh.rows[0].id, mgr.rows[0].id, emp.rows[0].id]) {
      await query(`
        INSERT INTO leave_balances (employee_id, year) VALUES ($1,$2)
        ON CONFLICT (employee_id, year) DO NOTHING`, [id, year]);
    }

    // Circuit de validation par défaut (2 étapes)
    const circuit = await query(`
      INSERT INTO validation_circuits (name, steps) VALUES ('Circuit Standard', 2)
      ON CONFLICT DO NOTHING RETURNING id`);
    if (circuit.rows.length) {
      await query(`INSERT INTO validation_steps (circuit_id, step_order, validator_role, label) VALUES ($1,1,'manager','Validation Manager')`, [circuit.rows[0].id]);
      await query(`INSERT INTO validation_steps (circuit_id, step_order, validator_role, label) VALUES ($1,2,'rh','Validation RH')`, [circuit.rows[0].id]);
    }

    // Jours fériés Tunisie
    const currentYear = new Date().getFullYear();
    const holidays = [
      { name: "Jour de l'An",         date: `${currentYear}-01-01` },
      { name: "Fête du Travail",       date: `${currentYear}-05-01` },
      { name: "Fête de la République", date: `${currentYear}-07-25` },
      { name: "Fête de l'Indépendance",date: `${currentYear}-03-20` },
      { name: "Fête des Martyrs",      date: `${currentYear}-04-09` },
      { name: "Fête de la Femme",      date: `${currentYear}-08-13` },
      { name: "Fête de l'Évacuation",  date: `${currentYear}-10-15` },
    ];
    for (const h of holidays) {
      await query(`INSERT INTO public_holidays (name, date, year) VALUES ($1,$2,$3) ON CONFLICT (date) DO NOTHING`,
        [h.name, h.date, currentYear]);
    }

    console.log('✅ Seeding terminé !');
    console.log('📝 Comptes créés:');
    console.log(`   SuperAdmin : ${process.env.ADMIN_EMAIL || 'admin@monetiquetunisie.com'} / ${process.env.ADMIN_PASSWORD || 'Admin@HR2026'}`);
    console.log('   RH         : rh@monetiquetunisie.com / REDACTED_PASSWORD');
    console.log('   Manager    : manager@monetiquetunisie.com / Mgr@HR2026');
    console.log('   Employé    : employe@monetiquetunisie.com / Emp@HR2026');
  } catch (err) {
    console.error('❌ Erreur seed:', err.message);
  } finally {
    await pool.end();
  }
}

seed();
