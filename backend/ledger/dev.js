// Development ledger: an append-only file where every entry contains the hash of the
// previous entry (a tiny blockchain). It lets us build and test everything before the
// real Hyperledger Fabric network is running. Only metadata + hashes are stored here,
// never the evidence file itself, which is the same rule the real chain follows.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIR = process.env.LEDGER_DIR || path.join(__dirname, '..', 'ledger_data');
const FILE = path.join(DIR, 'ledger.jsonl');
fs.mkdirSync(DIR, { recursive: true });

const sha = s => crypto.createHash('sha256').update(s).digest('hex');

function readAll() {
  if (!fs.existsSync(FILE)) return [];
  return fs.readFileSync(FILE, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
}

// Adds one entry. Returns the transaction id, payload size in bytes, and time in ms.
function append(evidenceId, type, payload) {
  const start = process.hrtime.bigint();
  const entries = readAll();
  const prevHash = entries.length ? entries[entries.length - 1].hash : '0'.repeat(64);
  const body = { seq: entries.length + 1, evidenceId, type, payload, ts: new Date().toISOString(), prevHash };
  const hash = sha(JSON.stringify(body));
  const line = JSON.stringify({ ...body, hash });
  const fd = fs.openSync(FILE, 'a');
  fs.writeSync(fd, line + '\n');
  fs.fsyncSync(fd);
  fs.closeSync(fd);
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  return { txId: hash, payloadBytes: Buffer.byteLength(JSON.stringify(payload)), ms };
}

async function createEvidence({ evidenceId, caseId, sha256, sizeBytes, registeredBy }) {
  return append(evidenceId, 'EVIDENCE_CREATED', { caseId, sha256, sizeBytes, registeredBy });
}

async function recordEvent({ evidenceId, type, fromUser, toUser, toOffice, result }) {
  return append(evidenceId, 'CUSTODY_EVENT', { type, fromUser, toUser, toOffice, result });
}

// The hash that was recorded when the evidence was registered.
async function getRecordedHash(evidenceId) {
  const e = readAll().find(x => x.evidenceId === evidenceId && x.type === 'EVIDENCE_CREATED');
  return e ? e.payload.sha256 : null;
}

async function getHistory(evidenceId) {
  return readAll().filter(x => x.evidenceId === evidenceId);
}

// Checks that nobody edited or removed an old ledger entry.
async function verifyChain() {
  let prev = '0'.repeat(64);
  for (const e of readAll()) {
    const { hash, ...body } = e;
    if (e.prevHash !== prev || sha(JSON.stringify(body)) !== hash) return { ok: false, brokenAt: e.seq };
    prev = hash;
  }
  return { ok: true };
}

module.exports = { createEvidence, recordEvent, getRecordedHash, getHistory, verifyChain };