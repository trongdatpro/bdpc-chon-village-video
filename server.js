const express = require('express');
const cors = require('cors');
const { PayOS } = require('@payos/node');
const Anthropic = require('@anthropic-ai/sdk');
const { syncToCalendarAgent } = require("./bookingAgent");
require('dotenv').config();

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

// API: Agent tiếp nhận và đồng bộ Bill
app.post('/api/agent-sync-bill', async (req, res) => {
    try {
        const { billText } = req.body;
        if (!billText) return res.status(400).json({ error: "Thiếu nội dung bill" });
        
        console.log("[AGENT-SYNC] Đang nhận bill từ Admin...");
        const result = await syncToCalendarAgent(billText);
        res.json(result);
    } catch (error) {
        console.error("Lỗi Agent Sync Bill:", error.message);
        res.status(500).json({ success: false, message: "Lỗi Server rồi ní ơi!" });
    }
});

// API: Admin Chat — Trợ lý Chồn Village (dùng Gemini)
const ADMIN_SYSTEM_PROMPT = `Bạn là "Chú Chồn", trợ lý AI thông minh của homestay Chồn Village tại Đà Lạt.
Bạn hỗ trợ Admin quản lý homestay. Trả lời bằng tiếng Việt, ngắn gọn (2-4 câu), thân thiện.

THÔNG TIN HỆ THỐNG:
- 6 phòng: White, Black, Pink, Green, Gray, Gold
- Sức chứa: tối đa 3 người/phòng. Green Room: ưu tiên trẻ dưới 6 tuổi.
- Đặt phòng -> Thanh toán PayOS -> Agent đồng bộ Sheets.

Phong cách: Dùng "ní" để gọi admin. Trả lời chuyên nghiệp nhưng vẫn gần gũi. Emoji 🦊.`;

// API: Guest Chat — Chú Chồn hỏi thăm khách đặt phòng (dùng Gemini)
const GUEST_SYSTEM_PROMPT = `Bạn là "Chú Chồn", mascot dễ thương của Chồn Village Homestay tại Đà Lạt.
Nói chuyện với khách đang đặt phòng. Trả lời bằng tiếng Việt, thân thiện, vui vẻ.

THÔNG TIN TƯ VẤN:
- 6 phòng: White, Black, Pink, Green, Gray, Gold (Cao cấp)
- Sức chứa: tối đa 3 người/phòng. Green Room cho gia đình có bé nhỏ.
- Ưu tiên đặt từ 2 đêm. Thanh toán qua PayOS tiện lợi.

Phong cách: Gọi khách là "ní", trả lời tự nhiên, dễ thương và súc tích (khoảng 2-3 câu). Emoji phù hợp.`;

async function claudeChat(systemPrompt, messages) {
    const response = await anthropic.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 500,
        system: systemPrompt,
        messages: messages.map(m => ({ role: m.role, content: m.content }))
    });
    return response.content[0].text;
}

app.post('/api/admin-chat', async (req, res) => {
    try {
        const { messages } = req.body;
        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: "Thiếu messages" });
        }
        console.log("[ADMIN-CHAT] Nhận câu hỏi từ Admin...");
        const reply = await claudeChat(ADMIN_SYSTEM_PROMPT, messages);
        res.json({ reply });
    } catch (error) {
        console.error("Lỗi Admin Chat:", error.message);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/guest-chat', async (req, res) => {
    try {
        const { messages } = req.body;
        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: "Thiếu messages" });
        }
        console.log("[GUEST-CHAT] Khách đang hỏi...");
        const reply = await claudeChat(GUEST_SYSTEM_PROMPT, messages);
        res.json({ reply });
    } catch (error) {
        console.error("Lỗi Guest Chat:", error.message);
        res.status(500).json({ error: error.message });
    }
});

// --- Xoá endpoint trùng ở đây ---

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