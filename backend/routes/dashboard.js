const express = require('express');
const { query } = require('../db/postgres');
const { requireAuth, requireSameUnit } = require('../middleware/auth');
const router = express.Router();

router.get('/', requireAuth, requireSameUnit, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const year  = new Date().getFullYear();
    const month = new Date().getMonth() + 1;

    let empFilter = '';
    let empParams = [];
    if (req.user.role === 'employee') {
      empFilter = 'AND e.id = $1';
      empParams = [req.user.id];
    } else if (req.user.role === 'manager') {
      if (!req.subordinateIds || req.subordinateIds.length === 0) {
        return res.json({ success: true, stats: {
          total_employees: 0, pending_leaves: 0,
          today_attendance: { present:0, absent:0, late:0, on_leave:0 },
          monthly_leaves: { approved:0, rejected:0, pending:0, total_days:0 },
          sick_alerts: []
        }});
      }
      empFilter = 'AND e.id = ANY($1::int[])';
      empParams = [req.subordinateIds];
    }

    const p = empParams;

    const [totalEmp, pendingLeaves, todayAttendance, monthlyStats] = await Promise.all([
      query(`SELECT COUNT(*) FROM employees e WHERE is_active=true ${empFilter}`, p),
      query(`SELECT COUNT(*) FROM leave_requests lr JOIN employees e ON lr.employee_id=e.id WHERE lr.status='pending' ${empFilter}`, p),
      query(`
        SELECT
          COUNT(*) FILTER (WHERE status='present')  as present,
          COUNT(*) FILTER (WHERE status='absent')   as absent,
          COUNT(*) FILTER (WHERE status='late')     as late,
          COUNT(*) FILTER (WHERE status IN ('on_leave','teletravail','mission','formation','seminaire')) as on_leave
        FROM attendance a JOIN employees e ON a.employee_id=e.id AND e.is_active=true
        WHERE a.date=$${p.length+1}::date ${empFilter}`,
        [...p, today]),
      query(`
        SELECT
          COUNT(*) FILTER (WHERE status='approved') as approved,
          COUNT(*) FILTER (WHERE status='rejected') as rejected,
          COUNT(*) FILTER (WHERE status='pending')  as pending,
          SUM(days_count) FILTER (WHERE status='approved') as total_days
        FROM leave_requests lr JOIN employees e ON lr.employee_id=e.id
        WHERE EXTRACT(YEAR FROM lr.start_date)=$${p.length+1}
          AND EXTRACT(MONTH FROM lr.start_date)=$${p.length+2}
          ${empFilter}`,
        [...p, year, month])
    ]);

    // Alertes conges maladie
    let sickAlerts = [];
    try {
      if (req.user.role === 'employee') {
        const sickData = await query(
          `SELECT lb.sick_taken, lb.sick_total,
                  lb.sick_total - lb.sick_taken as restant,
                  CASE WHEN lb.sick_taken >= lb.sick_total THEN 'DEPASSE'
                       WHEN lb.sick_taken >= 12 THEN 'ATTENTION'
                       WHEN lb.sick_taken >= 8  THEN 'VIGILANCE'
                       ELSE 'OK' END as statut
           FROM leave_balances lb
           WHERE lb.employee_id=$1 AND lb.year=$2`,
          [req.user.id, year]
        );
        if (sickData.rows.length) sickAlerts = sickData.rows;
      } else if (req.user.role === 'manager') {
        const sickData = await query(
          `SELECT e.matricule, e.first_name || ' ' || e.last_name as nom,
                  lb.sick_taken, lb.sick_total,
                  lb.sick_total - lb.sick_taken as restant,
                  CASE WHEN lb.sick_taken >= lb.sick_total THEN 'DEPASSE'
                       WHEN lb.sick_taken >= 12 THEN 'ATTENTION'
                       WHEN lb.sick_taken >= 8  THEN 'VIGILANCE'
                       ELSE 'OK' END as statut
           FROM leave_balances lb
           JOIN employees e ON lb.employee_id = e.id
           WHERE lb.year=$1 AND lb.sick_taken >= 8 AND e.id = ANY($2::int[])
           ORDER BY lb.sick_taken DESC`,
          [year, req.subordinateIds]
        );
        sickAlerts = sickData.rows;
      } else {
        const sickData = await query(
          `SELECT e.matricule, e.first_name || ' ' || e.last_name as nom,
                  lb.sick_taken, lb.sick_total,
                  lb.sick_total - lb.sick_taken as restant,
                  CASE WHEN lb.sick_taken >= lb.sick_total THEN 'DEPASSE'
                       WHEN lb.sick_taken >= 12 THEN 'ATTENTION'
                       WHEN lb.sick_taken >= 8  THEN 'VIGILANCE'
                       ELSE 'OK' END as statut
           FROM leave_balances lb
           JOIN employees e ON lb.employee_id = e.id
           WHERE lb.year=$1 AND lb.sick_taken >= 8
           ORDER BY lb.sick_taken DESC`,
          [year]
        );
        sickAlerts = sickData.rows;
      }
    } catch(e) {
      console.error('sick_alerts error:', e.message);
    }

    res.json({
      success: true,
      stats: {
        total_employees  : parseInt(totalEmp.rows[0].count),
        pending_leaves   : parseInt(pendingLeaves.rows[0].count),
        today_attendance : todayAttendance.rows[0],
        monthly_leaves   : monthlyStats.rows[0],
        sick_alerts      : sickAlerts,
      }
    });
  } catch (err) {
    console.error('Dashboard error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
