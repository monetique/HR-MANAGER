const express = require('express');
const { query } = require('../db/postgres');
const { getPointagePool } = require('../db/mssql');
const { requireAuth, requireRole, requireSameUnit } = require('../middleware/auth');
const router = express.Router();

const MIN_PRESENCE_MINUTES = 5;
const TZ_OFFSET = 1; // Tunisie UTC+1

// ── Convertir un timestamp en minutes depuis minuit (heure Tunisie) ──
function getMinTN(t) {
  const d = new Date(t);
  return ((d.getUTCHours() + TZ_OFFSET) % 24) * 60 + d.getUTCMinutes();
}

// ── Calcul des anomalies selon l'horaire ─────────────────────
function analyzeAttendance(events, schedule) {
  events.sort((a, b) => a.time - b.time);

  const toMin = t => {
    const str = typeof t === 'string' ? t.slice(0,5) : new Date(t).toISOString().slice(11,16);
    const [h,m] = str.split(':').map(Number);
    return h*60+m;
  };

  const morningStart   = toMin(schedule.morning_start);
  const morningEnd     = toMin(schedule.morning_end);
  const afternoonStart = schedule.afternoon_start ? toMin(schedule.afternoon_start) : null;
  const afternoonEnd   = schedule.afternoon_end   ? toMin(schedule.afternoon_end)   : null;
  const tolerance      = parseInt(schedule.tolerance_min);
  const requiredHours  = parseFloat(schedule.required_hours);
  const isContinuous   = !afternoonStart;

  // ── Appairage IN/OUT avec filtrage passages parasites (<5 min) ──
  let totalMinutes = 0;
  let validPairs   = [];
  let pendingIn    = null;

  for (const e of events) {
    if (e.type === 'IN') {
      pendingIn = e.time;
    } else if (e.type === 'OUT' && pendingIn) {
      const diff = (e.time - pendingIn) / 60000;
      if (diff >= MIN_PRESENCE_MINUTES) {
        validPairs.push({ in: pendingIn, out: e.time, duration: diff });
        totalMinutes += diff < 720 ? diff : 0;
      }
      pendingIn = null;
    }
  }
  if (pendingIn) {
    validPairs.push({ in: pendingIn, out: null, duration: null });
  }

  const firstValidPair = validPairs[0];
  const lastValidPair  = validPairs[validPairs.length - 1];

  const checkIn  = firstValidPair ? firstValidPair.in.toISOString().slice(11,19) : null;
  const checkOut = lastValidPair && lastValidPair.out ? lastValidPair.out.toISOString().slice(11,19) : null;

  // ── Déduire pause déjeuner 12h-13h pour horaire normal ──────
  // Si pas de badgeage entre 12h et 13h (heure Tunisie) ET heures > 4h
  let adjustedMinutes = totalMinutes;
  if (!isContinuous && totalMinutes > 240) {
    const hasMidayBreak = validPairs.some(function(p) {
      const outMin = p.out ? getMinTN(p.out) : null;
      const inMin  = getMinTN(p.in);
      // 12h-13h Tunisie = 720-780 minutes
      return (outMin && outMin >= 720 && outMin <= 780) || (inMin >= 720 && inMin <= 780);
    });
    if (!hasMidayBreak) {
      adjustedMinutes = Math.max(0, totalMinutes - 60);
    }
  }

  const workedHours = adjustedMinutes > 0 ? parseFloat((adjustedMinutes/60).toFixed(2)) : null;

  // ── Calcul des anomalies ─────────────────────────────────────
  let lateMorning         = false;
  let lateAfternoon       = false;
  let earlyLeaveMorning   = false;
  let earlyLeaveAfternoon = false;
  let delayMinutes        = 0;
  let earlyLeaveMinutes   = 0;

  // Convertir checkIn/checkOut UTC en minutes Tunisie pour comparaison avec horaire
  const checkInMinTN  = checkIn  ? getMinTN(new Date('1970-01-01T' + checkIn  + 'Z').getTime() - TZ_OFFSET*3600000 + TZ_OFFSET*3600000) : null;
  const checkOutMinTN = checkOut ? getMinTN(new Date('1970-01-01T' + checkOut + 'Z').getTime() - TZ_OFFSET*3600000 + TZ_OFFSET*3600000) : null;

  // Utiliser directement les minutes depuis les timestamps
  const ciMin = firstValidPair ? getMinTN(firstValidPair.in) : null;
  const coMin = (lastValidPair && lastValidPair.out) ? getMinTN(lastValidPair.out) : null;

  if (ciMin !== null) {
    // Retard matin
    if (ciMin > morningStart + tolerance) {
      lateMorning   = true;
      delayMinutes += ciMin - (morningStart + tolerance);
    }

    // Retard après-midi
    if (!isContinuous && afternoonStart) {
      const afternoonIns = validPairs.filter(p => getMinTN(p.in) >= morningEnd);
      if (afternoonIns.length > 0) {
        const returnMin = getMinTN(afternoonIns[0].in);
        if (returnMin > afternoonStart + tolerance) {
          lateAfternoon = true;
          delayMinutes += returnMin - (afternoonStart + tolerance);
        }
      }
    }
  }

  if (coMin !== null) {
    if (isContinuous) {
      if (ciMin !== null && ciMin >= morningStart - 60 && coMin < morningEnd - tolerance) {
        earlyLeaveMorning  = true;
        earlyLeaveMinutes += morningEnd - coMin;
      }
    } else {
      if (ciMin !== null && ciMin >= morningStart - 60 && coMin < morningEnd - tolerance && coMin <= morningEnd) {
        earlyLeaveMorning  = true;
        earlyLeaveMinutes += morningEnd - coMin;
      }
      if (afternoonEnd && coMin > morningEnd && coMin < afternoonEnd - tolerance) {
        earlyLeaveAfternoon = true;
        earlyLeaveMinutes  += afternoonEnd - coMin;
      }
    }
  }

  // ── Récupération ─────────────────────────────────────────────
  const recovered = workedHours !== null && workedHours >= requiredHours;

  // ── Statut final ─────────────────────────────────────────────
  let status = 'present';
  if (!checkIn) {
    status = 'absent';
  } else if ((lateMorning || lateAfternoon || earlyLeaveMorning || earlyLeaveAfternoon) && !recovered) {
    status = 'late';
  }

  // Convertir checkIn/checkOut en heure Tunisie pour affichage
  const checkInLocal  = firstValidPair
    ? new Date(firstValidPair.in.getTime() + TZ_OFFSET*3600000).toISOString().slice(11,19)
    : null;
  const checkOutLocal = (lastValidPair && lastValidPair.out)
    ? new Date(lastValidPair.out.getTime() + TZ_OFFSET*3600000).toISOString().slice(11,19)
    : null;

  return {
    checkIn: checkInLocal, checkOut: checkOutLocal, workedHours,
    lateMorning, lateAfternoon,
    earlyLeaveMorning, earlyLeaveAfternoon,
    delayMinutes, earlyLeaveMinutes,
    recovered, status
  };
}

// POST /api/attendance/sync
router.post('/sync', requireAuth, requireRole('superadmin', 'rh'), async (req, res) => {
  const pool = getPointagePool();
  if (!pool) return res.status(503).json({ success: false, error: 'SQL Server non disponible' });

  const { date_from, date_to } = req.body;
  try {
    const tsFrom = new Date(date_from).getTime();
    const tsTo   = new Date(date_to + 'T23:59:59').getTime();

    // Charger tous les horaires pour assignation dynamique selon la date
    const { schedule_id } = req.body;
    const allSchedules = await query('SELECT * FROM work_schedules WHERE is_active=true ORDER BY id');
    if (!allSchedules.rows.length) {
      return res.status(400).json({ success: false, error: 'Aucun horaire actif configure' });
    }

    // Dates Ramadan par année
    const RAMADAN_DATES = {
      2024: { start: '03-11', end: '04-09' },
      2025: { start: '03-01', end: '03-29' },
      2026: { start: '02-18', end: '03-19' },
      2027: { start: '02-07', end: '03-08' },
      2028: { start: '01-27', end: '02-25' },
    };

    // Fonction pour déterminer l'horaire selon la date
    function getScheduleForDate(dateStr) {
      const d = new Date(dateStr);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const mmdd = String(month).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');

      // Vérifier Ramadan selon l'année
      const ramadan = RAMADAN_DATES[year];
      if (ramadan && mmdd >= ramadan.start && mmdd <= ramadan.end) {
        return allSchedules.rows.find(s => s.code === 'ramadhan') || allSchedules.rows.find(s => s.is_current);
      }
      // Été: juillet-août
      if (month === 7 || month === 8) {
        return allSchedules.rows.find(s => s.code === 'summer') || allSchedules.rows.find(s => s.is_current);
      }
      // Normal
      return allSchedules.rows.find(s => s.code === 'normal') || allSchedules.rows.find(s => s.is_current);
    }

    const schedule = allSchedules.rows.find(s => s.is_current);

    const mssqlResult = await pool.request()
      .input('ts_from', tsFrom)
      .input('ts_to',   tsTo)
      .query(`
        SELECT MATRICULE,
               CAST(DATEADD(s, actual_time/1000, '19700101') AS DATE) AS jour,
               DATEADD(s, actual_time/1000, '19700101')               AS datetime_utc,
               type
        FROM dbo.CHECKING
        WHERE deleted=0 AND ignored_by_calc=0
          AND actual_time IS NOT NULL
          AND actual_time BETWEEN @ts_from AND @ts_to
          AND MATRICULE IS NOT NULL AND MATRICULE != ''
          AND type IN ('IN','OUT')
        ORDER BY MATRICULE, actual_time
      `);

    const grouped = {};
    for (const row of mssqlResult.recordset) {
      if (!row.MATRICULE || !row.jour) continue;
      const matricule = row.MATRICULE.toString().trim();
      // Date en heure Tunisie (UTC+1)
      const dtUTC  = row.datetime_utc instanceof Date ? row.datetime_utc : new Date(row.datetime_utc);
      const dtTN   = new Date(dtUTC.getTime() + TZ_OFFSET * 3600000);
      const dateStr = dtTN.toISOString().split('T')[0];
      const key = matricule + '|' + dateStr;
      if (!grouped[key]) grouped[key] = { matricule, dateStr, events: [] };
      grouped[key].events.push({ time: dtUTC, type: row.type });
    }

    let synced=0, skipped=0, errors=0;

    for (const [key, group] of Object.entries(grouped)) {
      try {
        const emp = await query(
          "SELECT id, matricule FROM employees WHERE matricule=$1 OR matricule=$2 OR matricule=$3",
          [group.matricule, group.matricule.replace(/^0+/,''), group.matricule.padStart(3,'0')]
        );
        if (!emp.rows.length) { skipped++; continue; }
        const hrMatricule = emp.rows[0].matricule; // Utiliser le matricule de HR Manager

        // Recuperer le regime de l employe
        const empRegime = await query(`
          SELECT wr.code, wr.hours_per_week,
                 rs.required_hours, rs.morning_start, rs.morning_end,
                 rs.afternoon_start, rs.afternoon_end, rs.tolerance_min
          FROM employees e
          LEFT JOIN work_regimes wr ON e.regime_id = wr.id
          LEFT JOIN regime_schedules rs ON rs.regime_id = wr.id AND rs.schedule_type = 'normal'
          WHERE e.id = $1
        `, [emp.rows[0].id]);
        let effectiveSchedule = schedule;
        if (empRegime.rows.length && empRegime.rows[0].required_hours) {
          const r = empRegime.rows[0];
          effectiveSchedule = {
            ...schedule,
            required_hours: parseFloat(r.required_hours),
            morning_start: r.morning_start || schedule.morning_start,
            morning_end: r.morning_end || schedule.morning_end,
            afternoon_start: r.afternoon_start !== undefined ? r.afternoon_start : schedule.afternoon_start,
            afternoon_end: r.afternoon_end !== undefined ? r.afternoon_end : schedule.afternoon_end,
            tolerance_min: r.tolerance_min || schedule.tolerance_min,
          };
        }
        const dateSchedule = getScheduleForDate(group.dateStr);
        const effectiveDateSchedule = empRegime.rows.length && empRegime.rows[0].required_hours
          ? { ...dateSchedule, 
              required_hours: parseFloat(empRegime.rows[0].required_hours),
              morning_start: empRegime.rows[0].morning_start || dateSchedule.morning_start,
              morning_end: empRegime.rows[0].morning_end || dateSchedule.morning_end,
              afternoon_start: empRegime.rows[0].afternoon_start !== undefined ? empRegime.rows[0].afternoon_start : dateSchedule.afternoon_start,
              afternoon_end: empRegime.rows[0].afternoon_end !== undefined ? empRegime.rows[0].afternoon_end : dateSchedule.afternoon_end,
              tolerance_min: empRegime.rows[0].tolerance_min || dateSchedule.tolerance_min,
            }
          : dateSchedule;
        const analysis = analyzeAttendance(group.events, effectiveDateSchedule);

        let finalStatus = analysis.status;

        // Vérifier jour férié EN PRIORITÉ
        const holidayCheck = await query(
          "SELECT id FROM public_holidays WHERE date=$1::date",
          [group.dateStr]
        );
        // Vérifier congé approuvé EN PRIORITÉ (même si l'employé a badgé)
        const onLeave = await query(
          "SELECT lr.id, lt.code FROM leave_requests lr LEFT JOIN leave_types lt ON lr.leave_type_id=lt.id WHERE lr.employee_id=$1 AND lr.status='approved' AND $2::date BETWEEN lr.start_date AND lr.end_date LIMIT 1",
          [emp.rows[0].id, group.dateStr]
        );
        if (holidayCheck.rows.length) {
          finalStatus = 'holiday';
        } else if (onLeave.rows.length) {
          const leaveCode = onLeave.rows[0].code;
          if (leaveCode === '0570')      finalStatus = 'teletravail';
          else if (leaveCode === '0580') finalStatus = 'mission';
          else if (leaveCode === '0560') finalStatus = 'formation';
          else if (leaveCode === '0690') finalStatus = 'seminaire';
          else if (leaveCode === '0480') finalStatus = analysis.status;
          else                           finalStatus = 'on_leave';
        }

        await query(`
          INSERT INTO attendance (
            employee_id, matricule, date, check_in, check_out, worked_hours, status,
            late_morning, late_afternoon, early_leave_morning, early_leave_afternoon,
            delay_minutes, early_leave_minutes, recovered, schedule_id, source, synced_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'pointeuse',NOW())
          ON CONFLICT (matricule, date) DO UPDATE SET
            check_in=EXCLUDED.check_in, check_out=EXCLUDED.check_out,
            worked_hours=EXCLUDED.worked_hours, status=EXCLUDED.status,
            late_morning=EXCLUDED.late_morning, late_afternoon=EXCLUDED.late_afternoon,
            early_leave_morning=EXCLUDED.early_leave_morning,
            early_leave_afternoon=EXCLUDED.early_leave_afternoon,
            delay_minutes=EXCLUDED.delay_minutes,
            early_leave_minutes=EXCLUDED.early_leave_minutes,
            recovered=EXCLUDED.recovered, schedule_id=EXCLUDED.schedule_id,
            synced_at=NOW()`,
          [
            emp.rows[0].id, hrMatricule, group.dateStr,
            analysis.checkIn, analysis.checkOut, analysis.workedHours, finalStatus,
            analysis.lateMorning, analysis.lateAfternoon,
            analysis.earlyLeaveMorning, analysis.earlyLeaveAfternoon,
            analysis.delayMinutes, analysis.earlyLeaveMinutes,
            analysis.recovered, dateSchedule ? dateSchedule.id : schedule.id
          ]
        );
        synced++;
      } catch(e) { errors++; console.error('Erreur sync', key, e.message); }
    }

    // ── Créer lignes on_leave pour employés en congé sans badgeage ──
    let leavesInserted = 0;
    try {
      // Générer toutes les dates entre date_from et date_to
      const dateList = [];
      const cur = new Date(date_from);
      const end = new Date(date_to);
      while (cur <= end) {
        const dow = cur.getDay();
        if (dow !== 0 && dow !== 6) { // Exclure week-end
          dateList.push(cur.toISOString().split('T')[0]);
        }
        cur.setDate(cur.getDate() + 1);
      }

      for (const d of dateList) {
        // Vérifier jour férié
        const holiday = await query("SELECT id FROM public_holidays WHERE date=$1::date", [d]);
        if (holiday.rows.length) continue;

        // Trouver tous les employés en congé approuvé ce jour
        const onLeaves = await query(`
          SELECT lr.employee_id, e.matricule, lt.code,
                 COALESCE(ws.id, $2) as schedule_id
          FROM leave_requests lr
          JOIN employees e ON lr.employee_id = e.id
          JOIN leave_types lt ON lr.leave_type_id = lt.id
          LEFT JOIN work_schedules ws ON ws.is_current = true
          WHERE lr.status = 'approved'
          AND $1::date BETWEEN lr.start_date AND lr.end_date
          AND e.is_active = true
        `, [d, schedule.id]);

        for (const lv of onLeaves.rows) {
          // Déterminer le statut selon le code congé
          let lvStatus = 'on_leave';
          if (lv.code === '0570')      lvStatus = 'teletravail';
          else if (lv.code === '0580') lvStatus = 'mission';
          else if (lv.code === '0560') lvStatus = 'formation';
          else if (lv.code === '0690') lvStatus = 'seminaire';
          else if (lv.code === '0480') continue; // Autorisation sortie : pas de ligne on_leave

          // Insérer seulement si pas déjà de ligne pour ce jour
          const existing = await query(
            "SELECT id FROM attendance WHERE employee_id=$1 AND date=$2::date",
            [lv.employee_id, d]
          );
          if (!existing.rows.length) {
            await query(`
              INSERT INTO attendance
                (employee_id, matricule, date, check_in, check_out, worked_hours, status,
                 late_morning, late_afternoon, early_leave_morning, early_leave_afternoon,
                 delay_minutes, early_leave_minutes, recovered, schedule_id, source, synced_at)
              VALUES ($1,$2,$3,NULL,NULL,0,$4,false,false,false,false,0,0,false,$5,'conge',NOW())
            `, [lv.employee_id, lv.matricule, d, lvStatus, lv.schedule_id]);
            leavesInserted++;
          }
        }
      }
    } catch(e) {
      console.error('Erreur insertion on_leave:', e.message);
    }

    res.json({
      success: true, synced, skipped, errors,
      leaves_inserted: leavesInserted,
      total: Object.keys(grouped).length,
      schedule: schedule.name,
      message: `${synced} synchronisés (horaire: ${schedule.name}), ${skipped} ignorés, ${errors} erreurs, ${leavesInserted} congés insérés`
    });
  } catch(err) {
    console.error('Erreur sync:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/attendance
router.get('/', requireAuth, requireSameUnit, async (req, res) => {
  try {
    let sql = `
      SELECT a.*, e.first_name||' '||e.last_name as employee_name, e.matricule as emp_matricule,
             ws.name as schedule_name, ws.code as schedule_code
      FROM attendance a
      JOIN employees e ON a.employee_id=e.id
      LEFT JOIN work_schedules ws ON a.schedule_id=ws.id
      WHERE e.is_active=true`;
    const params = [];
    if (['employee','hr_assistant'].includes(req.user.role)) { sql+=` AND a.employee_id=$${params.length+1}`; params.push(req.user.id); }
    else if (req.user.role==='manager'&&req.subordinateIds&&req.subordinateIds.length>0) {
      sql+=` AND a.employee_id=ANY($${params.length+1}::int[])`; params.push(req.subordinateIds);
    }
    if (req.query.employee_id) { sql+=` AND a.employee_id=$${params.length+1}`; params.push(req.query.employee_id); }
    if (req.query.date_from)   { sql+=` AND a.date>=$${params.length+1}`;       params.push(req.query.date_from); }
    if (req.query.date_to)     { sql+=` AND a.date<=$${params.length+1}`;       params.push(req.query.date_to); }
    if (req.query.status)      { sql+=` AND a.status=$${params.length+1}`;      params.push(req.query.status); }
    sql+=' ORDER BY a.date DESC, e.last_name';
    const result = await query(sql, params);
    res.json({ success: true, attendance: result.rows });
  } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/attendance/stats/:employee_id
router.get('/stats/:employee_id', requireAuth, async (req, res) => {
  try {
    const { month, year } = req.query;
    const result = await query(`
      SELECT
        COUNT(*) FILTER (WHERE status='present')  as present,
        COUNT(*) FILTER (WHERE status='absent')   as absent,
        COUNT(*) FILTER (WHERE status='late')     as late,
        COUNT(*) FILTER (WHERE status='on_leave') as on_leave,
        COUNT(*) FILTER (WHERE late_morning=true)          as retards_matin,
        COUNT(*) FILTER (WHERE late_afternoon=true)        as retards_apm,
        COUNT(*) FILTER (WHERE early_leave_morning=true)   as sorties_anticipees_matin,
        COUNT(*) FILTER (WHERE early_leave_afternoon=true) as sorties_anticipees_apm,
        COUNT(*) FILTER (WHERE recovered=true)             as recuperations,
        SUM(delay_minutes)       FILTER (WHERE delay_minutes > 0)       as total_retard_min,
        SUM(early_leave_minutes) FILTER (WHERE early_leave_minutes > 0) as total_sortie_anticipee_min,
        ROUND(AVG(worked_hours) FILTER (WHERE worked_hours IS NOT NULL)::numeric,2) as avg_hours,
        ROUND(SUM(worked_hours) FILTER (WHERE worked_hours IS NOT NULL)::numeric,2) as total_hours
      FROM attendance WHERE employee_id=$1
        AND EXTRACT(MONTH FROM date)=$2 AND EXTRACT(YEAR FROM date)=$3`,
      [req.params.employee_id, month, year]);
    res.json({ success: true, stats: result.rows[0] });
  } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST /api/attendance/manual
router.post('/manual', requireAuth, requireRole('superadmin','rh'), async (req, res) => {
  const { employee_id, date, check_in, check_out, status } = req.body;
  try {
    const emp = await query('SELECT matricule FROM employees WHERE id=$1', [employee_id]);
    if (!emp.rows.length) return res.status(404).json({ success:false, error:'Employé introuvable' });
    let workedHours = null;
    if (check_in && check_out) {
      const [h1,m1]=check_in.split(':').map(Number),[h2,m2]=check_out.split(':').map(Number);
      workedHours = parseFloat((((h2*60+m2)-(h1*60+m1))/60).toFixed(2));
    }
    await query(`
      INSERT INTO attendance (employee_id,matricule,date,check_in,check_out,worked_hours,status,source)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'manual')
      ON CONFLICT (matricule,date) DO UPDATE SET check_in=EXCLUDED.check_in,
        check_out=EXCLUDED.check_out, worked_hours=EXCLUDED.worked_hours,
        status=EXCLUDED.status, source='manual'`,
      [employee_id,emp.rows[0].matricule,date,check_in,check_out,workedHours,status||'present']);
    res.json({ success:true });
  } catch(err) { res.status(500).json({ success:false, error:err.message }); }
});

// GET /api/attendance/detail/:matricule/:date
router.get('/detail/:matricule/:date', requireAuth, async (req, res) => {
  const pool = getPointagePool();
  if (!pool) return res.status(503).json({ success:false, error:'SQL Server non disponible' });
  try {
    const { matricule, date } = req.params;
    const tsFrom = new Date(date).getTime();
    const tsTo   = new Date(date+'T23:59:59').getTime();
    // Chercher aussi sans zéros et avec zéros
    const mat2 = matricule.replace(/^0+/, '');
    const mat3 = matricule.padStart(3, '0');
    const result = await pool.request()
      .input('ts_from', tsFrom).input('ts_to', tsTo)
      .input('mat1', matricule).input('mat2', mat2).input('mat3', mat3)
      .query(`
        SELECT DATEADD(hour,1,DATEADD(s,actual_time/1000,'19700101')) AS datetime_local,
               type, DATA
        FROM dbo.CHECKING
        WHERE deleted=0 AND ignored_by_calc=0
          AND actual_time IS NOT NULL AND actual_time BETWEEN @ts_from AND @ts_to
          AND (MATRICULE=@mat1 OR MATRICULE=@mat2 OR MATRICULE=@mat3)
          AND type IN ('IN','OUT')
        ORDER BY actual_time
      `);
    const events = result.recordset.map(r => {
      let controller = '';
      try { const m=r.DATA&&r.DATA.match(/k="controller"\s+v="([^"]+)"/); if(m) controller=m[1]; } catch(e){}
      return { time: new Date(r.datetime_local).toTimeString().slice(0,8), type:r.type, controller };
    });
    res.json({ success:true, events });
  } catch(err) { res.status(500).json({ success:false, error:err.message }); }
});

module.exports = router;

// GET /api/attendance/stats-by-schedule/:employee_id — stats par type d'horaire
router.get('/stats-by-schedule/:employee_id', requireAuth, async (req, res) => {
  const { year, month } = req.query;
  const currentYear = year || new Date().getFullYear();
  const currentMonth = month || null;
  try {
    // Stats par horaire
    const result = await query(`
      SELECT 
        ws.name as horaire,
        ws.code as code,
        COUNT(*) FILTER (WHERE a.status IN ('present','late')) as nb_jours,
        TO_CHAR(
          (INTERVAL '1 second' * AVG(
            EXTRACT(EPOCH FROM a.check_in::time)
          ) FILTER (WHERE a.check_in IS NOT NULL AND a.status IN ('present','late'))),
          'HH24:MI'
        ) as moy_entree,
        TO_CHAR(
          (INTERVAL '1 second' * AVG(
            EXTRACT(EPOCH FROM a.check_out::time)
          ) FILTER (WHERE a.check_out IS NOT NULL AND a.status IN ('present','late'))),
          'HH24:MI'
        ) as moy_sortie,
        ROUND(AVG(a.worked_hours) FILTER (WHERE a.worked_hours IS NOT NULL AND a.status IN ('present','late'))::numeric, 2) as moy_duree,
        ROUND(SUM(a.worked_hours) FILTER (WHERE a.worked_hours IS NOT NULL AND a.status IN ('present','late'))::numeric, 2) as total_heures
      FROM attendance a
      LEFT JOIN work_schedules ws ON a.schedule_id = ws.id
      WHERE a.employee_id = $1
        AND EXTRACT(YEAR FROM a.date) = $2
        AND a.status IN ('present', 'late')
      GROUP BY ws.name, ws.code
      ORDER BY ws.name
    `, [req.params.employee_id, currentYear]);

    // Cumul mensuel par mois
    const monthly = await query(`
      SELECT 
        TO_CHAR(a.date, 'YYYY-MM') as mois,
        ROUND(SUM(a.worked_hours) FILTER (WHERE a.worked_hours IS NOT NULL AND a.status IN ('present','late'))::numeric, 2) as total_heures,
        COUNT(*) FILTER (WHERE a.status IN ('present','late')) as nb_jours,
        COUNT(*) FILTER (WHERE a.status = 'absent') as nb_absences,
        -- Heures requises selon régime
        ROUND((
          COUNT(*) FILTER (WHERE a.status IN ('present','late')) * 
          COALESCE(rs.required_hours, ws.required_hours, 8)
        )::numeric, 2) as heures_requises
      FROM attendance a
      LEFT JOIN work_schedules ws ON a.schedule_id = ws.id
      LEFT JOIN employees e ON a.employee_id = e.id
      LEFT JOIN work_regimes wr ON e.regime_id = wr.id
      LEFT JOIN regime_schedules rs ON rs.regime_id = wr.id AND rs.schedule_type = 'normal'
      WHERE a.employee_id = $1
        AND e.is_active = true
        AND EXTRACT(YEAR FROM a.date) = $2
      GROUP BY TO_CHAR(a.date, 'YYYY-MM'), rs.required_hours, ws.required_hours
      ORDER BY mois DESC
    `, [req.params.employee_id, currentYear]);

    res.json({ success: true, stats: result.rows, monthly: monthly.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
