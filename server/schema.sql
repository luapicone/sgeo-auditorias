-- Esquema PostgreSQL. Compatible con Postgres real (Vercel/Neon) y con PGlite (local).
-- Se ejecuta en cada arranque; todo es "IF NOT EXISTS".

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  nombre        TEXT NOT NULL,
  rol           TEXT NOT NULL CHECK (rol IN ('auditor','jefa')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS companies (
  id         SERIAL PRIMARY KEY,
  nombre     TEXT NOT NULL,
  sector     TEXT,
  ubicacion  TEXT,
  notas      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audits (
  id             SERIAL PRIMARY KEY,
  company_id     INTEGER NOT NULL REFERENCES companies(id),
  auditor_id     INTEGER NOT NULL REFERENCES users(id),
  auditor_nombre TEXT NOT NULL,
  fecha          TEXT NOT NULL,
  alcance_texto  TEXT,
  estado         TEXT NOT NULL DEFAULT 'en_progreso' CHECK (estado IN ('en_progreso','cerrada')),
  resultado_json JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS audit_items (
  audit_id    INTEGER NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  se          INTEGER NOT NULL,
  valoracion  TEXT CHECK (valoracion IN ('C','CP','NC','NA')),
  observacion TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (audit_id, se)
);
