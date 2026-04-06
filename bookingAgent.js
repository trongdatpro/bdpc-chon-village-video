const Anthropic = require("@anthropic-ai/sdk");
const axios = require("axios");
require("dotenv").config();

// Khởi tạo Claude
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * PHÂN TÍCH BILL BẰNG GEMINI AI
 * Trả về danh sách các chặng đặt phòng (Stitched Booking support)
 */
async function parseBill(billText) {
    const prompt = `
    Bạn là trợ lý đắc lực của Chồn Village Homestay Đà Lạt.
    Nhiệm vụ của bạn là đọc nội dung "Xác nhận thuê home" bên dưới và chuyển nó thành dữ liệu JSON chuẩn.

    DANH SÁCH PHÒNG HỢP LỆ (BẮT BUỘC DÙNG ID NÀY):
    - White_Room
    - Black_Room
    - Pink_Room
    - Green_Room
    - Gray_Room
    - Gold_Room

    YÊU CẦU:
    1. Trích xuất: Tên khách hàng, Ngày Check-in, Ngày Check-out, và Danh sách phòng được đặt.
    2. Nếu khách đặt NHIỀU PHÒNG cùng thời gian → gộp tất cả phòng đó vào 1 object với cùng checkin/checkout.
    3. Chỉ tách thành object riêng biệt khi khách ĐỔI PHÒNG (Stitched Booking) — tức là các phòng có NGÀY KHÁC NHAU.
    4. Định dạng ngày phải là YYYY-MM-DD.
    5. Trả về DUY NHẤT một mảng JSON các đối tượng.

    ĐỊNH DẠNG TRẢ VỀ:
    [{ "guestName": "...", "rooms": ["ID_PHONG_1", "ID_PHONG_2"], "checkin": "YYYY-MM-DD", "checkout": "YYYY-MM-DD" }]

    VÍ DỤ: Khách đặt Pink Room + Green Room từ 7/4 đến 10/4:
    [{ "guestName": "Nguyễn Văn A", "rooms": ["Pink_Room", "Green_Room"], "checkin": "2026-04-07", "checkout": "2026-04-10" }]

    NỘI DUNG BILL:
    ${billText}
    `;

    try {
        const response = await anthropic.messages.create({
            model: "claude-sonnet-4-5",
            max_tokens: 600,
            messages: [{ role: "user", content: prompt }]
        });
        const text = response.content[0].text;
        const jsonStr = text.replace(/```json|```/g, "").trim();
        const cleanedJson = jsonStr.substring(jsonStr.indexOf("["), jsonStr.lastIndexOf("]") + 1);
        return JSON.parse(cleanedJson);
    } catch (error) {
        console.error("[CLAUDE-PARSER] Lỗi phân tích Bill:", error.message);
        return [];
    }
}

/**
 * TRÍCH XUẤT TÊN SALE TỪ BILL
 * Tìm dòng bắt đầu bằng "s." hoặc "S." trong 5 dòng đầu
 */
function extractSaleName(billText) {
    const lines = billText.split('\n');
    const beforeHeader = [];

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        // Dừng khi gặp dòng XÁC NHẬN — có thể là Unicode Bold (\uD835)
        // hoặc dạng thường "XÁC NHẬN" / "BILL XÁC NHẬN"
        if (/\uD835/.test(trimmed)) break;
        if (/XÁC\s+NH[AẬ]N/i.test(trimmed)) break;
        beforeHeader.push(trimmed);
        if (beforeHeader.length >= 5) break;
    }

    // Lấy dòng cuối cùng trước "XÁC NHẬN" — đó là tên sale
    return beforeHeader.length > 0
        ? beforeHeader[beforeHeader.length - 1]
        : "Chồn Village";
}

/**
 * ĐIỀU PHỐI ĐỒNG BỘ 3 LỊCH
 */
// Chuyển YYYY-MM-DD sang DD/MM/YYYY cho GAS
function toVNDate(dateStr) {
    if (!dateStr) return "";
    const [y, m, d] = dateStr.split("-");
    return `${d}/${m}/${y}`;
}

async function syncToCalendarAgent(billText) {
    console.log("[AGENT] Bắt đầu xử lý Bill bằng Claude AI...");

    const bookings = await parseBill(billText);
    if (!bookings || bookings.length === 0) {
        console.error("[AGENT] AI không tìm thấy dữ liệu đặt phòng hợp lệ.");
        return { success: false, message: "AI không hiểu được nội dung Bill này. Kiểm tra lại định dạng bill nhé ní!" };
    }

    console.log(`[AGENT] Phát hiện ${bookings.length} chặng đặt phòng:`, JSON.stringify(bookings, null, 2));

    const SYNC_URLS = {
        duLieu: "https://script.google.com/macros/s/AKfycbyKFCNOVCLph-AbQUzfEGntVeMa8IbXhmzarRbKOsaMR1SnC-xtqJmIuBQScREiWrRj/exec",
        noiBo:  "https://script.google.com/macros/s/AKfycbwOSuLsT8v2n8OmzqG4QsMHRLWK7wIFfXMB78kAoB5N3YCQSodCNeqVLVP6GisMnRe-Eg/exec",
        sale:   "https://script.google.com/macros/s/AKfycbxRtX7kmzcpdzHPBzgjlWX7wznOHQKJeuOHafp40awjCTVsTo5etMVdN996XjujqLnzIw/exec"
    };

    const results = [];
    const saleName = extractSaleName(billText);

    for (const booking of bookings) {
        // Hỗ trợ cả format cũ (room) và mới (rooms)
        const rooms = booking.rooms || (booking.room ? [booking.room] : []);
        if (rooms.length === 0) continue;

        // Tất cả phòng trong cùng booking dùng CÙNG date range
        for (const room of rooms) {
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

            console.log(`[AGENT] Payload gửi GAS [${room}]:`, booking.checkin, "→", booking.checkout);

            const syncPromises = Object.entries(SYNC_URLS).map(([key, url]) => {
                return axios.post(url, { ...payload, target: key }, {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 15000,
                    maxRedirects: 5
                })
                    .then(res => {
                        console.log(`[AGENT] GAS [${key}][${room}] response:`, res.status, JSON.stringify(res.data));
                        return { sheet: key, status: res.status, response: res.data };
                    })
                    .catch(e => {
                        console.error(`[AGENT] GAS [${key}][${room}] ERROR:`, e.message);
                        return { sheet: key, error: e.message };
                    });
            });

            const syncResults = await Promise.all(syncPromises);
            results.push({ booking: room, guest: booking.guestName, syncResults });
        }
    }

    const allOk = results.every(r => r.syncResults.every(s => !s.error));
    return {
        success: true,
        allSheetsOk: allOk,
        message: allOk
            ? `Ní ơi! Chồn đã đồng bộ xong lên cả 3 lịch rồi nhé!`
            : `Chồn đồng bộ xong nhưng có lỗi, ní kiểm tra console nhé!`,
        details: results
    };
}

module.exports = { syncToCalendarAgent, parseBill };
