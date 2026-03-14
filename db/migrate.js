require("dotenv").config();
const { pool } = require("../src/config/db");

// ─────────────────────────────────────────────────────────────────────────────
//  All SmartServe objects live inside the "smartserve" schema.
//  This keeps them 100% isolated from any other project in the same database.
//  Enums are also schema-scoped so they never clash with other projects.
// ─────────────────────────────────────────────────────────────────────────────

const SQL = `

-- ── 1. CREATE SCHEMA (safe to run multiple times) ────────────────────────────
CREATE SCHEMA IF NOT EXISTS smartserve;

-- ── 2. ENUMS (schema-scoped — will never clash with other projects) ───────────
DO $$ BEGIN
  CREATE TYPE smartserve.user_role AS ENUM ('user', 'provider');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE smartserve.verification_status AS ENUM ('pending', 'verified', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE smartserve.appointment_status AS ENUM (
    'pending','accepted','ongoing','completed','rejected','cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 3. USERS ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS smartserve.users (
  id              SERIAL PRIMARY KEY,
  full_name       VARCHAR(120)              NOT NULL,
  email           VARCHAR(255)              NOT NULL UNIQUE,
  phone           VARCHAR(20)               NOT NULL UNIQUE,
  city            VARCHAR(80)               NOT NULL,
  hashed_password VARCHAR(255)              NOT NULL,
  role            smartserve.user_role      NOT NULL DEFAULT 'user',
  is_active       BOOLEAN                   NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ               NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ss_users_email ON smartserve.users(email);
CREATE INDEX IF NOT EXISTS idx_ss_users_role  ON smartserve.users(role);

-- ── 4. PROVIDER PROFILES ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS smartserve.provider_profiles (
  id                  SERIAL PRIMARY KEY,
  user_id             INTEGER                        NOT NULL UNIQUE
                        REFERENCES smartserve.users(id) ON DELETE CASCADE,
  service_name        VARCHAR(200)                   NOT NULL,
  service_category    VARCHAR(80)                    NOT NULL,
  bio                 TEXT,
  experience_years    INTEGER                        DEFAULT 0,
  base_price_per_hour FLOAT                          DEFAULT 0,
  service_areas       TEXT,
  skills              TEXT,
  available_days      VARCHAR(100)                   DEFAULT 'Mon,Tue,Wed,Thu,Fri',
  work_start_time     VARCHAR(10)                    DEFAULT '09:00',
  work_end_time       VARCHAR(10)                    DEFAULT '18:00',
  is_available        BOOLEAN                        DEFAULT TRUE,
  avg_rating          FLOAT                          DEFAULT 0.0,
  total_reviews       INTEGER                        DEFAULT 0,
  total_jobs          INTEGER                        DEFAULT 0,
  verification_status smartserve.verification_status DEFAULT 'pending',
  id_proof_type       VARCHAR(50),
  id_proof_url        VARCHAR(500),
  created_at          TIMESTAMPTZ                    NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ss_provider_category ON smartserve.provider_profiles(service_category);
CREATE INDEX IF NOT EXISTS idx_ss_provider_rating   ON smartserve.provider_profiles(avg_rating DESC);
CREATE INDEX IF NOT EXISTS idx_ss_provider_avail    ON smartserve.provider_profiles(is_available);

-- ── 5. APPOINTMENTS ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS smartserve.appointments (
  id               SERIAL PRIMARY KEY,
  customer_id      INTEGER                       NOT NULL
                     REFERENCES smartserve.users(id) ON DELETE CASCADE,
  provider_id      INTEGER                       NOT NULL
                     REFERENCES smartserve.provider_profiles(id) ON DELETE CASCADE,
  service_name     VARCHAR(200)                  NOT NULL,
  description      TEXT,
  location         VARCHAR(300)                  NOT NULL,
  area             VARCHAR(100),
  scheduled_date   DATE                          NOT NULL,
  scheduled_start  VARCHAR(10)                   NOT NULL,
  scheduled_end    VARCHAR(10)                   NOT NULL,
  agreed_price     FLOAT                         NOT NULL,
  total_amount     FLOAT,
  status           smartserve.appointment_status NOT NULL DEFAULT 'pending',
  rejection_note   TEXT,
  completion_note  TEXT,
  created_at       TIMESTAMPTZ                   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ,
  accepted_at      TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ss_appt_customer ON smartserve.appointments(customer_id);
CREATE INDEX IF NOT EXISTS idx_ss_appt_provider ON smartserve.appointments(provider_id);
CREATE INDEX IF NOT EXISTS idx_ss_appt_status   ON smartserve.appointments(status);
CREATE INDEX IF NOT EXISTS idx_ss_appt_date     ON smartserve.appointments(scheduled_date);

-- ── 6. REVIEWS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS smartserve.reviews (
  id             SERIAL PRIMARY KEY,
  appointment_id INTEGER     NOT NULL UNIQUE
                   REFERENCES smartserve.appointments(id) ON DELETE CASCADE,
  reviewer_id    INTEGER     NOT NULL
                   REFERENCES smartserve.users(id) ON DELETE CASCADE,
  provider_id    INTEGER     NOT NULL
                   REFERENCES smartserve.provider_profiles(id) ON DELETE CASCADE,
  rating         FLOAT       NOT NULL CHECK (rating >= 1.0 AND rating <= 5.0),
  comment        TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ss_review_provider ON smartserve.reviews(provider_id);
CREATE INDEX IF NOT EXISTS idx_ss_review_reviewer ON smartserve.reviews(reviewer_id);
`;

(async () => {
  const client = await pool.connect();
  try {
    console.log("🔄  Running SmartServe migrations...");
    await client.query(SQL);
    console.log("✅  All tables created in 'smartserve' schema");
    console.log("📦  Tables: smartserve.users, smartserve.provider_profiles,");
    console.log("           smartserve.appointments, smartserve.reviews");
  } catch (err) {
    console.error("❌  Migration failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();