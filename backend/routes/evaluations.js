const express = require('express')
const router = express.Router()
const pool = require('../db/postgres')
const { requireAuth, requireRole } = require('../middleware/auth')

// GET /api/evaluations/grids
router.get('/grids', requireAuth, async (req, res) => {
  try {
    const grids = await pool.query(`
      SELECT g.id, g.category, g.label, g.total_points, g.is_active,
        json_agg(
          json_build_object(
            'id', s.id, 'name', s.name, 'position', s.position, 'is_active', s.is_active,
            'criteria', (
              SELECT json_agg(json_build_object(
                'id', c.id, 'code', c.code, 'label', c.label,
                'max_points', c.max_points, 'position', c.position, 'is_active', c.is_active
              ) ORDER BY c.position)
              FROM eval_grid_criteria c WHERE c.section_id = s.id
            )
          ) ORDER BY s.position
        ) AS sections
      FROM eval_grids g
      LEFT JOIN eval_grid_sections s ON s.grid_id = g.id
      GROUP BY g.id ORDER BY g.category
    `)
    res.json({ grids: grids.rows })
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }) }
})

// GET /api/evaluations/grids/:category
router.get('/grids/:category', requireAuth, async (req, res) => {
  try {
    const grid = await pool.query(`SELECT * FROM eval_grids WHERE category=$1`, [req.params.category])
    if (!grid.rows.length) return res.status(404).json({ error: 'Grille non trouvée' })
    const sections = await pool.query(`
      SELECT s.id, s.name, s.position, s.is_active,
        json_agg(json_build_object(
          'id', c.id, 'code', c.code, 'label', c.label,
          'max_points', c.max_points, 'position', c.position, 'is_active', c.is_active
        ) ORDER BY c.position) AS criteria
      FROM eval_grid_sections s
      LEFT JOIN eval_grid_criteria c ON c.section_id = s.id
      WHERE s.grid_id=$1 AND s.is_active=true
      GROUP BY s.id ORDER BY s.position
    `, [grid.rows[0].id])
    res.json({ grid: grid.rows[0], sections: sections.rows })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// PUT /api/evaluations/grids/:id/section/:sid
router.put('/grids/:id/section/:sid', requireAuth, requireRole('superadmin', 'rh'), async (req, res) => {
  try {
    const { name, position, is_active } = req.body
    await pool.query(`UPDATE eval_grid_sections SET name=$1,position=$2,is_active=$3 WHERE id=$4`,
      [name, position, is_active, req.params.sid])
    res.json({ success: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST /api/evaluations/grids/:id/section
router.post('/grids/:id/section', requireAuth, requireRole('superadmin', 'rh'), async (req, res) => {
  try {
    const { name, position } = req.body
    const r = await pool.query(
      `INSERT INTO eval_grid_sections (grid_id,name,position) VALUES ($1,$2,$3) RETURNING *`,
      [req.params.id, name, position || 99])
    res.json({ section: r.rows[0] })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// PUT /api/evaluations/grids/criteria/:cid
router.put('/grids/criteria/:cid', requireAuth, requireRole('superadmin', 'rh'), async (req, res) => {
  try {
    const { label, max_points, position, is_active, code } = req.body
    await pool.query(
      `UPDATE eval_grid_criteria SET label=$1,max_points=$2,position=$3,is_active=$4,code=$5 WHERE id=$6`,
      [label, max_points, position, is_active, code, req.params.cid])
    res.json({ success: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST /api/evaluations/grids/section/:sid/criteria
router.post('/grids/section/:sid/criteria', requireAuth, requireRole('superadmin', 'rh'), async (req, res) => {
  try {
    const { label, max_points, code, position } = req.body
    const r = await pool.query(
      `INSERT INTO eval_grid_criteria (section_id,code,label,max_points,position) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.params.sid, code, label, max_points || 1, position || 99])
    res.json({ criteria: r.rows[0] })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// DELETE /api/evaluations/grids/criteria/:cid
router.delete('/grids/criteria/:cid', requireAuth, requireRole('superadmin', 'rh'), async (req, res) => {
  try {
    await pool.query(`UPDATE eval_grid_criteria SET is_active=false WHERE id=$1`, [req.params.cid])
    res.json({ success: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// GET /api/evaluations/campaigns
router.get('/campaigns', requireAuth, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT c.*,
        e.first_name||' '||e.last_name AS created_by_name,
        COUNT(ev.id) AS total_evaluations,
        COUNT(ev.id) FILTER (WHERE ev.status IN ('completed','rh_approved')) AS completed_evaluations
      FROM eval_campaigns c
      LEFT JOIN employees e ON e.id=c.created_by
      LEFT JOIN evaluations ev ON ev.campaign_id=c.id
      GROUP BY c.id,e.first_name,e.last_name
      ORDER BY c.created_at DESC
    `)
    res.json({ campaigns: r.rows })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST /api/evaluations/campaigns
router.post('/campaigns', requireAuth, requireRole('superadmin', 'rh', 'manager'), async (req, res) => {
  try {
    const { title, description, deadline, employee_ids } = req.body
    if (!title) return res.status(400).json({ error: 'Titre requis' })
    const camp = await pool.query(
      `INSERT INTO eval_campaigns (title,description,deadline,created_by,status) VALUES ($1,$2,$3,$4,'active') RETURNING *`,
      [title, description, deadline || null, req.user.id])
    const campId = camp.rows[0].id
    if (employee_ids && employee_ids.length > 0) {
      for (const empId of employee_ids) {
        const emp = await pool.query(
          `SELECT e.*,eg.id AS grid_id FROM employees e
           LEFT JOIN eval_grids eg ON eg.category=e.employee_category
           WHERE e.id=$1`, [empId])
        if (!emp.rows.length) continue
        const evaluatorId = emp.rows[0].manager_id || req.user.id
        const gridId = emp.rows[0].grid_id
        await pool.query(
          `INSERT INTO evaluations (campaign_id,employee_id,evaluator_id,grid_id,status) VALUES ($1,$2,$3,$4,'pending')`,
          [campId, empId, evaluatorId, gridId])
      }
    }
    res.json({ campaign: camp.rows[0] })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// PUT /api/evaluations/campaigns/:id/status
router.put('/campaigns/:id/status', requireAuth, requireRole('superadmin', 'rh', 'manager'), async (req, res) => {
  try {
    await pool.query(`UPDATE eval_campaigns SET status=$1 WHERE id=$2`, [req.body.status, req.params.id])
    res.json({ success: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// GET /api/evaluations/my-employees  ← DOIT ÊTRE AVANT /:id
router.get('/my-employees', requireAuth, async (req, res) => {
  try {
    let empList
    if (['superadmin','rh'].includes(req.user.role)) {
      empList = await pool.query(
        `SELECT id,first_name,last_name,matricule,employee_category FROM employees WHERE is_active=true ORDER BY first_name`)
    } else {
      empList = await pool.query(
        `SELECT id,first_name,last_name,matricule,employee_category FROM employees
         WHERE manager_id=$1 AND is_active=true ORDER BY first_name`, [req.user.id])
    }
    res.json({ employees: empList.rows })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// GET /api/evaluations/
router.get('/', requireAuth, async (req, res) => {
  try {
    const { status } = req.query
    let where = []
    let params = []
    let i = 1
    if (!['superadmin','rh'].includes(req.user.role)) {
      if (req.user.role === 'manager') {
        where.push(`(
          ev.evaluator_id=$${i} 
          OR ev.employee_id=$${i}
          OR (ev.status='pending_manager' AND ev.evaluator_id IN (SELECT id FROM employees WHERE manager_id=$${i}))
          OR (ev.status='rh_approved' AND ev.employee_id IN (SELECT id FROM employees WHERE manager_id=$${i}))
        )`); params.push(req.user.id); i++
      } else {
        where.push(`(ev.employee_id=$${i} AND ev.status IN ('rh_approved','completed'))`); params.push(req.user.id); i++
      }
    }
    if (status) { where.push(`ev.status=$${i}`); params.push(status); i++ }
    const r = await pool.query(`
      SELECT ev.*,
        emp.first_name||' '||emp.last_name AS employee_name,
        emp.matricule, emp.employee_category,
        evr.first_name||' '||evr.last_name AS evaluator_name,
        c.title AS campaign_title,
        g.label AS grid_label, g.total_points,
        COALESCE((SELECT SUM(es.score) FROM eval_scores es WHERE es.evaluation_id=ev.id),0) AS current_score
      FROM evaluations ev
      JOIN employees emp ON emp.id=ev.employee_id
      JOIN employees evr ON evr.id=ev.evaluator_id
      JOIN eval_campaigns c ON c.id=ev.campaign_id
      LEFT JOIN eval_grids g ON g.id=ev.grid_id
      ${where.length ? 'WHERE '+where.join(' AND ') : ''}
      ORDER BY ev.created_at DESC
    `, params)
    res.json({ evaluations: r.rows })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// GET /api/evaluations/:id  ← APRÈS my-employees
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const ev = await pool.query(`
      SELECT ev.*,
        emp.first_name||' '||emp.last_name AS employee_name,
        emp.matricule, emp.employee_category,
        evr.first_name||' '||evr.last_name AS evaluator_name,
        c.title AS campaign_title,
        g.label AS grid_label, g.total_points, g.category AS grid_category
      FROM evaluations ev
      JOIN employees emp ON emp.id=ev.employee_id
      JOIN employees evr ON evr.id=ev.evaluator_id
      JOIN eval_campaigns c ON c.id=ev.campaign_id
      LEFT JOIN eval_grids g ON g.id=ev.grid_id
      WHERE ev.id=$1
    `, [req.params.id])
    if (!ev.rows.length) return res.status(404).json({ error: 'Non trouvée' })
    const evaluation = ev.rows[0]
    const sections = await pool.query(`
      SELECT s.id, s.name, s.position,
        json_agg(json_build_object(
          'id',c.id,'code',c.code,'label',c.label,
          'max_points',c.max_points,'position',c.position
        ) ORDER BY c.position) AS criteria
      FROM eval_grid_sections s
      JOIN eval_grid_criteria c ON c.section_id=s.id
      WHERE s.grid_id=$1 AND s.is_active=true AND c.is_active=true
      GROUP BY s.id ORDER BY s.position
    `, [evaluation.grid_id])
    const scores = await pool.query(
      `SELECT criteria_id,score,comment FROM eval_scores WHERE evaluation_id=$1`, [req.params.id])
    const kpis = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status='present') AS present,
        COUNT(*) FILTER (WHERE status='late') AS late,
        COUNT(*) FILTER (WHERE status='absent') AS absent,
        ROUND(AVG(worked_hours)::numeric,1) AS avg_hours
      FROM attendance WHERE employee_id=$1 AND date>=date_trunc('year',NOW())
    `, [evaluation.employee_id])
    res.json({ evaluation, sections: sections.rows, scores: scores.rows, kpis: kpis.rows[0] })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// PUT /api/evaluations/:id
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { scores, comment, status } = req.body
    const evalId = req.params.id
    const ev = await pool.query(`SELECT * FROM evaluations WHERE id=$1`, [evalId])
    if (!ev.rows.length) return res.status(404).json({ error: 'Non trouvée' })
    if (ev.rows[0].evaluator_id !== req.user.id && !['superadmin','rh','manager'].includes(req.user.role))
      return res.status(403).json({ error: 'Accès refusé' })
    if (scores && scores.length > 0) {
      for (const s of scores) {
        await pool.query(`
          INSERT INTO eval_scores (evaluation_id,criteria_id,score,comment)
          VALUES ($1,$2,$3,$4)
          ON CONFLICT (evaluation_id,criteria_id) DO UPDATE SET score=$3,comment=$4,updated_at=NOW()
        `, [evalId, s.criteria_id, s.score, s.comment || ''])
      }
    }
    const total = await pool.query(
      `SELECT COALESCE(SUM(score),0) AS total FROM eval_scores WHERE evaluation_id=$1`, [evalId])
    await pool.query(
      `UPDATE evaluations SET comment=$1,status=$2,global_score=$3,updated_at=NOW() WHERE id=$4`,
      [comment || '', status || ev.rows[0].status, total.rows[0].total, evalId])
    res.json({ success: true, global_score: total.rows[0].total })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST /api/evaluations/:id/validate
router.post('/:id/validate', requireAuth, async (req, res) => {
  try {
    const { action, comment } = req.body
    const ev = await pool.query(`SELECT * FROM evaluations WHERE id=$1`, [req.params.id])
    if (!ev.rows.length) return res.status(404).json({ error: 'Non trouvée' })
    let newStatus
    if (action === 'approved') {
      newStatus = ev.rows[0].status === 'submitted' ? 'pending_manager'
        : ev.rows[0].status === 'pending_manager' ? 'rh_approved' : 'completed'
    } else {
      newStatus = 'rejected'
    }
    await pool.query(
      `UPDATE evaluations SET status=$1,validator_comment=$2,updated_at=NOW() WHERE id=$3`,
      [newStatus, comment || '', req.params.id])
    res.json({ success: true, status: newStatus })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

module.exports = router
