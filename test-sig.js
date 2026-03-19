const crypto = require('crypto');

const clientId = '0ea68cf8-0a62-48c2-9c5e-a11f811609e7';
const apiKey = '541d6744-9240-4989-a6f4-19db81304652';
const checksumKey = '78b810ecdd1df78fa9fd8eb398787197ae969e22b11f3504107e9d24418d2453';

function createSignature(data, key) {
    const { amount, cancelUrl, description, orderCode, returnUrl } = data;
    const dataStr = `amount=${amount}&cancelUrl=${cancelUrl}&description=${description}&orderCode=${orderCode}&returnUrl=${returnUrl}`;
    console.log('String to sign:', dataStr);
    return crypto.createHmac('sha256', key).update(dataStr).digest('hex');
}

const testData = {
    amount: 10000,
    cancelUrl: 'http://localhost:3000/checkout.html',
    description: 'THANHTOAN',
    orderCode: 123456,
    returnUrl: 'http://localhost:3000/checkout.html'
};

const signature = createSignature(testData, checksumKey);
console.log('Generated Signature:', signature);

// Try calling PayOS directly with this signature
const https = require('https');

const postData = JSON.stringify({
    ...testData,
    signature: signature
});

const options = {
    hostname: 'api-merchant.payos.vn',
    port: 443,
    path: '/v2/payment-requests',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'x-client-id': clientId,
        'x-api-key': apiKey
    }
};

const req = https.request(options, (res) => {
    let rawData = '';
    res.on('data', (chunk) => rawData += chunk);
    res.on('end', () => {
        console.log('PayOS Response:', rawData);
    });
});

req.on('error', (e) => console.error('Error:', e));
req.write(postData);
req.end();
