require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const users = [
  ['admin1', 'System Administrator', 'admin'],
  ['investigator1', 'Sample Investigator', 'investigator'],
  ['custodian1', 'Sample Evidence Custodian', 'custodian'],
  ['viewer1', 'Sample Viewer', 'viewer'],
];

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin','investigator','custodian','viewer')),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      ip TEXT,
      success BOOLEAN NOT NULL DEFAULT TRUE,
      detail TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  console.log('Tables ready.');

  const hash = await bcrypt.hash('ChangeMe123!', 10);
  for (const [username, fullName, role] of users) {
    await pool.query(
      `INSERT INTO users (username, full_name, password_hash, role)
       VALUES ($1, $2, $3, $4) ON CONFLICT (username) DO NOTHING`,
      [username, fullName, hash, role]
    );
  }
  const r = await pool.query('SELECT id, username, role FROM users ORDER BY id');
  console.table(r.rows);
  await pool.end();
}

main().catch(e => { console.error('Failed:', e.message); pool.end(); });