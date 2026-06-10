const express = require('express');
const { query } = require('../db/postgres');
const { requireAuth, requireRole } = require('../middleware/auth');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const router  = express.Router();
const { sendLeaveNotification } = require('../services/mail-service');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'announcements');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `announce_${Date.now()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error('Format non autorise'));
  }
});

// Helper : vérifier privilège hr_assistant
async function checkAssistantPrivilege(key, employeeId) {
  if (employeeId) {
    const r = await query(
      'SELECT value FROM hr_assistant_privileges WHERE employee_id=$1 AND privilege=$2',
      [employeeId, key]
    );
    if (r.rows.length) return r.rows[0].value === true;
  }
  const r = await query('SELECT value FROM app_config WHERE key=$1', [key]);
  return r.rows[0]?.value === 'true';
}

// Middleware : autoriser rh/superadmin OU hr_assistant avec le bon privilège
async function requireAnnouncementAccess(req, res, next) {
  if (['superadmin', 'rh'].includes(req.user.role)) return next();
  if (req.user.role === 'hr_assistant') {
    const allowed = await checkAssistantPrivilege('hr_assistant_can_view_announcements', req.user.id);
    if (allowed) return next();
  }
  return res.status(403).json({ success: false, error: 'Accès refusé' });
}


// -- Envoyer annonce par mail a tous les employes actifs --
async function sendAnnouncementToAll(announcement, authorName) {
  try {
    const TYPE_COLORS = { info: '#1B9BBF', urgent: '#dc2626', event: '#7c3aed', general: '#374151' };
    const TYPE_LABELS = { info: 'Information', urgent: 'Urgent', event: 'Evenement', general: 'General' };
    const color = TYPE_COLORS[announcement.type] || '#1B9BBF';
    const typeLabel = TYPE_LABELS[announcement.type] || announcement.type;
    const empResult = await query("SELECT email, first_name, last_name FROM employees WHERE is_active=true AND email IS NOT NULL AND email != ''");
    const employees = empResult.rows;
    if (!employees.length) return;
    const details = {
      'Type': typeLabel,
      'Publie par': authorName,
      'Date': new Date().toLocaleDateString('fr-TN', { day:'2-digit', month:'long', year:'numeric' })
    };
    if (announcement.is_pinned) details['Note'] = 'Annonce epinglee';
    await Promise.allSettled(employees.map(function(emp) {
      return sendLeaveNotification(
        emp.email,
        '[' + typeLabel + '] ' + announcement.title,
        announcement.title,
        announcement.content,
        details,
        color
      );
    }));
    console.log('[announcements] Mail envoye a ' + employees.length + ' employe(s) — "' + announcement.title + '"');
  } catch (err) {
    console.error('[announcements] Erreur envoi mails:', err.message);
  }
}
// GET /api/announcements
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await query(`
      SELECT a.*, e.first_name || ' ' || e.last_name as author_name,
             EXISTS(SELECT 1 FROM announcement_reads r WHERE r.announcement_id=a.id AND r.employee_id=$1) as is_read
      FROM announcements a
      LEFT JOIN employees e ON a.author_id = e.id
      WHERE a.is_active = true
      ORDER BY a.is_pinned DESC, a.created_at DESC
    `, [req.user.id]);
    res.json({ success: true, announcements: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/announcements/unread-count
router.get('/unread-count', requireAuth, async (req, res) => {
  try {
    const result = await query(`
      SELECT COUNT(*) as count FROM announcements a
      WHERE a.is_active = true
      AND NOT EXISTS (
        SELECT 1 FROM announcement_reads r
        WHERE r.announcement_id = a.id AND r.employee_id = $1
      )
    `, [req.user.id]);
    res.json({ success: true, count: parseInt(result.rows[0].count) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/announcements/attachment/:filename
router.get('/attachment/:filename', requireAuth, (req, res) => {
  const filePath = path.join(UPLOAD_DIR, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, error: 'Fichier introuvable' });
  res.download(filePath);
});

// POST /api/announcements/:id/read
router.post('/:id/read', requireAuth, async (req, res) => {
  try {
    await query(
      'INSERT INTO announcement_reads (announcement_id, employee_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/announcements — créer
router.post('/', requireAuth, requireAnnouncementAccess, upload.single('file'), async (req, res) => {
  const { title, content, type, is_pinned } = req.body;
  try {
    const result = await query(`
      INSERT INTO announcements (title, content, type, author_id, attachment, is_pinned)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [title, content, type || 'info', req.user.id, req.file?.filename || null, is_pinned === 'true']
    );
    const newAnnouncement = result.rows[0];

    // Mail a tous les employes (non bloquant)
    const authorName = req.user.first_name + ' ' + req.user.last_name;
    sendAnnouncementToAll(newAnnouncement, authorName).catch(function() {});

    // Notifications in-app
    const allEmps = await query("SELECT id FROM employees WHERE is_active=true AND id != $1", [req.user.id]);
    await Promise.allSettled(allEmps.rows.map(function(emp) {
      const preview = newAnnouncement.content ? newAnnouncement.content.substring(0, 120) + (newAnnouncement.content.length > 120 ? '...' : '') : '';
      return query(
        "INSERT INTO notifications (employee_id, title, message, type) VALUES ($1,$2,$3,'info')",
        [emp.id, newAnnouncement.title, preview]
      );
    }));

    res.status(201).json({ success: true, announcement: newAnnouncement });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/announcements/:id — modifier/épingler
router.put('/:id', requireAuth, requireAnnouncementAccess, async (req, res) => {
  const { title, content, type, is_pinned, is_active } = req.body;
  try {
    const result = await query(`
      UPDATE announcements SET title=$1, content=$2, type=$3, is_pinned=$4, is_active=$5, updated_at=NOW()
      WHERE id=$6 RETURNING *`,
      [title, content, type, is_pinned, is_active, req.params.id]
    );
    res.json({ success: true, announcement: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/announcements/:id — supprimer
router.delete('/:id', requireAuth, requireAnnouncementAccess, async (req, res) => {
  try {
    await query('UPDATE announcements SET is_active=false WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
