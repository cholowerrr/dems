// Real Hyperledger Fabric ledger adapter (used when LEDGER=fabric).
// Same functions and return values as dev.js, so the rest of the app does not change.
//
// Only hashes + custody events go on-chain (see chaincode/lib/evidenceContract.js).
// The evidence file itself stays on the station server's disk.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const grpc = require('@grpc/grpc-js');
const { connect, hash, signers } = require('@hyperledger/fabric-gateway');

const cfg = {
  peerEndpoint: process.env.FABRIC_PEER_ENDPOINT || 'localhost:7051',
  peerHostAlias: process.env.FABRIC_PEER_HOST_ALIAS || 'peer0.org1.example.com',
  mspId: process.env.FABRIC_MSP_ID || 'Org1MSP',
  channel: process.env.FABRIC_CHANNEL || 'evidencechannel',
  chaincode: process.env.FABRIC_CHAINCODE || 'evidence',
  contract: process.env.FABRIC_CONTRACT || 'EvidenceContract',
  identityDir: process.env.FABRIC_IDENTITY_DIR || path.join(__dirname, '..', 'fabric_identity'),
};

const decoder = new TextDecoder();
let conn = null; // { client, gateway, contract, network }

function getConnection() {
  if (conn) return conn;
  const read = (f) => fs.readFileSync(path.join(cfg.identityDir, f));
  let tls, cert, key;
  try { tls = read('tls-ca.crt'); cert = read('cert.pem'); key = read('key.pem'); }
  catch (e) {
    throw new Error(`Fabric identity files not found in ${cfg.identityDir} (need tls-ca.crt, cert.pem, key.pem): ${e.message}`);
  }
  const client = new grpc.Client(cfg.peerEndpoint, grpc.credentials.createSsl(tls), {
    'grpc.ssl_target_name_override': cfg.peerHostAlias,
  });
  const gateway = connect({
    client,
    identity: { mspId: cfg.mspId, credentials: cert },
    signer: signers.newPrivateKeySigner(crypto.createPrivateKey(key)),
    hash: hash.sha256,
    evaluateOptions: () => ({ deadline: Date.now() + 10_000 }),
    endorseOptions: () => ({ deadline: Date.now() + 20_000 }),
    submitOptions: () => ({ deadline: Date.now() + 10_000 }),
    commitStatusOptions: () => ({ deadline: Date.now() + 60_000 }),
  });
  const network = gateway.getNetwork(cfg.channel);
  conn = { client, gateway, network, contract: network.getContract(cfg.chaincode, cfg.contract) };
  return conn;
}

// Fabric errors carry the chaincode message in err.details[].message
function errorText(err) {
  const parts = [err && err.message];
  for (const d of (err && err.details) || []) parts.push(d.message);
  return parts.filter(Boolean).join(' | ');
}

// Write transaction: endorse -> order -> commit. Returns { txId, payloadBytes, ms }.
// ms = whole write time (endorsement + ordering + block commit).
// payloadBytes = size of the arguments sent in the transaction.
async function submit(fn, args) {
  const { contract } = getConnection();
  const start = process.hrtime.bigint();
  try {
    const proposal = contract.newProposal(fn, { arguments: args });
    const tx = await proposal.endorse();
    const commit = await tx.submit();
    const status = await commit.getStatus();
    if (!status.successful) {
      throw new Error(`Transaction ${status.transactionId} failed to commit (code ${status.code})`);
    }
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const payloadBytes = args.reduce((n, a) => n + Buffer.byteLength(String(a)), 0);
    return { txId: tx.getTransactionId(), payloadBytes, ms };
  } catch (err) {
    throw new Error(`Ledger write failed (${fn}): ${errorText(err)}`);
  }
}

async function query(fn, args) {
  const { contract } = getConnection();
  const bytes = await contract.evaluateTransaction(fn, ...args);
  return decoder.decode(bytes);
}

async function createEvidence({ evidenceId, caseId, sha256, sizeBytes, registeredBy }) {
  return submit('CreateEvidence', [evidenceId, String(caseId), sha256, String(sizeBytes), registeredBy]);
}

// actor = who did it; counterparty = who/where it went, or the verification result.
async function recordEvent({ evidenceId, type, fromUser, toUser, toOffice, result }) {
  const actor = fromUser || toUser || 'system';
  const counterparty = toUser || toOffice || result || '';
  return submit('RecordEvent', [evidenceId, type, String(actor), String(counterparty)]);
}

// The hash recorded when the evidence was registered, or null if the ledger has no such evidence.
// Network/other errors are thrown on purpose: "ledger unreachable" must not look like "TAMPERED".
async function getRecordedHash(evidenceId) {
  try {
    return await query('GetRecordedHash', [evidenceId]);
  } catch (err) {
    if (/does not exist/i.test(errorText(err))) return null;
    throw new Error(`Ledger read failed: ${errorText(err)}`);
  }
}

// Same shape as dev.js entries: { seq, evidenceId, type, payload, ts, txId }
async function getHistory(evidenceId) {
  let events;
  try { events = JSON.parse(await query('GetEvidenceHistory', [evidenceId])); }
  catch (err) {
    if (/does not exist/i.test(errorText(err))) return [];
    throw new Error(`Ledger read failed: ${errorText(err)}`);
  }
  return events.map((e) => ({
    seq: e.seq,
    evidenceId: e.evidenceId,
    type: e.type === 'registered' ? 'EVIDENCE_CREATED' : 'CUSTODY_EVENT',
    payload: { type: e.type, actor: e.actor, counterparty: e.counterparty },
    ts: e.at,
    txId: e.txId,
  }));
}

// On Fabric, block hash-chaining and signatures are checked by the peers themselves.
// Here we confirm the peer is reachable and report the chain height.
async function verifyChain() {
  try {
    const { network } = getConnection();
    const { common } = require('@hyperledger/fabric-protos');
    const bytes = await network.getContract('qscc').evaluateTransaction('GetChainInfo', cfg.channel);
    const info = common.BlockchainInfo.deserializeBinary(bytes);
    return { ok: true, height: info.getHeight() };
  } catch (err) {
    return { ok: false, error: errorText(err) };
  }
}

function close() {
  if (!conn) return;
  conn.gateway.close();
  conn.client.close();
  conn = null;
}

module.exports = { createEvidence, recordEvent, getRecordedHash, getHistory, verifyChain, close };
