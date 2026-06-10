const express = require('express');
const { query } = require('../db/postgres');
const { requireAuth, requireRole } = require('../middleware/auth');
const { sendTestMail, sendRecapToManager } = require('../services/mail-service');
const { sendWeeklyRecap } = require('../services/cron-recap');
const router = express.Router();

// POST /api/config/mail/test — tester la config SMTP
router.post('/test', requireAuth, requireRole('superadmin', 'rh'), async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, error: 'Email requis' });
  try {
    await sendTestMail(email);
    res.json({ success: true, message: `Email de test envoyé à ${email}` });
  } catch(err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/config/mail/recap-now — envoyer le récap maintenant
router.post('/recap-now', requireAuth, requireRole('superadmin', 'rh'), async (req, res) => {
  try {
    await sendWeeklyRecap();
    res.json({ success: true, message: 'Récapitulatif envoyé aux managers' });
  } catch(err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
