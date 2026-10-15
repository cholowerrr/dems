// Placeholder. The real Hyperledger Fabric connection is added in step 4.
const notReady = () => { throw new Error('Fabric ledger is not set up yet. Use LEDGER=dev for now.'); };
module.exports = {
  createEvidence: notReady, recordEvent: notReady, getRecordedHash: notReady,
  getHistory: notReady, verifyChain: notReady,
};