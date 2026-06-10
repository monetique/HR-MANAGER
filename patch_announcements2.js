const fs = require('fs');
const path = '/data/applications/hr-manager/backend/routes/announcements.js';
let code = fs.readFileSync(path, 'utf8');

// 1. Ajouter import mail-service
if (!code.includes('mail-service')) {
  code = code.replace(
    "const router  = express.Router();",
    "const router  = express.Router();\nconst { sendLeaveNotification } = require('../services/mail-service');"
  );
}

// 2. Ajouter la fonction sendAnnouncementToAll
const helperFn = "\n// -- Envoyer annonce par mail a tous les employes actifs --\nasync function sendAnnouncementToAll(announcement, authorName) {\n  try {\n    const TYPE_COLORS = { info: '#1B9BBF', urgent: '#dc2626', event: '#7c3aed', general: '#374151' };\n    const TYPE_LABELS = { info: 'Information', urgent: 'Urgent', event: 'Evenement', general: 'General' };\n    const color = TYPE_COLORS[announcement.type] || '#1B9BBF';\n    const typeLabel = TYPE_LABELS[announcement.type] || announcement.type;\n    const empResult = await query(\"SELECT email, first_name, last_name FROM employees WHERE is_active=true AND email IS NOT NULL AND email != ''\");\n    const employees = empResult.rows;\n    if (!employees.length) return;\n    const details = {\n      'Type': typeLabel,\n      'Publie par': authorName,\n      'Date': new Date().toLocaleDateString('fr-TN', { day:'2-digit', month:'long', year:'numeric' })\n    };\n    if (announcement.is_pinned) details['Note'] = 'Annonce epinglee';\n    await Promise.allSettled(employees.map(function(emp) {\n      return sendLeaveNotification(\n        emp.email,\n        '[' + typeLabel + '] ' + announcement.title,\n        announcement.title,\n        announcement.content,\n        details,\n        color\n      );\n    }));\n    console.log('[announcements] Mail envoye a ' + employees.length + ' employe(s) — \"' + announcement.title + '\"');\n  } catch (err) {\n    console.error('[announcements] Erreur envoi mails:', err.message);\n  }\n}\n";

code = code.replace(
  "// GET /api/announcements\nrouter.get('/',",
  helperFn + "// GET /api/announcements\nrouter.get('/',"
);

// 3. Appeler sendAnnouncementToAll + notifs in-app après création
code = code.replace(
  "    res.status(201).json({ success: true, announcement: result.rows[0] });\n  } catch (err) {\n    res.status(500).json({ success: false, error: err.message });\n  }\n});\n\n// PUT /api/announcements/:id",
  "    const newAnnouncement = result.rows[0];\n\n    // Mail a tous les employes (non bloquant)\n    const authorName = req.user.first_name + ' ' + req.user.last_name;\n    sendAnnouncementToAll(newAnnouncement, authorName).catch(function() {});\n\n    // Notifications in-app\n    const allEmps = await query(\"SELECT id FROM employees WHERE is_active=true AND id != $1\", [req.user.id]);\n    await Promise.allSettled(allEmps.rows.map(function(emp) {\n      const preview = newAnnouncement.content ? newAnnouncement.content.substring(0, 120) + (newAnnouncement.content.length > 120 ? '...' : '') : '';\n      return query(\n        \"INSERT INTO notifications (employee_id, title, message, type) VALUES ($1,$2,$3,'info')\",\n        [emp.id, newAnnouncement.title, preview]\n      );\n    }));\n\n    res.status(201).json({ success: true, announcement: newAnnouncement });\n  } catch (err) {\n    res.status(500).json({ success: false, error: err.message });\n  }\n});\n\n// PUT /api/announcements/:id"
);

fs.writeFileSync(path, code);
console.log('OK announcements.js patche');
