-- ============================================================
--  HR Manager — Schéma PostgreSQL
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Niveaux hiérarchiques (configurable) ───────────────────
CREATE TABLE org_levels (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,  -- Ex: Direction, Division, Département, Équipe
  level_order INTEGER NOT NULL,       -- 1=plus haut, 4=plus bas
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ── Unités organisationnelles ──────────────────────────────
CREATE TABLE org_units (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(150) NOT NULL,
  code        VARCHAR(50) UNIQUE,
  level_id    INTEGER REFERENCES org_levels(id),
  parent_id   INTEGER REFERENCES org_units(id),  -- NULL = racine
  manager_id  INTEGER,  -- FK vers employees (ajoutée après)
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW()
);

-- ── Postes ─────────────────────────────────────────────────
CREATE TABLE positions (
  id          SERIAL PRIMARY KEY,
  title       VARCHAR(150) NOT NULL,
  org_unit_id INTEGER REFERENCES org_units(id),
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ── Employés ───────────────────────────────────────────────
CREATE TABLE employees (
  id              SERIAL PRIMARY KEY,
  matricule       VARCHAR(50) UNIQUE NOT NULL,
  first_name      VARCHAR(100) NOT NULL,
  last_name       VARCHAR(100) NOT NULL,
  email           VARCHAR(200) UNIQUE NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  role            VARCHAR(50) NOT NULL DEFAULT 'employee',
  -- Valeurs: superadmin, rh, manager, employee
  position_id     INTEGER REFERENCES positions(id),
  org_unit_id     INTEGER REFERENCES org_units(id),
  manager_id      INTEGER REFERENCES employees(id),  -- manager direct
  hire_date       DATE,
  birth_date      DATE,
  phone           VARCHAR(30),
  is_active       BOOLEAN DEFAULT TRUE,
  last_login      TIMESTAMP,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

-- Ajouter FK manager sur org_units maintenant que employees existe
ALTER TABLE org_units ADD CONSTRAINT fk_org_manager
  FOREIGN KEY (manager_id) REFERENCES employees(id);

-- ── Soldes de congés ────────────────────────────────────────
CREATE TABLE leave_balances (
  id              SERIAL PRIMARY KEY,
  employee_id     INTEGER REFERENCES employees(id) ON DELETE CASCADE,
  year            INTEGER NOT NULL,
  annual_total    DECIMAL(5,2) DEFAULT 18,   -- jours annuels alloués
  annual_taken    DECIMAL(5,2) DEFAULT 0,
  sick_total      DECIMAL(5,2) DEFAULT 10,
  sick_taken      DECIMAL(5,2) DEFAULT 0,
  exceptional_total DECIMAL(5,2) DEFAULT 5,
  exceptional_taken DECIMAL(5,2) DEFAULT 0,
  updated_at      TIMESTAMP DEFAULT NOW(),
  UNIQUE(employee_id, year)
);

-- ── Types de congés ─────────────────────────────────────────
CREATE TABLE leave_types (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(100) NOT NULL,
  code            VARCHAR(50) UNIQUE NOT NULL,
  days_allowed    DECIMAL(5,2),   -- NULL = illimité / configurable par employé
  requires_doc    BOOLEAN DEFAULT FALSE,
  is_active       BOOLEAN DEFAULT TRUE,
  color           VARCHAR(20) DEFAULT '#3B82F6'
);

-- ── Circuit de validation (configurable) ───────────────────
CREATE TABLE validation_circuits (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(150) NOT NULL,
  leave_type_id   INTEGER REFERENCES leave_types(id),
  org_unit_id     INTEGER REFERENCES org_units(id),  -- NULL = tous
  steps           INTEGER NOT NULL DEFAULT 2,  -- nombre de valideurs
  created_at      TIMESTAMP DEFAULT NOW()
);

-- Étapes du circuit
CREATE TABLE validation_steps (
  id              SERIAL PRIMARY KEY,
  circuit_id      INTEGER REFERENCES validation_circuits(id) ON DELETE CASCADE,
  step_order      INTEGER NOT NULL,  -- 1, 2, 3...
  validator_role  VARCHAR(50) NOT NULL,  -- manager, rh, superadmin
  label           VARCHAR(100)  -- Ex: "Validation Manager", "Validation RH"
);

-- ── Demandes de congés ─────────────────────────────────────
CREATE TABLE leave_requests (
  id              SERIAL PRIMARY KEY,
  employee_id     INTEGER REFERENCES employees(id),
  leave_type_id   INTEGER REFERENCES leave_types(id),
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  days_count      DECIMAL(5,2) NOT NULL,
  reason          TEXT,
  status          VARCHAR(50) DEFAULT 'pending',
  -- pending, approved, rejected, cancelled
  current_step    INTEGER DEFAULT 1,
  total_steps     INTEGER DEFAULT 2,
  document_path   VARCHAR(500),
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

-- ── Historique des validations ─────────────────────────────
CREATE TABLE leave_validations (
  id              SERIAL PRIMARY KEY,
  request_id      INTEGER REFERENCES leave_requests(id) ON DELETE CASCADE,
  validator_id    INTEGER REFERENCES employees(id),
  step_order      INTEGER NOT NULL,
  action          VARCHAR(50) NOT NULL,  -- approved, rejected
  comment         TEXT,
  validated_at    TIMESTAMP DEFAULT NOW()
);

-- ── Autres demandes RH ─────────────────────────────────────
CREATE TABLE hr_requests (
  id              SERIAL PRIMARY KEY,
  employee_id     INTEGER REFERENCES employees(id),
  type            VARCHAR(100) NOT NULL,
  -- attestation_travail, attestation_salaire, avance, formation, autre
  description     TEXT,
  status          VARCHAR(50) DEFAULT 'pending',
  validator_id    INTEGER REFERENCES employees(id),
  validator_comment TEXT,
  validated_at    TIMESTAMP,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

-- ── Pointage (cache local depuis SQL Server) ───────────────
CREATE TABLE attendance (
  id              SERIAL PRIMARY KEY,
  employee_id     INTEGER REFERENCES employees(id),
  matricule       VARCHAR(50) NOT NULL,
  date            DATE NOT NULL,
  check_in        TIME,
  check_out       TIME,
  worked_hours    DECIMAL(5,2),
  status          VARCHAR(50) DEFAULT 'present',
  -- present, absent, late, half_day, on_leave
  source          VARCHAR(50) DEFAULT 'pointeuse',  -- pointeuse, manual
  synced_at       TIMESTAMP DEFAULT NOW(),
  UNIQUE(matricule, date)
);

-- ── Jours fériés ───────────────────────────────────────────
CREATE TABLE public_holidays (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(150) NOT NULL,
  date            DATE NOT NULL UNIQUE,
  year            INTEGER NOT NULL
);

-- ── Notifications ──────────────────────────────────────────
CREATE TABLE notifications (
  id              SERIAL PRIMARY KEY,
  employee_id     INTEGER REFERENCES employees(id),
  title           VARCHAR(200) NOT NULL,
  message         TEXT NOT NULL,
  type            VARCHAR(50) DEFAULT 'info',  -- info, success, warning, error
  is_read         BOOLEAN DEFAULT FALSE,
  link            VARCHAR(500),
  created_at      TIMESTAMP DEFAULT NOW()
);

-- ── Config application ─────────────────────────────────────
CREATE TABLE app_config (
  key             VARCHAR(100) PRIMARY KEY,
  value           TEXT,
  description     VARCHAR(300),
  updated_at      TIMESTAMP DEFAULT NOW()
);

-- ── Index ──────────────────────────────────────────────────
CREATE INDEX idx_employees_org_unit ON employees(org_unit_id);
CREATE INDEX idx_employees_manager ON employees(manager_id);
CREATE INDEX idx_leave_requests_employee ON leave_requests(employee_id);
CREATE INDEX idx_leave_requests_status ON leave_requests(status);
CREATE INDEX idx_attendance_employee ON attendance(employee_id);
CREATE INDEX idx_attendance_date ON attendance(date);
CREATE INDEX idx_notifications_employee ON notifications(employee_id, is_read);

-- ── Données initiales ──────────────────────────────────────
INSERT INTO org_levels (name, level_order) VALUES
  ('Direction', 1),
  ('Division', 2),
  ('Département', 3),
  ('Équipe', 4);

INSERT INTO leave_types (name, code, days_allowed, requires_doc, color) VALUES
  ('Congé annuel',       'annual',      18,   FALSE, '#3B82F6'),
  ('Congé maladie',      'sick',        10,   TRUE,  '#EF4444'),
  ('Congé exceptionnel', 'exceptional', 5,    TRUE,  '#F59E0B'),
  ('Congé sans solde',   'unpaid',      NULL, FALSE, '#6B7280'),
  ('Congé maternité',    'maternity',   98,   TRUE,  '#EC4899'),
  ('Congé paternité',    'paternity',   3,    FALSE, '#8B5CF6');

INSERT INTO app_config (key, value, description) VALUES
  ('company_name',         'Monétique Tunisie',  'Nom de la société'),
  ('work_hours_per_day',   '8',                  'Heures de travail par jour'),
  ('work_start_time',      '08:00',              'Heure de début de travail'),
  ('work_end_time',        '17:00',              'Heure de fin de travail'),
  ('late_tolerance_min',   '15',                 'Tolérance retard en minutes'),
  ('leave_min_days_notice','2',                  'Préavis minimum pour congé (jours)'),
  ('validation_steps',     '2',                  'Nombre de valideurs par défaut');
