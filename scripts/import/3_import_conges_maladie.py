import psycopg2
from datetime import datetime

conn = psycopg2.connect(
    host='localhost', port=5441,
    dbname='hr_manager', user='hr_user', password='REDACTED_PASSWORD'
)
cur = conn.cursor()

SMT_TO_HR = {
    '14': '014', '17': '017', '18': '018', '19': '019', '21': '021',
    '26': '026', '29': '029', '30': '030', '33': '033', '40': '040',
    '41': '041', '42': '042', '46': '046', '48': '048', '49': '049',
    '53': '053', '54': '054', '55': '055', '56': '056', '57': '057',
    '58': '058', '60': '060', '61': '061', '62': '062', '63': '063',
    '66': '066', '67': '067', '68': '068', '70': '070', '71': '071',
    '72': '072', '74': '074', '75': '075', '76': '076', '78': '078',
    '79': '079', '81': '081', '83': '083', '85': '085', '86': '086',
    '87': '087', '89': '089', '90': '090', '91': '091', '92': '092',
    '93': '093', '95': '095', '96': '096', '97': '097', '99': '099',
    '100': '100', '101': '101', '102': '102', '103': '103',
    '105': '105', '106': '106', '107': '107', '108': '108',
    '109': '109', '110': '110', '112': '112', '113': '113',
    '114': '114', '115': '115', '116': '116', '118': '118',
    '119': '119', '120': '120', '121': '121', '122': '122',
    '45': '045', '69': '069', '94': '094', '98': '098',
}

cur.execute("SELECT id, code FROM leave_types")
lt_map = {row[1]: row[0] for row in cur.fetchall()}

cur.execute("SELECT id, matricule FROM employees WHERE is_active=true")
emp_by_mat = {row[1]: row[0] for row in cur.fetchall()}

ok = skip = dup = 0

with open('/tmp/recap8.csv', encoding='utf-8-sig') as f:
    for line in f:
        parts = line.strip().split(';')
        if len(parts) < 8: continue

        mat_smt = parts[0].strip()
        code = parts[3].strip()
        date_debut = parts[5].strip()
        date_fin = parts[6].strip()
        nb_jours = parts[7].strip().replace(',', '.')

        hr_mat = SMT_TO_HR.get(mat_smt, mat_smt)
        emp_id = emp_by_mat.get(hr_mat)
        if not emp_id: skip += 1; continue

        lt_id = lt_map.get(code)
        if not lt_id: skip += 1; continue

        try:
            d_debut = datetime.strptime(date_debut[:10], '%Y-%m-%d').date()
            d_fin = datetime.strptime(date_fin[:10], '%Y-%m-%d').date()
            days = float(nb_jours) if nb_jours and nb_jours != 'NULL' else (d_fin - d_debut).days + 1
        except:
            skip += 1; continue

        # Vérifier doublon
        cur.execute("""
            SELECT id FROM leave_requests 
            WHERE employee_id=%s AND leave_type_id=%s 
            AND start_date=%s AND end_date=%s
        """, (emp_id, lt_id, d_debut, d_fin))
        if cur.fetchone():
            dup += 1; continue

        cur.execute("""
            INSERT INTO leave_requests 
            (employee_id, leave_type_id, start_date, end_date, days_count, 
             reason, status, current_step, total_steps)
            VALUES (%s, %s, %s, %s, %s, 'Import SMT_V9SQL', 'approved', 0, 0)
        """, (emp_id, lt_id, d_debut, d_fin, days))
        ok += 1

conn.commit()
print(f"Importes: {ok}, ignores: {skip}, doublons: {dup}")

# Vérification finale
cur.execute("""
    SELECT lt.code, lt.name, COUNT(*) as nb, SUM(lr.days_count) as total_jours
    FROM leave_requests lr
    JOIN leave_types lt ON lr.leave_type_id=lt.id
    WHERE lr.reason='Import SMT_V9SQL'
    GROUP BY lt.code, lt.name
    ORDER BY lt.code
""")
print("\nBilan final:")
for row in cur.fetchall():
    print(f"  {row[0]} {row[1]} : {row[2]} demandes / {row[3]}j")

cur.close()
conn.close()
# Ces matricules manquaient
