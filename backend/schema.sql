-- Run once to set up the database:
--   psql -U postgres -c "CREATE DATABASE kifiya_dashboard;"
--   psql -U postgres -d kifiya_dashboard -f schema.sql

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL       PRIMARY KEY,
  username      VARCHAR(50)  UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name     VARCHAR(100),
  title         VARCHAR(100),
  created_at    TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS snapshots (
  id            SERIAL  PRIMARY KEY,
  snapshot_date DATE    UNIQUE NOT NULL,
  data          JSONB   NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_snapshots_date ON snapshots(snapshot_date DESC);
