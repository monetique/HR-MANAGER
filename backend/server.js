'use strict';
require('dotenv').config();
process.on('uncaughtException',  err => console.error('uncaughtException:', err.message));
process.on('unhandledRejection', err => console.error('unhandledRejection:', err?.message || err));
const express   = require('express');
const cron      = require('node-cron');
const cors      = require('cors');
const path      = require('path');
const fs        = require('fs');
const rateLimit = require('express-rate-limit');
const { initPointageDB } = require('./db/mssql');
const { hrRouter, notifRouter } = require('./routes/hr');
const app  = express();
const PORT = process.env.PORT || 5005;
const HOST = process.env.HOST || '0.0.0.0';
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || 'http://172.17.5.198:3007').split(',').map(o => o.trim()).filter(Boolean);
app.use(cors({ origin: (origin, cb) => { if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true); console.error('❌ Erreur: CORS bloqué:', origin); cb(new Error('CORS bloque: ' + origin)); }, credentials: true }));
app.use('/api/', rateLimit({ windowMs: 60000, max: 200, standardHeaders: true, legacyHeaders: false, message: { success: false, error: 'Trop de requetes.' } }));
const authLimiter = rateLimit({ windowMs: 900000, max: 5, skipSuccessfulRequests: true, standardHeaders: true, legacyHeaders: false, message: { success: false, error: 'Trop de tentatives. Reessayez dans 15 minutes.' }, handler: (req, res, next, options) => { console.warn('[SECURITY] Rate limit auth IP: ' + req.ip); res.status(429).json(options.message); } });
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/reset-password', authLimiter);
app.use((req, res, next) => { if (decodeURIComponent(req.path).includes('..')) { return res.status(400).json({ success: false, error: 'Chemin invalide.' }); } next(); });
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => { if (!req.path.startsWith('/api')) return next(); const start = Date.now(); res.on('finish', () => { console.log(req.method + ' ' + req.path + ' ' + res.statusCode + ' ' + (Date.now()-start) + 'ms'); }); next(); });
app.use('/api/auth',           require('./routes/auth'));
app.use('/api/employees',      require('./routes/employees'));
app.use('/api/leaves/types',   require('./routes/leave-types'));
app.use('/api/leaves',         require('./routes/leaves'));
app.use('/api/attendance',     require('./routes/attendance'));
app.use('/api/schedules',      require('./routes/schedules'));
app.use('/api/org',            require('./routes/org'));
app.use('/api/hr',             hrRouter);
app.use('/api/hr-requests',    hrRouter);
app.use('/api/notifications',  notifRouter);
app.use('/api/dashboard',      require('./routes/dashboard'));
app.use('/api/uploads',        require('./routes/uploads'));
app.use('/api/evaluations',    require('./routes/evaluations'));
app.use('/api/announcements',  require('./routes/announcements'));
app.use('/api/config/mail',    require('./routes/mail'));
app.use('/api/config',         require('./routes/config'));
app.get('/api/health', (req, res) => res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() }));
const distPath = path.join(__dirname, 'public');
if (fs.existsSync(distPath)) { app.use(express.static(distPath)); app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html'))); console.log('Frontend servi depuis public/'); }
app.use((err, req, res, next) => { console.error('Erreur:', err.message); res.status(err.status || 500).json({ success: false, error: process.env.NODE_ENV === 'development' ? err.message : 'Erreur serveur interne' }); });
async function start() {
  if (process.env.MSSQL_POINTAGE_HOST) initPointageDB().catch(() => {});
  cron.schedule('*/5 * * * *', async () => {
    try {
      const axios = require('axios');
      const port = process.env.PORT || 5005;
      const loginRes = await axios.post('http://localhost:' + port + '/api/auth/login', { email: process.env.SYNC_EMAIL || 'admin@monetiquetunisie.com', password: process.env.SYNC_PASSWORD || 'REDACTED_PASSWORD' }).catch(() => null);
      if (!loginRes?.data?.token) return;
      const dateStr = new Date().toISOString().slice(0, 10);
      await axios.post('http://localhost:' + port + '/api/attendance/sync', { date_from: dateStr, date_to: dateStr }, { headers: { Authorization: 'Bearer ' + loginRes.data.token } });
      console.log('Auto-sync pointage:', dateStr, new Date().toLocaleTimeString());
    } catch (err) { console.error('Erreur auto-sync:', err.message); }
  });
  console.log('Scheduler pointage démarré (toutes les 5 min)');

  // ── Cron versement annuel congés (tous les jours à 06:00 Tunisie) ──
  cron.schedule('0 5 * * *', async () => {
    try {
      const { query } = require('./db/postgres');
      const today = new Date().toISOString().split('T')[0];
      // Chercher un versement pending dont la date est aujourd'hui ou dépassée
      const cfg = await query(
        "SELECT * FROM leave_versement_config WHERE status='pending' AND versement_date <= $1 LIMIT 1",
        [today]
      );
      if (!cfg.rows.length) return;
      const c = cfg.rows[0];
      const employees = await query("SELECT id FROM employees WHERE is_active=true AND role != 'superadmin'");
      for (const emp of employees.rows) {
        const annualGranted = parseFloat(c.nb_jours);

        // Chercher la ligne existante pour cette année
        const current = await query(
          'SELECT id, COALESCE(annual_total,22) as annual_total, COALESCE(annual_taken,0) as annual_taken FROM leave_balances WHERE employee_id=$1 AND year=$2',
          [emp.id, c.year]
        );

        if (current.rows.length) {
          // Ligne existante : le restant actuel devient le carried_over
          const existingTotal = parseFloat(current.rows[0].annual_total);
          const existingTaken = parseFloat(current.rows[0].annual_taken);
          const carriedOver   = Math.max(0, existingTotal - existingTaken);
          const annualTotal   = carriedOver + annualGranted;
          await query(
            'UPDATE leave_balances SET annual_total=$1, annual_carried_over=$2, annual_granted=$3, updated_at=NOW() WHERE employee_id=$4 AND year=$5',
            [annualTotal, carriedOver, annualGranted, emp.id, c.year]
          );
        } else {
          // Nouvelle ligne : chercher le restant de l'année précédente
          const prevYear = c.year - 1;
          const prev = await query(
            'SELECT COALESCE(annual_total,22) - COALESCE(annual_taken,0) AS annual_remaining FROM leave_balances WHERE employee_id=$1 AND year=$2',
            [emp.id, prevYear]
          );
          const carriedOver = parseFloat(prev.rows[0]?.annual_remaining ?? 0);
          const annualTotal = carriedOver + annualGranted;
          await query(
            'INSERT INTO leave_balances (employee_id, year, annual_total, annual_taken, annual_carried_over, annual_granted, sick_total, sick_taken, sick_granted, exceptional_total, exceptional_taken) VALUES ($1,$2,$3,0,$4,$5,15,0,15,0,0)',
            [emp.id, c.year, annualTotal, carriedOver, annualGranted]
          );
        }
      }
      await query(
        "UPDATE leave_versement_config SET status='executed', executed_at=NOW() WHERE id=$1",
        [c.id]
      );
      console.log('[cron-versement] Versement ' + c.nb_jours + 'j effectué pour ' + employees.rows.length + ' employés — ' + today);
    } catch (err) {
      console.error('[cron-versement] Erreur:', err.message);
    }
  });
  console.log('Scheduler versement congés démarré (06:00 Tunisie)');

  app.listen(PORT, HOST, () => console.log('✅ HR Manager API → http://' + HOST + ':' + PORT));
}
const { startCron } = require('./services/cron-recap');
startCron();
start();
