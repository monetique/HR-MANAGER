const express = require('express');
const { query } = require('../db/postgres');
const { requireAuth, requireRole } = require('../middleware/auth');
const { sendHRStatusNotification } = require('../services/mail-service');

const hrRouter   = express.Router();
const notifRouter = express.Router();

// ── Helpers ───────────────────────────────────────────────
async function hasPrivilege(key, employeeId) {
  // Vérifier dans hr_assistant_privileges (par employé)
  if (employeeId) {
    const r = await query(
      'SELECT value FROM hr_assistant_privileges WHERE employee_id=$1 AND privilege=$2',
      [employeeId, key]
    );
    if (r.rows.length) return r.rows[0].value === true;
  }
  // Fallback sur app_config (global)
  const r = await query('SELECT value FROM app_config WHERE key=$1', [key]);
  return r.rows[0]?.value === 'true';
}

async function getEmail(id) {
  const r = await query('SELECT email, first_name, last_name FROM employees WHERE id=$1', [id]);
  return r.rows[0] || null;
}
async function getRHEmail() {
  const r = await query("SELECT email, first_name, last_name FROM employees WHERE role IN ('rh','superadmin') AND is_active=true ORDER BY role='rh' DESC LIMIT 1");
  return r.rows[0] || null;
}

// Retourne RH + assistantes ayant le privilège de voir/traiter les demandes RH
async function getHRRecipients(privilege = 'hr_assistant_can_view_hr_requests') {
  const recipients = [];
  // RH principal
  const rh = await getRHEmail();
  if (rh) recipients.push({ ...rh, isRH: true });
  // Assistantes avec le privilège
  const assistants = await query(`
    SELECT e.id, e.email, e.first_name, e.last_name
    FROM employees e
    JOIN hr_assistant_privileges p ON p.employee_id = e.id
    WHERE e.role = 'hr_assistant' AND e.is_active = true
    AND p.privilege = $1 AND p.value = true
  `, [privilege]);
  assistants.rows.forEach(a => recipients.push({ ...a, isRH: true }));
  return recipients;
}

const STATUS_LABELS = {
  pending:     'En cours',
  in_progress: 'Prise en charge',
  closed:      'Clôturée',
  rejected:    'Rejetée'
};

const STATUS_COLORS = {
  pending:     '#f59e0b',
  in_progress: '#3b82f6',
  closed:      '#10b981',
  rejected:    '#ef4444'
};

// ── HR Requests ───────────────────────────────────────────

// GET /api/hr-requests — liste des demandes
hrRouter.get('/', requireAuth, async (req, res) => {
  try {
    if (req.user.role === 'hr_assistant') {
      const allowed = await hasPrivilege('hr_assistant_can_view_hr_requests', req.user.id);
      if (!allowed) return res.json({ success: true, requests: [] });
    }

    let sql = `
      SELECT hr.*, e.first_name || ' ' || e.last_name as employee_name, e.matricule,
             v.first_name || ' ' || v.last_name as validator_name
      FROM hr_requests hr
      JOIN employees e ON hr.employee_id = e.id
      LEFT JOIN employees v ON hr.validator_id = v.id
      WHERE 1=1`;
    const params = [];

    if (['employee', 'manager'].includes(req.user.role)) {
      sql += ` AND hr.employee_id = $${params.length + 1}`;
      params.push(req.user.id);
    }

    if (req.query.status) {
      sql += ` AND hr.status = $${params.length + 1}`;
      params.push(req.query.status);
    }

    sql += ' ORDER BY hr.created_at DESC';
    const result = await query(sql, params);
    res.json({ success: true, requests: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// GET /api/hr-requests/stats — statistiques RH (superadmin/rh uniquement)
hrRouter.get('/stats', requireAuth, requireRole('superadmin', 'rh', 'hr_assistant'), async (req, res) => {
  try {
    const { date_from, date_to, type, status } = req.query;
    const conditions = [];
    const params = [];

    if (date_from) { params.push(date_from); conditions.push(`hr.created_at >= $${params.length}::date`); }
    if (date_to)   { params.push(date_to);   conditions.push(`hr.created_at < ($${params.length}::date + interval '1 day')`); }
    if (type)      { params.push(type);      conditions.push(`hr.type = $${params.length}`); }
    if (status)    { params.push(status);    conditions.push(`hr.status = $${params.length}`); }

    const where = conditions.length ? 'AND ' + conditions.join(' AND ') : '';

    // KPIs globaux
    const kpis = await query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE hr.status='pending')     as pending,
        COUNT(*) FILTER (WHERE hr.status='in_progress') as in_progress,
        COUNT(*) FILTER (WHERE hr.status='closed')      as closed,
        COUNT(*) FILTER (WHERE hr.status='rejected')    as rejected
      FROM hr_requests hr WHERE 1=1 ${where}
    `, params);

    // Par type
    const byType = await query(`
      SELECT hr.type,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE hr.status='closed')   as closed,
        COUNT(*) FILTER (WHERE hr.status='rejected') as rejected,
        COUNT(*) FILTER (WHERE hr.status='pending')  as pending
      FROM hr_requests hr WHERE 1=1 ${where}
      GROUP BY hr.type ORDER BY total DESC
    `, params);

    // Par mois
    const byMonth = await query(`
      SELECT TO_CHAR(hr.created_at, 'YYYY-MM') as mois,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE hr.status='closed')   as closed,
        COUNT(*) FILTER (WHERE hr.status='rejected') as rejected
      FROM hr_requests hr WHERE 1=1 ${where}
      GROUP BY TO_CHAR(hr.created_at, 'YYYY-MM') ORDER BY mois
    `, params);

    // Liste détaillée
    const details = await query(`
      SELECT hr.id, hr.type, hr.status, hr.description, hr.created_at, hr.status_updated_at,
             hr.validator_comment,
             e.first_name || ' ' || e.last_name as employee_name, e.matricule,
             v.first_name || ' ' || v.last_name as validator_name
      FROM hr_requests hr
      JOIN employees e ON hr.employee_id = e.id
      LEFT JOIN employees v ON hr.validator_id = v.id
      WHERE 1=1 ${where}
      ORDER BY hr.created_at DESC LIMIT 1000
    `, params);

    res.json({ success: true, kpis: kpis.rows[0], by_type: byType.rows, by_month: byMonth.rows, details: details.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/hr-requests/:id — détail
hrRouter.get('/:id', requireAuth, async (req, res) => {
  try {
    const reqResult = await query(`
      SELECT hr.*, e.first_name || ' ' || e.last_name as employee_name,
             e.matricule, e.email as employee_email,
             v.first_name || ' ' || v.last_name as validator_name
      FROM hr_requests hr
      JOIN employees e ON hr.employee_id = e.id
      LEFT JOIN employees v ON hr.validator_id = v.id
      WHERE hr.id = $1`, [req.params.id]
    );

    if (!reqResult.rows.length) return res.status(404).json({ success: false, error: 'Demande introuvable' });
    const hrReq = reqResult.rows[0];

    if (['employee', 'manager'].includes(req.user.role) && hrReq.employee_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Accès refusé' });
    }

    if (req.user.role === 'hr_assistant') {
      const allowed = await hasPrivilege('hr_assistant_can_view_hr_requests', req.user.id);
      if (!allowed) return res.status(403).json({ success: false, error: 'Privilège non accordé' });
    }

    const histResult = await query(`
      SELECT h.*, e.first_name || ' ' || e.last_name as changed_by_name
      FROM hr_request_status_history h
      LEFT JOIN employees e ON h.changed_by = e.id
      WHERE h.request_id = $1
      ORDER BY h.created_at ASC`, [req.params.id]
    );

    res.json({ success: true, request: hrReq, history: histResult.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/hr-requests — créer une demande
hrRouter.post('/', requireAuth, async (req, res) => {
  const { type, description } = req.body;
  try {
    const result = await query(
      "INSERT INTO hr_requests (employee_id, type, description, status) VALUES ($1,$2,$3,'pending') RETURNING *",
      [req.user.id, type, description]
    );
    const newReq = result.rows[0];

    // Notification in-app
    await query(`INSERT INTO notifications (employee_id, title, message, type) VALUES ($1,$2,$3,'info')`,
      [req.user.id, 'Demande RH soumise', `Votre demande "${type}" a été soumise avec succès.`]
    );

    // Email au demandeur
    const demandeur = await getEmail(req.user.id);
    if (demandeur) {
      sendHRStatusNotification({
        to: demandeur.email,
        employeeName: `${demandeur.first_name} ${demandeur.last_name}`,
        requestType: type,
        newStatus: 'pending',
        statusLabel: STATUS_LABELS['pending'],
        statusColor: STATUS_COLORS['pending'],
        comment: description,
        requestId: newReq.id
      });
    }

    // Email au RH + assistantes avec privilège
    const recipients = await getHRRecipients('hr_assistant_can_view_hr_requests');
    for (const recipient of recipients) {
      sendHRStatusNotification({
        to: recipient.email,
        employeeName: demandeur ? `${demandeur.first_name} ${demandeur.last_name}` : 'Employé',
        requestType: type,
        newStatus: 'pending',
        statusLabel: STATUS_LABELS['pending'],
        statusColor: STATUS_COLORS['pending'],
        comment: description,
        requestId: newReq.id,
        isRH: true
      });
    }

    res.status(201).json({ success: true, request: newReq });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Fonction commune pour changer le statut ───────────────
async function changeStatus(req, res) {
  const { action, new_status, comment } = req.body;
  const status = new_status || action;

  if (!status) return res.status(400).json({ success: false, error: 'Statut requis' });

  try {
    const current = await query('SELECT * FROM hr_requests WHERE id=$1', [req.params.id]);
    if (!current.rows.length) return res.status(404).json({ success: false, error: 'Demande introuvable' });

    const result = await query(`
      UPDATE hr_requests
      SET status=$1::varchar, validator_id=$2, validator_comment=$3,
          status_comment=$3, status_updated_at=NOW(),
          validated_at=CASE WHEN $1='closed' THEN NOW() ELSE validated_at END,
          updated_at=NOW()
      WHERE id=$4 RETURNING *`,
      [status, req.user.id, comment || null, req.params.id]
    );

    const updatedReq = result.rows[0];

    // Notification in-app
    await query(`INSERT INTO notifications (employee_id, title, message, type) VALUES ($1,$2,$3,$4)`,
      [updatedReq.employee_id,
       `Demande RH — ${STATUS_LABELS[status] || status}`,
       `Votre demande "${updatedReq.type}" est maintenant : ${STATUS_LABELS[status] || status}`,
       status === 'closed' ? 'success' : status === 'rejected' ? 'error' : 'info']
    );

    // Email au demandeur
    const demandeur = await getEmail(updatedReq.employee_id);
    if (demandeur) {
      sendHRStatusNotification({
        to: demandeur.email,
        employeeName: `${demandeur.first_name} ${demandeur.last_name}`,
        requestType: updatedReq.type,
        newStatus: status,
        statusLabel: STATUS_LABELS[status] || status,
        statusColor: STATUS_COLORS[status] || '#6b7280',
        comment: comment,
        requestId: req.params.id,
        handledBy: `${req.user.first_name} ${req.user.last_name}`
      });
    }

    // Email au RH + assistantes avec privilège
    const recipients = await getHRRecipients('hr_assistant_can_view_hr_requests');
    for (const recipient of recipients) {
      // Ne pas renvoyer un mail au valideur lui-même
      if (recipient.email === req.user.email) continue;
      sendHRStatusNotification({
        to: recipient.email,
        employeeName: demandeur ? `${demandeur.first_name} ${demandeur.last_name}` : 'Employé',
        requestType: updatedReq.type,
        newStatus: status,
        statusLabel: STATUS_LABELS[status] || status,
        statusColor: STATUS_COLORS[status] || '#6b7280',
        comment: comment,
        requestId: req.params.id,
        handledBy: `${req.user.first_name} ${req.user.last_name}`,
        isRH: true
      });
    }
    res.json({ success: true, request: updatedReq });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// PUT /api/hr-requests/:id/status
hrRouter.put('/:id/status', requireAuth, requireRole('superadmin', 'rh', 'hr_assistant'), async (req, res) => {
  if (req.user.role === 'hr_assistant') {
    const allowed = await hasPrivilege('hr_assistant_can_change_hr_status', req.user.id);
    if (!allowed) return res.status(403).json({ success: false, error: 'Privilège non accordé' });
  }
  return changeStatus(req, res);
});

// PUT /api/hr-requests/:id/process (compatibilité)
hrRouter.put('/:id/process', requireAuth, requireRole('superadmin', 'rh', 'hr_assistant'), async (req, res) => {
  if (req.user.role === 'hr_assistant') {
    const allowed = await hasPrivilege('hr_assistant_can_change_hr_status', req.user.id);
    if (!allowed) return res.status(403).json({ success: false, error: 'Privilège non accordé' });
  }
  return changeStatus(req, res);
});

// ── Notifications ─────────────────────────────────────────

notifRouter.get('/', requireAuth, async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM notifications WHERE employee_id=$1 ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );
    const unread = result.rows.filter(n => !n.is_read).length;
    res.json({ success: true, notifications: result.rows, unread });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

notifRouter.put('/:id/read', requireAuth, async (req, res) => {
  try {
    await query('UPDATE notifications SET is_read=true WHERE id=$1 AND employee_id=$2', [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

notifRouter.put('/read-all', requireAuth, async (req, res) => {
  try {
    await query('UPDATE notifications SET is_read=true WHERE employee_id=$1', [req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = { hrRouter, notifRouter };
