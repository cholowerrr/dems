// Plays the "insider": swaps the STORED copy of each doctored test file for its edited version (or puts the original back).
//   node swap-doctored.js            -> swap in the 10 doctored files (only those you already uploaded)
//   node swap-doctored.js restore    -> put the original files back
// The website stays untouched; press Verify on the evidence pages afterwards.
require('dotenv').config();
const fs = require('fs'), path = require('path');
const dbMod = require('./db'); const pool = dbMod.pool || dbMod;
const restore = process.argv[2] === 'restore';
const dir = path.resolve(__dirname, 'eval_files');
(async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')).filter((e) => e.doctored);
  let done = 0;
  for (const e of manifest) {
    const r = await pool.query('SELECT id, storage_path FROM evidence WHERE file_name = $1 ORDER BY registered_at DESC LIMIT 1', [e.file]);
    if (!r.rows.length) { console.log(`  not uploaded yet: ${e.file}`); continue; }
    const p = path.isAbsolute(r.rows[0].storage_path) ? r.rows[0].storage_path : path.resolve(__dirname, r.rows[0].storage_path);
    fs.chmodSync(p, 0o666);
    fs.copyFileSync(path.join(dir, restore ? 'originals' : '', restore ? e.file : e.doctored), p);
    fs.chmodSync(p, 0o444);
    console.log(`  ${restore ? 'restored' : 'doctored'}: ${e.file}   (${e.doctored_how})`); done++;
  }
  console.log(`\nDone: ${done} file(s) ${restore ? 'restored' : 'swapped'}. Now press Verify on them in the website.`);
  process.exit(0);
})().catch((x) => { console.error('Stopped: ' + x.message); process.exit(1); });
