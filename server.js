const express = require('express');
const cors = require('cors');
const { PayOS } = require('@payos/node');
const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');
require('dotenv').config();

const path = require('path');
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); 

// 1. PayOS Initialization
const payos = new PayOS({
  clientId: process.env.PAYOS_CLIENT_ID,
  apiKey: process.env.PAYOS_API_KEY,
  checksumKey: process.env.PAYOS_CHECKSUM_KEY,
});

// 2. Create Payment Link
app.post('/create-payment-link', async (req, res) => {
    try {
        const { amount, description } = req.body;
        if (!amount || amount < 1000) {
            return res.status(400).json({ error: "Số tiền thanh toán không hợp lệ (tối thiểu 1,000 VNĐ)" });
        }
        const orderCode = Number(Date.now());
        const paymentLinkRequest = {
            orderCode: orderCode,
            amount: Number(amount),
            description: (description || "Thanh toan").normalize("NFD").replace(/[\u0300-\u036f]/g, "").substring(0, 25), 
            cancelUrl: "http://localhost:3000/checkout.html",
            returnUrl: "http://localhost:3000/checkout.html"
        };
        const paymentLink = await payos.paymentRequests.create(paymentLinkRequest);
        res.json(paymentLink);
    } catch (error) {
        console.error("[PAYOS-ERROR]:", error.message);
        res.status(500).json({ error: "Lỗi hệ thống nội bộ" });
    }
});

/**
 * DIRECT CALENDAR SYNC (NO AI)
 * Moved from bookingAgent.js and simplified to use direct data
 */
const SYNC_URLS = {
    duLieu: "https://script.google.com/macros/s/AKfycbyKFCNOVCLph-AbQUzfEGntVeMa8IbXhmzarRbKOsaMR1SnC-xtqJmIuBQScREiWrRj/exec",
    noiBo:  "https://script.google.com/macros/s/AKfycbwOSuLsT8v2n8OmzqG4QsMHRLWK7wIFfXMB78kAoB5N3YCQSodCNeqVLVP6GisMnRe-Eg/exec",
    sale:   "https://script.google.com/macros/s/AKfycbxRtX7kmzcpdzHPBzgjlWX7wznOHQKJeuOHafp40awjCTVsTo5etMVdN996XjujqLnzIw/exec"
};

const toVNDate = (dateStr) => {
    if (!dateStr) return "";
    // Handle both YYYY-MM-DD and ISO strings
    const parts = dateStr.split('T')[0].split("-");
    if (parts.length < 3) return dateStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

const extractSaleName = (billText) => {
    const lines = billText.split('\n');
    const beforeHeader = [];
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (/\uD835/.test(trimmed) || /XÁC\s+NH[AẬ]N/i.test(trimmed)) break;
        beforeHeader.push(trimmed);
        if (beforeHeader.length >= 5) break;
    }
    return beforeHeader.length > 0 ? beforeHeader[beforeHeader.length - 1] : "Chồn Village";
};

// Map UI room names to IDs expected by GAS
const mapRoomId = (name) => {
    if (!name) return "Unknown_Room";
    const clean = name.trim().replace(/ Room$/i, '').replace(/ /g, '_');
    return clean.includes('_Room') ? clean : `${clean}_Room`;
};

app.get('/get-order/:orderCode', async (req, res) => {
    try {
        const param = req.params.orderCode;
        const orderId = /^\d+$/.test(param) ? Number(param) : param;
        const order = await payos.paymentRequests.get(orderId);
        res.json(order);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Anthropic client (lazy init)
let anthropic = null;
const getAnthropicClient = () => {
    if (!anthropic && process.env.ANTHROPIC_API_KEY) {
        anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }
    return anthropic;
};

const ADMIN_SYSTEM_PROMPT = `Bạn là trợ lý quản lý Chồn Village - homestay 6 phòng ở Đà Lạt.
Các phòng: Pink Room, Gray Room, Green Room, Black Room, White Room, Gold Room.
Địa chỉ: 07 Thánh Tâm - Phường 5, Tp. Đà Lạt. Zalo: 0889717713 (Mr. Trọng Đạt).

Nhiệm vụ của bạn là hỗ trợ chủ nhà:
- Trả lời câu hỏi về lịch đặt phòng, giá, quy định
- Soạn bill xác nhận đặt phòng khi được yêu cầu

TUYỆT ĐỐI KHÔNG tự tạo bill khi chưa được yêu cầu rõ ràng.
Khi tạo bill, phải hỏi đầy đủ: tên khách, số điện thoại, phòng, ngày nhận, ngày trả, số người, giá.
Trả lời bằng tiếng Việt, ngắn gọn và thân thiện.`;

// Admin Chat API
app.post('/api/admin-chat', async (req, res) => {
    try {
        const client = getAnthropicClient();
        if (!client) {
            return res.status(503).json({ error: "Tính năng chat chưa được cấu hình (thiếu ANTHROPIC_API_KEY)" });
        }

        const { messages } = req.body;
        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({ error: "Thiếu nội dung tin nhắn" });
        }

        const response = await client.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 1024,
            system: ADMIN_SYSTEM_PROMPT,
            messages: messages.map(m => ({ role: m.role, content: m.content }))
        });

        const reply = response.content[0]?.text || "Chồn không hiểu, ní thử lại nhé!";
        const isBill = reply.includes("BILL") || reply.includes("XÁC NHẬN ĐẶT PHÒNG");
        res.json({ reply, isBill });
    } catch (error) {
        console.error("[ADMIN-CHAT] Error:", error.message);
        res.status(500).json({ error: "Lỗi kết nối AI: " + error.message });
    }
});

// Parse bill text using Claude to extract structured booking data
const parseBillWithClaude = async (billText) => {
    const client = getAnthropicClient();
    if (!client) return null;

    try {
        const response = await client.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 512,
            messages: [{
                role: "user",
                content: `Từ nội dung bill sau, hãy trích xuất thông tin và trả về JSON (không có markdown):
{"guestName": "tên khách", "phone": "số điện thoại", "rooms": [{"name": "tên phòng", "checkin": "YYYY-MM-DD", "checkout": "YYYY-MM-DD"}]}

Bill:
${billText.substring(0, 1500)}`
            }]
        });

        const text = response.content[0]?.text || "";
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) return JSON.parse(jsonMatch[0]);
        return null;
    } catch (e) {
        console.error("[PARSE-BILL] Error:", e.message);
        return null;
    }
};

// Improved: parse bill text when roomsData is missing
app.post('/api/agent-sync-bill', async (req, res) => {
    try {
        const { billText, bookingData, roomsData } = req.body;
        if (!billText) return res.status(400).json({ error: "Thiếu nội dung bill" });

        console.log("[SYNC] Bắt đầu đồng bộ dữ liệu...");

        let bookings = [];

        // If structured data provided (from checkout.js)
        if (roomsData && Array.isArray(roomsData) && roomsData.length > 0) {
            const groups = {};
            roomsData.forEach(r => {
                const key = `${r.checkin}_${r.checkout}`;
                if (!groups[key]) groups[key] = { checkin: r.checkin, checkout: r.checkout, rooms: [] };
                groups[key].rooms.push(mapRoomId(r.name));
            });

            Object.values(groups).forEach(g => {
                bookings.push({
                    guestName: bookingData?.phone || "Khách đặt web",
                    rooms: g.rooms,
                    checkin: g.checkin,
                    checkout: g.checkout
                });
            });
        } else {
            // Fallback: parse billText with Claude
            console.log("[SYNC] Không có dữ liệu cấu trúc, thử parse bill bằng Claude...");
            const parsed = await parseBillWithClaude(billText);
            if (parsed && parsed.rooms && Array.isArray(parsed.rooms)) {
                parsed.rooms.forEach(r => {
                    bookings.push({
                        guestName: parsed.guestName || parsed.phone || "Khách đặt web",
                        rooms: [mapRoomId(r.name)],
                        checkin: r.checkin,
                        checkout: r.checkout
                    });
                });
            }
        }

        if (bookings.length === 0) {
            console.warn("[SYNC] Không thể xác định thông tin đặt phòng.");
            return res.json({ success: false, message: "Không thể đọc thông tin phòng từ bill. Vui lòng sync thủ công." });
        }

        const saleName = extractSaleName(billText);
        const results = [];

        for (const booking of bookings) {
            for (const room of booking.rooms) {
                const payload = {
                    guestName: booking.guestName,
                    saleName: saleName,
                    room: room,
                    checkin: toVNDate(booking.checkin),
                    checkout: toVNDate(booking.checkout),
                    checkinISO: booking.checkin,
                    checkoutISO: booking.checkout,
                    billText: billText,
                    action: "sync_all"
                };

                const syncPromises = Object.entries(SYNC_URLS).map(([key, url]) => {
                    return axios.post(url, { ...payload, target: key }, {
                        headers: { 'Content-Type': 'application/json' },
                        timeout: 15000
                    })
                    .then(r => ({ sheet: key, status: r.status }))
                    .catch(e => ({ sheet: key, error: e.message }));
                });

                const syncResults = await Promise.all(syncPromises);
                results.push({ room, syncResults });
            }
        }

        const allOk = results.every(r => r.syncResults.every(s => !s.error));
        res.json({
            success: true,
            message: allOk ? "Đã đồng bộ xong lên 3 lịch!" : "Đồng bộ có lỗi, ní kiểm tra lại nhé!",
            allSheetsOk: allOk,
            details: results.map(r => ({
                room: r.room,
                syncResults: r.syncResults
            }))
        });
    } catch (error) {
        console.error("Lỗi Sync Bill:", error.message);
        res.status(500).json({ success: false, message: "Lỗi Server rồi ní ơi!" });
    }
});

app.listen(3000, () => {
    console.log("🚀 SERVER CHON VILLAGE TẠI CỔNG 3000");
});