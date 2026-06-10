const express = require('express');
const { query } = require('../db/postgres');
const { requireAuth, requireRole } = require('../middleware/auth');
const fs   = require('fs');
const path = require('path');
const router = express.Router();

// ── Logo en base64 pour les PDFs frontend ─────────────────
router.get('/logo', requireAuth, (req, res) => {
  try {
    const logoPath = path.join(__dirname, '..', 'logo_smt.png');
    if (fs.existsSync(logoPath)) {
      const b64 = fs.readFileSync(logoPath).toString('base64');
      return res.json({ success: true, logo: 'data:image/png;base64,' + b64 });
    }
    res.json({ success: false, logo: null });
  } catch (err) {
    res.json({ success: false, logo: null });
  }
});

// ── Jours fériés ──────────────────────────────────────────
router.get('/holidays', requireAuth, async (req, res) => {
  try {
    const year = req.query.year || new Date().getFullYear();
    const result = await query(
      'SELECT * FROM public_holidays WHERE year=$1 ORDER BY date',
      [year]
    );
    res.json({ success: true, holidays: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/holidays', requireAuth, requireRole('superadmin', 'rh'), async (req, res) => {
  const { name, date_from, date_to } = req.body;
  const dateFrom = date_from;
  const dateTo   = date_to || date_from;
  try {
    const inserted = [];
    let current = new Date(dateFrom);
    const end   = new Date(dateTo);
    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0];
      const year    = current.getFullYear();
      const result  = await query(
        'INSERT INTO public_holidays (name, date, year) VALUES ($1,$2,$3) ON CONFLICT (date) DO UPDATE SET name=EXCLUDED.name RETURNING *',
        [name, dateStr, year]
      );
      inserted.push(result.rows[0]);
      current.setDate(current.getDate() + 1);
    }
    res.status(201).json({ success: true, holidays: inserted, count: inserted.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/holidays/:id', requireAuth, requireRole('superadmin', 'rh'), async (req, res) => {
  try {
    await query('DELETE FROM public_holidays WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Config générale ───────────────────────────────────────
router.get('/general', requireAuth, async (req, res) => {
  try {
    const result = await query('SELECT key, value FROM app_config');
    const config = {};
    result.rows.forEach(r => config[r.key] = r.value);
    res.json({ success: true, config });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/general', requireAuth, requireRole('superadmin', 'rh'), async (req, res) => {
  try {
    for (const [key, value] of Object.entries(req.body)) {
      await query(
        'INSERT INTO app_config (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()',
        [key, String(value)]
      );
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// ── Privilèges par assistante ─────────────────────────────
router.get('/assistant-privileges/:employee_id', requireAuth, async (req, res) => {
  try {
    // Autoriser : superadmin, rh, ou l'assistante elle-même
    const isOwner = parseInt(req.params.employee_id) === req.user.id;
    if (!['superadmin','rh'].includes(req.user.role) && !isOwner) {
      return res.status(403).json({ success: false, error: 'Accès refusé' });
    }
    const result = await query(
      'SELECT privilege, value FROM hr_assistant_privileges WHERE employee_id=$1',
      [req.params.employee_id]
    );
    const privileges = {};
    result.rows.forEach(r => { privileges[r.privilege] = r.value; });
    res.json({ success: true, privileges });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/assistant-privileges/:employee_id', requireAuth, requireRole('superadmin','rh'), async (req, res) => {
  try {
    const { privileges } = req.body;
    for (const [key, val] of Object.entries(privileges)) {
      await query(`
        INSERT INTO hr_assistant_privileges (employee_id, privilege, value, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (employee_id, privilege)
        DO UPDATE SET value=$3, updated_at=NOW()
      `, [req.params.employee_id, key, val]);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
