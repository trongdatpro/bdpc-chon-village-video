// --- GLOBAL CONFIG & CORE UTILITIES ---
const fetchJSONP = (url) => new Promise((resolve) => {
    const cbName = 'gvizCb_' + Date.now() + Math.floor(Math.random() * 10000);
    const s = document.createElement('script');
    const timeout = setTimeout(() => {
        delete window[cbName];
        if (s.parentNode) document.head.removeChild(s);
        resolve(null);
    }, 10000);
    window[cbName] = (res) => {
        clearTimeout(timeout);
        delete window[cbName];
        if (s.parentNode) document.head.removeChild(s);
        resolve(res);
    };
    s.src = url + (url.includes('?') ? '&' : '?') + 'tqx=out:json;responseHandler:' + cbName;
    document.head.appendChild(s);
});

const getStr = (d) => {
    if (!d || !(d instanceof Date)) return "";
    const tz = d.getTimezoneOffset() * 60000;
    return (new Date(d - tz)).toISOString().split('T')[0];
};

const formatDateObj = (d) => {
    if (!d || !(d instanceof Date)) return "";
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

const formatDateShort = (d) => {
    if (!d || !(d instanceof Date)) return "";
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const renderCurrency = (val) => {
    if (val === undefined || val === null || isNaN(val)) return "0";
    return val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
};

const parseLocal = (dateStr) => {
    if (!dateStr) return null;
    const [y, m, d] = dateStr.split('-');
    return new Date(y, m - 1, d);
};

const isBooked = (s) => {
    if (!s) return false;
    const clean = String(s).normalize('NFC').trim().toLowerCase();
    if (clean.includes('hủy')) return false;
    return clean.includes('đặt') || clean.includes('cọc') || clean.includes('thanh toán') || clean.includes('đóng') || clean.includes('booked') || clean === 'b';
};

const convertGDriveUrl = (url, isVideo = false) => {
    if (!url) return "";
    let fileId = "";
    const idMatches = url.match(/\/d\/(.+?)\//) || url.match(/\/d\/(.+?)$/) || url.match(/id=(.+?)(&|$)/);
    if (idMatches && idMatches[1]) fileId = idMatches[1].split(/[?&]/)[0];
    if (fileId) return isVideo ? `https://drive.google.com/file/d/${fileId}/preview` : `https://drive.google.com/thumbnail?id=${fileId}&sz=w1600`;
    return url;
};

// Global State
let selectedRooms = [];
let adults = 2;
let children = 0;
let dynamicPolicyData = [];
let scheduleData = {};
let pricingData = {};
let localRooms = [];
let bookingState = {};
let isCheckingPolicy = false;
let checkinDate, checkoutDate;

function uiLog(...args) {
    const debugEl = document.getElementById('debug-console');
    if (!debugEl) return;
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    const logItem = document.createElement('div');
    logItem.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    debugEl.prepend(logItem);
}

document.addEventListener('DOMContentLoaded', async () => {
    uiLog("Init Room Script...");

    // --- 0. Post-Payment Cleanup Logic (New Requirement) ---
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('status') === 'PAID' || sessionStorage.getItem('chonVillageLastBooking')) {
        console.log("[CLEANUP] Success detected. Clearing selections...");
        localStorage.removeItem('chonVillageSelectedRooms_Stored');
        sessionStorage.removeItem('chonVillageSelectedRooms');
        sessionStorage.removeItem('chonVillageSelectedRoom');

        // Clean URL to prevent re-clearing on F5 (preserving other params if needed)
        if (urlParams.get('status') === 'PAID') {
            const cleanUrl = window.location.origin + window.location.pathname;
            window.history.replaceState({}, document.title, cleanUrl);
        }
    }

    const summaryBar = document.getElementById('booking-summary-bar');
    const changeDateBtn = document.getElementById('change-date-btn');
    const headerTitle = document.getElementById('header-title');
    const headerChangeDateBtn = document.getElementById('header-change-date-btn');

    // 1. Check Session Storage
    const bookingDataStr = sessionStorage.getItem('chonVillageBooking');
    let bookingData = {};
    try {
        bookingData = bookingDataStr ? JSON.parse(bookingDataStr) : {};
    } catch (e) {
        console.error("Failed to parse bookingData", e);
    }

    // Defensive defaults if index data is missing (v11.18 stability fix)
    if (!bookingData.checkin) {
        const d1 = new Date();
        const d2 = new Date(); d2.setDate(d2.getDate() + 1);
        bookingData.checkin = d1.toISOString().split('T')[0];
        bookingData.checkout = d2.toISOString().split('T')[0];
        bookingData.adults = 2;
        bookingData.children = 0;
        uiLog("Booking data missing from session, using defaults.");
    }
    
    adults = parseInt(bookingData.adults);
    if (isNaN(adults)) adults = 2; // Default to 2 adults if no data present
    children = parseInt(bookingData.children) || 0;

    const childrenAgesStr = bookingData.childrenAgeCategory || "";
    const childrenAges = childrenAgesStr ? childrenAgesStr.split(',').map(a => parseInt(a)) : [];
    const isUnder6 = childrenAges.some(age => age > 0 && age < 6);

    checkinDate = parseLocal(bookingData.checkin);
    checkoutDate = parseLocal(bookingData.checkout);

    window.updateBookingSummaryLabels = (checkinInputVal, checkoutInputVal) => {
        if (!checkinInputVal || !checkoutInputVal) return;
        const ci = parseLocal(checkinInputVal);
        const co = parseLocal(checkoutInputVal);
        const dateStr = `${formatDateObj(ci)} - ${formatDateObj(co)}`;
        const summaryDates = document.getElementById('summary-dates');
        if (summaryDates) summaryDates.textContent = dateStr;
        const miniSummaryDates = document.getElementById('mini-summary-dates');
        if (miniSummaryDates) miniSummaryDates.textContent = dateStr;
    };

    // Initial label update
    window.updateBookingSummaryLabels(bookingData.checkin, bookingData.checkout);

    const updateGuestLabels = (a, c) => {
        let label = `${a} Người lớn`;
        if (c > 0) label = `${a} NL, ${c} TE`;
        return label;
    };

    const initialGuestLabel = updateGuestLabels(adults, children);
    if (document.getElementById('summary-guests')) document.getElementById('summary-guests').textContent = initialGuestLabel;
    if (document.getElementById('mini-summary-guests')) document.getElementById('mini-summary-guests').textContent = initialGuestLabel;

    const roomsContainer = document.getElementById('rooms-container');
    roomsContainer.innerHTML = `
        <div class="flex flex-col items-center justify-center space-y-4 my-16 opacity-0 animate-[fadeIn_1s_ease-out_forwards]">
            <span class="inline-block animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary"></span>
            <p class="text-center text-primary font-display italic text-lg">Chồn is preparing the room...</p>
        </div>
    `;

    // 2. Database Definition
    localRooms = [
        {
            id: "Pink_Room",
            name: "Pink Room",
            area: "25m²",
            amenities: ["TV 55 inch kết nối Netflix, YouTube,...", "Quạt", "Máy sấy", "Bàn trang điểm", "Giường 1m8", "Toilet riêng có bồn tắm", "Nước suối miễn phí", "Đồ dùng vệ sinh cá nhân", "Bàn ủi hơi nước"],
            special: null,
            img: "https://images.unsplash.com/photo-1518136247453-74e7b5265980?q=80&w=600&auto=format&fit=crop"
        },
        {
            id: "Gray_Room",
            name: "Gray Room",
            area: "25m²",
            amenities: ["TV 55 inch kết nối Netflix, YouTube,...", "Điều hòa", "Máy sấy", "Bàn trang điểm", "Giường 1m8", "Toilet riêng có bồn tắm", "Nước suối miễn phí", "Đồ dùng vệ sinh cá nhân", "Bàn ủi hơi nước"],
            special: null,
            img: "https://images.unsplash.com/photo-1616594039964-ae9021a400a0?q=80&w=600&auto=format&fit=crop"
        },
        {
            id: "Green_Room",
            name: "Green Room",
            area: "25m²",
            amenities: ["TV 55 inch kết nối Netflix, YouTube,...", "Máy lạnh", "Máy sấy", "Bàn trang điểm", "Giường 1m8", "Toilet riêng có bồn tắm", "Nước suối miễn phí", "Đồ dùng vệ sinh cá nhân", "Bàn ủi hơi nước"],
            special: "Lựa chọn lý tưởng cho trẻ dưới 6 tuổi",
            img: "https://plus.unsplash.com/premium_photo-1678297270385-ad5067126607?q=80&w=600&auto=format&fit=crop"
        },
        {
            id: "Black_Room",
            name: "Black Room",
            area: "32m²",
            amenities: ["TV 65 inch kết nối Netflix, YouTube,...", "Máy lạnh", "Máy sấy", "Bàn trang điểm", "Giường 1m8", "Toilet riêng có bồn tắm", "Nước suối miễn phí", "Đồ dùng vệ sinh cá nhân", "Bàn ủi hơi nước"],
            special: null,
            img: "https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?q=80&w=600&auto=format&fit=crop"
        },
        {
            id: "White_Room",
            name: "White Room",
            area: "33m²",
            amenities: ["TV 55 inch kết nối Netflix, YouTube,...", "Máy lạnh", "Máy sấy", "Bàn trang điểm", "Giường 1m8", "Toilet riêng có bồn tắm", "Nước suối miễn phí", "Đồ dùng vệ sinh cá nhân", "Bàn ủi hơi nước"],
            special: null,
            img: "https://images.unsplash.com/photo-1590490360182-c33d57733427?q=80&w=600&auto=format&fit=crop"
        },
        {
            id: "Gold_Room",
            name: "Gold Room",
            area: "33m²",
            amenities: ["Bồn cầu điện", "Sưởi khăn tắm", "TV 55 inch kết nối Netflix, YouTube,...", "Máy lạnh", "Máy sấy", "Bàn trang điểm", "Giường 1m8", "Toilet riêng có bồn tắm", "Nước suối miễn phí", "Đồ dùng vệ sinh cá nhân", "Bàn ủi hơi nước"],
            special: "Có sân vườn, bếp riêng",
            img: "https://images.unsplash.com/photo-1554995207-c18c203602cb?q=80&w=600&auto=format&fit=crop"
        }
    ];

    // 3. Fetch Google Sheets Data
    const URL_SCHEDULES = [
        '', // T1 - Placeholder
        '', // T2 - Placeholder
        'https://docs.google.com/spreadsheets/d/1A-DGSU4oPx74xdzloBQW4ekyhcjATwgh6dKf0Ky0XKg/gviz/tq?gid=1441677072', // T3
        'https://docs.google.com/spreadsheets/d/1A-DGSU4oPx74xdzloBQW4ekyhcjATwgh6dKf0Ky0XKg/gviz/tq?gid=2011761073', // T4
        'https://docs.google.com/spreadsheets/d/1A-DGSU4oPx74xdzloBQW4ekyhcjATwgh6dKf0Ky0XKg/gviz/tq?gid=1564983873', // T5
        'https://docs.google.com/spreadsheets/d/1A-DGSU4oPx74xdzloBQW4ekyhcjATwgh6dKf0Ky0XKg/gviz/tq?gid=1882992325', // T6
        'https://docs.google.com/spreadsheets/d/1A-DGSU4oPx74xdzloBQW4ekyhcjATwgh6dKf0Ky0XKg/gviz/tq?gid=682502335',  // T7
        'https://docs.google.com/spreadsheets/d/1A-DGSU4oPx74xdzloBQW4ekyhcjATwgh6dKf0Ky0XKg/gviz/tq?gid=926390804',  // T8
        'https://docs.google.com/spreadsheets/d/1A-DGSU4oPx74xdzloBQW4ekyhcjATwgh6dKf0Ky0XKg/gviz/tq?gid=382926038',  // T9
        'https://docs.google.com/spreadsheets/d/1A-DGSU4oPx74xdzloBQW4ekyhcjATwgh6dKf0Ky0XKg/gviz/tq?gid=1549710105', // T10
        'https://docs.google.com/spreadsheets/d/1A-DGSU4oPx74xdzloBQW4ekyhcjATwgh6dKf0Ky0XKg/gviz/tq?gid=654600068',  // T11
        'https://docs.google.com/spreadsheets/d/1A-DGSU4oPx74xdzloBQW4ekyhcjATwgh6dKf0Ky0XKg/gviz/tq?gid=1543178625'  // T12
    ];
    const POLICY_API = "https://docs.google.com/spreadsheets/d/1jszKQ6uZOqk-MD0vy--9NqISDuUDau6-gyx-KO1wck4/gviz/tq?gid=1382126270";
    const GALLERY_API = "https://docs.google.com/spreadsheets/d/1jszKQ6uZOqk-MD0vy--9NqISDuUDau6-gyx-KO1wck4/gviz/tq?gid=932135485";
    isCheckingPolicy = false;

    // Gallery State
    window.galleryData = {};
    let currentGallery = [];
    let currentGalleryIndex = 0;
    let currentRoomId = null;

    try {

        async function syncPolicy() {
            try {
                const res = await fetchJSONP(POLICY_API + "&t=" + Date.now());
                if (res && res.table && res.table.rows) {
                    dynamicPolicyData = res.table.rows.map(row => ({
                        Month_ID: row.c[0] ? row.c[0].v : null,
                        Min_Days_Lead: row.c[1] ? row.c[1].v : null
                    })).filter(p => p.Month_ID !== null);
                    console.log("[V4.2-REALTIME] Policy synced from Sheet:", dynamicPolicyData);
                }
            } catch (e) {
                console.warn("Policy sync failed:", e);
            }
        }

        const schedulePromises = URL_SCHEDULES.filter(url => url).map(async (url, idx) => {
            try {
                const res = await fetchJSONP(url);
                if (res && res.table) return res;
                console.warn(`[WARN] T${idx + 1} link returned no data.`);
                return null;
            } catch (e) {
                console.error(`[ERROR] T${idx + 1} fetch failed:`, e);
                return null;
            }
        });

        const allResponses = await Promise.all([
            ...schedulePromises,
            fetchJSONP(GALLERY_API + "&t=" + Date.now()).catch(e => { console.error("Gallery API failed:", e); return null; })
        ]);

        const numSchedule = schedulePromises.length;
        const scheduleResponses = allResponses.slice(0, numSchedule);
        const galleryRes = allResponses[numSchedule];

        // Synchronize Policy first (Non-blocking)
        await syncPolicy();

        // Check if AT LEAST ONE link succeeded
        const validSchedule = scheduleResponses.filter(res => res && res.table);
        
        console.log(`[DEBUG] Received ${validSchedule.length} valid schedule responses.`);

        // 4. Parse Gallery Data
        window.galleryData = {};
        if (galleryRes && galleryRes.table && galleryRes.table.rows) {
            galleryRes.table.rows.forEach(row => {
                if (!row.c) return;
                const rawRid = (row.c[0] ? (row.c[0].v !== null ? row.c[0].v : row.c[0].f) : null);
                if (!rawRid) return;

                const rId = String(rawRid).trim().replace(/ /g, '_');
                const mType = row.c[1] ? String(row.c[1].v || "").trim().toLowerCase() : 'image';
                const rawUrl = row.c[2] ? String(row.c[2].v || "").trim() : null;
                const mOrder = row.c[3] ? parseInt(row.c[3].v) || 999 : 999;

                if (!rawUrl) return;

                const mUrl = convertGDriveUrl(rawUrl, mType === 'video');
                console.log(`[Gallery Debug] Room: ${rId}, Type: ${mType}, Final URL: ${mUrl}`);
                if (!window.galleryData[rId]) window.galleryData[rId] = [];
                window.galleryData[rId].push({ url: mUrl, type: mType, order: mOrder });
            });
            // Sort by order
            Object.keys(window.galleryData).forEach(id => {
                window.galleryData[id].sort((a, b) => a.order - b.order);
            });
            console.log("Parsed Gallery Data:", window.galleryData);
        }

        // Sort by Order already done for window.galleryData above.

        scheduleData = {};
        pricingData = {};

        scheduleResponses.forEach((scheduleRes) => {
            if (!scheduleRes || !scheduleRes.table || !scheduleRes.table.rows) return;

            scheduleRes.table.rows.forEach(row => {
                if (!row.c || row.c.length < 3) return;
                const val = row.c[0] ? row.c[0].v : null;
                const formatted = row.c[0] ? row.c[0].f : null;
                const rId = row.c[1] ? row.c[1].v : null;
                const status = row.c[2] ? row.c[2].v : null;
                if (!val || !rId || !status) return;

                let dateStr = "";
                if (typeof val === 'string' && val.startsWith('Date(')) {
                    const parts = val.substring(5, val.length - 1).split(',');
                    dateStr = `${parts[0]}-${String(parseInt(parts[1]) + 1).padStart(2, '0')}-${String(parseInt(parts[2])).padStart(2, '0')}`;
                } else {
                    let s = String(formatted || val).trim().split(' ')[0];
                    if (s.includes('/')) {
                        const parts = s.split('/');
                        if (parts[2] && parts[2].length === 4) dateStr = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                        else if (parts[0] && parts[0].length === 4) dateStr = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
                    } else if (s.includes('-')) {
                        const parts = s.split('-');
                        if (parts[0] && parts[0].length === 4) dateStr = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
                    } else {
                        dateStr = s;
                    }
                }

                const cleanRid = String(rId).trim().replace(/ /g, '_');

                // Extraction helper for numeric/formatted values
                const getVal = (cell, def = 0) => {
                    if (!cell) return def;
                    if (cell.v !== undefined && typeof cell.v === 'number') return cell.v;
                    if (cell.f) return parseInt(cell.f.replace(/\./g, '')) || def;
                    return parseInt(String(cell.v).replace(/\./g, '')) || def;
                };

                // Store Schedule
                if (!scheduleData[cleanRid]) scheduleData[cleanRid] = {};
                scheduleData[cleanRid][dateStr] = String(status).trim();

                // Store Pricing, Capacity & Meta per date
                if (!pricingData[cleanRid]) {
                    pricingData[cleanRid] = {};
                    // Seed default with the first valid entry for this room from Sheet
                    pricingData[cleanRid]['default'] = {
                        maxAdults: getVal(row.c[3], 2),
                        maxChildren: getVal(row.c[4], 2),
                        kidsUnder6: String(row.c[5] ? row.c[5].v : "Yes").trim(),
                        weekday: getVal(row.c[6], 800000),
                        weekend: getVal(row.c[7], 1000000),
                        surcharge: getVal(row.c[8], 450000),
                        note: ""
                    };
                }
                pricingData[cleanRid][dateStr] = {
                    maxAdults: getVal(row.c[3], 2),
                    maxChildren: getVal(row.c[4], 2),
                    kidsUnder6: String(row.c[5] ? row.c[5].v : "Yes").trim(),
                    weekday: getVal(row.c[6], 800000),
                    weekend: getVal(row.c[7], 1000000),
                    surcharge: getVal(row.c[8], 450000),
                    note: String(row.c[9] && row.c[9].v != null ? row.c[9].v : (row.c[9] && row.c[9].f ? row.c[9].f : "")).trim()
                };
                if (pricingData[cleanRid][dateStr].note) {
                    console.log(`[DEBUG] Found Note for ${cleanRid} on ${dateStr}: "${pricingData[cleanRid][dateStr].note}"`);
                }
            });
        });

        uiLog("Schedule links valid:", validSchedule.length);

        // Helper to loop dates (Checkin inclusive, Checkout exclusive)
        const datesToStay = [];
        let curr = new Date(checkinDate);
        while (curr < checkoutDate) {
            datesToStay.push(new Date(curr));
            curr.setDate(curr.getDate() + 1);
        }

        const totalGuests = adults + children;
        let allowedRooms = localRooms;

        // Optimized Under-6 Logic: Show Green Room as priority, but keep others visible if Green is unavailable
        // We pass the full list and let renderRooms handle the recommendation display
        allowedRooms = localRooms;

        roomsContainer.innerHTML = '';
        renderRooms(allowedRooms, scheduleData, pricingData, datesToStay);

    } catch (err) {
        uiLog("CATCH ERROR:", err.message);
        console.error("Lỗi khi tải dữ liệu Google Sheets", err);
        roomsContainer.innerHTML = '<p class="text-center text-amber-600 mb-4 bg-amber-50 rounded p-3 italic">Hệ thống đang kiểm tra phòng theo thời gian thực... Vui lòng đợi trong giây lát.</p>';

        const fallbackPricingData = {
            'Pink_Room': { 'default': { weekday: 700000, weekend: 800000, surcharge: 450000, maxAdults: 2, maxChildren: 2 } },
            'Gray_Room': { 'default': { weekday: 900000, weekend: 1000000, surcharge: 450000, maxAdults: 2, maxChildren: 2 } },
            'Green_Room': { 'default': { weekday: 1000000, weekend: 1100000, surcharge: 450000, maxAdults: 2, maxChildren: 2 } },
            'Black_Room': { 'default': { weekday: 1100000, weekend: 1200000, surcharge: 450000, maxAdults: 2, maxChildren: 2 } },
            'White_Room': { 'default': { weekday: 1200000, weekend: 1300000, surcharge: 450000, maxAdults: 2, maxChildren: 2 } },
            'Gold_Room': { 'default': { weekday: 1600000, weekend: 1600000, surcharge: 450000, maxAdults: 2, maxChildren: 2 } }
        };

        const datesToStay = [];
        let curr = new Date(checkinDate);
        while (curr < checkoutDate) {
            datesToStay.push(new Date(curr));
            curr.setDate(curr.getDate() + 1);
        }

        setTimeout(() => {
            roomsContainer.innerHTML = '';
            renderRooms(localRooms || [], {}, fallbackPricingData, datesToStay);
        }, 1500);
    }

    // --- SMART PRICING HELPERS ---
    
    /**
     * Finds typical rates (weekday/weekend) for a room in a specific month based on sheet data.
     * Used for Suggestion Cards where specific dates aren't selected yet.
     */
    function getMonthlyTypicalRates(roomId, baseDate) {
        const month = baseDate.getMonth();
        const year = baseDate.getFullYear();
        const data = pricingData[roomId] || {};
        const defaults = data['default'] || { weekday: 800000, weekend: 1000000, surcharge: 450000 };
        
        // Scan days to find actual rates for this specific month
        let foundWeekday = null;
        let foundWeekend = null;
        
        for (let i = 1; i <= 28; i++) {
            const d = new Date(year, month, i);
            const dStr = getStr(d);
            const dayData = data[dStr];
            if (dayData) {
                const dow = d.getDay();
                const isWe = (dow === 5 || dow === 6 || dow === 0);
                if (isWe && !foundWeekend) foundWeekend = dayData.weekend;
                if (!isWe && !foundWeekday) foundWeekday = dayData.weekday;
            }
            if (foundWeekday && foundWeekend) break;
        }
        
        return {
            weekday: foundWeekday || defaults.weekday,
            weekend: foundWeekend || defaults.weekend,
            surcharge: defaults.surcharge
        };
    }

    /**
     * Shared function to generate Price HTML block
     * Supports both "Standard" (Weekday/Weekend) and "Breakdown" (Individual nights)
     */
    function generatePriceHTML(options) {
        const { 
            forceIndividual, 
            baseWeekday, 
            baseWeekend, 
            nightlyDetails, 
            surchargeText 
        } = options;

        let html = `
            <div class="flex flex-col gap-0.5 -ml-3">
                ${!forceIndividual ? '<p class="text-[11px] text-black uppercase tracking-tight mb-1">Giá Niêm Yết</p>' : ''}
                <div class="space-y-1">`;

        if (!forceIndividual) {
            html += `
                <div class="flex items-baseline gap-1 whitespace-nowrap">
                    <span class="text-[15px] font-bold text-graphite leading-none">${renderCurrency(baseWeekday)}</span>
                    <span class="text-[12px] font-normal text-black">/ Đêm Trong Tuần (Thứ 2 - Thứ 5)</span>
                </div>
                <div class="flex items-baseline gap-1 whitespace-nowrap">
                    <span class="text-[15px] font-bold text-graphite leading-none">${renderCurrency(baseWeekend)}</span>
                    <span class="text-[12px] font-normal text-black">/ Đêm Cuối Tuần (Thứ 6 - Chủ Nhật)</span>
                </div>`;
        } else {
            html += nightlyDetails.map(n => {
                const label = n.isHoliday ? "Giá Lễ Ngày" : "Giá Ngày";
                const dObj = (typeof n.date === 'string') ? parseLocal(n.date) : n.date;
                return `
                    <div class="flex items-baseline gap-1 whitespace-nowrap">
                        <span class="text-[12px] font-normal text-black">${label} ${formatDateShort(dObj)} :</span>
                        <span class="text-[15px] font-bold text-graphite leading-none">${renderCurrency(n.price)}</span>
                        <span class="text-[12px] font-normal text-black">/ 1 Đêm</span>
                    </div>`;
            }).join('');
        }

        html += `
                </div>
                <p class="text-[12px] sm:text-[13px] text-black font-bold mt-1.5">${surchargeText}</p>
            </div>`;
        
        return html;
    }

    /** -------------------------------------------------------------------
     * CORE FUNCTIONS (Part of main initialization)
     * ------------------------------------------------------------------- */

    // --- SMART SUGGESTION ENGINE ---
    function findSmartSuggestions(checkinDate, checkoutDate, adults, children) {
        const today = new Date(); today.setHours(0, 0, 0, 0);

        const originalNights = [];
        let currDate = new Date(checkinDate);
        while (currDate < checkoutDate) {
            originalNights.push(getStr(currDate));
            currDate.setDate(currDate.getDate() + 1);
        }

        const rangeStart = new Date(checkinDate);
        rangeStart.setDate(rangeStart.getDate() - 4);

        // Ensure suggestion range doesn't start in the past
        const effectiveRangeStart = rangeStart < today ? new Date(today) : rangeStart;

        const rangeEnd = new Date(checkinDate);
        rangeEnd.setDate(rangeEnd.getDate() + 4);

        const roomAvailability = [];

        // Helper to check 1-night policy (Used in suggestions)
        const checkOneNightPolicy = (roomId, dateStr) => {
            const d = new Date(dateStr);
            const today = new Date();
            const isCurrentMonth = d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth();

            // Rule: Lead Time only applies to stays starting in the current calendar month
            if (isCurrentMonth) {
                const daysLead = Math.ceil((d - today) / (1000 * 60 * 60 * 24));
                const monthId = d.getMonth() + 1;
                const STATIC_POLICY = { 1: 5, 2: 5, 3: 4, 4: 7, 5: 7, 6: 5, 7: 5, 8: 5, 9: 7, 10: 7, 11: 7, 12: 5 };
                const mPolicy = (dynamicPolicyData || []).find(p => p.Month_ID === monthId);
                const minDaysLead = (mPolicy && mPolicy.Min_Days_Lead !== null) ? mPolicy.Min_Days_Lead : (STATIC_POLICY[monthId] || 7);

                if (daysLead <= minDaysLead) return true;
            }

            // Perfect Sandwich Check (Always allowed regardless of month)
            const pr = new Date(d); pr.setDate(pr.getDate() - 1);
            const nx = new Date(d); nx.setDate(nx.getDate() + 1);
            const isBookedBefore = isBooked(scheduleData[roomId] ? scheduleData[roomId][getStr(pr)] : null);
            const isBookedAfter = isBooked(scheduleData[roomId] ? scheduleData[roomId][getStr(nx)] : null);
            return isBookedBefore && isBookedAfter;
        };

        localRooms.forEach((room, index) => {
            const tempFreeDates = [];
            let scanDate = new Date(effectiveRangeStart);
            while (scanDate <= rangeEnd) {
                const dateStr = getStr(scanDate);
                const isBookedOnDate = isBooked(scheduleData[room.id] ? scheduleData[room.id][dateStr] : null);
                if (!isBookedOnDate) {
                    tempFreeDates.push(new Date(scanDate));
                }
                scanDate.setDate(scanDate.getDate() + 1);
            }

            // Filter tempFreeDates to only include bookable 1-night gaps or part of 2+ night ranges
            const freeDatesInRange = tempFreeDates.filter((d, i, arr) => {
                const prevFree = i > 0 && Math.round((d - arr[i - 1]) / 86400000) === 1;
                const nextFree = i < arr.length - 1 && Math.round((arr[i + 1] - d) / 86400000) === 1;

                if (prevFree || nextFree) return true; // Part of a range
                return checkOneNightPolicy(room.id, getStr(d)); // Isolated 1-night
            });

            // Check if this room covers ANY of the original nights
            const coveredNights = originalNights.filter(nightStr =>
                freeDatesInRange.some(fd => getStr(fd) === nightStr)
            );

            roomAvailability.push({
                room,
                index,
                freeDates: freeDatesInRange,
                coveredNights: coveredNights,
                isSwitchCandidate: coveredNights.length > 0 && coveredNights.length < originalNights.length
            });
        });

        // Always return all rooms in their original order
        return roomAvailability.sort((a, b) => a.index - b.index);
    }

    function formatFreeDates(dates) {
        if (!dates || dates.length === 0) return "";
        const groups = [];
        let currentGroup = [dates[0]];
        for (let i = 1; i < dates.length; i++) {
            const diff = Math.round((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24));
            if (diff === 1) {
                currentGroup.push(dates[i]);
            } else {
                groups.push(currentGroup);
                currentGroup = [dates[i]];
            }
        }
        groups.push(currentGroup);
        return groups.map(g => {
            const f = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
            if (g.length === 1) return f(g[0]);
            return `${f(g[0])}-${f(g[g.length - 1])}`;
        }).join(' hoặc ');
    }

    // --- REUSABLE CARD GENERATOR ---
    function buildRoomCardHTML(room, roomImg, amenitiesHtml, specialAttrHtml, priceHtml, buttonHtml, extraInfoHtml = "") {
        return `
            <div class="rococo-border bg-white shadow-sm overflow-hidden group scroll-animate-card h-full flex flex-col">
                <div class="acanthus-corner top-0 left-0">
                    <svg fill="currentColor" viewbox="0 0 24 24"><path d="M2,2 L10,2 C6,2 2,6 2,10 L2,2 Z"></path></svg>
                </div>
                <div class="acanthus-corner top-0 right-0 rotate-90">
                    <svg fill="currentColor" viewbox="0 0 24 24"><path d="M2,2 L10,2 C6,2 2,6 2,10 L2,2 Z"></path></svg>
                </div>
                <!-- Featured Image with Gallery Trigger -->
                <div class="relative h-60 overflow-hidden border-4 border-double border-primary/60 m-2 rounded-sm cursor-pointer group/img shrink-0"
                     onclick='openGallery("${room.id}")'>
                    <img id="img-${room.id}" alt="${room.name}" 
                         class="w-full h-full object-cover transition-transform duration-700 group-hover/img:scale-110" 
                         src="${roomImg}"
                         onerror="this.style.opacity='0'"/>
                    
                    <!-- Subtle Media Count Badge (Bottom Corner) -->
                    ${window.galleryData[room.id] ? `
                        <div class="absolute bottom-3 right-3 bg-black/60 text-white text-[11px] font-display px-3 py-1.5 rounded-sm backdrop-blur-md border border-white/20 flex items-center gap-2 shadow-xl">
                            <span class="material-symbols-outlined text-[14px]">photo_camera</span>
                            <span>1 / ${window.galleryData[room.id].length}</span>
                        </div>
                    ` : ''}
                </div>
                <div class="px-5 pb-2.5 pt-0 flex-1 flex flex-col">
                    <div class="flex justify-between items-start mb-0 -mt-3">
                        <h3 class="font-display text-2xl font-bold text-graphite">${room.name}</h3>
                    </div>
                    <div class="flex flex-wrap gap-x-4 gap-y-0 mt-1 mb-0 text-sm text-slate-500">
                        <div class="flex items-center gap-1">
                            <span class="material-symbols-outlined text-xl text-primary">square_foot</span>
                            <span>${room.area}</span>
                        </div>
                        ${amenitiesHtml}
                    </div>
                    ${specialAttrHtml}
                    <div class="h-px bg-primary/40 w-full mt-2"></div>
                    
                    <div class="flex items-end justify-between pt-1 mt-auto">
                        ${priceHtml}
                    </div>
                    
                    ${extraInfoHtml ? `<div class="mt-0.5">${extraInfoHtml}</div>` : ''}

                    <div class="flex justify-center mt-3">
                        ${buttonHtml}
                    </div>
                </div>
            </div>
        `;
    }

    function renderRooms(roomsList, scheduleData, pricingData, datesToStay) {
        if (!datesToStay || datesToStay.length === 0) {
            return;
        }

        const totalGuests = adults + children;
        const isOneNightStay = datesToStay.length === 1;

        roomsList.forEach(room => {
            // Assessment and Multi-night Price Calculation
            let isAvailable = true;
            let totalRoomBasePrice = 0;
            let isHolidayStay = false;
            let forceIndividual = false;
            let roomImg = room.img;

            // 1. Check if room is available for ALL days and sum the price
            let bookedOnTargetNight = false;
            const nightlyDetails = [];

            for (const date of datesToStay) {
                const dateStr = getStr(date);
                const status = scheduleData[room.id] ? scheduleData[room.id][dateStr] : null;
                if (isBooked(status)) {
                    bookedOnTargetNight = true;
                    uiLog(`Room ${room.id}: Hidden (Actually Booked on ${dateStr}: ${status})`);
                    break;
                }

                const roomDayData = (pricingData[room.id] && pricingData[room.id][dateStr]) || {};
                const dayNote = (roomDayData.note || "").toLowerCase().normalize("NFC");
                if (dayNote.includes("t") || dayNote.includes("l")) forceIndividual = true;

                // Track if any night in the stay is a holiday
                const isDayHoliday = /l[ễễe]/.test(dayNote) || dayNote.includes("holiday") || /\bl\b/.test(dayNote);

                if (isDayHoliday) {
                    isHolidayStay = true;
                    console.log(`[DEBUG] Holiday detected on ${dateStr} for ${room.id} via note: "${roomDayData.note}"`);
                }

                const dow = date.getDay();
                const isWe = (dow === 5 || dow === 6 || dow === 0);
                const nightPrice = isWe ? (roomDayData.weekend || 1000000) : (roomDayData.weekday || 800000);
                totalRoomBasePrice += nightPrice;

                nightlyDetails.push({
                    date: new Date(date),
                    dateStr: dateStr,
                    price: nightPrice,
                    surcharge_val: roomDayData.surcharge || 450000,
                    isHoliday: isDayHoliday,
                    note: roomDayData.note || ""
                });
            }

            // Group consecutive nights with identical price and holiday status
            const groupedNights = [];
            if (nightlyDetails.length > 0) {
                let currentGroup = {
                    startDate: nightlyDetails[0].date,
                    endDate: nightlyDetails[0].date,
                    price: nightlyDetails[0].price,
                    isHoliday: nightlyDetails[0].isHoliday,
                    count: 1
                };

                for (let i = 1; i < nightlyDetails.length; i++) {
                    const night = nightlyDetails[i];
                    if (night.price === currentGroup.price && night.isHoliday === currentGroup.isHoliday) {
                        currentGroup.endDate = night.date;
                        currentGroup.count++;
                    } else {
                        groupedNights.push(currentGroup);
                        currentGroup = {
                            startDate: night.date,
                            endDate: night.date,
                            price: night.price,
                            isHoliday: night.isHoliday,
                            count: 1
                        };
                    }
                }
                groupedNights.push(currentGroup);
            }

            if (bookedOnTargetNight) return; // HIDDEN if actually booked

            // 2. Fetch Display Data from first stay night (or fallback)
            const firstDate = datesToStay[0];
            const firstDateStr = getStr(firstDate);
            const roomDayData = (pricingData[room.id] && pricingData[room.id][firstDateStr]) || (pricingData[room.id] && pricingData[room.id]['default']) || {};

            // Reference prices for display logic
            const baseWeekday = roomDayData.weekday || 800000;
            const baseWeekend = roomDayData.weekend || 1000000;

            const isHoliday = isHolidayStay;
            if (isHoliday) console.log(`[DEBUG] Final decision for ${room.id}: HOLIDAY DISPLAY ACTIVE`);

            const maxAdults = roomDayData.maxAdults !== undefined ? roomDayData.maxAdults : 2;
            const maxChildren = roomDayData.maxChildren !== undefined ? roomDayData.maxChildren : 2;
            const kidsUnder6Allowed = roomDayData.kidsUnder6 || "Yes";

            // Priority: 1. Gallery Sheet (Order 1) -> 2. Pricing Sheet -> 3. Local definition
            if (galleryData[room.id] && galleryData[room.id].length > 0) {
                roomImg = convertGDriveUrl(galleryData[room.id][0].url, false);
            }

            // --- LEAD TIME & PERIOD LOGIC (Simplified) ---
            const checkin = datesToStay[0];
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const daysLead = Math.ceil((checkin - today) / (1000 * 60 * 60 * 24));
            const monthId = checkin.getMonth() + 1;

            const STATIC_POLICY = { 1: 5, 2: 5, 3: 4, 4: 7, 5: 7, 6: 5, 7: 5, 8: 5, 9: 7, 10: 7, 11: 7, 12: 5 };
            let minDaysLead = (dynamicPolicyData && dynamicPolicyData.find(p => p.Month_ID === monthId))?.Min_Days_Lead || STATIC_POLICY[monthId] || 7;

            const isWithinPeriod = daysLead <= minDaysLead;

            let policyNote = null;
            if (isOneNightStay) {
                // 1-Night Rules:
                const ciDate = new Date(checkin);
                const today = new Date(); today.setHours(0, 0, 0, 0);
                const isCurrentMonth = ciDate.getFullYear() === today.getFullYear() && ciDate.getMonth() === today.getMonth();

                const daysLead = Math.ceil((ciDate - today) / (1000 * 60 * 60 * 24));
                const monthId = ciDate.getMonth() + 1;
                const STATIC_POLICY = { 1: 5, 2: 5, 3: 4, 4: 7, 5: 7, 6: 5, 7: 5, 8: 5, 9: 7, 10: 7, 11: 7, 12: 5 };
                let minDaysLead = (dynamicPolicyData && dynamicPolicyData.find(p => p.Month_ID === monthId))?.Min_Days_Lead || STATIC_POLICY[monthId] || 7;

                const prevDate = new Date(ciDate);
                prevDate.setDate(prevDate.getDate() - 1);
                const prevDateStr = getStr(prevDate);
                const isBookedBefore = isBooked(scheduleData[room.id] ? scheduleData[room.id][prevDateStr] : null);

                const nextDate = new Date(ciDate);
                nextDate.setDate(nextDate.getDate() + 1);
                const nextDateStr = getStr(nextDate);
                const isBookedAfter = isBooked(scheduleData[room.id] ? scheduleData[room.id][nextDateStr] : null);

                const isPerfectSandwich = isBookedBefore && isBookedAfter;
                const isWithinPeriod = isCurrentMonth && (daysLead <= minDaysLead);

                if (!isWithinPeriod && !isPerfectSandwich) {
                    policyNote = "Chồn ưu tiên nhận đặt phòng từ 2 đêm trở lên. Với đặt phòng 1 đêm, vui lòng liên hệ Zalo.";
                }
            }

            // Capacity & Under-6 check: Show warning instead of hiding
            if (totalGuests <= 3) {
                if (isUnder6 && kidsUnder6Allowed.toLowerCase() === "no") {
                    policyNote = "Phòng này không phù hợp cho trẻ dưới 6 tuổi. Vui lòng liên hệ Chồn để được tư vấn thêm.";
                }
                if (adults > maxAdults || children > maxChildren) {
                    policyNote = "Số lượng khách vượt quá tiêu chuẩn của phòng này. Vui lòng liên hệ Chồn.";
                }
            }

            if (!isAvailable) return;

            // Build Room Card HTML
            const specialAttrHtml = room.special ? `
                <div class="bg-primary/10 border border-primary/20 rounded p-2 mb-2">
                    <p class="text-[11px] text-primary font-bold flex items-center gap-1 italic">
                        <span class="material-symbols-outlined text-sm">child_care</span>
                        ${room.special}
                    </p>
                </div>
            ` : '';

            const amenitiesHtml = room.amenities.map(am => `
                <div class="flex items-center gap-1">
                    <span class="material-symbols-outlined text-xl text-primary">done</span>
                    <span>${am}</span>
                </div>
            `).join('');

            const isAlreadySelected = selectedRooms.some(r => String(r.id) === String(room.id));

            // Determine Surcharge for display and for selection
            // If nights >= 3, use standard (weekday) surcharge
            let selectedSurcharge = roomDayData.surcharge || 450000;
            if (datesToStay.length >= 3) {
                // Find a non-holiday surcharge in the stay details
                const weekdayNight = nightlyDetails.find(n => !n.isHoliday);
                if (weekdayNight) {
                    selectedSurcharge = weekdayNight.surcharge_val || 450000; // I need to make sure surcharge is in nightlyDetails
                }
            } else {
                selectedSurcharge = roomDayData.surcharge || 450000;
            }

            const surchargeText = `Phòng tiêu chuẩn 2 khách - Phụ thu khách thứ 3: ${renderCurrency(selectedSurcharge)}đ/đêm`;

            // Use shared price generator
            const priceHtml = generatePriceHTML({
                forceIndividual: forceIndividual,
                baseWeekday: baseWeekday,
                baseWeekend: baseWeekend,
                nightlyDetails: nightlyDetails,
                surchargeText: surchargeText
            });


            let buttonHtml = "";
            let extraInfoHtml = "";

            if (policyNote) {
                // POLICY RESTRICTED: Show notice and Zalo button
                extraInfoHtml = `
                    <div class="bg-amber-50 border border-amber-200 rounded p-2 mb-2 animate-pop">
                        <p class="text-[11px] text-amber-700 font-bold flex items-center gap-1 italic">
                            <span class="material-symbols-outlined text-sm">info</span>
                            ${policyNote}
                        </p>
                    </div>
                `;
                buttonHtml = `
                    <div class="relative p-[3px] rounded-xl bg-slate-200 shadow-md group/btn active:scale-95 transition-transform duration-300">
                        <div class="p-[1px] rounded-[9px] bg-slate-300">
                            <a href="https://zalo.me/0889717713" target="_blank"
                                class="bg-slate-500 text-white font-sans tracking-wider font-bold text-[12px] sm:text-[13px] py-1.5 px-4 rounded-[8px] transition-all duration-500 flex items-center justify-center leading-none uppercase w-full whitespace-nowrap">
                                Liên hệ Zalo hỗ trợ
                            </a>
                        </div>
                    </div>`;
            } else {
                // NORMAL: Show selection button
                buttonHtml = `
                    <div class="relative p-[3px] rounded-xl bg-gradient-to-b from-[#BF953F] via-[#FCF6BA] to-[#AA771C] shadow-lg shadow-black/20 group/btn active:scale-95 transition-transform duration-300">
                        <div class="p-[1px] rounded-[9px] bg-gradient-to-b from-[#AA771C] via-[#FCF6BA] to-[#BF953F]">
                            <button data-room-id="${room.id}" onclick='selectRoom(this, ${JSON.stringify({
                    id: room.id,
                    name: room.name,
                    img: roomImg,
                    checkin: getStr(datesToStay[0]),
                    checkout: getStr(new Date(datesToStay[datesToStay.length - 1].getTime() + 86400000)),
                    adults: adults,
                    children: children,
                    childrenAgeCategory: bookingData.childrenAgeCategory || "",
                    totalPrice: totalRoomBasePrice + (adults > 2 ? (adults - 2) * selectedSurcharge * datesToStay.length : 0),
                    nights: datesToStay.length,
                    surcharge: selectedSurcharge,
                    baseWeekday: baseWeekday,
                    baseWeekend: baseWeekend,
                    groupedNights: groupedNights.map(g => ({ ...g, startDate: formatDateShort(g.startDate), endDate: formatDateShort(g.endDate) })),
                    nightlyDetails: nightlyDetails.map(n => ({ ...n, date: formatDateShort(n.date) }))
                })})' 
                                class="${isAlreadySelected ? 'bg-[#A0824B] text-white pointer-events-none' : 'bg-primary text-white'} hover:bg-[#A0824B] font-sans tracking-wider font-bold text-[12px] sm:text-[13px] py-1.5 px-4 rounded-[8px] transition-all duration-500 flex items-center justify-center leading-none uppercase w-full whitespace-nowrap">
                                ${isAlreadySelected ? 'Đã Chọn' : 'Chọn Phòng'}
                            </button>
                        </div>
                    </div>`;
            }

            const card = document.createElement('div');
            card.className = "scroll-animate-card";
            card.innerHTML = buildRoomCardHTML(room, roomImg, amenitiesHtml, specialAttrHtml, priceHtml, buttonHtml, extraInfoHtml);
            roomsContainer.appendChild(card);
        });


        // --- CAPACITY & NO ROOMS LOGIC ---
        const availableRoomsMessage = document.getElementById('available-rooms-message');
        const availableRoomsCount = roomsContainer.querySelectorAll('.scroll-animate-card').length;

        // Lead time period check again for capacity message
        const checkin = datesToStay[0];
        const checkinStr = getStr(checkin);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const daysLead = Math.ceil((checkin - today) / (1000 * 60 * 60 * 24));
        const monthId = checkin.getMonth() + 1;
        const STATIC_POLICY = { 1: 5, 2: 5, 3: 4, 4: 7, 5: 7, 6: 5, 7: 5, 8: 5, 9: 7, 10: 7, 11: 7, 12: 5 };
        let minDaysLead = (dynamicPolicyData && dynamicPolicyData.find(p => p.Month_ID === monthId))?.Min_Days_Lead || STATIC_POLICY[monthId] || 7;
        const isWithinPeriod = daysLead <= minDaysLead;

        let totalAvailableOnCheckin = 0;
        if (scheduleData) {
            Object.keys(scheduleData).forEach(roomId => {
                const statusCi = scheduleData[roomId][checkinStr];
                if (!isBooked(statusCi)) totalAvailableOnCheckin++;
            });
        }

        const roomsNeeded = Math.ceil(totalGuests / 3);

        if (availableRoomsCount === 0) {
            const isOneNightStay = datesToStay.length === 1;
            const ciDate = datesToStay[0];
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const daysLead = Math.ceil((ciDate - today) / (1000 * 60 * 60 * 24));
            const isCurrentMonth = ciDate.getFullYear() === today.getFullYear() && ciDate.getMonth() === today.getMonth();
            const monthId = ciDate.getMonth() + 1;

            const STATIC_POLICY = { 1: 5, 2: 5, 3: 4, 4: 7, 5: 7, 6: 5, 7: 5, 8: 5, 9: 7, 10: 7, 11: 7, 12: 5 };
            let minDaysLead = (dynamicPolicyData && dynamicPolicyData.find(p => p.Month_ID === monthId))?.Min_Days_Lead || STATIC_POLICY[monthId] || 7;

            // SPECIAL RULE: Lead Time only applies to STAYS starting in the current calendar month
            const isWithinPeriod = isCurrentMonth && (daysLead <= minDaysLead);

            let msg = "Ngày mà bạn chọn đã hết phòng, xin vui lòng đổi ngày khác.";
            if (isOneNightStay && !isWithinPeriod && totalAvailableOnCheckin > 0) {
                msg = "Chồn ưu tiên nhận đặt phòng từ 2 đêm trở lên. Với đặt phòng 1 đêm, vui lòng liên hệ với chúng tôi qua Zalo.";
            }

            // Move message ABOVE the line by using the availableRoomsMessage container
            if (availableRoomsMessage) {
                availableRoomsMessage.classList.remove('hidden');
                availableRoomsMessage.querySelector('p').textContent = msg;
            }

            // --- SMART SUGGESTIONS ---
            const suggestions = findSmartSuggestions(checkinDate, checkoutDate, adults, children);

            if (suggestions.length > 0) {
                roomsContainer.innerHTML = `
                    <div class="col-span-full mt-0 mb-1.5">
                        <p id="suggestion-header" class="text-center font-display text-primary italic text-[16px] sm:text-lg animate-pop">Các phòng trống gần ngày bạn chọn nhất.</p>
                    </div>
                `;

                suggestions.forEach(s => {
                    const room = s.room;
                    const isAlreadySelected = selectedRooms.some(r => String(r.id) === String(room.id));
                    const typicalRates = getMonthlyTypicalRates(room.id, checkinDate);
                    const baseWeekday = typicalRates.weekday;
                    const baseWeekend = typicalRates.weekend;
                    const selectedSurcharge = typicalRates.surcharge;

                    let roomImg = room.img;
                    if (galleryData[room.id] && galleryData[room.id].length > 0) {
                        roomImg = convertGDriveUrl(galleryData[room.id][0].url, false);
                    }

                    const freeDatesStr = formatFreeDates(s.freeDates);

                    // --- Reconstruct standard UI components ---
                    const specialAttrHtml = room.special ? `
                        <div class="bg-primary/10 border border-primary/20 rounded p-2 mb-2">
                            <p class="text-[11px] text-primary font-bold flex items-center gap-1 italic">
                                <span class="material-symbols-outlined text-sm">child_care</span>
                                ${room.special}
                            </p>
                        </div>
                    ` : '';

                    const amenitiesHtml = room.amenities.map(am => `
                        <div class="flex items-center gap-1">
                            <span class="material-symbols-outlined text-xl text-primary">done</span>
                            <span>${am}</span>
                        </div>
                    `).join('');

                    const surchargeText = `Phòng tiêu chuẩn 2 khách - Phụ thu khách thứ 3: ${renderCurrency(selectedSurcharge)}đ/đêm`;

                    // Use shared price generator (Always Standard for Suggestion Cards)
                    const priceHtml = generatePriceHTML({
                        forceIndividual: false,
                        baseWeekday: baseWeekday,
                        baseWeekend: baseWeekend,
                        surchargeText: surchargeText
                    });


                    const buttonHtml = `
                        <div onclick='openSuggestionModal("${room.id}")' class="relative p-[3px] rounded-xl bg-gradient-to-b from-[#BF953F] via-[#FCF6BA] to-[#AA771C] shadow-lg shadow-black/20 group/btn active:scale-95 transition-transform duration-300 cursor-pointer">
                            <div class="p-[1px] rounded-[9px] bg-gradient-to-b from-[#AA771C] via-[#FCF6BA] to-[#BF953F]">
                                <button data-room-id="${room.id}" data-is-suggestion="true"
                                    style="touch-action: none;"
                                    class="${isAlreadySelected ? 'bg-[#A0824B] text-white pointer-events-none' : 'bg-primary text-white'} hover:bg-[#A0824B] font-sans tracking-wider font-bold text-[15px] sm:text-[16px] py-2.5 px-8 rounded-[8px] transition-all duration-500 flex items-center justify-center leading-none w-full whitespace-nowrap">
                                    ${isAlreadySelected ? 'Đã Chọn' : 'Xem Ngày Trống Của Phòng Này'}
                                </button>
                            </div>
                        </div>`;

                    const suggestionText = freeDatesStr
                        ? `Phòng ${room.name} đang trống các ngày: ${freeDatesStr}`
                        : "Vui lòng liên hệ Zalo để kiểm tra ngày trống gần nhất.";

                    const extraInfoHtml = '';

                    const card = document.createElement('div');
                    card.className = "scroll-animate-card";
                    card.innerHTML = buildRoomCardHTML(room, roomImg, amenitiesHtml, specialAttrHtml, priceHtml, buttonHtml, extraInfoHtml);
                    roomsContainer.appendChild(card);
                });
            } else {
                roomsContainer.innerHTML = `
                    <div id="no-rooms-alert" class="col-span-full flex flex-col items-center justify-center my-16 animate-shake animate-pop px-4">
                        <span class="material-symbols-outlined text-4xl text-slate-300">event_busy</span>
                    </div>
                `;
            }
        } else {
            if (availableRoomsMessage) {
                availableRoomsMessage.classList.remove('hidden');
                availableRoomsMessage.querySelector('p').textContent = "Những phòng đang hiển thị là những phòng trống vào ngày bạn chọn.";
            }

            if (availableRoomsCount < roomsNeeded) {
                // New Capacity Alert Requirement: Show rooms AND message below (Now correctly includes children)
                const alertDiv = document.createElement('div');
                alertDiv.id = "capacity-alert";
                alertDiv.className = "col-span-full flex flex-col items-center justify-center space-y-4 mt-8 mb-16 animate-shake animate-pop bg-[#FAF6EC] p-8 rounded-xl border-2 border-primary/20";
                alertDiv.innerHTML = `
                    <span class="material-symbols-outlined text-4xl text-primary">group_off</span>
                    <p class="text-center text-[#c8a96a] font-display italic text-xl px-4">
                        Hiện tại chỉ còn ${availableRoomsCount} phòng đơn đủ cho tối đa ${availableRoomsCount * 3} khách (bao gồm cả trẻ em). <br class="hidden sm:block"> Xin vui lòng liên hệ Zalo để được hỗ trợ chi tiết.
                    </p>
                    <a href="https://zalo.me/0889717713" target="_blank" class="mt-4 bg-primary text-white py-2 px-6 rounded-lg font-bold shadow-lg hover:scale-105 transition-transform uppercase text-sm">
                        Liên hệ Zalo
                    </a>
                `;
                roomsContainer.appendChild(alertDiv);
            }
        }

        // --- Tích hợp Intersection Observer (Move to end to catch dynamically added suggestions) ---
        const observerOptions = { threshold: 0.1 };
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                } else if (entry.boundingClientRect.top > 0) {
                    entry.target.classList.remove('is-visible');
                }
            });
        }, observerOptions);

        document.querySelectorAll('.scroll-animate-card').forEach(card => observer.observe(card));
    }

    // Modal & Guest Logic (Move inside DOMContentLoaded to access variables)
    const modal = document.getElementById('edit-booking-modal');
    const modalContent = document.getElementById('edit-booking-content');
    const checkinInput = document.getElementById('modal-checkin');
    const checkoutInput = document.getElementById('modal-checkout');
    const adultCountSpan = document.getElementById('modal-adult-count');
    const childCountSpan = document.getElementById('modal-child-count');
    const childrenAgeInput = document.getElementById('modal-children-age');

    let adultCountLocal = adults;
    let childCountLocal = children;

    const todayVal = new Date().toISOString().split('T')[0];
    const formatDisplayDate = (dStr) => {
        if (!dStr) return "";
        const [y, m, d] = dStr.split('-');
        return `${d}/${m}/${y}`;
    };

    if (checkinInput && checkoutInput) {
        // Native picker disabled, min not needed for type="text"
    }

    const modalAgeContainer = document.getElementById('modal-children-ages-container');

    const updateGuestDisplay = () => {
        if (adultCountSpan) adultCountSpan.textContent = adultCountLocal;
        if (childCountSpan) childCountSpan.textContent = childCountLocal;

        const totalGuests = adultCountLocal + childCountLocal;
        const plusAdult = document.getElementById('modal-plus-adult');
        const plusChild = document.getElementById('modal-plus-child');
        const curRoomId = window._currentModalRoomId;

        // Only enforce 3-person limit if we are picking a SPECIFIC room
        if (curRoomId && totalGuests >= 3) {
            if (plusAdult) {
                plusAdult.classList.add('opacity-50', 'pointer-events-none');
            }
            if (plusChild) {
                plusChild.classList.add('opacity-50', 'pointer-events-none');
            }
        } else {
            if (plusAdult) {
                plusAdult.classList.remove('opacity-50', 'pointer-events-none');
            }
            if (plusChild) {
                plusChild.classList.remove('opacity-50', 'pointer-events-none');
            }
        }

        if (modalAgeContainer) {
            const currentCount = modalAgeContainer.children.length;
            if (childCountLocal > currentCount) {
                for (let i = currentCount; i < childCountLocal; i++) {
                    const select = document.createElement('select');
                    select.className = "modal-child-age-selector text-[10px] text-[#c8a96a] bg-transparent border-none py-0 pl-0 pr-5 focus:ring-0 uppercase cursor-pointer mt-1 outline-none";
                    select.innerHTML = `
                        <option value="" disabled selected hidden>Trẻ ${i + 1}: độ tuổi</option>
                        ${Array.from({ length: 12 }, (_, j) => `<option value="${j + 1}">${j + 1} tuổi</option>`).join('')}
                    `;
                    modalAgeContainer.appendChild(select);
                }
            } else if (childCountLocal < currentCount) {
                for (let i = currentCount; i > childCountLocal; i--) {
                    modalAgeContainer.removeChild(modalAgeContainer.lastChild);
                }
            }
        }
    };

    const openModal = (isPopState = false, preferredRoomId = null) => {
        window._calendarFirstClick = true;
        if (!isPopState) {
            history.pushState({ view: 'booking-modal' }, '');
        }

        if (checkinInput) { checkinInput.value = ""; checkinInput.removeAttribute('data-date'); }
        if (checkoutInput) { checkoutInput.value = ""; checkoutInput.removeAttribute('data-date'); }

        // --- GUEST AUTO-FILL LOGIC (V1.28) ---
        if (selectedRooms.length > 0) {
            // Additional rooms mode: Auto-fill ONLY if it's the FINAL room (<= 3 people total remaining)
            const totalSelectedAdults = selectedRooms.reduce((sum, r) => sum + (r.adults || 0), 0);
            const totalSelectedChildren = selectedRooms.reduce((sum, r) => sum + (r.children || 0), 0);

            let remA = Math.max(0, (parseInt(bookingData.adults) || 2) - totalSelectedAdults);
            let remC = Math.max(0, (parseInt(bookingData.children) || 0) - totalSelectedChildren);

            if (remA + remC <= 3) {
                // Final room: Auto-fill remaining
                adultCountLocal = remA;
                childCountLocal = remC;
            } else {
                // Still many people left: Force manual entry
                adultCountLocal = 0;
                childCountLocal = 0;
            }
        } else if (preferredRoomId) {
            // First suggested room: Force manual entry
            adultCountLocal = 0;
            childCountLocal = 0;
        } else {
            // General "Change Date" from header: Show current baseline defaults without any limit (V1.5)
            adultCountLocal = parseInt(bookingData.adults) || 2;
            childCountLocal = parseInt(bookingData.children) || 0;
        }

        // Reset and populate modal age container (V1.4)
        if (modalAgeContainer) {
            modalAgeContainer.innerHTML = '';
            const ages = (bookingData.childrenAgeCategory || "").split(',').filter(a => a);
            updateGuestDisplay();
            const selects = modalAgeContainer.querySelectorAll('select');
            ages.forEach((age, idx) => {
                if (selects[idx]) selects[idx].value = age;
            });
        }

        const globalTitle = document.getElementById('modal-global-title');
        const roomCalendar = document.getElementById('modal-room-calendar');
        const roomDetails = document.getElementById('modal-room-details');
        const dividers = document.querySelectorAll('.modal-divider');
        const saveBtn = document.getElementById('modal-save-btn');
        const mCheckin = document.getElementById('modal-checkin');
        const mCheckout = document.getElementById('modal-checkout');

        if (preferredRoomId) {
            // ROOM SPECIFIC MODE (Suggestion Flow) - Custom Calendar
            if (mCheckin) mCheckin.type = "text";
            if (mCheckout) mCheckout.type = "text";
            if (mCheckin) mCheckin.readOnly = true;
            if (mCheckout) mCheckout.readOnly = true;

            if (mCheckin && mCheckout && roomCalendar) {
                const showCal = () => {
                    if (roomCalendar.classList.contains('hidden')) {
                        roomCalendar.classList.remove('hidden');
                        const cMonth = checkinDate ? checkinDate.getMonth() : new Date().getMonth();
                        const cYear = checkinDate ? checkinDate.getFullYear() : new Date().getFullYear();
                        renderRoomMonthCalendar(preferredRoomId, cMonth, cYear);
                    }
                };
                mCheckin.onclick = showCal;
                mCheckout.onclick = showCal;
            }

            if (globalTitle) globalTitle.classList.add('hidden');
            if (roomCalendar) roomCalendar.classList.remove('hidden');
            dividers.forEach(d => d.classList.remove('hidden'));
            if (saveBtn) saveBtn.textContent = 'XÁC NHẬN ĐỔI';
            window._currentModalRoomId = preferredRoomId;

            // Populate room details
            const roomObj = localRooms.find(r => r.id === preferredRoomId);
            if (roomObj) {
                const roomNameEl = document.getElementById('modal-room-name');
                const roomImgEl = document.getElementById('modal-room-image');
                if (roomNameEl) roomNameEl.textContent = roomObj.name;

                let roomImg = roomObj.img;
                if (window.galleryData[preferredRoomId] && window.galleryData[preferredRoomId].length > 0) {
                    const firstImg = window.galleryData[preferredRoomId][0];
                    roomImg = typeof firstImg === 'object' ? firstImg.url : firstImg;
                }
                if (roomImgEl) roomImgEl.src = convertGDriveUrl(roomImg);

                if (roomDetails) {
                    roomDetails.classList.remove('hidden', 'opacity-100');
                    roomDetails.classList.add('opacity-0');
                    setTimeout(() => roomDetails.classList.add('opacity-100'), 50);
                }

                // Trigger initial price calculation
                if (window.updateModalPricing) window.updateModalPricing(preferredRoomId);
            }
        } else {
            // GLOBAL SEARCH MODE (Re-search Flow) - Native Picker
            if (mCheckin) {
                mCheckin.type = "date";
                mCheckin.readOnly = false;
                mCheckin.min = new Date().toISOString().split('T')[0]; // Disable past dates
                mCheckin.value = bookingData.checkin || "";

                mCheckin.onclick = () => { if (mCheckin.showPicker) mCheckin.showPicker(); };
                mCheckin.onchange = () => {
                    if (mCheckin.value && mCheckout) {
                        const ciDate = new Date(mCheckin.value);

                        // Set min checkout to +1 day
                        const minDate = new Date(ciDate);
                        minDate.setDate(minDate.getDate() + 1);
                        mCheckout.min = minDate.toISOString().split('T')[0];

                        // Auto-set checkout to +2 days as requested
                        const coDate = new Date(ciDate);
                        coDate.setDate(coDate.getDate() + 2);
                        mCheckout.value = coDate.toISOString().split('T')[0];
                    }
                };
            }
            if (mCheckout) {
                mCheckout.type = "date";
                mCheckout.readOnly = false;
                mCheckout.onclick = () => { if (mCheckout.showPicker) mCheckout.showPicker(); };
                if (mCheckin && mCheckin.value) {
                    const ciDate = new Date(mCheckin.value);
                    const minDate = new Date(ciDate);
                    minDate.setDate(minDate.getDate() + 1);
                    mCheckout.min = minDate.toISOString().split('T')[0];
                } else {
                    mCheckout.min = new Date().toISOString().split('T')[0];
                }
                mCheckout.value = bookingData.checkout || "";
            }

            if (globalTitle) globalTitle.classList.remove('hidden');
            if (roomCalendar) {
                roomCalendar.classList.add('hidden');
                roomCalendar.innerHTML = ''; // Clear custom calendar
            }
            if (roomDetails) roomDetails.classList.add('hidden');
            dividers.forEach(d => d.classList.add('hidden'));
            if (saveBtn) saveBtn.textContent = 'ĐỔI NGÀY';
            window._currentModalRoomId = null;
        }

        updateGuestDisplay();
        if (modal) {
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            document.body.style.overflow = 'hidden';
            void modal.offsetWidth;
            modal.classList.remove('opacity-0');
            if (modalContent) {
                modalContent.classList.remove('translate-y-full');
                modalContent.classList.add('scale-100'); // Centered popup entrance
            }
        }

        const startMonth = checkinDate ? checkinDate.getMonth() : new Date().getMonth();
        const startYear = checkinDate ? checkinDate.getFullYear() : new Date().getFullYear();
        if (preferredRoomId) {
            renderRoomMonthCalendar(preferredRoomId, startMonth, startYear);
        }
    };
    window.openModal = openModal;

    window.openSuggestionModal = (roomId) => {
        openModal(false, roomId);
    };

    function renderRoomMonthCalendar(roomId, month, year) {
        const container = document.getElementById('modal-room-calendar');
        if (!container) return;
        container.classList.remove('hidden');

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Get check-in/out inputs for dataset values (native picker disabled)
        const ciInput = document.getElementById('modal-checkin');
        const coInput = document.getElementById('modal-checkout');

        // Native picker disabled, min not needed for type="text" readonly
        // if (ciInput) ciInput.min = getStr(today);

        // Month calculations (Local)
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const numDays = lastDay.getDate();

        // Leading days from prev month
        const prevLastDay = new Date(year, month, 0).getDate();
        let firstDayIdx = firstDay.getDay();
        let padding = firstDayIdx === 0 ? 6 : firstDayIdx - 1;

        // Navigation
        window.changeCalendarMonth = (offset) => {
            let newMonth = month + offset;
            let newYear = year;
            if (newMonth < 0) { newMonth = 11; newYear--; }
            if (newMonth > 11) { newMonth = 0; newYear++; }
            renderRoomMonthCalendar(roomId, newMonth, newYear);
        };

        if (!window.handleCalendarDateClick) {
            window.handleCalendarDateClick = (dateStr, rId, m, y) => {
                const checkin = document.getElementById('modal-checkin');
                const checkout = document.getElementById('modal-checkout');
                if (!checkin || !checkout) return;

                const d = new Date(dateStr);
                d.setHours(0, 0, 0, 0);
                const today = new Date(); today.setHours(0, 0, 0, 0);
                if (d < today) return;

                const currentCI = checkin.dataset.date || "";
                const currentCO = checkout.dataset.date || "";

                // Helper for interaction: Get stay night boundaries
                const getNextDayStr = (dStr) => {
                    const d = new Date(dStr);
                    d.setDate(d.getDate() + 1);
                    return getStr(d);
                };
                const getPrevDayStr = (dStr) => {
                    const d = new Date(dStr);
                    d.setDate(d.getDate() - 1);
                    return getStr(d);
                };
                const lastStayNight = currentCO ? getPrevDayStr(currentCO) : null;
                const isRange = currentCI && lastStayNight && (currentCI !== lastStayNight);

                if (currentCI === dateStr || lastStayNight === dateStr) {
                    // Reset if clicking either boundary
                    checkin.value = ""; checkin.removeAttribute('data-date');
                    checkout.value = ""; checkout.removeAttribute('data-date');
                } else if (!currentCI || dateStr < currentCI || isRange) {
                    // Start fresh if: nothing selected, clicking earlier, OR a range is already set
                    let isNBooked = false;
                    if (rId) isNBooked = isBooked(scheduleData[rId] ? scheduleData[rId][dateStr] : null);
                    else {
                        let anyF = false;
                        for (let rid of localRooms.map(r => r.id)) {
                            if (!isBooked(scheduleData[rid] ? scheduleData[rid][dateStr] : null)) { anyF = true; break; }
                        }
                        isNBooked = !anyF;
                    }
                    if (isNBooked) return;

                    checkin.value = formatDisplayDate(dateStr);
                    checkin.setAttribute('data-date', dateStr);
                    checkout.value = formatDisplayDate(getNextDayStr(dateStr));
                    checkout.setAttribute('data-date', getNextDayStr(dateStr));
                } else {
                    // Extension: Clicked date > CI and it's currently only 1 night
                    let tempCI = new Date(currentCI);
                    let tempLastStay = new Date(dateStr);
                    let canSelect = true;

                    if (rId) {
                        let scan = new Date(tempCI);
                        while (scan <= tempLastStay) {
                            if (isBooked(scheduleData[rId] ? scheduleData[rId][getStr(scan)] : null)) {
                                canSelect = false; break;
                            }
                            scan.setDate(scan.getDate() + 1);
                        }
                    }

                    if (canSelect) {
                        checkout.value = formatDisplayDate(getNextDayStr(dateStr));
                        checkout.setAttribute('data-date', getNextDayStr(dateStr));
                    } else {
                        checkin.value = formatDisplayDate(dateStr);
                        checkin.setAttribute('data-date', dateStr);
                        checkout.value = formatDisplayDate(getNextDayStr(dateStr));
                        checkout.setAttribute('data-date', getNextDayStr(dateStr));
                    }
                }

                // Header update removed to preserve baseline dates (V1.28)
                // if (window.updateBookingSummaryLabels) {
                //     window.updateBookingSummaryLabels(checkin.dataset.date || "", checkout.dataset.date || "");
                // }

                if (!window._isSyncingFromNative) {
                    try {
                        window._isSyncingFromNative = true;
                        checkin.dispatchEvent(new Event('input', { bubbles: true }));
                        checkin.dispatchEvent(new Event('change', { bubbles: true }));
                        checkout.dispatchEvent(new Event('input', { bubbles: true }));
                        checkout.dispatchEvent(new Event('change', { bubbles: true }));
                    } finally {
                        window._isSyncingFromNative = false;
                    }
                }
                if (window.updateModalPricing) {
                    window.updateModalPricing(rId);
                }
                renderRoomMonthCalendar(rId, m, y);
            };
        }

        window.updateModalPricing = (rId) => {
            const container = document.getElementById('modal-price-breakdown');
            const list = document.getElementById('modal-price-list');
            const totalEl = document.getElementById('modal-total-price');
            const surchargeRow = document.getElementById('modal-surcharge-row');
            const surchargeEl = document.getElementById('modal-surcharge-price');
            const ci = document.getElementById('modal-checkin')?.dataset.date;
            const co = document.getElementById('modal-checkout')?.dataset.date;

            if (!rId || !ci || !co || !container || !list || !totalEl) {
                if (container) container.classList.add('hidden');
                return;
            }

            const ciDate = parseLocal(ci);
            const coDate = parseLocal(co);
            if (coDate <= ciDate) {
                container.classList.add('hidden');
                return;
            }

            const stayDates = [];
            let curr = new Date(ciDate);
            while (curr < coDate) {
                stayDates.push(new Date(curr));
                curr.setDate(curr.getDate() + 1);
            }

            let totalBase = 0;

            // --- DYNAMIC PRICE DISPLAY (SYNC WITH MAIN CARD) ---
            const stayNightlyDetails = stayDates.map(d => {
                const dStr = getStr(d);
                const rDayData = (pricingData[rId]?.[dStr]) || (pricingData[rId]?.['default']) || {};
                const dayNote = (rDayData.note || "").toLowerCase().normalize("NFC");
                const isDayHoliday = /l[ễễe]/.test(dayNote) || dayNote.includes("holiday") || /\bl\b/.test(dayNote);
                const dow = d.getDay();
                const isWe = (dow === 5 || dow === 6 || dow === 0);
                const nPrice = isWe ? (rDayData.weekend || 1000000) : (rDayData.weekday || 800000);
                
                return {
                    date: d,
                    price: nPrice,
                    isHoliday: isDayHoliday,
                    note: rDayData.note || ""
                };
            });

            totalBase = stayNightlyDetails.reduce((sum, n) => sum + n.price, 0);
            
            // INDIVIDUAL DISPLAY: In Suggestion Modal, always show individual breakdown once dates are chosen
            let forceIndiv = true;
            
            // Reference prices for fallback display (if needed by helper)
            const firstDateStr = getStr(stayDates[0]);
            const firstDayData = (pricingData[rId]?.[firstDateStr]) || (pricingData[rId]?.['default']) || {};
            const baseWk = firstDayData.weekday || 800000;
            const baseWn = firstDayData.weekend || 1000000;
            const selectedSurcharge = firstDayData.surcharge || 450000;

            const surchargeTxt = `Phòng tiêu chuẩn 2 khách - Phụ thu khách thứ 3: ${renderCurrency(selectedSurcharge)}đ/đêm`;

            // Replace standard list with synchronised generatePriceHTML output
            list.innerHTML = generatePriceHTML({
                forceIndividual: forceIndiv,
                baseWeekday: baseWk,
                baseWeekend: baseWn,
                nightlyDetails: stayNightlyDetails,
                surchargeText: surchargeTxt
            });

            // Surcharge logic (Adult 3+)
            let totalSurcharge = 0;
            if (adultCountLocal > 2) {
                totalSurcharge = (adultCountLocal - 2) * selectedSurcharge * stayDates.length;
            }

            const finalTotal = totalBase + totalSurcharge;
            totalEl.textContent = renderCurrency(finalTotal) + "đ / " + stayDates.length + " Đêm";

            if (totalSurcharge > 0) {
                surchargeRow.classList.remove('hidden');
                surchargeRow.classList.add('flex');
                surchargeEl.textContent = "+" + renderCurrency(totalSurcharge) + "đ";
            } else {
                surchargeRow.classList.add('hidden');
                surchargeRow.classList.remove('flex');
            }

            container.classList.remove('hidden');
        };



        const renderDay = (d) => {
            const dStr = getStr(d);
            const isToday = d.getTime() === today.getTime();
            const isPast = d < today;

            let isBookedDay = false;
            if (isPast) {
                // Staggered fake occupancy: 4 potential free days per month [5, 12, 19, 26]
                // Shifted based on roomId and month to create variety (staggered)
                const salt = (roomId ? roomId.split('').reduce((a, c) => a + c.charCodeAt(0), 0) : 10) + month;
                const offset = salt % 7;
                const potentialFreeDays = [5, 12, 19, 26].map(d => {
                    let next = d + offset;
                    return next > 30 ? next - 30 : next;
                });
                isBookedDay = !(potentialFreeDays.includes(d.getDate()));
            } else if (roomId) {
                isBookedDay = isBooked(scheduleData[roomId] ? scheduleData[roomId][dStr] : null);
            } else {
                // Global view: "Trống" if ANY room is free
                let anyFree = false;
                for (let rId of localRooms.map(r => r.id)) {
                    if (!isBooked(scheduleData[rId] ? scheduleData[rId][dStr] : null)) {
                        anyFree = true; break;
                    }
                }
                isBookedDay = !anyFree;
            }

            const ciVal = ciInput.dataset.date || "";
            const coVal = coInput.dataset.date || "";
            const ciTime = ciVal ? parseLocal(ciVal).getTime() : null;
            const coTime = coVal ? parseLocal(coVal).getTime() : null;

            // Calculate the last NIGHT the guest stays (1 day before Check-out)
            // Use parseLocal to ensure time (00:00:00) matches perfectly with current 'd'
            let lastStayNightTime = null;
            if (coVal) {
                const coDate = parseLocal(coVal);
                coDate.setDate(coDate.getDate() - 1);
                lastStayNightTime = coDate.getTime();
            }

            let isCI = ciTime && d.getTime() === ciTime;
            let isCO = coTime && d.getTime() === coTime;
            let isLastNight = lastStayNightTime && d.getTime() === lastStayNightTime;
            let isInRange = ciTime && lastStayNightTime && d.getTime() > ciTime && d.getTime() < lastStayNightTime;

            let style = 'bg-white text-graphite border border-gray-100';
            let cursor = 'cursor-pointer hover:bg-gray-50';

            if (isBookedDay) {
                style = 'bg-[#c8a96a] text-white font-bold' + (isPast ? ' opacity-60' : ' opacity-90');
                cursor = 'cursor-not-allowed';
            } else if (isCI || isLastNight) {
                style = 'bg-[#3b82f6] text-white font-bold z-10 shadow-md';
            } else if (isInRange) {
                style = 'bg-[#3b82f6]/10 text-[#3b82f6] font-medium';
            } else if (isPast && !isToday) {
                style = 'bg-white text-gray-400 opacity-60';
                cursor = 'cursor-not-allowed';
            }

            if (isToday && !isCI && !isLastNight && !isBookedDay) style += ' ring-1 ring-[#c8a96a] ring-inset';

            const dInMonth = d.getMonth() === month;
            const dayText = `<span class="${dInMonth ? 'opacity-100' : 'opacity-40'}">${d.getDate()}/${d.getMonth() + 1}</span>`;

            return `
                <div onclick="handleCalendarDateClick('${dStr}', '${roomId || ''}', ${month}, ${year})" 
                     class="${style} ${cursor} h-8 rounded-lg flex items-center justify-center text-[12px] relative transition-all duration-200 shadow-sm">
                    ${dayText}
                    ${isToday && !isBookedDay && !isCI && !isCO ? '<div class="absolute bottom-1 w-1 h-1 bg-[#c8a96a] rounded-full"></div>' : ''}
                </div>
            `;
        };

        const gridDays = [];
        for (let i = padding - 1; i >= 0; i--) {
            gridDays.push(new Date(year, month, -i));
        }
        for (let i = 1; i <= numDays; i++) {
            gridDays.push(new Date(year, month, i));
        }
        const remaining = 42 - gridDays.length;
        for (let i = 1; i <= remaining; i++) {
            gridDays.push(new Date(year, month + 1, i));
        }

        const monthNames = ["Một", "Hai", "Ba", "Bốn", "Năm", "Sáu", "Bảy", "Tám", "Chín", "Mười", "Mười Một", "Mười Hai"];
        const dayHeaders = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

        let html = `
            <div class="bg-white p-2 rounded-2xl border border-[#c8a96a]/30 shadow-xl w-full font-sans select-none animate-[fadeIn_0.5s_ease-out]">
                <div class="flex items-center justify-between mb-1 border-b border-[#c8a96a]/10 pb-1">
                    <div class="flex items-center gap-3">
                        <h4 class="text-[14px] sm:text-[15px] font-bold text-graphite font-display tracking-tight">Tháng ${monthNames[month]} ${year}</h4>
                        <div class="flex items-center gap-2 ml-1">
                             <div class="flex items-center gap-1">
                                <div class="w-2.5 h-2.5 bg-[#c8a96a] rounded-sm"></div>
                                <span class="text-[9px] text-gray-500 uppercase font-bold tracking-tighter">Hết</span>
                             </div>
                             <div class="flex items-center gap-1">
                                <div class="w-2.5 h-2.5 bg-white border border-gray-200 rounded-sm"></div>
                                <span class="text-[9px] text-gray-500 uppercase font-bold tracking-tighter">Trống</span>
                             </div>
                        </div>
                    </div>
                    <div class="flex gap-1.5">
                        <button onclick="changeCalendarMonth(-1)" class="p-1 px-3 hover:bg-gray-100 rounded-full transition-colors border border-gray-100 flex items-center shadow-sm">
                            <span class="material-symbols-outlined text-lg leading-none cursor-pointer">keyboard_arrow_left</span>
                        </button>
                        <button onclick="changeCalendarMonth(1)" class="p-1 px-3 hover:bg-gray-100 rounded-full transition-colors border border-gray-100 flex items-center shadow-sm">
                            <span class="material-symbols-outlined text-lg leading-none cursor-pointer">keyboard_arrow_right</span>
                        </button>
                    </div>
                </div>
                <div class="grid grid-cols-7 gap-1 mb-1">
                    ${dayHeaders.map(h => `<div class="text-[12px] text-[#c8a96a] text-center font-bold uppercase tracking-widest">${h}</div>`).join('')}
                </div>
                <div class="grid grid-cols-7 gap-1">
                    ${gridDays.map(d => renderDay(d)).join('')}
                </div>
            </div>
        `;
        container.innerHTML = html;
    }



    const closeModal = (isPopState = false) => {
        if (modal) {
            document.body.style.overflow = ''; // Unlock scroll
            if (!isPopState && history.state && history.state.view === 'booking-modal') {
                history.back();
            }
            modal.classList.add('opacity-0');
            if (modalContent) modalContent.classList.add('translate-y-full');

            // Hide and clear room calendar
            const container = document.getElementById('modal-room-calendar');
            if (container) {
                container.classList.add('hidden');
                container.innerHTML = '';
            }

            setTimeout(() => {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            }, 300);
        }
    };
    window.closeModal = closeModal;

    const minusAdult = document.getElementById('modal-minus-adult');
    const plusAdult = document.getElementById('modal-plus-adult');
    const minusChild = document.getElementById('modal-minus-child');
    const plusChild = document.getElementById('modal-plus-child');

    if (minusAdult) minusAdult.addEventListener('click', () => { if (adultCountLocal > 1) { adultCountLocal--; updateGuestDisplay(); if (window.updateModalPricing) window.updateModalPricing(window._currentModalRoomId); } });
    if (plusAdult) plusAdult.addEventListener('click', () => {
        const curRoomId = window._currentModalRoomId;
        if (!curRoomId || (adultCountLocal + childCountLocal < 3)) {
            adultCountLocal++;
            updateGuestDisplay();
            if (window.updateModalPricing) window.updateModalPricing(curRoomId);
        } else {
            alert("Mỗi phòng tối đa 3 khách. Nếu đi đông hơn vui lòng chọn thêm phòng.");
        }
    });
    if (minusChild) minusChild.addEventListener('click', () => { if (childCountLocal > 0) { childCountLocal--; updateGuestDisplay(); if (window.updateModalPricing) window.updateModalPricing(window._currentModalRoomId); } });
    if (plusChild) plusChild.addEventListener('click', () => {
        const curRoomId = window._currentModalRoomId;
        if (!curRoomId || (adultCountLocal + childCountLocal < 3)) {
            childCountLocal++;
            updateGuestDisplay();
            if (window.updateModalPricing) window.updateModalPricing(curRoomId);
        } else {
            alert("Mỗi phòng tối đa 3 khách. Nếu đi đông hơn vui lòng chọn thêm phòng.");
        }
    });

    const closeModalBtn = document.getElementById('close-modal-btn');
    if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
    if (summaryBar) summaryBar.addEventListener('click', openModal);
    if (changeDateBtn) changeDateBtn.addEventListener('click', (e) => { e.stopPropagation(); openModal(); });
    if (headerChangeDateBtn) headerChangeDateBtn.addEventListener('click', (e) => { e.stopPropagation(); openModal(); });

    window.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    const triggerModalWarningEffect = (msg, isCritical = false) => {
        const warning = document.getElementById('modal-booking-warning');
        if (!warning) return;
        if (msg) warning.textContent = msg;

        warning.classList.add('active');
        if (isCritical) {
            warning.classList.remove('text-[#8B4513]');
            warning.classList.add('text-red-600', 'scale-110');
        } else {
            warning.classList.add('text-[#8B4513]');
            warning.classList.remove('text-red-600', 'scale-110');
        }

        // Force restart animation on every click
        warning.style.animation = 'none';
        void warning.offsetWidth;
        warning.style.animation = '';

        warning.classList.remove('animate-shake', 'animate-pop');
        void warning.offsetWidth;
        warning.classList.add('animate-shake', 'animate-pop');

        if (isCritical) {
            setTimeout(() => {
                warning.classList.remove('scale-110');
            }, 500);
        }
    };

    const saveBtn = document.getElementById('modal-save-btn');
    if (saveBtn) {
        saveBtn.style.touchAction = 'none'; // Disable all system gestures on this button
        saveBtn.style.userSelect = 'none';
        saveBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Prevent accidental double triggers
            if (window._isSavingBooking) return;
            window._isSavingBooking = true;
            setTimeout(() => { window._isSavingBooking = false; }, 1000);

            const rId = window._currentModalRoomId;
            const modalImg = document.getElementById('modal-room-image');
            const modalContent = document.getElementById('edit-booking-content');
            const modalAgeContainer = document.getElementById('modal-children-ages-container');

            // 0. Guest Count Validation (Force selection)
            if (adultCountLocal + childCountLocal === 0) {
                triggerModalWarningEffect("Xin xác nhận số người lớn và trẻ em ở trong phòng này.", true);
                return;
            }

            const ciInput = document.getElementById('modal-checkin');
            const coInput = document.getElementById('modal-checkout');
            const ci = ciInput ? (ciInput.type === 'date' ? ciInput.value : ciInput.dataset.date || "") : '';
            const co = coInput ? (coInput.type === 'date' ? coInput.value : coInput.dataset.date || "") : '';
            if (!ci || !co) { alert("Vui lòng chọn ngày nhận và trả phòng"); return; }
            const ciDate = parseLocal(ci);
            const coDate = parseLocal(co);
            const diffDays = Math.ceil((coDate - ciDate) / (1000 * 60 * 60 * 24));

            if (diffDays <= 0) {
                alert("Ngày trả phòng phải sau ngày nhận phòng.");
                return;
            }

            // 1-NIGHT POLICY SYNC (Modal Edition - OPTIMIZED v11.18)
            // 1-NIGHT POLICY SYNC (Modal Edition - ROOM-SPECIFIC v11.20)
            if (rId && diffDays === 1) {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const isCurrentMonth = ciDate.getFullYear() === today.getFullYear() && ciDate.getMonth() === today.getMonth();

                const daysLead = Math.ceil((ciDate - today) / (1000 * 60 * 60 * 24));
                const monthId = ciDate.getMonth() + 1;

                const STATIC_POLICY = { 1: 5, 2: 5, 3: 4, 4: 7, 5: 7, 6: 5, 7: 5, 8: 5, 9: 7, 10: 7, 11: 7, 12: 5 };
                const mPolicy = (dynamicPolicyData || []).find(p => p.Month_ID === monthId);
                const minDaysLead = (mPolicy && mPolicy.Min_Days_Lead !== null) ? mPolicy.Min_Days_Lead : (STATIC_POLICY[monthId] || 7);

                // Lead Time rule applies ONLY to current calendar month
                const isWithinPeriod = isCurrentMonth && (daysLead <= minDaysLead);
                if (!isWithinPeriod) {
                    const getStrLocal = d => {
                        const yy = d.getFullYear();
                        const mm = String(d.getMonth() + 1).padStart(2, '0');
                        const dd = String(d.getDate()).padStart(2, '0');
                        return `${yy}-${mm}-${dd}`;
                    };
                    const ciStr = getStrLocal(ciDate);
                    const coStr = getStrLocal(coDate);
                    const prDate = new Date(ciDate);
                    prDate.setDate(prDate.getDate() - 1);
                    const prStr = getStrLocal(prDate);

                    const statusPr = scheduleData[rId] ? scheduleData[rId][prStr] : null;
                    const statusCo = scheduleData[rId] ? scheduleData[rId][coStr] : null;

                    const isPerfectSandwich = isBooked(statusPr) && isBooked(statusCo);

                    if (!isPerfectSandwich) {
                        triggerModalWarningEffect("Chồn ưu tiên nhận đặt phòng từ 2 đêm. Với đặt phòng 1 đêm, vui lòng liên hệ Zalo.");
                        return; // BLOCK submission
                    }
                }
            }

            // 3. Child Age Validation (Sync with index.html)
            const modalAgeSelectors = modalAgeContainer.querySelectorAll('select');
            const modalChildrenAges = Array.from(modalAgeSelectors).map(s => s.value);
            if (childCountLocal > 0 && modalChildrenAges.some(age => !age)) {
                alert("Vui lòng chọn đầy đủ độ tuổi của trẻ em.");
                return;
            }
            const childrenAgeStr = modalChildrenAges.join(',');

            // --- MULTI-ROOM & STITCHING VALIDATION (v11.23) ---
            if (rId && selectedRooms.length > 0) {
                const firstRoom = selectedRooms[0];
                const fCI = firstRoom.checkin;
                const fCO = firstRoom.checkout;

                // 1. Target Range Boundary: Modal dates must match existing OR follow consecutively
                const isMatching = selectedRooms.some(r => r.checkin === ci && r.checkout === co);
                const isSequel = selectedRooms.some(r => r.checkout === ci);
                
                if (!isMatching && !isSequel) {
                    triggerModalWarningEffect("Ngày nhận và trả của các phòng không trùng khớp", true);
                    return;
                }

            }

            // --- PRE-VALIDATION ---
            if (rId) {
                // 1-NIGHT POLICY (Specific Room)
                if (diffDays === 1) {
                    const today = new Date(); today.setHours(0, 0, 0, 0);
                    const isCurrentMonth = ciDate.getFullYear() === today.getFullYear() && ciDate.getMonth() === today.getMonth();
                    const daysLead = Math.ceil((ciDate - today) / (1000 * 60 * 60 * 24));
                    const monthId = ciDate.getMonth() + 1;
                    const mPolicy = (dynamicPolicyData || []).find(p => p.Month_ID === monthId);
                    const minDaysLead = (mPolicy && mPolicy.Min_Days_Lead !== null) ? mPolicy.Min_Days_Lead : 7;

                    if (!(isCurrentMonth && daysLead <= minDaysLead)) {
                        const prDate = new Date(ciDate); prDate.setDate(prDate.getDate() - 1);
                        const statusPr = scheduleData[rId]?.[getStr(prDate)];
                        const statusCo = scheduleData[rId]?.[co];
                        if (!(isBooked(statusPr) && isBooked(statusCo))) {
                            triggerModalWarningEffect("Chồn ưu tiên nhận đặt phòng từ 2 đêm. Với đặt phòng 1 đêm, vui lòng liên hệ Zalo.");
                            return;
                        }
                    }
                }

                // MULTI-ROOM / SEQUENTIAL SYNC
                if (selectedRooms.length > 0) {
                    const isMatching = selectedRooms.some(r => r.checkin === ci && r.checkout === co);
                    const isSequel = selectedRooms.some(r => r.checkout === ci);
                    if (!isMatching && !isSequel) {
                        triggerModalWarningEffect("Ngày nhận và trả của các phòng không trùng khớp", true);
                        return;
                    }
                }

                // GREEN ROOM
                const isUnder6Loc = modalChildrenAges.some(age => age && parseInt(age) > 0 && parseInt(age) < 6);
                if (isUnder6Loc && adultCountLocal === 2 && rId !== 'Green_Room') {
                    triggerModalWarningEffect("Phòng chọn chưa hỗ trợ trẻ dưới 6 tuổi, vui lòng liên hệ Zalo.", true);
                    return;
                }
            }

            // --- CASE 1: GLOBAL SEARCH CHANGE (No specific room) ---
            if (!rId) {
                // Strict 2-Night Policy for Global Search (New Requirement)
                if (diffDays < 2) {
                    triggerModalWarningEffect("Chồn ưu tiên nhận đặt phòng từ 2 đêm. Với đặt phòng 1 đêm, vui lòng liên hệ Zalo.");
                    return; // Prevent redirect and reload
                }

                bookingData.checkin = ci;
                bookingData.checkout = co;
                bookingData.adults = adultCountLocal;
                bookingData.children = childCountLocal;
                bookingData.childrenAgeCategory = childrenAgeStr;
                sessionStorage.setItem('chonVillageBooking', JSON.stringify(bookingData));
                selectedRooms.length = 0; // Clear previous selections
                saveSelectedRooms();
                window.location.reload(); // Refresh entire state
                return;
            }

            // --- SUCCESS: Update Selection ---
            const roomObj = localRooms.find(r => r.id === rId);
            if (!roomObj) return;

            let totalRoomPrice = 0;
            let currPriceDate = new Date(ciDate);
            while (currPriceDate < coDate) {
                const dStr = getStr(currPriceDate);
                const rData = pricingData[rId]?.[dStr] || pricingData[rId]?.['default'] || {};
                const nightP = (currPriceDate.getDay() === 5 || currPriceDate.getDay() === 6 || currPriceDate.getDay() === 0) ? (rData.weekend || 1000000) : (rData.weekday || 800000);
                totalRoomPrice += nightP;
                currPriceDate.setDate(currPriceDate.getDate() + 1);
            }

            // Unified Surcharge Calculation (Simplified)
            let roomSurchargeRate = pricingData[rId]?.['default']?.surcharge || 450000;
            if (adultCountLocal > 2) {
                const firstDateStr = getStr(ciDate);
                const firstDayData = pricingData[rId]?.[firstDateStr] || pricingData[rId]?.['default'] || {};
                roomSurchargeRate = firstDayData.surcharge || 450000;
                totalRoomPrice += (adultCountLocal - 2) * roomSurchargeRate * diffDays;
            }

            const selectionData = {
                ...roomObj,
                img: modalImg ? modalImg.src : roomObj.img,
                checkin: ci, checkout: co,
                adults: adultCountLocal, children: childCountLocal,
                childrenAgeCategory: childrenAgeStr,
                totalPrice: totalRoomPrice, nights: diffDays,
                surcharge: roomSurchargeRate
            };

            // Update Selection
            const existingIdx = selectedRooms.findIndex(r => String(r.id) === String(rId));
            if (existingIdx !== -1) selectedRooms[existingIdx] = selectionData;
            else selectedRooms.push(selectionData);

            saveSelectedRooms();

            if (window.updateBookingSummaryLabels) window.updateBookingSummaryLabels(ci, co);

            const summaryCheckinEl = document.getElementById('summary-checkin');
            const summaryCheckoutEl = document.getElementById('summary-checkout');
            const summaryGuestsEl = document.getElementById('summary-guests');
            const miniSummaryDatesEl = document.getElementById('mini-summary-dates');
            const miniSummaryGuestsEl = document.getElementById('mini-summary-guests');

            if (summaryCheckinEl) summaryCheckinEl.textContent = `Ngày Nhận: ${formatDateObj(ciDate)}`;
            if (summaryCheckoutEl) summaryCheckoutEl.textContent = `Ngày Trả: ${formatDateObj(coDate)}`;
            
            const guestFull = `Người Lớn ${adultCountLocal}${childCountLocal > 0 ? ` - Trẻ Em ${childCountLocal}` : ''}`;
            const guestMini = `NL ${adultCountLocal}${childCountLocal > 0 ? ` - TE ${childCountLocal}` : ''}`;

            if (summaryGuestsEl) summaryGuestsEl.textContent = guestFull;
            if (miniSummaryGuestsEl) miniSummaryGuestsEl.textContent = guestMini;

            if (miniSummaryDatesEl) {
                const dCI = formatDateShort(ciDate);
                const dCO = formatDateShort(coDate);
                miniSummaryDatesEl.textContent = `${dCI} - ${dCO}`;
            }

            // --- ANIMATION FLOW ---
            // 1. Render waitlist to create the slot
            renderWaitlist();

            // 2. Shrink Modal Content (Initial feedback)
            if (modalContent) {
                modalContent.style.transition = 'transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.5s ease';
                modalContent.style.transform = 'scale(0.9) translateY(20px)';
                modalContent.style.pointerEvents = 'none';
            }

            // 3. Fly the image and shrink towards the specific target slot
            const targetItem = document.getElementById(`waitlist-item-${rId}`);
            if (modalImg && targetItem && modalContent) {
                targetItem.style.opacity = '0'; // Hide real item temporarily

                const modalRect = modalContent.getBoundingClientRect();
                const targetRect = targetItem.getBoundingClientRect();
                const deltaX = (targetRect.left + targetRect.width / 2) - (modalRect.left + modalRect.width / 2);
                const deltaY = (targetRect.top + targetRect.height / 2) - (modalRect.top + modalRect.height / 2);

                // Start combined animation
                modalContent.style.transition = 'transform 0.7s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.5s ease';
                modalContent.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(0.1)`;
                modalContent.style.opacity = '0';

                animateFly(modalImg, targetItem, modalImg.src, () => {
                    targetItem.style.opacity = '1';
                    closeModal();
                    // Reset modal transform for next time
                    setTimeout(() => {
                        if (modalContent) {
                            modalContent.style.transform = '';
                            modalContent.style.opacity = '';
                            modalContent.style.transition = '';
                            modalContent.style.pointerEvents = '';
                        }
                    }, 100);
                });
            } else {
                closeModal();
            }
        });
    }

    // --- HEADER SCROLL ANIMATION LOGIC ---
    if (summaryBar) {
        const headerTitleContainer = document.getElementById('header-title-container');
        const headerTitle = document.getElementById('header-title');
        const headerDecorTop = document.getElementById('header-decor-top');
        const headerDecorBottom = document.getElementById('header-decor-bottom');
        const headerRightContainer = document.getElementById('header-right-container');

        // Capture initial top or fallback to a reasonable offset
        let summaryTop = 0;
        const updateTop = () => {
            const rect = summaryBar.getBoundingClientRect();
            if (rect.top > 0) summaryTop = rect.top + window.scrollY;
        };
        updateTop();
        
        window.addEventListener('resize', updateTop);
        // Also update after 1s just in case content loaded late
        setTimeout(updateTop, 1000);

        window.addEventListener('scroll', () => {
            try {
                // If summaryTop calculation failed, use fallback (100px)
                const triggerPoint = (summaryTop > 50) ? (summaryTop - 20) : 100;
                const isScrolled = window.scrollY > triggerPoint;
                
                if (isScrolled) {
                    if (headerTitleContainer && !headerTitleContainer.classList.contains('left-4')) {
                        headerTitleContainer.classList.replace('left-1/2', 'left-4');
                        headerTitleContainer.classList.remove('-translate-x-1/2', 'flex-col');
                        headerTitleContainer.classList.add('flex-row', 'gap-3', 'items-center');
                    }
                    
                    if (headerTitle) {
                        headerTitle.classList.replace('text-[32px]', 'text-[22px]');
                    }
                    
                    if (headerDecorTop && headerDecorBottom) {
                        headerDecorTop.classList.remove('opacity-0', 'pb-0.5', 'w-full', 'max-w-[120px]');
                        headerDecorBottom.classList.remove('opacity-0', 'pt-0.5', 'w-full', 'max-w-[120px]');
                        headerDecorTop.classList.add('w-[30px]', 'shrink-0'); 
                        headerDecorBottom.classList.add('w-[30px]', 'shrink-0');
                    }
                    
                    if (headerRightContainer) {
                        headerRightContainer.classList.replace('opacity-0', 'opacity-100');
                        headerRightContainer.classList.replace('translate-y-4', 'translate-y-0');
                        headerRightContainer.classList.replace('scale-95', 'scale-100');
                        headerRightContainer.classList.remove('pointer-events-none');
                    }

                    summaryBar.style.opacity = '0';
                    summaryBar.style.pointerEvents = 'none';
                    summaryBar.style.transform = 'translateY(-10px)';
                    summaryBar.style.transition = 'all 0.4s ease';
                    
                } else {
                    if (headerTitleContainer && headerTitleContainer.classList.contains('left-4')) {
                        headerTitleContainer.classList.replace('left-4', 'left-1/2');
                        headerTitleContainer.classList.add('-translate-x-1/2', 'flex-col');
                        headerTitleContainer.classList.remove('flex-row', 'gap-3', 'items-center');
                    }
                    
                    if (headerTitle) {
                        headerTitle.classList.replace('text-[22px]', 'text-[32px]');
                    }
                    
                    if (headerDecorTop && headerDecorBottom) {
                        headerDecorTop.classList.add('opacity-0', 'pb-0.5', 'w-full', 'max-w-[120px]');
                        headerDecorBottom.classList.add('opacity-0', 'pt-0.5', 'w-full', 'max-w-[120px]');
                        headerDecorTop.classList.remove('w-[30px]', 'shrink-0');
                        headerDecorBottom.classList.remove('w-[30px]', 'shrink-0');
                    }

                    if (headerRightContainer) {
                        headerRightContainer.classList.replace('opacity-100', 'opacity-0');
                        headerRightContainer.classList.replace('translate-y-0', 'translate-y-4');
                        headerRightContainer.classList.replace('scale-100', 'scale-95');
                        headerRightContainer.classList.add('pointer-events-none');
                    }

                    summaryBar.style.opacity = '1';
                    summaryBar.style.pointerEvents = 'auto';
                    summaryBar.style.transform = 'translateY(0)';
                }
            } catch (err) {
                console.warn("Scroll animation failed:", err);
            }
        });
    }

    // Xử lý nút Xác nhận đặt cuối cùng
    const confirmBtn = document.getElementById('confirm-waitlist-btn');
    if (confirmBtn) {
        confirmBtn.style.touchAction = 'none';
        confirmBtn.style.userSelect = 'none';

        // Use click for better mobility compatibility (pointerdown can be blocked for redirects)
        confirmBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (selectedRooms.length === 0) return;

            // Use the updated guest counts from modal scope
            const totalGuestsCount = adultCountLocal + childCountLocal;
            const totalCapacity = selectedRooms.length * 3;
            const warningEl = document.getElementById('waitlist-booking-warning');

            if (totalGuestsCount > totalCapacity) {
                if (e.cancelable) e.preventDefault();
                if (warningEl) {
                    warningEl.textContent = "Vượt quá quy định. Mỗi phòng chỉ ở tối đa 3 khách, có thu phí theo thông tin phòng.";
                    warningEl.classList.remove('hidden');
                    warningEl.classList.add('animate-shake', 'animate-pop');

                    // Trigger animation reset
                    warningEl.style.animation = 'none';
                    void warningEl.offsetWidth;
                    warningEl.style.animation = '';

                    // Auto-hide after 5 seconds
                    if (window.waitlistWarningTimeout) clearTimeout(window.waitlistWarningTimeout);
                    window.waitlistWarningTimeout = setTimeout(() => {
                        warningEl.classList.add('hidden');
                        window.isWaitlistWarningActive = false;
                    }, 5000);

                    // Click anywhere to hide immediately
                    if (!window.isWaitlistWarningActive) {
                        window.isWaitlistWarningActive = true;
                        const hideNow = (evt) => {
                            if (confirmBtn.contains(evt.target)) return;
                            warningEl.classList.add('hidden');
                            window.isWaitlistWarningActive = false;
                            document.removeEventListener('click', hideNow);
                        };
                        setTimeout(() => document.addEventListener('click', hideNow), 10);
                    }
                }
                return;
            }

            if (warningEl) warningEl.classList.add('hidden');
            confirmBtn.textContent = "Đang xử lý...";
            confirmBtn.style.pointerEvents = 'none';
            confirmBtn.classList.add('opacity-70', 'scale-95');

            // Save and Redirect
            sessionStorage.setItem('chonVillageSelectedRooms', JSON.stringify(selectedRooms));
            sessionStorage.setItem('chonVillageSelectedRoom', JSON.stringify(selectedRooms[0]));

            // Note: We keep the localStorage for persistence even after redirecting to checkout, 
            // in case they press back. We should clear it only after successful payment/booking.

            setTimeout(() => {
                window.location.href = 'checkout.html';
            }, 200);
        });
    }

    // Handle Back Button (Popstate) to close modal
    window.addEventListener('popstate', (e) => {
        if (modal && !modal.classList.contains('hidden')) {
            closeModal(true);
        }
    });

    // Initial Load of Waitlist
    loadSelectedRooms();

// --- Waitlist Logic (Phòng chờ đặt) ---

// Lưu selectedRooms vào sessionStorage
function saveSelectedRooms() {
    sessionStorage.setItem('chonVillageSelectedRooms', JSON.stringify(selectedRooms));
    if (selectedRooms.length === 1) {
        sessionStorage.setItem('chonVillageSelectedRoom', JSON.stringify(selectedRooms[0]));
    } else {
        sessionStorage.removeItem('chonVillageSelectedRoom');
    }
}

// Khôi phục selectedRooms từ sessionStorage
function loadSelectedRooms() {
    try {
        const stored = sessionStorage.getItem('chonVillageSelectedRooms');
        if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) {
                selectedRooms.length = 0;
                parsed.forEach(r => selectedRooms.push(r));
            }
        }
    } catch (e) {
        console.warn('[ROOMS] Could not restore selectedRooms:', e);
    }
    renderWaitlist();
}

// Hàm render danh sách phòng chờ dưới footer
function renderWaitlist() {
    const container = document.getElementById('waitlist-items');
    const footer = document.getElementById('waitlist-footer');
    const countEl = document.getElementById('waitlist-count');
    if (!container || !footer) return;

    // 0. Reset Confirm Button State (Prevention for 'Back' and state persistence)
    const confirmBtnActive = document.getElementById('confirm-waitlist-btn');
    if (confirmBtnActive) {
        confirmBtnActive.textContent = "XÁC NHẬN ĐẶT";
        confirmBtnActive.style.pointerEvents = 'auto';
        confirmBtnActive.classList.remove('opacity-70', 'scale-95');
    }

    // 1. Đồng bộ trạng thái các nút trên danh sách phòng
    const allRoomButtons = document.querySelectorAll('button[data-room-id]');
    allRoomButtons.forEach(btn => {
        const roomId = btn.getAttribute('data-room-id');
        const isSelected = selectedRooms.some(r => String(r.id) === String(roomId));
        const isSuggestion = btn.getAttribute('data-is-suggestion') === 'true';

        if (isSelected) {
            btn.textContent = 'ĐÃ CHỌN';
            btn.classList.add('bg-[#A0824B]', 'pointer-events-none');
            btn.classList.remove('bg-primary');
        } else {
            btn.textContent = isSuggestion ? 'Xem Ngày Trống Của Phòng Này' : 'CHỌN PHÒNG';
            btn.classList.remove('bg-[#A0824B]', 'pointer-events-none');
            btn.classList.add('bg-primary');
        }
    });

    const contactContainer = document.getElementById('floating-contact-container');

    if (selectedRooms.length === 0) {
        footer.classList.add('translate-y-full');
        if (contactContainer) contactContainer.style.bottom = '128px';
        return;
    }

    footer.classList.remove('translate-y-full');
    if (contactContainer) contactContainer.style.bottom = '240px';

    if (countEl) countEl.textContent = selectedRooms.length;

    container.innerHTML = selectedRooms.map((room, index) => {
        // Correct identification for animation
        const rId = room.id;
        return `
            <div id="waitlist-item-${rId}" class="relative group/item shrink-0 transition-opacity duration-300">
                <div class="w-[64px] h-[64px] rounded-full overflow-hidden border-2 border-primary shadow-md bg-white">
                    <img src="${room.img}" class="w-full h-full object-cover">
                </div>
                <!-- Nút X để xóa phòng -->
                <button onclick="removeFromWaitlist(${index})" class="absolute -top-1 -right-1 bg-red-500 text-white rounded-full size-[22px] flex items-center justify-center shadow-lg active:scale-95 transition-all z-10 border border-white">
                    <span class="material-symbols-outlined text-[13px] font-bold">close</span>
                </button>
            </div>
        `;
    }).join('');
}

// Hàm xóa phòng khỏi danh sách
window.removeFromWaitlist = function (index) {
    selectedRooms.splice(index, 1);
    saveSelectedRooms();
    renderWaitlist();
};

// Hiệu ứng "Bay" (Fly to Footer)
function animateFly(startEl, targetEl, imgSrc, callback) {
    const flyContainer = document.getElementById('fly-container');
    if (!flyContainer || !startEl || !targetEl) {
        if (callback) callback();
        return;
    }

    const startRect = startEl.getBoundingClientRect();
    const targetRect = targetEl.getBoundingClientRect();

    const clone = document.createElement('img');
    clone.src = imgSrc;
    clone.className = 'fixed object-cover rounded-sm z-[200] transition-all duration-700 cubic-bezier(0.25, 1, 0.5, 1)';

    // Vị trí bắt đầu
    clone.style.top = `${startRect.top}px`;
    clone.style.left = `${startRect.left}px`;
    clone.style.width = `${startRect.width}px`;
    clone.style.height = `${startRect.height}px`;
    clone.style.opacity = '1';

    // Force reflow for first selection animation
    void clone.offsetWidth;

    flyContainer.appendChild(clone);
    // Bắt đầu bay - Thêm một chút delay nhỏ để đảm bảo Footer đã bắt đầu hiện
    setTimeout(() => {
        requestAnimationFrame(() => {
            const freshTargetRect = targetEl.getBoundingClientRect();
            clone.style.top = `${freshTargetRect.top}px`;
            clone.style.left = `${freshTargetRect.left}px`;
            clone.style.width = `${freshTargetRect.width}px`;
            clone.style.height = `${freshTargetRect.height}px`;
            clone.style.opacity = '0.7';
            clone.style.borderRadius = '8px';
            clone.style.transform = 'scale(0.3)';
        });
    }, 50);

    // Xóa clone sau khi bay xong
    setTimeout(() => {
        clone.remove();
        if (callback) callback();
    }, 750);
}

// Override hàm selectRoom để hỗ trợ waitlist
window.selectRoom = function (btn, roomData) {
    // 1. Kiểm tra nếu phòng đã có trong list thì không thêm nữa
    const isAlreadyIn = selectedRooms.some(r => String(r.id) === String(roomData.id));
    if (isAlreadyIn) return;

    // 2. Capacity Validation for single room
    const totalGuestsSelect = (typeof adults !== 'undefined' ? adults : 2) + (typeof children !== 'undefined' ? children : 0);
    if (totalGuestsSelect > 3 && selectedRooms.length === 0) {
        alert("Vượt quá quy định. Mỗi phòng chỉ ở tối đa 3 khách, có thu phí theo thông tin phòng.");
    }

    // 2. Chuyển nút sang trạng thái "Đã chọn" ngay lập tức
    btn.textContent = 'ĐÃ CHỌN';
    btn.classList.add('bg-[#A0824B]', 'pointer-events-none');
    btn.classList.remove('bg-primary');

    // 3. Thêm vào mảng local
    // Include surcharge and notes for checkout page calculation
    // SPECIAL RULE: If stay >= 3 nights (4 days 3 nights), the surcharge is already handled or we use roomData.surcharge
    let finalSurcharge = roomData.surcharge || 450000;

    if (roomData.nights >= 3) {
        console.log(`[DEBUG] Stay >= 3 nights (${roomData.nights}). Surcharge used: ${finalSurcharge}`);
    }

    selectedRooms.push({
        ...roomData,
        surcharge: finalSurcharge
    });

    saveSelectedRooms();

    // 4. Render lại waitlist để tạo placeholder
    renderWaitlist();

    // 5. Tìm placeholder vừa tạo và ẩn nó đi để chờ ảnh bay tới
    const targetItem = document.getElementById(`waitlist-item-${roomData.id}`);
    const imgEl = document.getElementById(`img-${roomData.id}`);

    if (targetItem) {
        targetItem.style.opacity = '0'; // Ẩn item thực tế

        // Chạy hiệu ứng bay đến đúng vị trí của placeholder
        animateFly(imgEl, targetItem, roomData.img, () => {
            targetItem.style.opacity = '1'; // Hiện item thực tế khi bay xong
        });
    }
};


// --- Reviews Logic ---
const REVIEWS_API_URL = "https://script.google.com/macros/s/AKfycbyKwYdqY1Xd762VehUWY8wCKCdek6rc0lASlrUfZVh33B4X_ozjWSxqDUt3PIz27cg/exec";

// Fallback Mock Data based on the user's screenshot
const MOCK_REVIEWS = [
    {
        name: "Linhh Trúc",
        info: "Local Guide · 6 bài đánh giá · 10 ảnh",
        rating: "5/5",
        time: "3 tuần trước trên Google",
        content: "100đ cho phòng nghỉ, nhân viên siêu siêu dễ thương và nhiệt tình ạ. Recoment mng tới đây nghỉ dưỡng khi tới đà lạt ạaa. Nhất định lần sau quay lại mình sẽ ghé đây tiếp ạ",
        tripType: "Chuyến nghỉ mát",
        travelGroup: "Cặp đôi",
        roomScore: 5,
        serviceScore: 5,
        locationScore: 5,
        highlights: "Sang trọng, Lãng mạn, Yên tĩnh, Phù hợp với trẻ em, Giá tốt"
    },
    {
        name: "Mai Anh",
        info: "2 bài đánh giá",
        rating: "5/5",
        time: "1 tháng trước trên Google",
        content: "Phòng ốc cực kỳ sạch sẽ và mang phong cách châu cổ điển rất sang trọng. Điểm cộng lớn là view nhìn ra thung lũng rất chill, ngắm bình minh tuyệt vời.",
        tripType: "Kỳ nghỉ gia đình",
        travelGroup: "Gia đình",
        roomScore: 5,
        serviceScore: 5,
        locationScore: 4,
        highlights: "View đẹp, Yên tĩnh, Sang trọng"
    },
    {
        name: "Minh Quân",
        info: "10 bài đánh giá",
        rating: "5/5",
        time: "2 tháng trước trên Tripadvisor",
        content: "Trải nghiệm đáng nhớ tại Chồn Village. Nội thất phòng đều được chăm chút tỉ mỉ, giường cực kỳ êm. Bạn nhân viên take care chu đáo từ lúc check in tới check out.",
        tripType: "Công tác",
        travelGroup: "Đi một mình",
        roomScore: 5,
        serviceScore: 5,
        locationScore: 5,
        highlights: "Phục vụ xuất sắc, Sạch sẽ, Giường thoải mái"
    }
];

async function loadReviews() {
    try {
        const res = await fetch(REVIEWS_API_URL);
        const data = await res.json();
        if (data.error || !Array.isArray(data) || data.length === 0) {
            console.warn("API trả về lỗi hoặc chưa có data, sử dụng Mock Data mẫu cho khách hàng");
            renderReviews(MOCK_REVIEWS);
        } else {
            // Map the parsed data dynamically based on fuzzy column names
            const parsedData = data.map(row => {
                const getVal = (possibleKeys) => {
                    const key = Object.keys(row).find(k => possibleKeys.some(pk => k.toLowerCase().includes(pk)));
                    return key ? row[key] : "";
                };

                return {
                    name: getVal(["tên", "khách", "name", "tác giả"]) || "Khách hàng",
                    info: getVal(["loại", "guide", "thông tin", "info"]),
                    rating: getVal(["số sao", "đánh giá", "rating", "điểm"]) || "5/5",
                    time: getVal(["thời gian", "ngày", "time", "date"]) || "Gần đây",
                    content: getVal(["nội", "dung", "nhận xét", "content", "review"]) || "",
                    tripType: getVal(["loại chuyến", "trip"]),
                    travelGroup: getVal(["nhóm", "khách", "group"]),
                    roomScore: getVal(["phòng"]),
                    serviceScore: getVal(["dịch vụ", "service"]),
                    locationScore: getVal(["vị trí", "location"]),
                    highlights: getVal(["nổi bật", "highlight", "điểm"])
                };
            }).filter(r => r.content && r.name !== "Khách hàng");

            if (parsedData.length > 0) {
                renderReviews(parsedData);
            } else {
                renderReviews(MOCK_REVIEWS);
            }
        }
    } catch (error) {
        console.error("Lỗi khi fetch reviews từ Google Sheet:", error);
        renderReviews(MOCK_REVIEWS);
    }
}

function renderReviews(reviews) {
    const section = document.getElementById('reviews-section');
    const slider = document.getElementById('reviews-slider');
    if (!section || !slider) return;

    slider.innerHTML = reviews.map((r, i) => {
        const initials = r.name.trim().substring(0, 2).toUpperCase();

        let starsHtml = '';
        const starCount = parseInt(String(r.rating).charAt(0)) || 5;
        for (let s = 0; s < starCount; s++) {
            starsHtml += `<span class="material-symbols-outlined text-[#C8A96A] text-[14px]" style="font-variation-settings: 'FILL' 1;">star</span>`;
        }

        const buildDetailRow = (label, val) => {
            if (!val) return '';
            return `<div class="flex justify-between items-center text-[12px] border-b border-primary/10 pb-1 mb-1.5">
                        <span class="text-slate-500 font-bold">${label}:</span>
                        <span class="text-graphite font-medium text-right max-w-[60%] sm:max-w-[70%]">${val}</span>
                    </div>`;
        };
        const buildScoreItem = (label, val) => {
            if (!val) return '';
            return `<div class="flex flex-col items-center">
                        <span class="text-slate-500 font-bold text-[10px] uppercase">${label}</span>
                        <span class="text-graphite font-bold text-[13px]">${val}</span>
                    </div>`;
        };

        const hasScores = r.roomScore || r.serviceScore || r.locationScore;
        const scoreRow = hasScores ? `
                <div class="flex justify-around items-center bg-[#FAF6EC] p-2 rounded-md mt-3 border border-primary/20">
                    ${buildScoreItem('Phòng', r.roomScore)}
                    ${buildScoreItem('Dịch vụ', r.serviceScore)}
                    ${buildScoreItem('Vị trí', r.locationScore)}
                </div>
                ` : '';

        return `
                <div class="snap-start shrink-0 w-[85vw] sm:w-[350px] bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-[#C8A96A]/20 p-5 flex flex-col relative overflow-hidden active:scale-[0.98] transition-all duration-300 review-card-animate will-change-transform select-none cursor-grab active:cursor-grabbing" style="animation-delay: ${i * 100}ms;">
                <!-- Decor Elements -->
                <div class="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-[#C8A96A]/10 to-transparent rounded-bl-full -z-0 pointer-events-none"></div>
                <span class="material-symbols-outlined absolute top-3 right-3 text-[#C8A96A]/20 text-5xl -z-0 pointer-events-none" style="font-variation-settings: 'FILL' 1;">format_quote</span>
                
                <!-- Reviewer Header -->
                <div class="flex items-center gap-3 relative z-10 mb-4">
                    <div class="w-20 h-20 rounded-full bg-gradient-to-br from-[#C8A96A] to-[#A0824B] text-white flex items-center justify-center font-display font-bold text-3xl shadow-inner shrink-0">
                        ${initials}
                    </div>
                    <div class="flex flex-col min-w-0">
                        <span class="font-bold text-graphite text-[16px] leading-tight truncate w-full">${r.name}</span>
                        ${r.info ? `<span class="text-slate-400 text-[11px] truncate w-full mt-0.5">${r.info}</span>` : ''}
                    </div>
                </div>

                <!-- Rating & Time -->
                <div class="flex items-center flex-wrap gap-2 mb-3 relative z-10">
                    <div class="flex items-center gap-0.5">
                        <span class="font-bold text-graphite text-sm mr-1 leading-none pt-0.5">${r.rating}</span>
                        ${starsHtml}
                    </div>
                    <span class="text-slate-400 text-[11px]">• ${r.time}</span>
                </div>

                <!-- Content -->
                <p class="text-slate-600 text-[14px] leading-relaxed italic mb-5 relative z-10 break-words line-clamp-[7]">
                    "${r.content}"
                </p>

                <!-- Detailed Specs -->
                <div class="mt-auto relative z-10">
                    ${buildDetailRow('Loại chuyến đi', r.tripType)}
                    ${buildDetailRow('Nhóm khách', r.travelGroup)}

                    ${r.highlights ? `
                    <div class="mt-2 text-[12px] text-slate-500 bg-slate-50 p-2 rounded border border-slate-100 italic">
                        <span class="font-bold text-graphite not-italic">Điểm nổi bật:</span> ${r.highlights}
                    </div>
                    ` : ''}

                    ${scoreRow}
                </div>
            </div>
                `;
    }).join('');

    section.classList.remove('hidden');
    // Bật lên với hiệu ứng fade in
    setTimeout(() => {
        section.classList.remove('opacity-0');

        // Thêm tính năng kéo thả cuộn ngang (drag to scroll) cho máy tính
        let isDown = false;
        let startX;
        let scrollLeft;

        slider.addEventListener('mousedown', (e) => {
            isDown = true;
            slider.style.scrollBehavior = 'auto'; // Tạm tắt smooth scroll khi user mousedown
            slider.style.scrollSnapType = 'none'; // Tắt snap khi mousedown để kéo mượt
            startX = e.pageX - slider.offsetLeft;
            scrollLeft = slider.scrollLeft;
        });
        slider.addEventListener('mouseleave', () => {
            if (!isDown) return;
            isDown = false;
            slider.style.scrollBehavior = 'smooth';
            slider.style.scrollSnapType = 'x mandatory';
        });
        slider.addEventListener('mouseup', () => {
            isDown = false;
            slider.style.scrollBehavior = 'smooth';
            slider.style.scrollSnapType = 'x mandatory';
            // Snap về thẻ gần nhất (cần một chút timeout để thả chuột kích hoạt cuộn)
            setTimeout(() => { slider.scrollBy({ left: 1, behavior: 'smooth' }); }, 50);
        });
        slider.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            const x = e.pageX - slider.offsetLeft;
            const walk = (x - startX) * 2; // Tốc độ cuộn x2
            slider.scrollLeft = scrollLeft - walk;
        });

    }, 100);
}

function openGallery(roomId, isPopState = false) {
    const media = window.galleryData[roomId];
    if (!media || media.length === 0) {
        console.warn("No gallery data for room:", roomId);
        return;
    }

    if (!isPopState) {
        history.pushState({ view: 'gallery-grid', roomId: roomId }, '');
    }

    currentGallery = media;
    currentRoomId = roomId;
    currentGalleryIndex = 0;

    // Create Modal if not exists
    let modal = document.getElementById('room-gallery-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'room-gallery-modal';
        modal.className = 'fixed inset-0 z-[9999] bg-[#FFFAF0] opacity-0 pointer-events-none transition-all duration-500 flex flex-col items-center p-0 overflow-y-auto overflow-x-hidden';
        modal.innerHTML = `
            <style>
                #room-gallery-modal.active { opacity: 1 !important; pointer-events: auto !important; }
                .grid-container { max-width: 1200px; width: 100%; margin: 80px auto; padding: 0 20px; }
                .grid-layout { display: grid; grid-template-columns: 2fr 1fr; gap: 10px; border-radius: 12px; overflow: hidden; margin-bottom: 20px; }
                @media (max-width: 768px) { .grid-layout { grid-template-columns: 1fr; } }
                .grid-item { position: relative; cursor: pointer; overflow: hidden; background: #f8f8f8; border: 1px solid rgba(0,0,0,0.05); border-radius: 8px; }
                .grid-item img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.5s ease; pointer-events: none; }
                .grid-item:hover img { transform: scale(1.05); }
                .grid-feature { grid-row: span 2; height: 410px; }
                @media (max-width: 768px) { .grid-feature { grid-row: span 1; height: 250px; } }
                .grid-secondary { height: 200px; }
                .grid-thumbnails { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; padding-bottom: 50px; }
                @media (max-width: 480px) { .grid-thumbnails { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); } }
                .grid-thumb { aspect-ratio: 16/10; }
                
                .detail-container { position: fixed; inset: 0; background: black; z-index: 200; display: none; flex-direction: column; align-items: center; justify-content: flex-start; padding: 0; overflow: hidden; }
                .detail-container.active { display: flex; }
                .gallery-media { max-width: 100vw; max-height: calc(100vh - 180px); width: auto; height: auto; object-fit: contain; }
                .nav-btn, .detail-close-btn-bottom { background: rgba(255, 255, 255, 0.1); color: white; border: 1px solid rgba(255,255,255,0.2); width: 56px; height: 56px; border-radius: 50%; cursor: pointer; backdrop-filter: blur(8px); transition: 0.3s; display: flex; align-items: center; justify-content: center; z-index: 220; }
                .nav-btn:hover, .detail-close-btn-bottom:hover { background: rgba(255,255,255,0.3); transform: scale(1.1); border-color: white; }
                .detail-close-btn-bottom:hover { background: rgba(239, 68, 68, 0.4); } 
                
                .detail-footer-controls { position: absolute; bottom: 0; left: 0; right: 0; padding: 20px 0 30px; display: flex; flex-direction: column; align-items: center; background: linear-gradient(to top, rgba(0,0,0,0.8), transparent); z-index: 210; pointer-events: none; }
                .detail-footer-controls > * { pointer-events: auto; }
                
                .gallery-header { position: sticky; top: 0; width: 100%; background: rgba(255, 250, 240, 0.95); backdrop-filter: blur(12px); z-index: 101; padding: 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(191, 149, 63, 0.2); box-shadow: 0 4px 20px rgba(0,0,0,0.05); }
                .gallery-close-btn { color: #1a1a1a; cursor: pointer; border: 1px solid #c8a96a; padding: 8px; border-radius: 50%; transition: all 0.3s; display: flex; align-items: center; justify-content: center; }
                .gallery-close-btn:hover { background: #c8a96a; color: white; }
                
                .video-play-icon { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.2); color: white; transition: background 0.3s; }
                .grid-item:hover .video-play-icon { background: rgba(0,0,0,0.4); }
            </style>
            
            <div class="gallery-header">
                <div style="font-family: 'Gilda Display', serif; font-style: italic; font-size: 1.25rem; color: #BF953F;">Chồn Village Gallery</div>
                <div class="gallery-close-btn" onclick="closeGallery()">
                    <span class="material-symbols-outlined">close</span>
                </div>
            </div>
 
            <div id="grid-view" class="grid-container animate-[fadeIn_0.5s_ease-out]">
                <!-- Grid items injected here -->
            </div>
 
            <div id="detail-view" class="detail-container">
                <div id="detail-media-container" class="w-full h-full flex items-start justify-center p-0 pt-2"></div>
                
                <div class="detail-footer-controls">
                    <!-- Navigation & Close Buttons Area -->
                    <div class="flex gap-8 mb-4 z-[210]">
                        <button class="nav-btn" onclick="prevGallery()">
                            <span class="material-symbols-outlined">chevron_left</span>
                        </button>
                        <button class="nav-btn" onclick="nextGallery()">
                            <span class="material-symbols-outlined">chevron_right</span>
                        </button>
                        <button class="detail-close-btn-bottom" onclick="closeGallery()">
                            <span class="material-symbols-outlined">close</span>
                        </button>
                    </div>

                    <!-- Mini Thumb Bar -->
                    <div id="detail-thumbs" class="flex gap-2 overflow-x-auto max-w-full px-4 scrollbar-hide h-16"></div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    renderGalleryGrid();
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function renderGalleryGrid() {
    const gridView = document.getElementById('grid-view');
    const detailView = document.getElementById('detail-view');
    if (!gridView || !detailView) return;

    gridView.style.display = 'block';
    detailView.classList.remove('active');

    if (!currentGallery || currentGallery.length === 0) return;

    const feature = currentGallery[0];
    const secondary = currentGallery.slice(1, 3);
    const rest = currentGallery.slice(3);

    const finalFeatureThumb = convertGDriveUrl(feature.url, false, false, "w1200");

    gridView.innerHTML = `
        <div class="grid-layout">
            <div class="grid-item grid-feature" onclick="openDetail(0)">
                <img src="${finalFeatureThumb}" loading="lazy" class="w-full h-full object-cover" 
                     onerror="this.style.opacity='0'"/>
                ${feature.type === 'video' ? `
                    <div class="video-play-icon">
                        <span class="material-symbols-outlined text-white text-6xl">play_circle</span>
                    </div>
                ` : ''}
            </div>
            ${secondary.map((m, i) => {
        const finalThumb = convertGDriveUrl(m.url, false, false, "w1024");
        return `
                <div class="grid-item grid-secondary" onclick="openDetail(${i + 1})">
                    <img src="${finalThumb}" loading="lazy" class="w-full h-full object-cover" 
                         onerror="this.style.opacity='0'"/>
                    ${m.type === 'video' ? `
                        <div class="video-play-icon">
                            <span class="material-symbols-outlined text-white text-4xl">play_circle</span>
                        </div>
                    ` : ''}
                </div>`;
    }).join('')}
        </div>
        <div class="grid-thumbnails">
            ${rest.map((m, i) => {
        const finalThumb = convertGDriveUrl(m.url, false, false, "w800");
        return `
                <div class="grid-item grid-thumb" onclick="openDetail(${i + 3})">
                    <img src="${finalThumb}" loading="lazy" class="w-full h-full object-cover" 
                         onerror="this.style.opacity='0'"/>
                    ${m.type === 'video' ? `
                        <div class="video-play-icon">
                            <span class="material-symbols-outlined text-white text-3xl">play_circle</span>
                        </div>
                    ` : ''}
                </div>`;
    }).join('')}
        </div>
    `;
}

function openDetail(index, isPopState = false) {
    const gridView = document.getElementById('grid-view');
    const detailView = document.getElementById('detail-view');
    if (!gridView || !detailView) return;

    if (!isPopState) {
        history.pushState({ view: 'gallery-detail', index: index, roomId: currentRoomId }, '');
    }

    gridView.style.display = 'none';
    detailView.classList.add('active');
    currentGalleryIndex = index;
    updateDetailDisplay();
}

function showGrid(isPopState = false) {
    if (!isPopState && history.state && history.state.view === 'gallery-detail') {
        history.back();
    }
    renderGalleryGrid();
}

function updateDetailDisplay() {
    const container = document.getElementById('detail-media-container');
    const thumbContainer = document.getElementById('detail-thumbs');
    const item = currentGallery[currentGalleryIndex];

    if (!container || !item) return;

    if (item.type === 'video') {
        const isDirectVideo = item.url.includes('cloudinary.com') ||
            item.url.match(/\.(mp4|webm|mov|m4v|ogv)/i);

        if (isDirectVideo) {
            const posterUrl = item.url.includes('cloudinary.com') ? convertGDriveUrl(item.url, false, false, "q_auto,f_auto,so_2") : "";
            container.innerHTML = `
                <video 
                    controls 
                    autoplay
                    muted
                    ${posterUrl ? `poster="${posterUrl}"` : ''}
                    class="gallery-media animate-[fadeIn_0.5s_ease-out]" 
                    style="width: 100%; height: 85vh; background: #000; border-radius: 8px;"
                    playsinline>
                    <source src="${item.url}" type="video/mp4">
                    Your browser does not support the video tag.
                </video>`;
        } else {
            // Iframe for YouTube/GDrive
            const finalUrl = convertGDriveUrl(item.url, true);
            container.innerHTML = `<iframe 
                src="${finalUrl}" 
                class="gallery-media" 
                style="width: 100%; height: 85vh; border: none;" 
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                allowfullscreen 
                referrerpolicy="no-referrer-when-downgrade"></iframe>`;
        }
    } else {
        // w1600 for instant mobile loading
        const highResUrl = convertGDriveUrl(item.url, false, true);
        container.innerHTML = `<img src="${highResUrl}" class="gallery-media animate-[fadeIn_0.2s_ease-out]"/>`;

        // --- AGGRESSIVE PRELOAD (Next 2) ---
        [1, 2].forEach(offset => {
            const idx = (currentGalleryIndex + offset) % currentGallery.length;
            const nextItem = currentGallery[idx];
            if (nextItem && nextItem.type !== 'video') {
                const nextImg = new Image();
                nextImg.src = convertGDriveUrl(nextItem.url, false, true);
            }
        });
    }

    if (thumbContainer) {
        thumbContainer.innerHTML = currentGallery.map((m, idx) => {
            // Use w300 for clearer thumbnails that are still fast
            const thumbUrl = convertGDriveUrl(m.url, false, false, "w300");
            const isActive = idx === currentGalleryIndex;
            return `
            <div onclick="jumpToGallery(${idx})" 
                 ${isActive ? 'id="active-thumb"' : ''}
                 class="w-20 h-20 flex-shrink-0 cursor-pointer border-2 transition-all duration-300 rounded overflow-hidden relative ${isActive ? 'border-[#BF953F] ring-2 ring-[#BF953F]/20 scale-105' : 'border-transparent opacity-60 hover:opacity-100'}">
                <img src="${thumbUrl}" class="w-full h-full object-cover bg-slate-800 pointer-events-none"
                     onerror="this.style.opacity='0'"/>
                ${m.type === 'video' ? `
                    <div class="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
                        <span class="material-symbols-outlined text-white text-xl">play_circle</span>
                    </div>
                ` : ''}
            </div>
        `;
        }).join('');

        // Ensure active thumb is in view
        setTimeout(() => {
            const activeThumb = document.getElementById('active-thumb');
            if (activeThumb) {
                activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            }
        }, 50);
    }
}

function jumpToGallery(index) {
    currentGalleryIndex = index;
    updateDetailDisplay();
}

function closeGallery(isPopState = false) {
    const modal = document.getElementById('room-gallery-modal');
    const bookingModal = document.getElementById('edit-booking-modal');
    if (modal) {
        if (!isPopState && history.state && (history.state.view === 'gallery-grid' || history.state.view === 'gallery-detail')) {
            history.back();
        }
        modal.classList.remove('active');

        // ONLY unlock scroll if booking modal is hidden
        if (!bookingModal || bookingModal.classList.contains('hidden')) {
            document.body.style.overflow = '';
        }

        const container = document.getElementById('detail-media-container');
        if (container) container.innerHTML = '';
    }
}

function nextGallery() {
    currentGalleryIndex = (currentGalleryIndex + 1) % currentGallery.length;
    updateDetailDisplay();
}

function prevGallery() {
    currentGalleryIndex = (currentGalleryIndex - 1 + currentGallery.length) % currentGallery.length;
    updateDetailDisplay();
}

// Global Export
window.openGallery = openGallery;
window.closeGallery = closeGallery;
window.nextGallery = nextGallery;
window.prevGallery = prevGallery;
window.jumpToGallery = jumpToGallery;
window.showGrid = showGrid;
window.openDetail = openDetail;
}); // End of main DOMContentLoaded

// --- BACK BUTTON HANDLING (History API) ---
const MODAL_VIEWS = ['booking-modal', 'gallery-grid', 'gallery-detail'];
window.addEventListener('popstate', (event) => {
    const state = event.state;
    const view = state ? state.view : null;
    const bookingModal = document.getElementById('edit-booking-modal');
    const galleryModal = document.getElementById('room-gallery-modal');

    // Handle Booking Modal - Only close if we've completely exited modal-related views
    if (!MODAL_VIEWS.includes(view)) {
        if (bookingModal && !bookingModal.classList.contains('hidden')) {
            if (window.closeModal) window.closeModal(true);
        }
    }

    // Handle Gallery
    if (!state || state.view === 'booking-modal') {
        if (galleryModal && galleryModal.classList.contains('active')) {
            window.closeGallery(true);
        }
    } else if (state.view === 'gallery-grid') {
        if (galleryModal && galleryModal.classList.contains('active')) {
            window.showGrid(true);
        } else if (state.roomId) {
            window.openGallery(state.roomId, true);
        }
    } else if (state.view === 'gallery-detail') {
        if (galleryModal && galleryModal.classList.contains('active')) {
            window.openDetail(state.index, true);
        }
    }
});

/**
 * UI Builders & Global Initializers
 */
document.addEventListener('DOMContentLoaded', () => {
    console.log("Rooms script v11.18 loaded and active.");
    setTimeout(loadReviews, 500);
});

// Reset Button on Back Navigation (BFcache protection)
window.addEventListener('pageshow', (event) => {
    const confirmBtn = document.getElementById('confirm-waitlist-btn');
    if (confirmBtn) {
        confirmBtn.textContent = "XÁC NHẬN ĐẶT";
        confirmBtn.style.pointerEvents = 'auto';
        confirmBtn.classList.remove('opacity-70', 'scale-95');
    }
});
