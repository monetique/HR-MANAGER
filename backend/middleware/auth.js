const jwt = require('jsonwebtoken');
const { query } = require('../db/postgres');

async function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Token manquant' });
  }
  try {
    const token = auth.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const result = await query(
      'SELECT id, matricule, first_name, last_name, email, role, org_unit_id, manager_id FROM employees WHERE id=$1 AND is_active=true',
      [decoded.id]
    );
    if (!result.rows.length) return res.status(401).json({ success: false, error: 'Utilisateur introuvable' });
    req.user = result.rows[0];
    req.subordinateIds = []; // initialiser par défaut
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Token invalide' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Accès refusé' });
    }
    next();
  };
}

async function requireSameUnit(req, res, next) {
  try {
    // superadmin, rh et hr_assistant ont accès total
    if (['superadmin', 'rh', 'hr_assistant'].includes(req.user.role)) return next();
    if (req.user.role === 'manager') {
      const result = await query(`
        WITH RECURSIVE subordinates AS (
          SELECT id FROM employees WHERE manager_id = $1
          UNION ALL
          SELECT e.id FROM employees e
          INNER JOIN subordinates s ON e.manager_id = s.id
        )
        SELECT id FROM subordinates
      `, [req.user.id]);
      req.subordinateIds = result.rows.map(r => r.id);
      console.log('Manager', req.user.matricule, 'subordinateIds:', req.subordinateIds);
    }
    next();
  } catch(err) {
    console.error('requireSameUnit error:', err.message);
    next();
  }
}

module.exports = { requireAuth, requireRole, requireSameUnit };
