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
}

cur.execute("SELECT id, matricule FROM employees WHERE is_active=true")
emp_by_mat = {row[1]: row[0] for row in cur.fetchall()}

annee = datetime.now().year
soldes = {}

with open('/tmp/recap3.csv', encoding='utf-8-sig') as f:
    for line in f:
        parts = line.strip().split(';')
        if len(parts) < 9: continue

        mat_smt = parts[0].strip()
        code = parts[3].strip()
        solde_np1 = parts[6].strip().replace(',', '.')

        hr_mat = SMT_TO_HR.get(mat_smt, mat_smt)
        emp_id = emp_by_mat.get(hr_mat)
        if not emp_id: continue

        if emp_id not in soldes:
            soldes[emp_id] = {'annual': 0, 'sick': 0}

        try:
            val_np1 = float(solde_np1) if solde_np1 != 'NULL' else 0
        except:
            continue

        # Solde annuel = 0454 SoldeNP1 uniquement (congés N acquis)
        if code == '0454':
            soldes[emp_id]['annual'] = val_np1
        elif code == '0550':
            soldes[emp_id]['sick'] = val_np1

ok = 0
for emp_id, s in soldes.items():
    cur.execute("""
        INSERT INTO leave_balances
        (employee_id, year, annual_total, annual_taken, sick_total, sick_taken, exceptional_total, exceptional_taken)
        VALUES (%s, %s, %s, 0, %s, 0, 0, 0)
        ON CONFLICT (employee_id, year)
        DO UPDATE SET
            annual_total = EXCLUDED.annual_total,
            sick_total = EXCLUDED.sick_total,
            updated_at = NOW()
    """, (emp_id, annee, s['annual'], s['sick']))
    ok += 1

conn.commit()
print(f"Soldes mis a jour: {ok}")

# Vérifier
cur.execute("""
    SELECT e.matricule, e.first_name, e.last_name, 
           lb.annual_total, lb.annual_taken,
           lb.annual_total - lb.annual_taken as restant
    FROM leave_balances lb
    JOIN employees e ON lb.employee_id=e.id
    WHERE lb.year=2026 AND e.matricule IN ('068','057','014','017','102')
    ORDER BY e.matricule
""")
print("\nVerification:")
for row in cur.fetchall():
    print(f"  {row[0]} {row[1]} {row[2]} : total={row[3]}j pris={row[4]}j reste={row[5]}j")

cur.close()
conn.close()
