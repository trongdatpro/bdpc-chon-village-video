const { PayOS } = require('@payos/node');
require('dotenv').config();

const payos = new PayOS({
  clientId: process.env.PAYOS_CLIENT_ID,
  apiKey: process.env.PAYOS_API_KEY,
  checksumKey: process.env.PAYOS_CHECKSUM_KEY,
});

console.log('PayOS keys:', Object.keys(payos));
if (payos.paymentRequests) {
    console.log('paymentRequests keys:', Object.keys(payos.paymentRequests));
}
