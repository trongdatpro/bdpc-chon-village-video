const axios = require('axios');
require('dotenv').config();

async function testManual() {
    const orderCode = 123456; // Mock or use a previous one
    try {
        const url = `https://api-merchant.payos.vn/v2/payment-requests/${orderCode}`;
        const response = await axios.get(url, {
            headers: {
                'x-client-id': process.env.PAYOS_CLIENT_ID,
                'x-api-key': process.env.PAYOS_API_KEY
            }
        });
        console.log('Status:', response.status);
        console.log('Data:', JSON.stringify(response.data));
    } catch (e) {
        console.error('Error:', e.response ? e.response.data : e.message);
    }
}

// First, create a new one to get a valid orderCode
const { PayOS } = require('@payos/node');
const payos = new PayOS({
  clientId: process.env.PAYOS_CLIENT_ID,
  apiKey: process.env.PAYOS_API_KEY,
  checksumKey: process.env.PAYOS_CHECKSUM_KEY,
});

async function flow() {
    const body = {
        orderCode: Number(Date.now()),
        amount: 10000,
        description: "TEST MANUAL"
    };
    const c = await payos.paymentRequests.create(body);
    console.log('Created:', body.orderCode);
    
    // Now manual get
    const url = `https://api-merchant.payos.vn/v2/payment-requests/${body.orderCode}`;
    try {
        const response = await axios.get(url, {
            headers: {
                'x-client-id': process.env.PAYOS_CLIENT_ID,
                'x-api-key': process.env.PAYOS_API_KEY
            }
        });
        console.log('Manual Get Data:', JSON.stringify(response.data));
    } catch (e) {
        console.error('Manual Get Error:', e.response ? e.response.data : e.message);
    }
}

flow();
