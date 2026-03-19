const { PayOS } = require('@payos/node');
require('dotenv').config();

const payos = new PayOS({
  clientId: process.env.PAYOS_CLIENT_ID,
  apiKey: process.env.PAYOS_API_KEY,
  checksumKey: process.env.PAYOS_CHECKSUM_KEY,
});

async function testSmall() {
    const orderCode = Number(Date.now()); // Unique
    const body = {
        orderCode: orderCode,
        amount: 10000,
        description: "THANHTOAN",
        cancelUrl: "http://localhost:3000/checkout.html",
        returnUrl: "http://localhost:3000/checkout.html"
    };

    console.log('--- Testing with Complete Body ---');
    try {
        const createRes = await payos.paymentRequests.create(body);
        console.log('SUCCESS! checkoutUrl:', createRes.checkoutUrl);
        console.log('Full Response:', JSON.stringify(createRes));
    } catch (err) {
        console.error('FAILED:', err.message);
    }
}

testSmall();
