const express = require('express');
const bcrypt  = require('bcrypt');
const { query } = require('../db/postgres');
const { requireAuth, requireRole, requireSameUnit } = require('../middleware/auth');
const router  = express.Router();

// GET /api/employees — liste
router.get('/', requireAuth, requireSameUnit, async (req, res) => {
  try {
    // hr_assistant : vérifier le privilège de consultation des employés
    if (req.user.role === 'hr_assistant') {
      const cfg = await query(
        'SELECT value FROM hr_assistant_privileges WHERE employee_id=$1 AND privilege=$2',
        [req.user.id, 'hr_assistant_can_view_employees']
      );
      if (cfg.rows[0]?.value !== true) {
        return res.json({ success: true, employees: [] });
      }
    }

    let sql = `
      SELECT e.id, e.matricule, e.first_name, e.last_name, e.email, e.role,
             e.phone, e.hire_date, e.is_active, e.last_login, e.departure_date, e.departure_reason, e.departure_note,
             e.employee_category, e.regime_id,
             ou.name as unit_name, ou.id as org_unit_id,
             p.title as position_title,
             m.first_name || ' ' || m.last_name as manager_name,
             m.id as manager_id,
             wr.name as regime_name, wr.code as regime_code
      FROM employees e
      LEFT JOIN org_units ou ON e.org_unit_id = ou.id
      LEFT JOIN positions p  ON e.position_id  = p.id
      LEFT JOIN employees m  ON e.manager_id   = m.id
      LEFT JOIN work_regimes wr ON e.regime_id = wr.id
      WHERE 1=1`;
    const params = [];

    // Manager ne voit que ses subordonnés
    if (req.user.role === 'manager' && req.subordinateIds) {
      sql += ` AND e.id = ANY($${params.length + 1})`;
      params.push(req.subordinateIds);
    }

    if (req.query.org_unit_id) {
      sql += ` AND e.org_unit_id = $${params.length + 1}`;
      params.push(req.query.org_unit_id);
    }
    if (req.query.is_active !== undefined) {
      sql += ` AND e.is_active = $${params.length + 1}`;
      params.push(req.query.is_active === 'true');
    }
    if (req.query.search) {
      sql += ` AND (e.first_name ILIKE $${params.length + 1} OR e.last_name ILIKE $${params.length + 1} OR e.matricule ILIKE $${params.length + 1})`;
      params.push(`%${req.query.search}%`);
    }

    sql += ' ORDER BY e.last_name, e.first_name';
    const result = await query(sql, params);
    res.json({ success: true, employees: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/employees/regimes
router.get('/regimes', requireAuth, async (req, res) => {
  try {
    const result = await query('SELECT * FROM work_regimes WHERE is_active=true ORDER BY id');
    res.json({ success: true, regimes: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/employees/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const result = await query(`
      SELECT e.*, ou.name as unit_name, p.title as position_title,
             m.first_name || ' ' || m.last_name as manager_name,
             wr.name as regime_name, wr.code as regime_code
      FROM employees e
      LEFT JOIN org_units ou ON e.org_unit_id = ou.id
      LEFT JOIN positions p  ON e.position_id  = p.id
      LEFT JOIN employees m  ON e.manager_id   = m.id
      LEFT JOIN work_regimes wr ON e.regime_id = wr.id
      WHERE e.id=$1`, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ success: false, error: 'Employé introuvable' });
    const { password_hash, ...emp } = result.rows[0];
    res.json({ success: true, employee: emp });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/employees — créer
router.post('/', requireAuth, requireRole('superadmin', 'rh'), async (req, res) => {
  const { matricule, first_name, last_name, email, password, role, position_id, org_unit_id, manager_id, hire_date, phone, employee_category, regime_id } = req.body;
  try {
    const hash = await bcrypt.hash(password || 'REDACTED_PASSWORD', 12);
    const result = await query(`
      INSERT INTO employees (matricule, first_name, last_name, email, password_hash, role, position_id, org_unit_id, manager_id, hire_date, phone, employee_category, regime_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING id, matricule, first_name, last_name, email, role`,
      [matricule, first_name, last_name, email, hash, role || 'employee', position_id || null, org_unit_id || null, manager_id || null, hire_date || null, phone || '', employee_category || null, regime_id || null]
    );
    const year = new Date().getFullYear();
    await query(
      'INSERT INTO leave_balances (employee_id, year) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [result.rows[0].id, year]
    );
    res.status(201).json({ success: true, employee: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ success: false, error: 'Matricule ou email déjà existant' });
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/employees/:id — modifier
router.put('/:id', requireAuth, requireRole('superadmin', 'rh'), async (req, res) => {
  const { first_name, last_name, email, role, position_id, org_unit_id, manager_id, hire_date, phone, is_active, employee_category, regime_id, departure_date, departure_reason, departure_note } = req.body;
  try {
    const result = await query(`
      UPDATE employees SET
        first_name=$1, last_name=$2, email=$3, role=$4,
        position_id=$5, org_unit_id=$6, manager_id=$7,
        hire_date=$8, phone=$9, is_active=$10,
        employee_category=$11, regime_id=$12,
        departure_date=$13, departure_reason=$14, departure_note=$15,
        updated_at=NOW()
      WHERE id=$16 RETURNING id, matricule, first_name, last_name, email, role`,
      [first_name, last_name, email, role, position_id || null, org_unit_id || null, manager_id || null, hire_date || null, phone || '', is_active, employee_category || null, regime_id || null, departure_date || null, departure_reason || null, departure_note || null, req.params.id]
    );
    res.json({ success: true, employee: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/employees/:id — désactiver
router.delete('/:id', requireAuth, requireRole('superadmin'), async (req, res) => {
  try {
    await query('UPDATE employees SET is_active=false WHERE id=$1', [req.params.id]);
    res.json({ success: true, message: 'Employé désactivé' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
