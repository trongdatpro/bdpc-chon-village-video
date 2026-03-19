const express = require('express');
const cors = require('cors');
// Lấy đúng đoạn code: const { PayOS } = require('@payos/node');
const { PayOS } = require('@payos/node'); 
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Đoạn 1: Khởi tạo (Lấy từ phần Basic usage của bạn)
const payos = new PayOS({
  clientId: process.env.PAYOS_CLIENT_ID,
  apiKey: process.env.PAYOS_API_KEY,
  checksumKey: process.env.PAYOS_CHECKSUM_KEY,
});

// Đoạn 2: Tạo link thanh toán (Lấy từ phần paymentRequests.create)
app.post('/create-payment-link', async (req, res) => {
    try {
        const { amount, description } = req.body;
        const orderCode = Number(Date.now().toString().slice(-6));

        const paymentLinkRequest = {
            orderCode: orderCode,
            amount: Number(amount),
            description: (description || "Chon Village").substring(0, 25),
            cancelUrl: "http://localhost:3000", // Bạn có thể sửa sau
            returnUrl: "http://localhost:3000"  // Bạn có thể sửa sau
        };

        const paymentLink = await payos.paymentRequests.create(paymentLinkRequest);
        
        // Trả link QR về cho file rooms.js
        res.json({ checkoutUrl: paymentLink.checkoutUrl });

    } catch (error) {
        console.error("Lỗi PayOS:", error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(3000, () => {
    console.log("-----------------------------------------");
    console.log("🚀 SERVER CHON VILLAGE DA CHAY TAI CONG 3000");
    console.log("-----------------------------------------");
});