const express = require('express');
const { query } = require('../db/postgres');
const { requireAuth, requireRole } = require('../middleware/auth');
const router = express.Router();

// GET /api/leave-types
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM leave_types WHERE is_active=true ORDER BY code'
    );
    res.json({ success: true, leave_types: result.rows });
  } catch(err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/leave-types/all (admin — inclut inactifs)
router.get('/all', requireAuth, requireRole('superadmin','rh'), async (req, res) => {
  try {
    const result = await query('SELECT * FROM leave_types ORDER BY code');
    res.json({ success: true, leave_types: result.rows });
  } catch(err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/leave-types
router.post('/', requireAuth, requireRole('superadmin','rh'), async (req, res) => {
  const { name, code, has_balance, max_days, auto_refill, refill_date, refill_days, color, requires_validation, is_active } = req.body;
  try {
    const result = await query(`
      INSERT INTO leave_types (name, code, has_balance, max_days, auto_refill, refill_date, refill_days, color, requires_validation, is_active, days_allowed)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [name, code, has_balance||false, max_days||null, auto_refill||false, refill_date||null, refill_days||0, color||'blue', requires_validation !== false, is_active !== false, max_days||0]
    );
    res.status(201).json({ success: true, leave_type: result.rows[0] });
  } catch(err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/leave-types/:id
router.put('/:id', requireAuth, requireRole('superadmin','rh'), async (req, res) => {
  const { name, code, has_balance, max_days, auto_refill, refill_date, refill_days, color, requires_validation, is_active } = req.body;
  try {
    const result = await query(`
      UPDATE leave_types SET
        name=$1, code=$2, has_balance=$3, max_days=$4, auto_refill=$5,
        refill_date=$6, refill_days=$7, color=$8, requires_validation=$9,
        is_active=$10, days_allowed=$11
      WHERE id=$12 RETURNING *`,
      [name, code, has_balance||false, max_days||null, auto_refill||false, refill_date||null, refill_days||0, color||'blue', requires_validation !== false, is_active !== false, max_days||0, req.params.id]
    );
    res.json({ success: true, leave_type: result.rows[0] });
  } catch(err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
