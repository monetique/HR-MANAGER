import csv
import psycopg2
from datetime import datetime

# Connexion PostgreSQL
conn = psycopg2.connect(
    host='localhost', port=5441,
    database='hr_manager',
    user='hr_user',
    password='REDACTED_PASSWORD'
)
cur = conn.cursor()

print("✅ Connecté à PostgreSQL")

# ── Mapping code nature → leave_type_id ──────────────────────
cur.execute("SELECT id, code FROM leave_types")
leave_types = {row[1]: row[0] for row in cur.fetchall()}
print(f"Types de congés : {leave_types}")

# ── Mapping matricule → employee_id ──────────────────────────
cur.execute("SELECT id, matricule FROM employees WHERE is_active=true")
employees = {}
for row in cur.fetchall():
    mat = row[1].lstrip('0') if row[1] != '0' else '0'
    employees[row[1]] = row[0]          # '014' → id
    employees[mat.zfill(3)] = row[0]    # '14' padded → id
    employees[mat] = row[0]             # '14' → id

print(f"Employés chargés : {len(employees)} entrées")

# ════════════════════════════════════════════════════════════
# 1. MIGRATION SOLDES
# ════════════════════════════════════════════════════════════
print("\n── Migration soldes congés ──")
solde_ok = 0
solde_skip = 0
current_year = datetime.now().year

with open('/data/applications/hr-manager/migration/solde_conge.csv', 'r', encoding='utf-8-sig') as f:
    reader = csv.reader(f, delimiter=';')
    for row in reader:
        if not row or not row[0].strip():
            continue
        try:
            mat_raw  = row[0].strip()
            mat      = mat_raw.zfill(3)
            solde_np2       = float(row[3].replace(',','.')) if row[3].strip() else 0
            conges_np2      = float(row[4].replace(',','.')) if row[4].strip() else 0
            solde_n         = float(row[5].replace(',','.')) if row[5].strip() else 0
            conges_n_valides = float(row[6].replace(',','.')) if row[6].strip() else 0
            solde_final     = float(row[7].replace(',','.')) if row[7].strip() else 0

            emp_id = employees.get(mat) or employees.get(mat_raw.lstrip('0').zfill(3))
            if not emp_id:
                print(f"  ⚠️  Matricule {mat} non trouvé")
                solde_skip += 1
                continue

            # Calculer annual_taken et annual_total
            annual_taken = conges_n_valides
            annual_total = solde_n + conges_n_valides  # solde_n = restant, donc total = restant + pris
            annual_carried_over = solde_np2
            annual_granted = 22.0

            cur.execute("""
                INSERT INTO leave_balances 
                  (employee_id, year, annual_total, annual_taken, annual_carried_over, 
                   annual_granted, sick_total, sick_taken, sick_granted,
                   exceptional_total, exceptional_taken, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, 15, 0, 15, 0, 0, NOW())
                ON CONFLICT (employee_id, year) DO UPDATE SET
                  annual_total        = EXCLUDED.annual_total,
                  annual_taken        = EXCLUDED.annual_taken,
                  annual_carried_over = EXCLUDED.annual_carried_over,
                  annual_granted      = EXCLUDED.annual_granted,
                  updated_at          = NOW()
            """, [emp_id, current_year, annual_total, annual_taken, annual_carried_over, annual_granted])
            solde_ok += 1
        except Exception as e:
            print(f"  ❌ Erreur solde ligne {row}: {e}")
            solde_skip += 1

conn.commit()
print(f"✅ Soldes : {solde_ok} mis à jour, {solde_skip} ignorés")

# ════════════════════════════════════════════════════════════
# 2. MIGRATION HISTORIQUE CONGÉS
# ════════════════════════════════════════════════════════════
print("\n── Migration historique congés ──")
hist_ok = 0
hist_skip = 0
hist_dup = 0

# Récupérer les étapes de validation depuis app_config
cur.execute("SELECT value FROM app_config WHERE key='validation_steps'")
cfg = cur.fetchone()
validation_steps = int(cfg[0]) if cfg else 2

with open('/data/applications/hr-manager/migration/historique_conge.csv', 'r', encoding='utf-8-sig') as f:
    reader = csv.reader(f, delimiter=';')
    for row in reader:
        if not row or not row[0].strip():
            continue
        try:
            mat_raw    = row[0].strip()
            mat        = mat_raw.zfill(3)
            code       = row[1].strip()
            date_debut = row[2].strip()
            date_fin   = row[3].strip()
            matin      = int(row[4]) if row[4].strip() else 0
            apres_midi = int(row[5]) if row[5].strip() else 0
            jours      = float(row[6].replace(',','.')) if row[6].strip() else 0
            annulee    = int(row[7]) if row[7].strip() else 0
            commentaire = row[9].strip() if len(row) > 9 else ''

            if not date_debut or not date_fin:
                hist_skip += 1
                continue

            emp_id = employees.get(mat) or employees.get(mat_raw.lstrip('0').zfill(3))
            if not emp_id:
                hist_skip += 1
                continue

            # Trouver le leave_type_id
            lt_id = leave_types.get(code)
            if not lt_id:
                hist_skip += 1
                continue

            # Statut
            if annulee == 1:
                status = 'cancelled'
            else:
                status = 'approved'

            # Demi-journée
            half_day = (matin == 1 or apres_midi == 1) and jours <= 0.5
            half_day_period = 'matin' if matin == 1 else ('apremidi' if apres_midi == 1 else None)

            # Vérifier doublon
            cur.execute("""
                SELECT id FROM leave_requests 
                WHERE employee_id=%s AND start_date=%s AND end_date=%s AND leave_type_id=%s
            """, [emp_id, date_debut, date_fin, lt_id])
            if cur.fetchone():
                hist_dup += 1
                continue

            cur.execute("""
                INSERT INTO leave_requests 
                  (employee_id, leave_type_id, start_date, end_date, days_count, 
                   reason, status, current_step, total_steps, half_day, half_day_period, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
            """, [
                emp_id, lt_id, date_debut, date_fin, jours,
                commentaire or 'Migré depuis SMT_V9SQL',
                status,
                validation_steps if status == 'approved' else 1,
                validation_steps,
                half_day, half_day_period
            ])
            hist_ok += 1

            if hist_ok % 100 == 0:
                conn.commit()
                print(f"  ... {hist_ok} congés insérés")

        except Exception as e:
            print(f"  ❌ Erreur hist ligne {row}: {e}")
            hist_skip += 1

conn.commit()
print(f"✅ Historique : {hist_ok} insérés, {hist_dup} doublons ignorés, {hist_skip} ignorés")

cur.close()
conn.close()
print("\n🎉 Migration terminée !")
