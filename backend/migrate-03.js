require('dotenv').config();
const pool = require('./db');

async function main() {
  await pool.query(`ALTER TABLE evidence ADD COLUMN IF NOT EXISTS pending_custodian_id INTEGER REFERENCES users(id);`);
  console.log('Step 3 changes ready.');
  await pool.end();
}
main().catch(e => { console.error('Failed:', e.message); pool.end(); });