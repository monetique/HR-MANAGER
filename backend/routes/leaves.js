const express = require('express');
const { sendLeaveNotification } = require('../services/mail-service');
const { query } = require('../db/postgres');
const { requireAuth, requireRole, requireSameUnit } = require('../middleware/auth');
const router  = express.Router();


// Helper format date
function fmtDate(d) { return d ? String(d).split('T')[0] : ''; }

// Helper récupérer email employé
async function getEmail(id) {
  const r = await query('SELECT email, first_name, last_name FROM employees WHERE id=$1', [id]);
  return r.rows[0] || null;
}

// Helper récupérer email RH
async function getRHEmail() {
  const r = await query("SELECT email, first_name, last_name FROM employees WHERE role IN ('rh','superadmin') AND is_active=true ORDER BY role='rh' DESC LIMIT 1");
  return r.rows[0] || null;
}

// Calculer les jours ouvrables entre deux dates
async function countWorkDays(start, end) {
  const result = await query(`
    SELECT COUNT(*) as days FROM generate_series($1::date, $2::date, '1 day'::interval) d
    WHERE EXTRACT(DOW FROM d) NOT IN (0,6)
    AND d::date NOT IN (SELECT date FROM public_holidays WHERE date BETWEEN $1 AND $2)
  `, [start, end]);
  return parseFloat(result.rows[0].days);
}

// ─── Helper : contexte année par type de congé ───────────────────────────────
// Annuel  (0454) : versement 01/06 → N = année courante si après juin, sinon N = année-1
// Maladie (0550) : versement 01/01 → N = toujours l'année courante
function getYearContext() {
  const today = new Date();
  const year  = today.getFullYear();

  const isAfterJune1  = today >= new Date(`${year}-06-01`);
  // Toujours inclure l'année courante — le versement peut avoir été fait manuellement
  const yearN_annual  = year;
  const yearN1_annual = year - 1;
  const nextAnnual    = isAfterJune1 ? `${year + 1}-06-01` : `${year}-06-01`;

  const yearN_sick    = year;
  const yearN1_sick   = year - 1;
  const nextSick      = `${year + 1}-01-01`;

  return { yearN_annual, yearN1_annual, nextAnnual, yearN_sick, yearN1_sick, nextSick, isAfterJune1 };
}

// ─── Déduction solde annuel : N-1 d'abord, puis N ────────────────────────────
async function deductAnnualBalance(employeeId, days, startYear) {
  const ctx = getYearContext();

  // Récupérer soldes N-1 et N triés ASC (N-1 en premier)
  const rows = await query(`
    SELECT year,
      COALESCE(annual_total, 22) - COALESCE(annual_taken, 0) AS remaining
    FROM leave_balances
    WHERE employee_id = $1 AND year IN ($2, $3)
    ORDER BY year ASC
  `, [employeeId, ctx.yearN1_annual, ctx.yearN_annual]);

  let left = days;
  for (const row of rows.rows) {
    if (left <= 0) break;
    const toDeduct = Math.min(left, parseFloat(row.remaining));
    if (toDeduct <= 0) continue;
    await query(`
      UPDATE leave_balances
      SET annual_taken = annual_taken + $1, updated_at = NOW()
      WHERE employee_id = $2 AND year = $3
    `, [toDeduct, employeeId, row.year]);
    left -= toDeduct;
  }
  // Si toujours un restant (soldes N-1 et N inexistants), déduire sur startYear
  if (left > 0) {
    await query(`
      UPDATE leave_balances
      SET annual_taken = annual_taken + $1, updated_at = NOW()
      WHERE employee_id = $2 AND year = $3
    `, [left, employeeId, startYear]);
  }
}

// ─── Remboursement solde annuel lors d'annulation : N d'abord, puis N-1 ──────
async function refundAnnualBalance(employeeId, days, startYear) {
  const ctx = getYearContext();

  const rows = await query(`
    SELECT year, COALESCE(annual_taken, 0) AS taken
    FROM leave_balances
    WHERE employee_id = $1 AND year IN ($2, $3)
    ORDER BY year DESC
  `, [employeeId, ctx.yearN1_annual, ctx.yearN_annual]);

  let left = days;
  for (const row of rows.rows) {
    if (left <= 0) break;
    const toRefund = Math.min(left, parseFloat(row.taken));
    if (toRefund <= 0) continue;
    await query(`
      UPDATE leave_balances
      SET annual_taken = GREATEST(0, annual_taken - $1), updated_at = NOW()
      WHERE employee_id = $2 AND year = $3
    `, [toRefund, employeeId, row.year]);
    left -= toRefund;
  }
}


// ════════════════════════════════════════════════════════════════════════════
// ROUTES
// ════════════════════════════════════════════════════════════════════════════

// GET /api/leaves — liste des demandes
router.get('/', requireAuth, requireSameUnit, async (req, res) => {
  try {
    let sql = `
      SELECT lr.*, lt.name as leave_type_name, lt.code as leave_type_code, lt.color,
             e.first_name || ' ' || e.last_name as employee_name, e.manager_id as employee_manager_id,
             e.matricule
      FROM leave_requests lr
      JOIN leave_types lt ON lr.leave_type_id = lt.id
      JOIN employees e    ON lr.employee_id   = e.id
      WHERE 1=1`;
    const params = [];

    if (['employee','hr_assistant'].includes(req.user.role)) {
      sql += ` AND lr.employee_id = $${params.length + 1}`;
      params.push(req.user.id);
    } else if (req.user.role === 'manager' && req.subordinateIds) {
      sql += ` AND lr.employee_id = ANY($${params.length + 1})`;
      params.push(req.subordinateIds);
    }

    if (req.query.status)      { sql += ` AND lr.status = $${params.length + 1}`;      params.push(req.query.status); }
    if (req.query.employee_id) { sql += ` AND lr.employee_id = $${params.length + 1}`; params.push(req.query.employee_id); }
    if (req.query.year) {
      sql += ` AND EXTRACT(YEAR FROM lr.start_date) = $${params.length + 1}`;
      params.push(req.query.year);
    }

    sql += ' ORDER BY lr.start_date DESC, lr.created_at DESC';
    const result = await query(sql, params);
    res.json({ success: true, requests: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/leaves/balances-summary ────────────────────────────────────────
// Retourne soldes N-1 et N pour congé annuel (0454) et maladie (0550)
//
// Modèle réel : 1 seule ligne par employé/année dans leave_balances
//   annual_carried_over = jours reportés de l'année précédente (= solde N-1 initial)
//   annual_granted      = jours versés cette année (22j)
//   annual_total        = carried_over + granted
//   annual_taken        = jours consommés (N-1 d'abord, puis N)
//
// Affichage :
//   N-1 : carried_over initial vs carried_over restant (= ce qui n'a pas encore été consommé du report)
//   N   : granted (22j) vs ce qui reste après déduction sur N
router.get('/balances-summary', requireAuth, async (req, res) => {
  try {
    const empId = parseInt(req.query.employee_id) || req.user.id;

    if (req.user.role === 'employee' && empId !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Accès refusé' });
    }

    // Récupérer la ligne la plus récente en base pour cet employé
    const result = await query(`
      SELECT
        year,
        COALESCE(annual_total, 22)           AS annual_total,
        COALESCE(annual_taken, 0)            AS annual_taken,
        COALESCE(annual_carried_over, 0)     AS annual_carried_over,
        COALESCE(annual_granted, 22)         AS annual_granted,
        COALESCE(sick_total, 15)             AS sick_total,
        COALESCE(sick_taken, 0)             AS sick_taken,
        COALESCE(sick_granted, sick_total, 15) AS sick_granted
      FROM leave_balances
      WHERE employee_id = $1
      ORDER BY year DESC LIMIT 1
    `, [empId]);

    const today       = new Date();
    const currentYear = today.getFullYear();
    const isAfterJune1 = today >= new Date(`${currentYear}-06-01`);
    const nextAnnual  = isAfterJune1 ? `${currentYear + 1}-06-01` : `${currentYear}-06-01`;
    const nextSick    = `${currentYear + 1}-01-01`;

    if (!result.rows.length) {
      return res.json({
        success: true,
        annual: { year_n: currentYear, year_n1: currentYear - 1, next_grant_date: nextAnnual, active_on: 'n', n1: null, n: null },
        sick:   { year_n: currentYear, year_n1: currentYear - 1, next_grant_date: nextSick,   active_on: 'n', n1: null, n: null }
      });
    }

    const row = result.rows[0];
    const yearN  = row.year;
    const yearN1 = yearN - 1;

    const carriedOver  = parseFloat(row.annual_carried_over);
    const grantedRaw   = parseFloat(row.annual_granted);
    const annualTotal  = parseFloat(row.annual_total);  // solde réel (peut différer de granted)
    const grantDate    = new Date(row.year + '-06-01');
    const granted      = grantedRaw;
    const totalTaken   = parseFloat(row.annual_taken);

    // Répartition de la consommation : N-1 d'abord, puis N
    const n1Taken      = Math.min(totalTaken, carriedOver);   // consommé sur N-1
    const nTaken       = Math.max(0, totalTaken - n1Taken);   // consommé sur N

    const n1Remaining  = carriedOver - n1Taken;               // restant N-1
    // Utiliser annual_total réel si inférieur à granted (cas employés avec solde réduit)
    const effectiveTotal = Math.min(annualTotal, granted + carriedOver);
    const nRemaining   = Math.max(0, effectiveTotal - carriedOver - nTaken);  // restant N

    // N-1 actif si encore du solde reporté non consommé
    const annualN1Active = n1Remaining > 0;

    // Objet N-1 : affiche le solde global disponible (carried_over + granted - totalTaken)
    const globalTotal     = carriedOver + grantedRaw;
    const globalRemaining = Math.max(0, globalTotal - totalTaken);
    const annualN1 = carriedOver > 0 ? {
      year:                yearN1,
      annual_total:        globalTotal,
      annual_taken:        totalTaken,
      annual_remaining:    globalRemaining,
      annual_carried_over: carriedOver,
      annual_granted:      carriedOver,
    } : null;

    // Objet N (versement de l'année)
    const annualN = {
      year:                yearN,
      annual_total:        grantedRaw,
      annual_taken:        nTaken,
      annual_remaining:    nRemaining,
      annual_carried_over: carriedOver,
      annual_granted:      granted,
      grant_date:          row.year + '-06-01',
      grant_pending:       today < grantDate,
      // Solde réel si différent du granted (ex: nouvel employé avec moins de 22j)
      real_total:          annualTotal,
    };

    // Maladie : toujours sur N, pas de report
    const sickN = {
      year:          yearN,
      sick_total:    parseFloat(row.sick_total),
      sick_taken:    parseFloat(row.sick_taken),
      sick_remaining: parseFloat(row.sick_total) - parseFloat(row.sick_taken),
      sick_granted:  parseFloat(row.sick_granted),
    };

    res.json({
      success: true,
      annual: {
        year_n:          yearN,
        year_n1:         yearN1,
        next_grant_date: nextAnnual,
        active_on:       annualN1Active ? 'n1' : 'n',
        n1: annualN1,
        n:  annualN
      },
      sick: {
        year_n:          yearN,
        year_n1:         yearN1,
        next_grant_date: nextSick,
        active_on:       'n',
        n1: null,
        n:  sickN
      }
    });
  } catch (err) {
    console.error('[balances-summary]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/leaves — créer une demande
router.post('/', requireAuth, async (req, res) => {
  const { leave_type_id, start_date, end_date, reason, certificate_path, exit_period, exit_time, return_time, half_day, half_day_period } = req.body;
  try {
    let days;
    if (half_day) {
      // Vérifier que le jour est ouvrable
      const workCheck = await countWorkDays(start_date, start_date);
      if (workCheck <= 0) return res.status(400).json({ success: false, error: 'Ce jour n est pas ouvrable' });
      days = 0.5;
    } else {
      days = await countWorkDays(start_date, end_date);
      if (days <= 0) return res.status(400).json({ success: false, error: 'Aucun jour ouvrable dans cette periode' });
    }

    // Vérifier solde disponible
    const year = new Date(start_date).getFullYear();
    const lt   = await query('SELECT * FROM leave_types WHERE id=$1', [leave_type_id]);
    if (!lt.rows.length) return res.status(404).json({ success: false, error: 'Type de conge introuvable' });

    // Validation autorisation de sortie (code 0480)
    if (lt.rows[0].code === '0480') {
      if (!exit_period || !exit_time || !return_time) {
        return res.status(400).json({ success: false, error: 'Periode, heure de sortie et heure de retour obligatoires' });
      }
      const [exitH, exitM] = exit_time.split(':').map(Number);
      const [returnH, returnM] = return_time.split(':').map(Number);
      const diffMinutes = (returnH * 60 + returnM) - (exitH * 60 + exitM);
      if (diffMinutes > 120) {
        return res.status(400).json({ success: false, error: 'L autorisation de sortie ne peut pas depasser 2 heures' });
      }
      if (diffMinutes <= 0) {
        return res.status(400).json({ success: false, error: 'L heure de retour doit etre apres l heure de sortie' });
      }
    }

    // Vérifier solde si congé à solde (annuel ou maladie)
    if (lt.rows[0].has_balance) {
      const ctx = getYearContext();
      const code = lt.rows[0].code;

      if (code === '0454') {
        // Annuel : total disponible = N-1 restant + N restant
        const balRes = await query(`
          SELECT COALESCE(SUM(annual_total - annual_taken), 0) AS total_remaining
          FROM leave_balances
          WHERE employee_id = $1 AND year IN ($2, $3)
        `, [req.user.id, ctx.yearN1_annual, ctx.yearN_annual]);
        const available = parseFloat(balRes.rows[0].total_remaining);
        if (available < days) {
          return res.status(400).json({ success: false, error: `Solde annuel insuffisant. Disponible : ${available}j, Demandé : ${days}j` });
        }
      } else if (code === '0550') {
        // Maladie : uniquement sur N
        const balRes = await query(`
          SELECT COALESCE(sick_total - sick_taken, 0) AS remaining
          FROM leave_balances WHERE employee_id = $1 AND year = $2
        `, [req.user.id, ctx.yearN_sick]);
        const available = parseFloat(balRes.rows[0]?.remaining ?? 15);
        if (available < days) {
          return res.status(400).json({ success: false, error: `Solde maladie insuffisant. Disponible : ${available}j, Demandé : ${days}j` });
        }
      }
    }

    // Vérifier chevauchement
    const overlap = await query(`
      SELECT id FROM leave_requests
      WHERE employee_id=$1 AND status NOT IN ('rejected','cancelled')
      AND (start_date, end_date) OVERLAPS ($2::date, $3::date)`,
      [req.user.id, start_date, end_date]
    );
    if (overlap.rows.length) return res.status(400).json({ success: false, error: 'Chevauchement avec une demande existante' });

    // Nombre d'étapes de validation
    const cfg = await query("SELECT value FROM app_config WHERE key='validation_steps'");
    const isSickLeave = lt.rows[0]?.code === '0550';
    const steps = isSickLeave ? 1 : parseInt(cfg.rows[0]?.value || '2');

    const result = await query(`
      INSERT INTO leave_requests (employee_id, leave_type_id, start_date, end_date, days_count, reason, total_steps, document_path, exit_period, exit_time, return_time, half_day, half_day_period)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [req.user.id, leave_type_id, start_date, end_date, days, reason, steps, certificate_path || null, exit_period || null, exit_time || null, return_time || null, half_day ? true : false, half_day ? (half_day_period || 'matin') : null]
    );

    // Notification au manager
    if (req.user.manager_id) {
      await query(`
        INSERT INTO notifications (employee_id, title, message, type, link)
        VALUES ($1, $2, $3, 'info', $4)`,
        [req.user.manager_id,
         'Nouvelle demande de congé',
         `${req.user.first_name} ${req.user.last_name} a soumis une demande de congé`,
         `/leaves/${result.rows[0].id}`]
      );
    }

    // ── Envoi mails soumission ──────────────────────────────
    const details = {
      'Type': lt.rows[0]?.name || '',
      'Periode': fmtDate(start_date) + ' au ' + fmtDate(end_date),
      'Jours': days + ' jour(s)',
      'Motif': reason || '—'
    };

    sendLeaveNotification(
      req.user.email,
      'Confirmation de votre demande de conge',
      'Demande de conge soumise',
      'Votre demande de conge a bien ete enregistree et est en attente de validation.',
      details, '#1e40af'
    );

    if (isSickLeave) {
      const rh = await getRHEmail();
      if (rh) sendLeaveNotification(
        rh.email,
        'Nouvelle demande de conge maladie - ' + req.user.first_name + ' ' + req.user.last_name,
        'Action requise — Conge maladie',
        'Une demande de conge maladie necessite votre validation.',
        { ...details, 'Demandeur': req.user.first_name + ' ' + req.user.last_name, 'Matricule': req.user.matricule },
        '#dc2626'
      );
    } else if (req.user.manager_id) {
      const manager = await getEmail(req.user.manager_id);
      if (manager) sendLeaveNotification(
        manager.email,
        'Nouvelle demande de conge - ' + req.user.first_name + ' ' + req.user.last_name,
        'Action requise — Demande de conge',
        'Une demande de conge necessite votre validation.',
        { ...details, 'Demandeur': req.user.first_name + ' ' + req.user.last_name, 'Matricule': req.user.matricule },
        '#1B9BBF'
      );
    }

    if (isSickLeave && req.user.manager_id) {
      await query(`
        INSERT INTO notifications (employee_id, title, message, type)
        VALUES ($1, $2, $3, 'info')
      `, [
        req.user.manager_id,
        'Congé maladie — ' + req.user.first_name + ' ' + req.user.last_name,
        req.user.first_name + ' ' + req.user.last_name + ' est en congé maladie du ' + start_date + ' au ' + end_date + '.'
      ]).catch(() => {});
    }

    res.status(201).json({ success: true, request: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/leaves/:id/validate — valider ou rejeter
router.put('/:id/validate', requireAuth, requireRole('superadmin', 'rh', 'manager'), requireSameUnit, async (req, res) => {
  const { action, comment } = req.body;
  try {
    const req_result = await query('SELECT * FROM leave_requests WHERE id=$1', [req.params.id]);
    if (!req_result.rows.length) return res.status(404).json({ success: false, error: 'Demande introuvable' });
    const leave = req_result.rows[0];

    if (leave.status !== 'pending') return res.status(400).json({ success: false, error: 'Demande déjà traitée' });

    const ltResult = await query('SELECT code FROM leave_types WHERE id=$1', [leave.leave_type_id]);
    const leaveCode = ltResult.rows[0]?.code;

    if (leaveCode === '0550' && req.user.role === 'manager') {
      return res.status(403).json({ success: false, error: 'Le congé maladie est validé uniquement par le RH' });
    }

    if (req.user.role === 'manager') {
      const empResult = await query('SELECT manager_id FROM employees WHERE id=$1', [leave.employee_id]);
      const directManagerId = empResult.rows[0]?.manager_id;
      if (directManagerId !== req.user.id) {
        return res.status(403).json({ success: false, error: 'Manager direct requis de cet employé' });
      }
    }

    await query(`
      INSERT INTO leave_validations (request_id, validator_id, step_order, action, comment)
      VALUES ($1,$2,$3,$4,$5)`,
      [leave.id, req.user.id, leave.current_step, action, comment]
    );

    let newStatus = 'pending';
    let newStep   = leave.current_step + 1;

    if (action === 'rejected') {
      newStatus = 'rejected';
    } else if (leave.current_step >= leave.total_steps) {
      newStatus = 'approved';
      const year = new Date(leave.start_date).getFullYear();

      if (leaveCode === '0454') {
        // ── Annuel : déduction N-1 d'abord, puis N ──
        await deductAnnualBalance(leave.employee_id, leave.days_count, year);
      } else if (leaveCode === '0550') {
        // ── Maladie : déduction sur N uniquement ──
        const ctx = getYearContext();
        await query(`
          UPDATE leave_balances SET sick_taken = sick_taken + $1, updated_at = NOW()
          WHERE employee_id = $2 AND year = $3
        `, [leave.days_count, leave.employee_id, ctx.yearN_sick]);
      } else if (leaveCode === 'exceptional') {
        await query(`
          UPDATE leave_balances SET exceptional_taken = exceptional_taken + $1, updated_at = NOW()
          WHERE employee_id = $2 AND year = $3
        `, [leave.days_count, leave.employee_id, year]);
      }
    }

    await query(`
      UPDATE leave_requests SET status=$1, current_step=$2, updated_at=NOW() WHERE id=$3`,
      [newStatus, newStep, leave.id]
    );

    // ── Envoi mails ─────────────────────────────────────────
    const leaveDetails = {
      'Type': leaveCode || '',
      'Periode': fmtDate(leave.start_date) + ' au ' + fmtDate(leave.end_date),
      'Jours': leave.days_count + ' jour(s)',
      'Valideur': req.user.first_name + ' ' + req.user.last_name
    };
    if (comment) leaveDetails['Commentaire'] = comment;

    const demandeur = await getEmail(leave.employee_id);
    if (demandeur) {
      sendLeaveNotification(
        demandeur.email,
        action === 'approved' ? 'Votre conge a ete approuve' : 'Votre conge a ete rejete',
        action === 'approved' ? 'Conge approuve' : 'Conge rejete',
        action === 'approved'
          ? 'Votre demande de conge a ete approuvee.'
          : 'Votre demande de conge a ete rejetee.' + (comment ? ' Motif: ' + comment : ''),
        leaveDetails,
        action === 'approved' ? '#16a34a' : '#dc2626'
      );
    }

    if (action === 'approved' && newStatus === 'pending') {
      // Notifier RH pour validation finale
      const rh = await getRHEmail();
      if (rh) {
        const empInfo = await getEmail(leave.employee_id);
        sendLeaveNotification(
          rh.email,
          'Conge en attente de votre validation - ' + (empInfo ? empInfo.first_name + ' ' + empInfo.last_name : ''),
          'Action requise — Validation finale',
          'Une demande de conge a ete approuvee par le manager et necessite votre validation finale.',
          { ...leaveDetails, 'Demandeur': empInfo ? empInfo.first_name + ' ' + empInfo.last_name : '' },
          '#1B9BBF'
        );
      }
    }

    // Notifier manager du résultat final (approved/rejected par RH)
    if (newStatus === 'approved' || newStatus === 'rejected') {
      const emp = await getEmail(leave.employee_id);
      if (emp) {
        const managerInfo = emp.manager_id ? await getEmail(emp.manager_id) : null;
        if (managerInfo) {
          sendLeaveNotification(
            managerInfo.email,
            action === 'approved'
              ? 'Congé approuvé — ' + (demandeur ? demandeur.first_name + ' ' + demandeur.last_name : '')
              : 'Congé rejeté — ' + (demandeur ? demandeur.first_name + ' ' + demandeur.last_name : ''),
            action === 'approved' ? 'Congé approuvé par le RH' : 'Congé rejeté par le RH',
            action === 'approved'
              ? 'La demande de congé de votre collaborateur a été approuvée par le service RH.'
              : 'La demande de congé de votre collaborateur a été rejetée par le service RH.' + (comment ? ' Motif: ' + comment : ''),
            leaveDetails,
            action === 'approved' ? '#16a34a' : '#dc2626'
          );
        }
      }
    }

    await query(`
      INSERT INTO notifications (employee_id, title, message, type, link)
      VALUES ($1,$2,$3,$4,$5)`,
      [leave.employee_id,
       action === 'approved' ? 'Demande de congé approuvée' : 'Demande de congé rejetée',
       action === 'approved' ? `Votre demande du ${leave.start_date} au ${leave.end_date} a été approuvée` : `Votre demande a été rejetée${comment ? ': ' + comment : ''}`,
       action === 'approved' ? 'success' : 'error',
       `/leaves/${leave.id}`]
    );

    res.json({ success: true, status: newStatus });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/leaves/:id/cancel
router.put('/:id/cancel', requireAuth, async (req, res) => {
  const { cancel_reason } = req.body;
  try {
    let result;
    if (['superadmin', 'rh'].includes(req.user.role)) {
      result = await query('SELECT * FROM leave_requests WHERE id=$1', [req.params.id]);
    } else {
      result = await query('SELECT * FROM leave_requests WHERE id=$1 AND employee_id=$2', [req.params.id, req.user.id]);
    }

    if (!result.rows.length) return res.status(404).json({ success: false, error: 'Demande introuvable' });

    const leave = result.rows[0];
    const today = new Date().toISOString().split('T')[0];

    if (leave.start_date <= today && leave.status === 'approved') {
      return res.status(400).json({ success: false, error: 'Conge deja commence' });
    }
    if (leave.status === 'cancelled' || leave.status === 'rejected') {
      return res.status(400).json({ success: false, error: 'Demande deja annulee ou rejetee' });
    }

    await query(`
      UPDATE leave_requests SET
        status='cancelled', cancelled_by=$1, cancelled_at=NOW(), cancel_reason=$2, updated_at=NOW()
      WHERE id=$3`,
      [req.user.id, cancel_reason || null, req.params.id]
    );

    // Remboursement si demande était approuvée
    if (leave.status === 'approved') {
      const year = new Date(leave.start_date).getFullYear();
      const ltResult = await query('SELECT code FROM leave_types WHERE id=$1', [leave.leave_type_id]);
      const code = ltResult.rows[0]?.code;

      if (code === '0454') {
        // ── Annuel : remboursement N d'abord, puis N-1 ──
        await refundAnnualBalance(leave.employee_id, leave.days_count, year);
      } else if (code === '0550') {
        const ctx = getYearContext();
        await query(`
          UPDATE leave_balances SET sick_taken = GREATEST(0, sick_taken - $1), updated_at = NOW()
          WHERE employee_id = $2 AND year = $3
        `, [leave.days_count, leave.employee_id, ctx.yearN_sick]);
      }
    }

    if (['superadmin', 'rh'].includes(req.user.role) && leave.employee_id !== req.user.id) {
      await query(`
        INSERT INTO notifications (employee_id, title, message, type)
        VALUES ($1, $2, $3, 'warning')`,
        [
          leave.employee_id,
          'Conge annule',
          'Votre demande de conge du ' + leave.start_date + ' au ' + leave.end_date + ' a ete annulee par ' + req.user.first_name + ' ' + req.user.last_name + (cancel_reason ? ' - Motif: ' + cancel_reason : '') + '.'
        ]
      ).catch(() => {});
    }

    // Mail à l'employé si annulation par RH/admin
    if (['superadmin', 'rh'].includes(req.user.role) && leave.employee_id !== req.user.id) {
      const empInfo = await getEmail(leave.employee_id);
      if (empInfo) {
        sendLeaveNotification(
          empInfo.email,
          'Votre congé a été annulé',
          'Congé annulé',
          'Votre demande de congé a été annulée par ' + req.user.first_name + ' ' + req.user.last_name + (cancel_reason ? '. Motif: ' + cancel_reason : '.'),
          {
            'Période': leave.start_date + ' au ' + leave.end_date,
            'Annulé par': req.user.first_name + ' ' + req.user.last_name,
            ...(cancel_reason ? { 'Motif': cancel_reason } : {})
          },
          '#dc2626'
        );
      }
    }

    // Mail au RH si annulation par l'employé lui-même
    if (!['superadmin', 'rh'].includes(req.user.role)) {
      const rh = await getRHEmail();
      const empInfo = await getEmail(leave.employee_id);
      if (rh) {
        sendLeaveNotification(
          rh.email,
          'Congé annulé par ' + (empInfo ? empInfo.first_name + ' ' + empInfo.last_name : 'un employé'),
          'Annulation de congé',
          'Un employé a annulé sa demande de congé.',
          {
            'Employé': empInfo ? empInfo.first_name + ' ' + empInfo.last_name : '',
            'Période': leave.start_date + ' au ' + leave.end_date,
            ...(cancel_reason ? { 'Motif': cancel_reason } : {})
          },
          '#f59e0b'
        );
      }
    }

    // Mail au manager dans tous les cas
    const empForManager = await getEmail(leave.employee_id);
    if (empForManager?.manager_id) {
      const managerInfo = await getEmail(empForManager.manager_id);
      if (managerInfo && managerInfo.email !== req.user.email) {
        sendLeaveNotification(
          managerInfo.email,
          'Congé annulé — ' + (empForManager ? empForManager.first_name + ' ' + empForManager.last_name : ''),
          'Annulation de congé',
          'La demande de congé de votre collaborateur a été annulée.',
          {
            'Employé': empForManager ? empForManager.first_name + ' ' + empForManager.last_name : '',
            'Période': leave.start_date + ' au ' + leave.end_date,
            'Annulé par': req.user.first_name + ' ' + req.user.last_name,
            ...(cancel_reason ? { 'Motif': cancel_reason } : {})
          },
          '#f59e0b'
        );
      }
    }

    res.json({ success: true, message: 'Demande annulee' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/leaves/balances/:employee_id
router.get('/balances/:employee_id', requireAuth, async (req, res) => {
  try {
    const year = req.query.year || new Date().getFullYear();
    const result = await query(
      'SELECT * FROM leave_balances WHERE employee_id=$1 AND year=$2',
      [req.params.employee_id, year]
    );
    res.json({ success: true, balances: result.rows[0] || null });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/leaves/calendar
router.get('/calendar', requireAuth, async (req, res) => {
  try {
    const { start, end } = req.query;
    const result = await query(`
      SELECT lr.start_date, lr.end_date, lr.status, lt.name as type, lt.color,
             e.first_name || ' ' || e.last_name as employee_name
      FROM leave_requests lr
      JOIN leave_types lt ON lr.leave_type_id = lt.id
      JOIN employees e    ON lr.employee_id   = e.id
      WHERE lr.status = 'approved'
      AND lr.start_date <= $2 AND lr.end_date >= $1
      ORDER BY lr.start_date`,
      [start, end]
    );
    res.json({ success: true, events: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/leaves/stats
router.get('/stats', requireAuth, requireRole('superadmin', 'rh', 'manager', 'hr_assistant'), async (req, res) => {
  const { year, date_from, date_to, employee_id, leave_type_id } = req.query;
  const currentYear = year || new Date().getFullYear();
  const conditions = [];
  const params = [];

  // Restriction manager : uniquement ses subordonnés
  if (req.user.role === 'manager') {
    const subResult = await query(`
      WITH RECURSIVE subordinates AS (
        SELECT id FROM employees WHERE manager_id = $1
        UNION ALL
        SELECT e.id FROM employees e
        INNER JOIN subordinates s ON e.manager_id = s.id
      ) SELECT id FROM subordinates`, [req.user.id]);
    const ids = subResult.rows.map(r => r.id);
    if (!ids.length) return res.json({ success: true, kpis: {}, by_type: [], top_employees: [], monthly: [], details: [] });
    params.push(ids);
    conditions.push(`lr.employee_id = ANY($${params.length}::int[])`);
  }


  if (date_from && date_to) {
    params.push(date_from); conditions.push(`lr.start_date >= $${params.length}::date`);
    params.push(date_to);   conditions.push(`lr.end_date <= $${params.length}::date`);
  } else {
    params.push(currentYear);
    conditions.push(`EXTRACT(YEAR FROM lr.start_date) = $${params.length}`);
  }
  if (employee_id)   { params.push(employee_id);   conditions.push(`lr.employee_id = $${params.length}`); }
  if (leave_type_id) { params.push(leave_type_id); conditions.push(`lr.leave_type_id = $${params.length}`); }

  const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  try {
    const kpis = await query(`
      SELECT
        COUNT(DISTINCT lr.employee_id) as nb_employes,
        COUNT(lr.id) as total_demandes,
        COUNT(lr.id) FILTER (WHERE lr.status='approved') as total_approuvees,
        COUNT(lr.id) FILTER (WHERE lr.status='pending') as total_en_attente,
        COUNT(lr.id) FILTER (WHERE lr.status='rejected') as total_rejetees,
        ROUND(AVG(lr.days_count) FILTER (WHERE lr.status='approved')::numeric, 1) as moy_duree,
        SUM(lr.days_count) FILTER (WHERE lr.status='approved') as total_jours
      FROM leave_requests lr ${whereClause}
    `, params);

    const byType = await query(`
      SELECT lt.name as type_conge, lt.color, lt.code,
        COUNT(lr.id) as nb_demandes,
        SUM(lr.days_count) FILTER (WHERE lr.status='approved') as total_jours,
        COUNT(DISTINCT lr.employee_id) as nb_employes
      FROM leave_requests lr
      JOIN leave_types lt ON lr.leave_type_id = lt.id
      ${whereClause}
      GROUP BY lt.name, lt.color, lt.code
      ORDER BY total_jours DESC NULLS LAST
    `, params);

    const topEmployees = await query(`
      SELECT e.matricule, e.first_name || ' ' || e.last_name as nom, ou.name as unite,
        COUNT(lr.id) as nb_demandes,
        SUM(lr.days_count) FILTER (WHERE lr.status='approved' AND lt.code IN ('0454','0455')) as total_jours,
        COUNT(lr.id) FILTER (WHERE lt.code='0550') as nb_maladie
      FROM leave_requests lr
      JOIN employees e ON lr.employee_id = e.id
      JOIN leave_types lt ON lr.leave_type_id = lt.id
      LEFT JOIN org_units ou ON e.org_unit_id = ou.id
      ${whereClause}
      AND e.is_active = true
      AND lr.status = 'approved' AND lt.code IN ('0454','0455','0550')
      GROUP BY e.matricule, e.first_name, e.last_name, ou.name
      ORDER BY total_jours DESC NULLS LAST LIMIT 10
    `, params);

    const monthly = await query(`
      SELECT TO_CHAR(lr.start_date, 'YYYY-MM') as mois,
        COUNT(lr.id) as nb_demandes, SUM(lr.days_count) as total_jours,
        COUNT(lr.id) FILTER (WHERE lt.code='0550') as nb_maladie,
        COUNT(lr.id) FILTER (WHERE lt.code IN ('0454','0455')) as nb_annuel
      FROM leave_requests lr
      JOIN leave_types lt ON lr.leave_type_id = lt.id
      ${whereClause} AND lr.status = 'approved'
      GROUP BY TO_CHAR(lr.start_date, 'YYYY-MM') ORDER BY mois
    `, params);

    const details = await query(`
      SELECT e.matricule, e.first_name || ' ' || e.last_name as nom, ou.name as unite,
        lt.name as type_conge, lt.code, lr.start_date, lr.end_date, lr.days_count,
        lr.status, lr.reason, lr.created_at
      FROM leave_requests lr
      JOIN employees e ON lr.employee_id = e.id
      JOIN leave_types lt ON lr.leave_type_id = lt.id
      LEFT JOIN org_units ou ON e.org_unit_id = ou.id
      ${whereClause}
      AND e.role != 'superadmin'
      AND e.matricule NOT LIKE 'ADM%'
      ORDER BY e.matricule ASC, lr.start_date DESC LIMIT 500
    `, params);

    res.json({
      success: true,
      kpis: kpis.rows[0], by_type: byType.rows, top_employees: topEmployees.rows,
      monthly: monthly.rows, details: details.rows,
      filters: { year: currentYear, date_from, date_to, employee_id, leave_type_id }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/leaves/versement-config
router.get('/versement-config', requireAuth, requireRole('superadmin', 'rh'), async (req, res) => {
  try {
    const result = await query(`
      SELECT vc.*, e.first_name || ' ' || e.last_name as executed_by_name
      FROM leave_versement_config vc
      LEFT JOIN employees e ON vc.executed_by = e.id
      ORDER BY vc.year DESC
    `);
    res.json({ success: true, configs: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/leaves/versement-config
router.post('/versement-config', requireAuth, requireRole('superadmin', 'rh'), async (req, res) => {
  const { year, versement_date, nb_jours, note } = req.body;
  try {
    const result = await query(`
      INSERT INTO leave_versement_config (year, versement_date, nb_jours, note)
      VALUES ($1, $2, $3, $4) RETURNING *
    `, [year, versement_date, nb_jours || 22, note]);
    res.json({ success: true, config: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/leaves/versement-config/:id
router.put('/versement-config/:id', requireAuth, requireRole('superadmin', 'rh'), async (req, res) => {
  const { versement_date, nb_jours, note } = req.body;
  try {
    const result = await query(`
      UPDATE leave_versement_config SET versement_date=$1, nb_jours=$2, note=$3
      WHERE id=$4 AND status='pending' RETURNING *
    `, [versement_date, nb_jours, note, req.params.id]);
    res.json({ success: true, config: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/leaves/versement-config/:id/execute
router.post('/versement-config/:id/execute', requireAuth, requireRole('superadmin', 'rh'), async (req, res) => {
  try {
    const cfg = await query('SELECT * FROM leave_versement_config WHERE id=$1', [req.params.id]);
    if (!cfg.rows.length) return res.status(404).json({ success: false, error: 'Config introuvable' });
    const c = cfg.rows[0];
    if (c.status === 'executed') return res.status(400).json({ success: false, error: 'Versement déjà effectué' });

    const employees = await query("SELECT id FROM employees WHERE is_active=true AND role != 'superadmin'");
    let updated = 0;

    for (const emp of employees.rows) {
      // Récupérer le restant annuel N-1 pour le report
      const prevYear = c.year - 1;
      const prev = await query(`
        SELECT COALESCE(annual_total, 22) - COALESCE(annual_taken, 0) AS annual_remaining
        FROM leave_balances WHERE employee_id=$1 AND year=$2
      `, [emp.id, prevYear]);
      const carriedOver   = parseFloat(prev.rows[0]?.annual_remaining ?? 0);
      const annualGranted = c.nb_jours;
      const annualTotal   = carriedOver + annualGranted;

      const current = await query(
        'SELECT id FROM leave_balances WHERE employee_id=$1 AND year=$2',
        [emp.id, c.year]
      );

      if (current.rows.length) {
        await query(`
          UPDATE leave_balances
          SET annual_total        = $1,
              annual_carried_over = $2,
              annual_granted      = $3,
              updated_at          = NOW()
          WHERE employee_id=$4 AND year=$5
        `, [annualTotal, carriedOver, annualGranted, emp.id, c.year]);
      } else {
        await query(`
          INSERT INTO leave_balances
            (employee_id, year, annual_total, annual_taken, annual_carried_over, annual_granted,
             sick_total, sick_taken, sick_granted, exceptional_total, exceptional_taken)
          VALUES ($1, $2, $3, 0, $4, $5, 15, 0, 15, 0, 0)
        `, [emp.id, c.year, annualTotal, carriedOver, annualGranted]);
      }
      updated++;
    }

    await query(`
      UPDATE leave_versement_config SET status='executed', executed_at=NOW(), executed_by=$1
      WHERE id=$2
    `, [req.user.id, req.params.id]);

    res.json({ success: true, updated, message: `Versement de ${c.nb_jours}j effectué pour ${updated} employés (avec report N-1)` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/leaves/team-balances
router.get('/team-balances', requireAuth, async (req, res) => {
  const year = req.query.year || new Date().getFullYear();
  try {
    let empCondition = '';
    const params = [year];
    if (req.user.role === 'manager') {
      const subResult = await query(`
        WITH RECURSIVE subordinates AS (
          SELECT id FROM employees WHERE manager_id = $1
          UNION ALL
          SELECT e.id FROM employees e
          INNER JOIN subordinates s ON e.manager_id = s.id
        ) SELECT id FROM subordinates`, [req.user.id]);
      const ids = subResult.rows.map(r => r.id);
      if (!ids.length) return res.json({ success: true, balances: [] });
      params.push(ids);
      empCondition = `AND e.id = ANY($${params.length})`;
    }
    const result = await query(`
      SELECT e.id, e.matricule, e.first_name, e.last_name, ou.name as unit_name,
             lb.id as balance_id,
             COALESCE(lb.annual_total, 22)         as annual_total,
             COALESCE(lb.annual_taken, 0)          as annual_taken,
             COALESCE(lb.annual_carried_over, 0)   as annual_carried_over,
             COALESCE(lb.annual_granted, 22)       as annual_granted,
             COALESCE(lb.sick_total, 15)           as sick_total,
             COALESCE(lb.sick_taken, 0)            as sick_taken,
             COALESCE(lb.exceptional_total, 0)     as exceptional_total,
             COALESCE(lb.exceptional_taken, 0)     as exceptional_taken
      FROM employees e
      LEFT JOIN leave_balances lb ON lb.employee_id = e.id AND lb.year = $1::integer
      LEFT JOIN org_units ou ON e.org_unit_id = ou.id
      WHERE e.is_active = true ${empCondition}
      AND e.role != 'superadmin'
      AND e.matricule NOT LIKE 'ADM%'
      ORDER BY e.matricule ASC`, params);
    res.json({ success: true, balances: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// PUT /api/leaves/admin-balance/:id — modifier solde (RH/superadmin uniquement)
router.put('/admin-balance/:id', requireAuth, requireRole('superadmin', 'rh'), async (req, res) => {
  const { annual_total, annual_taken, sick_total, sick_taken } = req.body;
  try {
    // Récupérer ancienne valeur pour audit
    const old = await query('SELECT * FROM leave_balances WHERE id=$1', [req.params.id]);
    if (!old.rows.length) return res.status(404).json({ success: false, error: 'Solde introuvable' });
    const oldBalance = old.rows[0];

    const result = await query(`
      UPDATE leave_balances
      SET annual_total        = $1,
          annual_taken        = $2,
          sick_total          = $3,
          sick_taken          = $4,
          annual_carried_over = GREATEST(0, $1::numeric - 22),
          annual_granted      = 22,
          updated_at          = NOW()
      WHERE id = $5
      RETURNING *
    `, [annual_total, annual_taken, sick_total, sick_taken, req.params.id]);

    // Enregistrer dans audit_logs
    await query(`
      INSERT INTO audit_logs (action, table_name, record_id, employee_id, performed_by, old_values, new_values, ip_address)
      VALUES ('UPDATE_BALANCE', 'leave_balances', $1, $2, $3, $4, $5, $6)
    `, [
      req.params.id,
      oldBalance.employee_id,
      req.user.id,
      JSON.stringify({
        annual_total: oldBalance.annual_total,
        annual_taken: oldBalance.annual_taken,
        sick_total:   oldBalance.sick_total,
        sick_taken:   oldBalance.sick_taken,
        year:         oldBalance.year
      }),
      JSON.stringify({ annual_total, annual_taken, sick_total, sick_taken, year: oldBalance.year }),
      req.ip
    ]);

    res.json({ success: true, balance: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/leaves/audit-logs — consulter les logs d'audit
router.get('/audit-logs', requireAuth, requireRole('superadmin', 'rh'), async (req, res) => {
  try {
    const { limit = 100, employee_id } = req.query;
    let sql = `
      SELECT al.*,
             e.first_name  || ' ' || e.last_name  as employee_name,  e.matricule,
             p.first_name  || ' ' || p.last_name  as performed_by_name, p.matricule as performed_by_matricule
      FROM audit_logs al
      LEFT JOIN employees e ON al.employee_id  = e.id
      LEFT JOIN employees p ON al.performed_by = p.id
      WHERE 1=1`;
    const params = [];
    if (employee_id) { params.push(employee_id); sql += ` AND al.employee_id = $${params.length}`; }
    sql += ` ORDER BY al.created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);
    const result = await query(sql, params);
    res.json({ success: true, logs: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
