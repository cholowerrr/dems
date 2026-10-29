'use strict';
// Logic test with a fake ledger in memory (no Fabric needed). Run: node test.js
const assert = require('assert');
const EvidenceContract = require('./lib/evidenceContract');

function fakeCtx() {
  const state = new Map(); let n = 0;
  const stub = {
    getState: async (k) => state.has(k) ? state.get(k) : Buffer.alloc(0),
    putState: async (k, v) => { state.set(k, Buffer.from(v)); },
    getTxTimestamp: () => ({ seconds: 1790000000 + n, nanos: 0 }),
    getTxID: () => 'tx' + (++n),
    createCompositeKey: (t, attrs) => '\u0000' + t + '\u0000' + attrs.join('\u0000') + '\u0000',
    getStateByPartialCompositeKey: async (t, attrs) => {
      const prefix = '\u0000' + t + '\u0000' + attrs.join('\u0000') + '\u0000';
      const keys = [...state.keys()].filter(k => k.startsWith(prefix)).sort();
      let i = 0;
      return { next: async () => i < keys.length ? { value: { value: state.get(keys[i++]) }, done: false } : { done: true }, close: async () => {} };
    },
  };
  return { stub, state };
}
const expectFail = async (p, msg) => { try { await p; } catch (e) { assert(e.message.includes(msg), e.message); return; } assert.fail('should have failed: ' + msg); };

(async () => {
  const c = new EvidenceContract(); const ctx = fakeCtx();
  const H = 'a'.repeat(64);
  let r = JSON.parse(await c.CreateEvidence(ctx, 'e1', 'case1', H, '300', 'investigator1'));
  assert.strictEqual(r.sha256, H); assert.strictEqual(r.eventCount, 1); console.log('PASS create evidence');
  await expectFail(c.CreateEvidence(ctx, 'e1', 'case1', H, '300', 'investigator1'), 'already exists'); console.log('PASS duplicate id rejected');
  await expectFail(c.CreateEvidence(ctx, 'e2', 'case1', 'XYZ', '1', 'i'), '64 lowercase hex'); console.log('PASS bad hash rejected');
  assert.strictEqual(await c.GetRecordedHash(ctx, 'e1'), H); console.log('PASS recorded hash readable');
  await c.RecordEvent(ctx, 'e1', 'transferred', 'investigator1', 'custodian1');
  await c.RecordEvent(ctx, 'e1', 'received', 'custodian1', '');
  await c.RecordEvent(ctx, 'e1', 'verification_failed', 'custodian1', '');
  await expectFail(c.RecordEvent(ctx, 'e1', 'deleted', 'x', ''), 'Unknown event type'); console.log('PASS unknown event rejected');
  await expectFail(c.RecordEvent(ctx, 'e1', 'registered', 'x', ''), 'CreateEvidence'); console.log('PASS cannot re-register');
  await expectFail(c.RecordEvent(ctx, 'nope', 'accessed', 'x', ''), 'does not exist'); console.log('PASS unknown evidence rejected');
  const hist = JSON.parse(await c.GetEvidenceHistory(ctx, 'e1'));
  assert.deepStrictEqual(hist.map(h => h.type), ['registered', 'transferred', 'received', 'verification_failed']);
  assert.deepStrictEqual(hist.map(h => h.seq), [1, 2, 3, 4]); console.log('PASS history in order');
  assert.strictEqual(await c.GetRecordedHash(ctx, 'e1'), H); console.log('PASS hash unchanged after events');
  const eventBytes = Buffer.byteLength(JSON.stringify(hist[1])); assert(eventBytes < 1024);
  console.log(`PASS event record size ${eventBytes} bytes (< 1 KB)`);
  // many events: ordering must still hold past seq 9 -> 10 (zero-padded keys)
  for (let i = 0; i < 12; i++) await c.RecordEvent(ctx, 'e1', 'accessed', 'u', '');
  const h2 = JSON.parse(await c.GetEvidenceHistory(ctx, 'e1')); assert.strictEqual(h2.length, 16);
  assert(h2.every((e, i) => e.seq === i + 1)); console.log('PASS ordering holds for 16 events');
  console.log('\nAll chaincode logic tests passed.');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
