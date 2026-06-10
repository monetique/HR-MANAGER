const express = require('express');
const { query } = require('../db/postgres');
const { requireAuth, requireRole } = require('../middleware/auth');
const router  = express.Router();

// GET /api/org/levels
router.get('/levels', requireAuth, async (req, res) => {
  try {
    const result = await query('SELECT * FROM org_levels ORDER BY level_order');
    res.json({ success: true, levels: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/org/levels
router.post('/levels', requireAuth, requireRole('superadmin'), async (req, res) => {
  const { name, level_order } = req.body;
  try {
    const result = await query(
      'INSERT INTO org_levels (name, level_order) VALUES ($1,$2) RETURNING *',
      [name, level_order]
    );
    res.status(201).json({ success: true, level: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/org/units — arbre complet
router.get('/units', requireAuth, async (req, res) => {
  try {
    const result = await query(`
      SELECT ou.*, ol.name as level_name, ol.level_order,
             m.first_name || ' ' || m.last_name as manager_name,
             parent.name as parent_name
      FROM org_units ou
      LEFT JOIN org_levels ol ON ou.level_id  = ol.id
      LEFT JOIN employees  m  ON ou.manager_id = m.id
      LEFT JOIN org_units parent ON ou.parent_id = parent.id
      ORDER BY ol.level_order, ou.name`);
    res.json({ success: true, units: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/org/units/:id/tree — sous-arbre
router.get('/units/:id/tree', requireAuth, async (req, res) => {
  try {
    const result = await query(`
      WITH RECURSIVE tree AS (
        SELECT id, name, parent_id, level_id, manager_id, 0 as depth
        FROM org_units WHERE id = $1
        UNION ALL
        SELECT ou.id, ou.name, ou.parent_id, ou.level_id, ou.manager_id, t.depth + 1
        FROM org_units ou JOIN tree t ON ou.parent_id = t.id
      )
      SELECT t.*, ol.name as level_name
      FROM tree t LEFT JOIN org_levels ol ON t.level_id = ol.id
      ORDER BY depth, name`, [req.params.id]);
    res.json({ success: true, tree: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/org/units
router.post('/units', requireAuth, requireRole('superadmin', 'rh'), async (req, res) => {
  const { name, code, level_id, parent_id, manager_id } = req.body;
  try {
    const result = await query(
      'INSERT INTO org_units (name, code, level_id, parent_id, manager_id) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [name, code, level_id, parent_id, manager_id]
    );
    res.status(201).json({ success: true, unit: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/org/units/:id
router.put('/units/:id', requireAuth, requireRole('superadmin', 'rh'), async (req, res) => {
  const { name, code, level_id, parent_id, manager_id, is_active } = req.body;
  try {
    const result = await query(`
      UPDATE org_units SET name=$1, code=$2, level_id=$3, parent_id=$4, manager_id=$5, is_active=$6, updated_at=NOW()
      WHERE id=$7 RETURNING *`,
      [name, code, level_id, parent_id, manager_id, is_active, req.params.id]
    );
    res.json({ success: true, unit: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/org/positions
router.get('/positions', requireAuth, async (req, res) => {
  try {
    const result = await query(`
      SELECT p.*, ou.name as unit_name FROM positions p
      LEFT JOIN org_units ou ON p.org_unit_id = ou.id
      WHERE p.is_active=true ORDER BY p.title`);
    res.json({ success: true, positions: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/org/positions
router.post('/positions', requireAuth, requireRole('superadmin', 'rh'), async (req, res) => {
  const { title, org_unit_id } = req.body;
  try {
    const result = await query(
      'INSERT INTO positions (title, org_unit_id) VALUES ($1,$2) RETURNING *',
      [title, org_unit_id]
    );
    res.status(201).json({ success: true, position: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
