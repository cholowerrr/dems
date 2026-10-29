'use strict';
const { Contract } = require('fabric-contract-api');

// What may be stored on the ledger (kept deliberately small — "lightweight"):
//   evidence record : id, case id, SHA-256, size, who registered it, time, event counter
//   custody events  : type, actor, counterparty, time
// NOT stored: the file itself, descriptions, free-text notes, personal data.

const EVENT_TYPES = ['registered', 'accessed', 'transferred', 'received', 'released', 'verified', 'verification_failed'];
const HEX64 = /^[0-9a-f]{64}$/;

const evKey = (id) => `EVIDENCE_${id}`;
const eventKey = (ctx, id, seq) =>
  ctx.stub.createCompositeKey('EVENT', [id, String(seq).padStart(8, '0')]);

function txTime(ctx) {
  const t = ctx.stub.getTxTimestamp();           // same value on every endorsing peer
  const seconds = typeof t.seconds === 'object' && t.seconds.toNumber ? t.seconds.toNumber() : Number(t.seconds);
  return new Date(seconds * 1000 + Math.floor((t.nanos || 0) / 1e6)).toISOString();
}

class EvidenceContract extends Contract {
  constructor() { super('EvidenceContract'); }

  async _load(ctx, id) {
    const raw = await ctx.stub.getState(evKey(id));
    if (!raw || raw.length === 0) throw new Error(`Evidence ${id} does not exist`);
    return JSON.parse(raw.toString());
  }

  async _appendEvent(ctx, ev, type, actor, counterparty) {
    const seq = ev.eventCount + 1;
    const event = {
      docType: 'event', evidenceId: ev.evidenceId, seq, type,
      actor, counterparty: counterparty || '', at: txTime(ctx), txId: ctx.stub.getTxID(),
    };
    await ctx.stub.putState(eventKey(ctx, ev.evidenceId, seq), Buffer.from(JSON.stringify(event)));
    ev.eventCount = seq;
    await ctx.stub.putState(evKey(ev.evidenceId), Buffer.from(JSON.stringify(ev)));
    return event;
  }

  // Called once when evidence is registered. The hash can never be changed afterwards.
  async CreateEvidence(ctx, evidenceId, caseId, sha256, sizeBytes, registeredBy) {
    if (!evidenceId || !caseId || !registeredBy) throw new Error('evidenceId, caseId and registeredBy are required');
    if (!HEX64.test(sha256)) throw new Error('sha256 must be 64 lowercase hex characters');
    const size = Number(sizeBytes);
    if (!Number.isFinite(size) || size < 0) throw new Error('sizeBytes must be a non-negative number');
    const existing = await ctx.stub.getState(evKey(evidenceId));
    if (existing && existing.length > 0) throw new Error(`Evidence ${evidenceId} already exists`);

    const ev = {
      docType: 'evidence', evidenceId, caseId, sha256, sizeBytes: size,
      registeredBy, createdAt: txTime(ctx), eventCount: 0,
    };
    await this._appendEvent(ctx, ev, 'registered', registeredBy, '');
    return JSON.stringify(ev);
  }

  // Add one custody event (transfer, receive, release, verify...). Append-only.
  async RecordEvent(ctx, evidenceId, eventType, actor, counterparty) {
    if (!EVENT_TYPES.includes(eventType)) throw new Error(`Unknown event type: ${eventType}`);
    if (eventType === 'registered') throw new Error('Use CreateEvidence to register evidence');
    if (!actor) throw new Error('actor is required');
    const ev = await this._load(ctx, evidenceId);
    const event = await this._appendEvent(ctx, ev, eventType, actor, counterparty);
    return JSON.stringify(event);
  }

  async GetEvidence(ctx, evidenceId) {
    return JSON.stringify(await this._load(ctx, evidenceId));
  }

  // Convenience for verification: just the recorded hash.
  async GetRecordedHash(ctx, evidenceId) {
    return (await this._load(ctx, evidenceId)).sha256;
  }

  // Full custody history, oldest first.
  async GetEvidenceHistory(ctx, evidenceId) {
    await this._load(ctx, evidenceId);
    const out = [];
    const it = await ctx.stub.getStateByPartialCompositeKey('EVENT', [evidenceId]);
    for (;;) {
      const r = await it.next();
      if (r.value && r.value.value.length > 0) out.push(JSON.parse(r.value.value.toString()));
      if (r.done) { await it.close(); break; }
    }
    out.sort((a, b) => a.seq - b.seq);
    return JSON.stringify(out);
  }
}

module.exports = EvidenceContract;
