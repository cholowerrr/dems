// Usage (in the backend folder):  node tamper.js <evidence-id>
// Simulates someone secretly editing the stored evidence file on the server.
const fs = require('fs');
const path = require('path');
const mod = require('./db');
const pool = mod.pool || mod;
(async () => {
  const id = process.argv[2];
  if (!id) { console.log('Usage: node tamper.js <evidence-id>'); process.exit(1); }
  const r = await pool.query('SELECT file_name, storage_path FROM evidence WHERE id = $1', [id]);
  if (!r.rows.length) { console.log('No evidence with that ID.'); process.exit(1); }
  const p = path.isAbsolute(r.rows[0].storage_path) ? r.rows[0].storage_path : path.resolve(__dirname, r.rows[0].storage_path);
  fs.appendFileSync(p, ' ');   // one extra space is enough to change the SHA-256
  console.log('Stored file changed by one byte:', p);
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
