const { PayOS } = require('@payos/node');
require('dotenv').config();

const payos = new PayOS({
  clientId: process.env.PAYOS_CLIENT_ID,
  apiKey: process.env.PAYOS_API_KEY,
  checksumKey: process.env.PAYOS_CHECKSUM_KEY,
});

function getAllMethods(obj) {
    let methods = new Set();
    while (obj = Object.getPrototypeOf(obj)) {
        let keys = Object.getOwnPropertyNames(obj);
        keys.forEach(k => methods.add(k));
    }
    return Array.from(methods);
}

console.log('All methods on payos instance:', getAllMethods(payos));
