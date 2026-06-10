const express = require('express');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const { query } = require('../db/postgres');
const { requireAuth, requireRole } = require('../middleware/auth');
const router  = express.Router();

function generateTokens(employee) {
  const payload = { id: employee.id, role: employee.role, matricule: employee.matricule };
  const token        = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });
  const refreshToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' });
  return { token, refreshToken };
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ success: false, error: 'Email et mot de passe requis' });
  try {
    const result = await query(
      `SELECT e.*, ou.name as unit_name, p.title as position_title
       FROM employees e
       LEFT JOIN org_units ou ON e.org_unit_id = ou.id
       LEFT JOIN positions p  ON e.position_id  = p.id
       WHERE LOWER(e.email)=LOWER($1) AND e.is_active=true`, [email]
    );
    if (!result.rows.length) return res.status(401).json({ success: false, error: 'Identifiants invalides' });
    const emp = result.rows[0];
    const valid = await bcrypt.compare(password, emp.password_hash);
    if (!valid) return res.status(401).json({ success: false, error: 'Identifiants invalides' });
    await query('UPDATE employees SET last_login=$1 WHERE id=$2', [new Date(), emp.id]);
    const { token, refreshToken } = generateTokens(emp);
    const { password_hash, ...empData } = emp;
    res.json({ success: true, token, refreshToken, employee: empData });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT e.id, e.matricule, e.first_name, e.last_name, e.email, e.role,
              e.phone, e.hire_date, e.org_unit_id, e.manager_id,
              ou.name as unit_name, p.title as position_title,
              m.first_name || ' ' || m.last_name as manager_name
       FROM employees e
       LEFT JOIN org_units ou ON e.org_unit_id = ou.id
       LEFT JOIN positions p  ON e.position_id  = p.id
       LEFT JOIN employees m  ON e.manager_id   = m.id
       WHERE e.id=$1`, [req.user.id]
    );
    res.json({ success: true, employee: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ success: false, error: 'Token manquant' });
  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    const result  = await query('SELECT * FROM employees WHERE id=$1 AND is_active=true', [decoded.id]);
    if (!result.rows.length) return res.status(401).json({ success: false, error: 'Utilisateur introuvable' });
    const { token, refreshToken: newRefresh } = generateTokens(result.rows[0]);
    res.json({ success: true, token, refreshToken: newRefresh });
  } catch (err) {
    res.status(401).json({ success: false, error: 'Token invalide' });
  }
});

// POST /api/auth/change-password — employé change son propre mot de passe
router.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  try {
    const result = await query('SELECT password_hash FROM employees WHERE id=$1', [req.user.id]);
    const valid  = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    if (!valid) return res.status(400).json({ success: false, error: 'Mot de passe actuel incorrect' });
    const hash = await bcrypt.hash(newPassword, 12);
    await query('UPDATE employees SET password_hash=$1, updated_at=NOW() WHERE id=$2', [hash, req.user.id]);
    res.json({ success: true, message: 'Mot de passe modifié' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/auth/reset-password/:id — RH/superadmin réinitialise le mot de passe d'un employé
router.post('/reset-password/:id', requireAuth, requireRole('superadmin', 'rh'), async (req, res) => {
  const { newPassword } = req.body;
  const password = newPassword || require('crypto').randomBytes(8).toString('hex');
  try {
    const emp = await query('SELECT id, first_name, last_name, matricule FROM employees WHERE id=$1', [req.params.id]);
    if (!emp.rows.length) return res.status(404).json({ success: false, error: 'Employé introuvable' });
    const hash = await bcrypt.hash(password, 12);
    await query('UPDATE employees SET password_hash=$1, updated_at=NOW() WHERE id=$2', [hash, req.params.id]);
    res.json({
      success: true,
      message: `Mot de passe réinitialisé pour ${emp.rows[0].first_name} ${emp.rows[0].last_name}`,
      newPassword: password
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
