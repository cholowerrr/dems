// The ledger "adapter". The rest of the app only talks to this file.
// LEDGER=dev    -> a local hash-chained file (works anywhere, used while building and testing)
// LEDGER=fabric -> the real Hyperledger Fabric network (added in step 4)
const mode = process.env.LEDGER || 'dev';

if (mode === 'dev') module.exports = require('./dev');
else if (mode === 'fabric') module.exports = require('./fabric');
else throw new Error('Unknown LEDGER mode: ' + mode);