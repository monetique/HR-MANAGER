const nodemailer = require('nodemailer');
const { query }  = require('../db/postgres');
const fs         = require('fs');
const path       = require('path');

// ── Logo en base64 ────────────────────────────────────────
function getLogoBase64() {
  try {
    const logoPath = path.join(__dirname, '..', 'logo_smt.png');
    if (fs.existsSync(logoPath)) {
      return 'data:image/png;base64,' + fs.readFileSync(logoPath).toString('base64');
    }
  } catch (e) { /* silent */ }
  return null;
}

function logoHTML() {
  const b64 = getLogoBase64();
  if (!b64) return '';
  return `<img src="${b64}" alt="Monétique Tunisie" style="height:40px;max-width:160px;object-fit:contain;" />`;
}

// ── Créer le transporteur SMTP ────────────────────────────
async function getTransporter() {
  const result = await query("SELECT key, value FROM app_config WHERE key LIKE 'smtp_%'");
  const cfg = {};
  result.rows.forEach(r => cfg[r.key] = r.value);
  if (!cfg.smtp_host) throw new Error('SMTP non configuré');
  return nodemailer.createTransport({
    host:   cfg.smtp_host,
    port:   parseInt(cfg.smtp_port || '587'),
    secure: cfg.smtp_secure === 'true',
    auth: cfg.smtp_user ? { user: cfg.smtp_user, pass: cfg.smtp_password } : undefined,
    tls: { rejectUnauthorized: false },
  });
}

// ── Récap hebdomadaire ────────────────────────────────────
function generateRecapHTML(manager, employees, attendanceByEmp, weekLabel) {
  const fmtH   = h => h ? `${h}h` : '—';
  const fmtMin = m => m > 0 ? `${Math.floor(m/60)}h${String(m%60).padStart(2,'0')}` : '—';

  let rows = '';
  employees.forEach(emp => {
    const records = attendanceByEmp[emp.id] || [];
    const present  = records.filter(r => r.status === 'present').length;
    const absent   = records.filter(r => r.status === 'absent').length;
    const late     = records.filter(r => r.status === 'late').length;
    const onLeave  = records.filter(r => r.status === 'on_leave').length;
    const hours    = records.reduce((s,r) => s + parseFloat(r.worked_hours||0), 0).toFixed(2);
    const retMin   = records.reduce((s,r) => s + parseInt(r.delay_minutes||0), 0);
    rows += `<tr>
      <td style="text-align:left;padding:6px 8px;border:1px solid #e5e7eb">
        <strong>${emp.first_name} ${emp.last_name}</strong><br>
        <span style="color:#6b7280;font-size:11px">${emp.matricule}</span>
      </td>
      <td style="text-align:center;padding:6px;border:1px solid #e5e7eb;color:#16a34a">${present}</td>
      <td style="text-align:center;padding:6px;border:1px solid #e5e7eb;color:#dc2626">${absent}</td>
      <td style="text-align:center;padding:6px;border:1px solid #e5e7eb;color:#d97706">${late}</td>
      <td style="text-align:center;padding:6px;border:1px solid #e5e7eb;color:#2563eb">${onLeave}</td>
      <td style="text-align:center;padding:6px;border:1px solid #e5e7eb">${fmtH(hours)}</td>
      <td style="text-align:center;padding:6px;border:1px solid #e5e7eb;color:#d97706">${fmtMin(retMin)}</td>
    </tr>`;
  });

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;color:#1a1a1a;max-width:700px;margin:0 auto;padding:20px">
  <div style="background:#1e40af;color:white;padding:20px;border-radius:8px 8px 0 0;display:flex;justify-content:space-between;align-items:center">
    <div>
      <h1 style="margin:0;font-size:20px">HR Manager — Récapitulatif Hebdomadaire</h1>
      <p style="margin:4px 0 0;opacity:0.8;font-size:13px">${weekLabel}</p>
    </div>
    <div style="text-align:right">${logoHTML()}</div>
  </div>
  <div style="background:#f8fafc;padding:20px;border:1px solid #e5e7eb;border-top:none">
    <p style="margin:0 0 16px">Bonjour <strong>${manager.first_name} ${manager.last_name}</strong>,</p>
    <p style="margin:0 0 16px;color:#374151">Voici le récapitulatif de présence de votre équipe pour la semaine du ${weekLabel}.</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead>
        <tr style="background:#1e40af;color:white">
          <th style="text-align:left;padding:8px;border:1px solid #1e3a8a">Employé</th>
          <th style="padding:8px;border:1px solid #1e3a8a">Présents</th>
          <th style="padding:8px;border:1px solid #1e3a8a">Absents</th>
          <th style="padding:8px;border:1px solid #1e3a8a">Retards</th>
          <th style="padding:8px;border:1px solid #1e3a8a">Congés</th>
          <th style="padding:8px;border:1px solid #1e3a8a">Heures</th>
          <th style="padding:8px;border:1px solid #1e3a8a">Min.Retard</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin:20px 0 0;font-size:12px;color:#6b7280">Ce mail est généré automatiquement par HR Manager — Monétique Tunisie.</p>
  </div>
</body></html>`;
}

async function sendRecapToManager(manager, employees, attendanceByEmp, weekLabel, cfg) {
  const transporter = await getTransporter();
  const html = generateRecapHTML(manager, employees, attendanceByEmp, weekLabel);
  await transporter.sendMail({
    from:    `"${cfg.smtp_from_name || 'HR Manager'}" <${cfg.smtp_from}>`,
    to:      manager.email,
    subject: `${cfg.recap_subject || 'Récapitulatif hebdomadaire'} — ${weekLabel}`,
    html,
  });
}

// ── Template générique notification ──────────────────────
function generateNotifHTML(title, message, details, color) {
  const accentColor = color || '#1B9BBF';
  const rows = Object.entries(details).map(([k,v]) =>
    `<tr>
      <td style="padding:8px 16px;color:#6b7280;font-size:13px;border-bottom:1px solid #f3f4f6;width:35%">${k}</td>
      <td style="padding:8px 16px;font-size:13px;border-bottom:1px solid #f3f4f6;color:#1a1a1a"><strong>${v}</strong></td>
    </tr>`
  ).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:Arial,Helvetica,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:30px 0">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
        <tr>
          <td style="background:${accentColor};padding:20px 30px;border-radius:12px 12px 0 0">
            <table width="100%" cellpadding="0" cellspacing="0"><tr>
              <td><p style="margin:0;color:white;font-size:18px;font-weight:bold">${title}</p></td>
              <td align="right">${logoHTML()}</td>
            </tr></table>
          </td>
        </tr>
        <tr>
          <td style="background:white;padding:24px 30px">
            <p style="margin:0 0 20px;color:#374151;font-size:14px;line-height:1.6">${message}</p>
            <table width="100%" cellpadding="0" cellspacing="0"
              style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;font-size:13px">
              ${rows}
            </table>
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;padding:16px 30px;border-radius:0 0 12px 12px;border-top:1px solid #e5e7eb">
            <p style="margin:0;color:#9ca3af;font-size:11px">
              Ce mail est généré automatiquement par <strong>HR Manager</strong> — Monétique Tunisie.<br>
              Merci de ne pas répondre à cet email.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

async function sendLeaveNotification(to, subject, title, message, details, color) {
  try {
    const transporter = await getTransporter();
    const cfgResult = await query("SELECT key, value FROM app_config WHERE key LIKE 'smtp_%'");
    const cfg = {};
    cfgResult.rows.forEach(r => cfg[r.key] = r.value);
    const html = generateNotifHTML(title, message, details, color);
    console.log(`[MAIL] Envoi à: ${recipientEmail} | Sujet: ${subject}`);
    await transporter.sendMail({
      from: `"${cfg.smtp_from_name || 'HR Manager'}" <${cfg.smtp_from}>`,
      to, subject, html,
    });
  } catch(err) {
    console.error('Mail erreur:', err.message);
  }
}

async function sendTestMail(toEmail) {
  const transporter = await getTransporter();
  const result = await query("SELECT key, value FROM app_config WHERE key LIKE 'smtp_%'");
  const cfg = {};
  result.rows.forEach(r => cfg[r.key] = r.value);
  const html = generateNotifHTML(
    'Configuration SMTP correcte',
    'Cet email confirme que votre configuration SMTP fonctionne correctement.',
    { 'Serveur SMTP': cfg.smtp_host, 'Port': cfg.smtp_port, 'Expediteur': cfg.smtp_from },
    '#1B9BBF'
  );
  await transporter.sendMail({
    from:    `"${cfg.smtp_from_name || 'HR Manager'}" <${cfg.smtp_from}>`,
    to:      toEmail,
    subject: 'Test SMTP — HR Manager',
    html,
  });
}

// ── Notification statut demande RH ────────────────────────
async function sendHRStatusNotification(opts) {
  const {
    to, employeeName, requestType, newStatus,
    statusLabel, statusColor, comment, requestId, handledBy, isRH = false
  } = opts;

  const STATUS_COLORS = {
    pending:     '#f59e0b',
    in_progress: '#3b82f6',
    closed:      '#10b981',
    rejected:    '#ef4444'
  };

  const color = statusColor || STATUS_COLORS[newStatus] || '#6b7280';

  const statusConfig = {
    pending: {
      icon: '🟡',
      title: isRH ? 'Nouvelle demande RH reçue' : 'Votre demande a été soumise',
      subtitle: isRH
        ? `${employeeName} a soumis une nouvelle demande.`
        : 'Votre demande est en attente de traitement par le service RH.'
    },
    in_progress: {
      icon: '🔵',
      title: 'Demande prise en charge',
      subtitle: 'Votre demande est en cours de traitement par le service RH.'
    },
    closed: {
      icon: '✅',
      title: 'Demande clôturée',
      subtitle: 'Votre demande a été traitée et clôturée par le service RH.'
    },
    rejected: {
      icon: '❌',
      title: 'Demande rejetée',
      subtitle: 'Votre demande a été rejetée par le service RH.'
    }
  };

  const cfg = statusConfig[newStatus] || { icon: 'ℹ️', title: 'Mise à jour de votre demande', subtitle: '' };
  const subject = `${cfg.icon} ${cfg.title} — ${requestType}`;

  const STEPS = [
    { key: 'pending',     label: 'En cours' },
    { key: 'in_progress', label: 'Prise en charge' },
    { key: 'closed',      label: 'Clôturée' }
  ];
  const statusOrder = ['pending', 'in_progress', 'closed'];
  const currentIdx  = statusOrder.indexOf(newStatus);

  const timelineRows = STEPS.map((step, i) => {
    const isDone    = i < currentIdx;
    const isCurrent = i === currentIdx;
    const dotColor  = isCurrent ? color : isDone ? '#10b981' : '#d1d5db';
    const textColor = isCurrent ? color : isDone ? '#374151' : '#9ca3af';
    const connector = i < STEPS.length - 1
      ? `<tr><td style="padding:0 0 0 13px"><div style="width:2px;height:20px;background:${isDone ? '#10b981' : '#e5e7eb'};margin:2px 0"></div></td></tr>`
      : '';

    // Label : badge coloré si statut actuel, texte simple sinon
    const labelHTML = isCurrent
      ? `<span style="font-size:12px;font-weight:700;background:${color}22;color:${color};padding:2px 10px;border-radius:20px;border:1px solid ${color}44">${step.label}</span>`
      : `<span style="font-size:13px;color:${textColor}">${step.label}</span>`;

    return `<tr>
      <td style="padding:4px 0">
        <table cellpadding="0" cellspacing="0"><tr>
          <td style="width:30px;vertical-align:middle">
            <div style="width:24px;height:24px;border-radius:50%;background:${dotColor};text-align:center;line-height:24px;font-size:12px;color:white">
              ${isDone ? '✓' : isCurrent ? '●' : '○'}
            </div>
          </td>
          <td style="padding-left:10px">${labelHTML}</td>
        </tr></table>
      </td>
    </tr>${connector}`;
  }).join('');

  const detailsRows = `
    <tr>
      <td style="padding:8px 16px;color:#6b7280;font-size:13px;border-bottom:1px solid #f3f4f6;width:40%">Référence</td>
      <td style="padding:8px 16px;font-size:13px;border-bottom:1px solid #f3f4f6;color:#111827"><strong>#${String(requestId).padStart(5,'0')}</strong></td>
    </tr>
    <tr>
      <td style="padding:8px 16px;color:#6b7280;font-size:13px;border-bottom:1px solid #f3f4f6">Employé</td>
      <td style="padding:8px 16px;font-size:13px;border-bottom:1px solid #f3f4f6;color:#111827"><strong>${employeeName}</strong></td>
    </tr>
    <tr>
      <td style="padding:8px 16px;color:#6b7280;font-size:13px;border-bottom:1px solid #f3f4f6">Type de demande</td>
      <td style="padding:8px 16px;font-size:13px;border-bottom:1px solid #f3f4f6;color:#111827"><strong>${requestType}</strong></td>
    </tr>
    <tr>
      <td style="padding:8px 16px;color:#6b7280;font-size:13px;border-bottom:1px solid #f3f4f6">Statut actuel</td>
      <td style="padding:8px 16px;font-size:13px;border-bottom:1px solid #f3f4f6">
        <span style="background:${color}18;color:${color};font-size:12px;font-weight:600;padding:3px 10px;border-radius:20px;border:1px solid ${color}33">${statusLabel}</span>
      </td>
    </tr>
    ${handledBy ? `<tr>
      <td style="padding:8px 16px;color:#6b7280;font-size:13px;border-bottom:1px solid #f3f4f6">Traité par</td>
      <td style="padding:8px 16px;font-size:13px;border-bottom:1px solid #f3f4f6;color:#111827"><strong>${handledBy}</strong></td>
    </tr>` : ''}
    ${comment ? `<tr>
      <td style="padding:8px 16px;color:#6b7280;font-size:13px;vertical-align:top">Commentaire</td>
      <td style="padding:8px 16px;font-size:13px;color:#374151;font-style:italic">${comment}</td>
    </tr>` : ''}
  `;

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%);padding:28px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0"><tr>
              <td>
                <p style="margin:0 0 6px;font-size:22px;">${cfg.icon}</p>
                <h1 style="margin:0;color:#ffffff;font-size:18px;font-weight:700;">${cfg.title}</h1>
              </td>
              <td align="right" style="vertical-align:middle">${logoHTML()}</td>
            </tr></table>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px;">
            <p style="margin:0 0 16px;color:#374151;font-size:14px;">
              Bonjour <strong>${isRH ? 'Service RH' : employeeName}</strong>,
            </p>
            <p style="margin:0 0 24px;color:#6b7280;font-size:13px;line-height:1.6;">${cfg.subtitle}</p>
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:20px;">
              <table width="100%" cellpadding="0" cellspacing="0">${detailsRows}</table>
            </div>
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;margin-bottom:20px;">
              <p style="margin:0 0 14px;color:#374151;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Suivi de la demande</p>
              <table cellpadding="0" cellspacing="0">${timelineRows}</table>
            </div>
            <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;border-top:1px solid #f3f4f6;padding-top:16px;">
              Cet email a été envoyé automatiquement par HR Manager — Monétique Tunisie.<br>
              Merci de ne pas répondre à cet email.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;padding:14px 32px;border-top:1px solid #e5e7eb;text-align:center;">
            <p style="margin:0;color:#9ca3af;font-size:11px;">© ${new Date().getFullYear()} Monétique Tunisie — HR Manager</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  try {
    const transporter = await getTransporter();
    const cfgResult = await query("SELECT key, value FROM app_config WHERE key LIKE 'smtp_%'");
    const smtpCfg = {};
    cfgResult.rows.forEach(r => smtpCfg[r.key] = r.value);
    console.log(`[MAIL] Envoi à: ${to} | Sujet: ${subject}`);
    await transporter.sendMail({
      from: `"HR Manager - Monétique Tunisie" <${smtpCfg.smtp_from || smtpCfg.smtp_user}>`,
      to, subject, html
    });
  } catch (err) {
    console.error('[mail-service] sendHRStatusNotification error:', err.message);
  }
}

module.exports = {
  sendRecapToManager,
  sendTestMail,
  generateRecapHTML,
  sendLeaveNotification,
  sendHRStatusNotification,
};
