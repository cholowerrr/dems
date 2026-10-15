require('dotenv').config();
const pool = require('./db');

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cases (
      id SERIAL PRIMARY KEY,
      case_number TEXT UNIQUE NOT NULL,
      case_name TEXT NOT NULL,
      case_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS case_assignments (
      case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      PRIMARY KEY (case_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS evidence (
      id UUID PRIMARY KEY,
      case_id INTEGER NOT NULL REFERENCES cases(id),
      description TEXT,
      file_name TEXT NOT NULL,
      mime_type TEXT,
      size_bytes BIGINT NOT NULL,
      sha256 CHAR(64) NOT NULL,
      storage_path TEXT NOT NULL,
      current_custodian_id INTEGER REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'in_custody'
        CHECK (status IN ('in_custody','transferred','released')),
      registered_by INTEGER NOT NULL REFERENCES users(id),
      registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      ledger_tx_id TEXT
    );

    CREATE TABLE IF NOT EXISTS custody_events (
      id SERIAL PRIMARY KEY,
      evidence_id UUID NOT NULL REFERENCES evidence(id),
      event_type TEXT NOT NULL CHECK (event_type IN
        ('registered','accessed','transferred','received','released','verified','verification_failed')),
      from_user INTEGER REFERENCES users(id),
      to_user INTEGER REFERENCES users(id),
      to_office TEXT,
      note TEXT,
      ledger_tx_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS metrics (
      id SERIAL PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('tx_payload_bytes','tx_ms','hash_ms')),
      value DOUBLE PRECISION NOT NULL,
      evidence_id UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  console.log('Step 2 tables ready: cases, case_assignments, evidence, custody_events, metrics.');
  await pool.end();
}

main().catch(e => { console.error('Failed:', e.message); pool.end(); });