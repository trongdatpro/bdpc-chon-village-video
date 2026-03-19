const https = require('https');
const { PayOS } = require('@payos/node');
require('dotenv').config();

const payos = new PayOS({
  clientId: process.env.PAYOS_CLIENT_ID,
  apiKey: process.env.PAYOS_API_KEY,
  checksumKey: process.env.PAYOS_CHECKSUM_KEY,
});

async function flow() {
    const orderCode = Number(Date.now());
    const body = {
        orderCode: orderCode,
        amount: 10000,
        description: "TEST MANUAL"
    };

    console.log('--- Creating Payment Link ---');
    try {
        const createRes = await payos.paymentRequests.create(body);
        console.log('Created. checkoutUrl:', createRes.checkoutUrl);
    } catch (err) {
        console.error('Create Error:', err.message);
        return;
    }

    console.log('\n--- Fetching Manual Data (No SDK) ---');
    const options = {
        hostname: 'api-merchant.payos.vn',
        path: `/v2/payment-requests/${orderCode}`,
        method: 'GET',
        headers: {
            'x-client-id': process.env.PAYOS_CLIENT_ID,
            'x-api-key': process.env.PAYOS_API_KEY,
            'Content-Type': 'application/json'
        }
    };

    const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
            console.log('Status:', res.statusCode);
            console.log('Raw Data:', data);
            
            try {
                const json = JSON.parse(data);
                if (json.data) {
                    console.log('FOUND DATA!');
                    console.log('qrCode:', !!json.data.qrCode);
                    console.log('accountNumber:', json.data.accountNumber);
                } else {
                    console.log('NO DATA FIELD IN RESPONSE');
                }
            } catch (e) {
                console.error('JSON Parse Error:', e.message);
            }
        });
    });

    req.on('error', (e) => {
        console.error('Request Error:', e.message);
    });

    req.end();
}

flow();
