const fs = require('fs');
const path = '/data/applications/hr-manager/backend/routes/announcements.js';
let code = fs.readFileSync(path, 'utf8');

// 1. Ajouter import mail-service
if (!code.includes('mail-service')) {
  code = code.replace(
    `const router  = express.Router();`,
    `const router  = express.Router();
const { sendLeaveNotification } = require('../services/mail-service');`
  );
}

// 2. Ajouter fonction sendAnnouncementToAll
const helperFn = `
// ── Envoyer annonce par mail à tous les employés actifs ──
async function sendAnnouncementToAll(announcement, authorName) {
  try {
    const TYPE_COLORS = {
      info:    '#1B9BBF',
      urgent:  '#dc2626',
      event:   '#7c3aed',
      general: '#374151'
    };
    const TYPE_LABELS = {
      info:    'Information',
      urgent:  'Urgent',
      event:   'Événement',
      general: 'Général'
    };
    const color = TYPE_COLORS[announcement.type] || '#1B9BBF';
    const typeLabel = TYPE_LABELS[announcement.type] || announcement.type;

    const empResult = await query(
      "SELECT email, first_name, last_name FROM employees WHERE is_active=true AND email IS NOT NULL AND email != ''"
    );
    const employees = empResult.rows;
    if (!employees.length) return;

    const details = {
      'Type': typeLabel,
      'Publié par': authorName,
      'Date': new Date().toLocaleDateString('fr-TN', { day:'2-digit', month:'long', year:'numeric' })
    };
    if (announcement.is_pinned) details[''] = '📌 Annonce épinglée';

    // Envoi en parallèle (non bloquant)
    await Promise.allSettled(employees.map(emp =>
      sendLeaveNotification(
        emp.email,
        `${announcement.is_pinned ? '📌 ' : ''}[${typeLabel}] ${announcement.title}`,
        announcement.title,
        announcement.content,
        details,
        color
      )
    ));
    console.log(`[announcements] Mail envoyé à ${employees.length} employé(s) — "${announcement.title}"`);
  } catch (err) {
    console.error('[announcements] Erreur envoi mails:', err.message);
  }
}
`;

// Insérer avant le premier router.get
code = code.replace(
  `// GET /api/announcements\nrouter.get('/',`,
  helperFn + `// GET /api/announcements\nrouter.get('/',`
);

// 3. Appeler sendAnnouncementToAll après création
code = code.replace(
  `    res.status(201).json({ success: true, announcement: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/announcements/:id`,
  `    const newAnnouncement = result.rows[0];

    // Notifier tous les employés par mail (non bloquant)
    const authorName = req.user.first_name + ' ' + req.user.last_name;
    sendAnnouncementToAll(newAnnouncement, authorName).catch(() => {});

    // Notifications in-app pour tous les employés actifs
    const allEmps = await query("SELECT id FROM employees WHERE is_active=true AND id != $1", [req.user.id]);
    await Promise.allSettled(allEmps.rows.map(emp =>
      query(
        "INSERT INTO notifications (employee_id, title, message, type) VALUES ($1,$2,$3,'info')",
        [emp.id, newAnnouncement.title, newAnnouncement.content?.substring(0, 120) + (newAnnouncement.content?.length > 120 ? '...' : '')]
      )
    ));

    res.status(201).json({ success: true, announcement: newAnnouncement });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/announcements/:id`
);

fs.writeFileSync(path, code);
console.log('✅ announcements.js patché');
