const express = require('express');
const cors = require('cors');
// Lấy đúng đoạn code: const { PayOS } = require('@payos/node');
const { PayOS } = require('@payos/node'); 
require('dotenv').config();

const path = require('path');
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // Serve static files from current directory

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
        // Đảm bảo orderCode là số nguyên duy nhất
        const orderCode = Number(Date.now());

        console.log(`[PAYOS] Đang tạo link thanh toán: ${orderCode} | Số tiền: ${amount}`);

        const paymentLinkRequest = {
            orderCode: orderCode,
            amount: Number(amount),
            description: (description || "Thanh toan Chon Village").normalize("NFD").replace(/[\u0300-\u036f]/g, ""), 
            cancelUrl: "http://localhost:3000/checkout.html",
            returnUrl: "http://localhost:3000/checkout.html"
        };

        const paymentLink = await payos.paymentRequests.create(paymentLinkRequest);
        console.log("[PAYOS] OK! qrCode exists:", !!paymentLink.qrCode);
        
        // Trả toàn bộ thông tin về cho frontend
        res.json(paymentLink);

    } catch (error) {
        console.error("Lỗi PayOS:", error.message);
        // Trả về mã lỗi cụ thể để giúp debug
        res.status(500).json({ 
            error: error.message,
            tip: error.message.includes("signature") ? "Vui lòng kiểm tra lại CHECKSUM_KEY trong file .env" : "Kiểm tra kết nối mạng hoặc PayOS Dashboard"
        });
    }
});

// Đoạn 3: Kiểm tra trạng thái đơn hàng (v2 SDK sử dụng paymentRequests.get)
app.get('/get-order/:orderCode', async (req, res) => {
    try {
        const param = req.params.orderCode;
        // Nếu param chỉ toàn số thì chuyển sang Number, nếu có chữ (GUID) thì giữ String
        const orderId = /^\d+$/.test(param) ? Number(param) : param;
        
        console.log(`[PAYOS] Check Status Request for Order: ${orderId}`);
        
        const order = await payos.paymentRequests.get(orderId);
        
        console.log(`[PAYOS] Result for ${orderId}:`, order.status);
        res.json(order);
    } catch (error) {
        console.error("Lỗi API get-order:", error.message);
        res.status(500).json({ error: error.message });
    }
});

app.listen(3000, () => {
    console.log("-----------------------------------------");
    console.log("🚀 SERVER CHON VILLAGE DA CHAY TAI CONG 3000");
    console.log("-----------------------------------------");
});