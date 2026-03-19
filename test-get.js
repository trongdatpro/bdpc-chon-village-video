const { PayOS } = require('@payos/node');
require('dotenv').config();

const payos = new PayOS({
  clientId: process.env.PAYOS_CLIENT_ID,
  apiKey: process.env.PAYOS_API_KEY,
  checksumKey: process.env.PAYOS_CHECKSUM_KEY,
});

const orderCode = 123456; // Use a real orderCode if you have one, or just test if the method exists
async function test() {
    try {
        const body = {
            orderCode: Number(Date.now()),
            amount: 10000,
            description: "TEST GET"
        };
        const createRes = await payos.paymentRequests.create(body);
        console.log('Created:', createRes.checkoutUrl);
        
        const getRes = await payos.paymentRequests.get(body.orderCode);
        console.log('Get Response keys:', Object.keys(getRes));
        console.log('QR Code exists:', !!getRes.qrCode);
        console.log('Account No:', getRes.accountNumber);
    } catch (e) {
        console.error('Error:', e.message);
    }
}
test();
