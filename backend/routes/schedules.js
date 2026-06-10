const express = require('express');
const { query } = require('../db/postgres');
const { requireAuth, requireRole } = require('../middleware/auth');
const router = express.Router();

// GET /api/schedules — liste tous les horaires
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await query('SELECT * FROM work_schedules ORDER BY id');
    res.json({ success: true, schedules: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/schedules/current — horaire actif
router.get('/current', requireAuth, async (req, res) => {
  try {
    const result = await query('SELECT * FROM work_schedules WHERE is_current=true LIMIT 1');
    res.json({ success: true, schedule: result.rows[0] || null });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/schedules/:id/activate — activer un horaire
router.put('/:id/activate', requireAuth, requireRole('superadmin', 'rh'), async (req, res) => {
  try {
    await query('UPDATE work_schedules SET is_current=false');
    await query('UPDATE work_schedules SET is_current=true WHERE id=$1', [req.params.id]);
    await query("UPDATE app_config SET value=(SELECT code FROM work_schedules WHERE id=$1), updated_at=NOW() WHERE key='current_schedule'", [req.params.id]);
    const result = await query('SELECT * FROM work_schedules WHERE id=$1', [req.params.id]);
    res.json({ success: true, schedule: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/schedules/:id — modifier un horaire
router.put('/:id', requireAuth, requireRole('superadmin', 'rh'), async (req, res) => {
  const { name, morning_start, morning_end, afternoon_start, afternoon_end, tolerance_min, required_hours, period_start, period_end } = req.body;
  try {
    const result = await query(`
      UPDATE work_schedules SET
        name=$1, morning_start=$2, morning_end=$3,
        afternoon_start=$4, afternoon_end=$5,
        tolerance_min=$6, required_hours=$7,
        period_start=$8, period_end=$9, updated_at=NOW()
      WHERE id=$10 RETURNING *`,
      [name, morning_start, morning_end, afternoon_start || null, afternoon_end || null, tolerance_min, required_hours, period_start || null, period_end || null, req.params.id]
    );
    res.json({ success: true, schedule: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
