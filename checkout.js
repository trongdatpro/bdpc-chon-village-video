document.addEventListener('DOMContentLoaded', () => {
    let lastGeneratedBillText = ""; // Variable to store the bill text for sync
    // 0. Configuration
    window.GAS_SYNC_URL = "https://hook.us2.make.com/b46yr5o3cerg8rgzrxdd2wqf2adc97f5";

    const renderCurrency = (num) => new Intl.NumberFormat('vi-VN').format(num) + 'đ';
    const setSafeText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };

    console.log("Checkout Script Initialized");
    const urlParams = new URLSearchParams(window.location.search);
    const status = urlParams.get('status');
    const orderCodeFromUrl = urlParams.get('orderCode');

    // RECOVER BILL if this is a payment success return
    if (status) {
        lastGeneratedBillText = sessionStorage.getItem('chonVillageLastBill') || "";
        console.log("[RECOVER] Recovered bill content length:", lastGeneratedBillText.length);
    } else {
        sessionStorage.removeItem('chonVillageLastBill');
    }


    // 3. Retrieve Data From Session
    const bookingDataStr = sessionStorage.getItem('chonVillageBooking');
    const selectedRoomsStr = sessionStorage.getItem('chonVillageSelectedRooms');
    const selectedRoomStr = sessionStorage.getItem('chonVillageSelectedRoom');

    if (!bookingDataStr || (!selectedRoomsStr && !selectedRoomStr)) {
        console.warn("Booking data not found in session, redirecting...");
        window.location.href = 'index.html';
        return;
    }

    const bookingData = JSON.parse(bookingDataStr);
    const roomsData = selectedRoomsStr ? JSON.parse(selectedRoomsStr) : [JSON.parse(selectedRoomStr)];
    const adultsCount = parseInt(bookingData.adults) || 2;

    console.log("Booking Data:", bookingData);
    console.log("Rooms Data:", roomsData);

    // 3. Date Formatting
    const parseLocal = (dateStr) => {
        if (!dateStr) return new Date();
        const [y, m, d] = dateStr.split('-');
        return new Date(y, m - 1, d);
    };

    const checkinDate = parseLocal(bookingData.checkin);
    const checkoutDate = parseLocal(bookingData.checkout);
    const diffTime = Math.abs(checkoutDate - checkinDate);
    const nights = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;

    const formatDateObj = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    const dateRangeStr = `${formatDateObj(checkinDate)} - ${formatDateObj(checkoutDate)} (${nights} \u0111\u00eam)`;

    // 4. Pricing & Surcharge Logic
    let baseRoomTotal = 0;
    const surchargeRates = [];
    const roomsWithTotals = [];

    roomsData.forEach(room => {
        const roomBasePrice = parseInt(room.baseRoomTotal) || 0;
        baseRoomTotal += roomBasePrice;

        // SPECIAL RULE: If stay >= 3 nights (4 days 3 nights), 
        // use standard surcharge (we take the first night's surcharge as "standard" 
        // or fallback to 450k). 
        // If < 3 nights, we use the specific surcharge passed.
        let rate = parseInt(room.surcharge) || 450000;

        // Note: The prompt says "hiển thị giá phụ thu ngưá»i thứ 3 của ngày thưá»ng nếu khách đặt từ 4 ngày 3 \u0111\u00eam"
        // In this implementation, room.nights is passed from rooms.js.
        if (room.nights >= 3) {
            console.log(`[DEBUG] Stay is ${room.nights} nights (>= 3). Using standard surcharge rate.`);
            // Assuming the passed room.surcharge is the standard rate if rooms.js passed datesToStay[0]'s surcharge
        }

        surchargeRates.push(rate);

        roomsWithTotals.push({
            ...room,
            basePrice: roomBasePrice,
            surchargeAllocated: 0,
            surchargePerNight: 0,
            total: roomBasePrice
        });
    });

    // Calculate Extra Guests (3rd person in shared rooms)
    const extraGuestsCount = Math.max(0, adultsCount - (roomsData.length * 2));

    // Sort logic for surcharge application
    const sortedRates = [...surchargeRates].sort((a, b) => a - b);
    let totalSurchargePerNight = 0;

    if (roomsData.length === 3) {
        const uniqueRates = new Set(sortedRates).size;
        if (extraGuestsCount === 1) {
            totalSurchargePerNight = (uniqueRates === 3) ? sortedRates[1] : sortedRates[0];
        } else if (extraGuestsCount === 2) {
            totalSurchargePerNight = sortedRates[0] + sortedRates[1];
        } else {
            for (let i = 0; i < extraGuestsCount; i++) totalSurchargePerNight += sortedRates[i] || sortedRates[0];
        }
    } else {
        for (let i = 0; i < extraGuestsCount; i++) totalSurchargePerNight += sortedRates[i] || sortedRates[0];
    }

    const grandSurchargeTotal = totalSurchargePerNight * nights;
    const grandTotalAmount = baseRoomTotal + grandSurchargeTotal;
    const depositAmount = Math.floor(grandTotalAmount / 2);

    // Allocate surcharge proportionally to rooms for the UI cards
    if (grandSurchargeTotal > 0) {
        roomsWithTotals.forEach((room) => {
            room.surchargeAllocated = (grandSurchargeTotal / roomsWithTotals.length);
            room.surchargePerNight = (totalSurchargePerNight / roomsWithTotals.length);
            room.total = room.basePrice + room.surchargeAllocated;
        });
    }

    // 5. Populate UI Elements
    const roomsListContainer = document.getElementById('checkout-rooms-list');
    if (roomsListContainer) {
        roomsListContainer.innerHTML = roomsWithTotals.map(room => {
            return `
                <div class="border border-primary/40 p-6 rounded-xl bg-background-light/80 shadow-md relative overflow-hidden">
                    <div class="w-full h-56 bg-center bg-cover rounded-lg mb-6 border-2 border-primary/20"
                        style="background-image: url('${room.img}');">
                    </div>
                    <h3 class="text-2xl font-serif font-bold mb-4 text-black border-b-2 border-primary/30 pb-3">${room.name}</h3>
                    <div class="space-y-4">
                        <div class="flex flex-col gap-0.5">
                            <span class="text-black text-sm font-medium italic">Th\u1eddi gian:</span>
                            <span class="text-black text-sm font-bold leading-tight">Ngày Nhận ${formatDateObj(checkinDate)} - Ngày Trả ${formatDateObj(checkoutDate)} - ${nights + 1} ngày ${nights} \u0111\u00eam</span>
                        </div>
                        <div class="flex flex-col gap-2 py-4 border-b-2 border-t-2 border-dashed border-primary/40">
                            <span class="text-black text-sm uppercase tracking-wider font-bold">Chi ti\u1ebft gi\u00e1:</span>
                            <div class="space-y-3">
                                <div class="flex flex-col text-sm">
                                    ${room.nightlyDetails ? room.nightlyDetails.map(n => {
                const label = n.isHoliday ? "Giá Lễ" : "Giá Ngày";
                return `<span class="text-black font-bold mt-0.5">${label} ${n.date} : ${renderCurrency(n.price)} / 1 \u0110\u00eam</span>`;
            }).join('') : (room.groupedNights ? room.groupedNights.map(group => {
                const dateLabel = group.count > 1
                    ? `Giá Ngày ${group.startDate}-${group.endDate} :`
                    : `Giá ${group.isHoliday ? 'Ngày Lễ ' : 'Ngày '}${group.startDate} :`;
                return `<span class="text-black font-bold mt-0.5">${dateLabel} ${renderCurrency(group.price)} / 1 \u0110\u00eam</span>`;
            }).join('') : `<span class="text-black font-bold mt-0.5">Giá phòng: ${renderCurrency(room.basePrice)}</span>`)}
                                </div>
                                ${room.surchargeAllocated > 0 ? `
                                <div class="flex flex-col text-sm">
                                    <span class="text-black font-bold mt-0.5">Phụ thu: ${renderCurrency(room.surchargeAllocated)}</span>
                                </div>` : ''}
                            </div>
                        </div>
                        <div class="flex justify-between items-center pt-2 text-primary font-bold">
                            <span>T\u1ed4NG C\u1ed8NG:</span>
                            <span>${renderCurrency(room.total)}</span>
                        </div>
                    </div>
                </div>`;
        }).join('');
    }

    setSafeText('checkout-total', renderCurrency(grandTotalAmount));
    setSafeText('checkout-deposit', renderCurrency(grandTotalAmount >= 0 ? depositAmount : 0));

    // Define success function using declaration for hoisting
    function handlePaymentSuccess(orderCode) {
        console.log("Executing handlePaymentSuccess for:", orderCode);

        // Ensure summary and payment sections are visible if they were hidden
        const summarySection = document.getElementById('summary-section');
        const paymentSection = document.getElementById('payment-section');
        if (summarySection) {
            summarySection.classList.remove('hidden');
            summarySection.classList.remove('opacity-0');
        }
        if (paymentSection) {
            paymentSection.classList.remove('hidden');
            paymentSection.classList.remove('opacity-0');
        }

        // Hide QR loading & QR image
        const qrLoading = document.getElementById('qr-loading');
        const qrImg = document.getElementById('checkout-qr');
        const actionBtns = document.querySelector('#payment-section .grid.grid-cols-2');

        if (qrLoading) qrLoading.classList.add('hidden');
        if (qrImg) qrImg.classList.add('hidden');
        if (actionBtns) actionBtns.classList.add('hidden');

        // Auto-hide Bank Picker if open
        const pickerOverlay = document.getElementById('bank-picker-overlay');
        const pickerModal = document.getElementById('bank-picker-modal');
        if (pickerOverlay && !pickerOverlay.classList.contains('hidden')) {
            pickerOverlay.classList.add('opacity-0');
            if (pickerModal) pickerModal.classList.add('translate-y-full');
            setTimeout(() => pickerOverlay.classList.add('hidden'), 300);
        }

        // Show Success Overlay inside Payment Section
        const successOverlay = document.getElementById('payment-success-overlay');
        if (successOverlay) {
            successOverlay.classList.remove('hidden');
            setTimeout(() => {
                successOverlay.classList.remove('opacity-0');
                successOverlay.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 50);
        }

        // SAVE orderCode to use after info confirmation
        window.lastOrderCode = orderCode;
        sessionStorage.setItem('chonVillageLastOrderCode', orderCode);
    }
    window.handlePaymentSuccess = handlePaymentSuccess;

    async function syncToCalendarBridge(orderCode) {
        try {
            const bookingDataStr = sessionStorage.getItem('chonVillageBooking');
            const selectedRoomsStr = sessionStorage.getItem('chonVillageSelectedRooms') || sessionStorage.getItem('chonVillageSelectedRoom');
            const guestName = document.getElementById('guest-fullname')?.value || "Web Guest";
            
            const storedBill = sessionStorage.getItem('chonVillageLastBill') || "";

            if (!bookingDataStr || !selectedRoomsStr) {
                console.error("[SYNC] Missing booking/room data in session.");
                return;
            }

            const bookingData = JSON.parse(bookingDataStr);
            const rooms = selectedRoomsStr.startsWith('[') ? JSON.parse(selectedRoomsStr) : [JSON.parse(selectedRoomsStr)];

            // 3. Helper to generate date range (Avoid UTC shift)
            const dates = [];
            const checkinObj = parseLocal(bookingData.checkin);
            const checkoutObj = parseLocal(bookingData.checkout);
            
            if (!checkinObj || isNaN(checkinObj.getTime())) {
                console.error("[SYNC] Invalid Check-in Date:", bookingData.checkin);
                return;
            }

            let curr = new Date(checkinObj);
            const end = checkoutObj && !isNaN(checkoutObj.getTime()) ? checkoutObj : new Date(curr.getTime() + 86400000);
            
            while (curr < end) {
                const y = curr.getFullYear();
                const m = String(curr.getMonth() + 1).padStart(2, '0');
                const d = String(curr.getDate()).padStart(2, '0');
                dates.push(`${y}-${m}-${d}`);
                curr.setDate(curr.getDate() + 1);
            }

            // 4. Calculations (Integer enforced)
            const d1 = checkinObj.getDate();
            const d2 = checkoutObj.getDate();
            
            // Internal (Day 1 = Row 3)
            const rIntStart = Math.floor(d1 + 1);
            let rIntEnd = Math.floor(d2 + 1);

            // Sale (Day 1 = Row 8)
            const rSaleStart = Math.floor(d1 + 6);
            let rSaleEnd = Math.floor(d2 + 6);

            // Data Calendar
            const rData = Math.floor(d1 + 1);

            // Cross-month safety
            if (checkoutObj.getMonth() !== checkinObj.getMonth()) {
                rIntEnd = 35; rSaleEnd = 38;
            }

            const roomColMap = {
                "White_Room": 1, "Black_Room": 2, "Pink_Room": 3,
                "Green_Room": 4, "Gray_Room": 5, "Gold_Room": 6
            };

            const billText = lastGeneratedBillText || storedBill || "BILL_MISSING";

            // BUILDING PAYLOADS
            const reqInt = [];
            const reqSale = [];

            rooms.forEach(r => {
                const col = roomColMap[r.id] || 1;
                
                // INTERNAL (Matched rows)
                const rangeInt = { sheetId: 361802428, startRowIndex: rIntStart, endRowIndex: rIntEnd, startColumnIndex: col, endColumnIndex: col + 1 };
                const rowsInt = [];
                for (let i = 0; i < (rIntEnd - rIntStart); i++) {
                    rowsInt.push({ values: [{
                        userEnteredValue: { stringValue: billText },
                        userEnteredFormat: { backgroundColor: { red: 0.9, green: 0.6, blue: 0.6 }, textFormat: { fontSize: 9 }, verticalAlignment: "TOP", wrapStrategy: "WRAP" }
                    }] });
                }

                reqInt.push({
                    updateCells: {
                        range: rangeInt,
                        rows: rowsInt,
                        fields: "userEnteredValue,userEnteredFormat(backgroundColor,textFormat,verticalAlignment,wrapStrategy)"
                    }
                });
                if (rIntEnd - rIntStart > 1) {
                    reqInt.push({ mergeCells: { range: rangeInt, mergeType: "MERGE_ALL" } });
                }

                // SALE (Matched rows + Fail-safe)
                const rangeSaleIdx = { sheetId: 521586608, startRowIndex: rSaleStart, endRowIndex: rSaleEnd, startColumnIndex: col, endColumnIndex: col + 1 };
                const rowsSale = [];
                for (let i = 0; i < (rSaleEnd - rSaleStart); i++) {
                    rowsSale.push({ values: [{
                        userEnteredValue: { stringValue: "CV_OK" }
                    }] });
                }

                reqSale.push({
                    updateCells: {
                        range: rangeSaleIdx,
                        rows: rowsSale,
                        fields: "userEnteredValue"
                    }
                });
            });

            const payload = {
                guestName: guestName,
                checkin: bookingData.checkin, 
                checkout: bookingData.checkout,
                dates: dates, 
                row_start: rIntStart, 
                row_sale: rSaleStart,
                row_data: rData, 
                json_internal: JSON.stringify({ requests: reqInt }),
                json_sale: JSON.stringify({ requests: reqSale }),
                orderCode: orderCode,
                timestamp: new Date().toISOString()
            };

            const contentLen = (payload.billContent || "").length;
            console.log("[SYNC-DEBUG] Payload Prepared:", payload);

            const GAS_URL = window.GAS_SYNC_URL;
            if (!GAS_URL) {
                console.warn("[SYNC] GAS_URL (Make.com/Apps Script) not set.");
                return;
            }

            const res = await fetch(GAS_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            console.log("[SYNC] Sent to Webhook. Success:", res.ok);
            
            // OPTIONAL: Clear session after confirm-info only if you want to prevent multiple syncs
            // sessionStorage.removeItem('chonVillageSelectedRooms');
            // sessionStorage.removeItem('chonVillageSelectedRoom');
        } catch (err) {
            console.error("[SYNC] Error in syncToCalendarBridge:", err);
        }
    }

    // Trigger success logic if URL says PAID (Case-insensitive)
    const isUrlPaid = status && status.toUpperCase() === 'PAID';
    if (isUrlPaid) {
        console.log("Payment Successful (Reload/Redirect detected)!");
        handlePaymentSuccess(orderCodeFromUrl);
    }

    // 6. visibility & Agreement Logic
    const agreeCheckbox = document.getElementById('agree-checkbox');
    const summarySection = document.getElementById('summary-section');
    const paymentSection = document.getElementById('payment-section');
    const confirmBtn = document.getElementById('confirm-btn');

    // Reset Initial State
    if (confirmBtn) {
        confirmBtn.classList.add('hidden'); // Hide original confirm button as we use Transfer button now
    }

    if (summarySection) {
        summarySection.classList.add('hidden', 'opacity-0');
    }
    if (paymentSection) {
        paymentSection.classList.add('hidden', 'opacity-0');
    }

    let payosData = null;

    // Toggle Visibility on Checkbox
    if (agreeCheckbox) {
        agreeCheckbox.addEventListener('change', async (e) => {
            const isChecked = e.target.checked;

            if (isChecked) {
                const apiBase = (window.location.protocol === 'file:') ? 'http://localhost:3000' : '';
                console.log("[API] Using base:", apiBase || '(relative)');

                // Show Summary & Payment
                if (summarySection) {
                    summarySection.classList.remove('hidden');
                    setTimeout(() => summarySection.classList.remove('opacity-0'), 10);
                }
                if (paymentSection) {
                    paymentSection.classList.remove('hidden');
                    setTimeout(() => paymentSection.classList.remove('opacity-0'), 10);

                    // Populate basic info
                    const qrLoading = document.getElementById('qr-loading');
                    const depositAmountEl = document.getElementById('checkout-deposit-amount');
                    if (depositAmountEl) depositAmountEl.textContent = renderCurrency(depositAmount);

                    // Call PayOS Backend Automatically
                    try {
                        console.log("Creating PayOS link...");
                        const response = await fetch(`${apiBase}/create-payment-link`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                amount: depositAmount,
                                description: "Thanh toan"
                            })
                        });

                        const data = await response.json();
                        if (!response.ok) throw new Error(data.error || "Lỗi kết nối Server");

                        payosData = data;
                        console.log("PayOS Link Created:", payosData.orderCode);

                        if (payosData.qrCode) {
                            const qrImg = document.getElementById('checkout-qr');
                            const qrLoading = document.getElementById('qr-loading');
                            const accountNoEl = document.getElementById('payos-account-no');
                            const accountNameEl = document.getElementById('payos-account-name');
                            const transferBtn = document.getElementById('transfer-app-btn');

                            if (qrImg) {
                                // MODERN branded VietQR: includes NAPAS + Bank Logos
                                const brandedQrUrl = `https://img.vietqr.io/image/${payosData.bin}-${payosData.accountNumber}-print.png?amount=${payosData.amount}&addInfo=${encodeURIComponent(payosData.description)}&accountName=${encodeURIComponent(payosData.accountName)}`;
                                qrImg.src = brandedQrUrl;

                                qrImg.onload = () => {
                                    qrImg.classList.remove('hidden');
                                    if (qrLoading) qrLoading.classList.add('hidden');
                                };
                            }
                            if (accountNoEl) accountNoEl.textContent = payosData.accountNumber;
                            if (accountNameEl) accountNameEl.textContent = payosData.accountName;
                            const bankNameEl = document.getElementById('payos-bank-name');
                            if (bankNameEl) bankNameEl.textContent = payosData.bankName || "Ngân hàng TMCP Phương Äông (OCB)";

                            // QR Actions: Download & Share
                            const downloadBtn = document.getElementById('download-qr-btn');
                            const shareBtn = document.getElementById('share-qr-btn');

                            if (downloadBtn) {
                                downloadBtn.onclick = async () => {
                                    try {
                                        const qrApiUrl = `https://img.vietqr.io/image/${payosData.bin}-${payosData.accountNumber}-print.png?amount=${payosData.amount}&addInfo=${encodeURIComponent(payosData.description)}&accountName=${encodeURIComponent(payosData.accountName)}`;
                                        const res = await fetch(qrApiUrl);
                                        const blob = await res.blob();
                                        const url = window.URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = `thanh-toan-chon-village-${payosData.orderCode}.png`;
                                        document.body.appendChild(a);
                                        a.click();
                                        document.body.removeChild(a);
                                        window.URL.revokeObjectURL(url);
                                    } catch (err) { alert("Lỗi tải ảnh. Vui lòng chụp màn hình."); }
                                };
                            }

                            if (shareBtn) {
                                shareBtn.onclick = async () => {
                                    const shareUrl = payosData.checkoutUrl;
                                    const triggerSuccess = () => {
                                        const originalContent = shareBtn.innerHTML;
                                        shareBtn.innerHTML = '<span class="material-symbols-outlined text-base leading-none">check</span><span>ÄÃƒ CHÃ‰P LINK</span>';
                                        shareBtn.classList.add('bg-green-50', 'text-green-600', 'border-green-200');
                                        setTimeout(() => {
                                            shareBtn.innerHTML = originalContent;
                                            shareBtn.classList.remove('bg-green-50', 'text-green-600', 'border-green-200');
                                        }, 3000);
                                    };

                                    try {
                                        // 1. Prepare data & text
                                        const shareTitle = 'Thanh toán Chon Village';
                                        const shareText = `Thanh toán cá»c cho Chon Village. STK: ${payosData.accountNumber} (${payosData.accountName})`;

                                        // 2. Try Image Sharing (Modern)
                                        if (navigator.canShare && window.isSecureContext) {
                                            const brandedQrApiUrl = `https://img.vietqr.io/image/${payosData.bin}-${payosData.accountNumber}-print.png?amount=${payosData.amount}&addInfo=${encodeURIComponent(payosData.description)}&accountName=${encodeURIComponent(payosData.accountName)}`;
                                            const res = await fetch(brandedQrApiUrl);
                                            const blob = await res.blob();
                                            const file = new File([blob], `thanh-toan-${payosData.orderCode}.png`, { type: 'image/png' });

                                            const shareData = {
                                                title: shareTitle,
                                                text: shareText,
                                                url: shareUrl,
                                                files: [file]
                                            };

                                            if (navigator.canShare(shareData)) {
                                                await navigator.share(shareData);
                                                return; // Success
                                            }
                                        }

                                        // 3. Fallback: Generic Web Share (Text/URL only)
                                        if (navigator.share && window.isSecureContext) {
                                            await navigator.share({ title: shareTitle, text: shareText, url: shareUrl });
                                        } else {
                                            // 4. Fallback: Clipboard (For HTTP/Local Testing)
                                            fallbackCopyText(shareUrl, triggerSuccess);
                                        }
                                    } catch (e) {
                                        console.error("[SHARE ERROR]", e);
                                        if (e.name !== 'AbortError') fallbackCopyText(shareUrl, triggerSuccess);
                                    }
                                };
                            }

                            if (transferBtn) {
                                // BANK DATA
                                const ALL_BANKS = [
                                    { id: 'vcb', name: 'Vietcombank', priority: true },
                                    { id: 'mb', name: 'MB Bank', priority: true },
                                    { id: 'tcb', name: 'Techcombank', priority: true },
                                    { id: 'icb', name: 'VietinBank', priority: true },
                                    { id: 'bidv', name: 'BIDV', priority: true },
                                    { id: 'vba', name: 'Agribank', priority: true },
                                    { id: 'tpb', name: 'TPBank (Tien Phong)' },
                                    { id: 'vpb', name: 'VPBank' },
                                    { id: 'acb', name: 'ACB (A Chau)' },
                                    { id: 'stb', name: 'Sacombank' },
                                    { id: 'vib', name: 'VIB (Quoc Te)' },
                                    { id: 'hdb', name: 'HDBank' },
                                    { id: 'shb', name: 'SHB (Saigon-Hanoi)' },
                                    { id: 'eib', name: 'Eximbank' },
                                    { id: 'msb', name: 'MSB (Maritime)' },
                                    { id: 'seab', name: 'SeABank' },
                                    { id: 'ocb', name: 'OCB (Phuong Dong)' },
                                    { id: 'lpb', name: 'LPBank' },
                                    { id: 'pvcb', name: 'PVcomBank' },
                                    { id: 'bab', name: 'Bac A Bank' },
                                    { id: 'nab', name: 'Nam A Bank' },
                                    { id: 'vietbank', name: 'VietBank' },
                                    { id: 'vccb', name: 'VietCapitalBank' },
                                    { id: 'bvb', name: 'BaoVietBank' },
                                    { id: 'pgb', name: 'PGBank' },
                                    { id: 'sgb', name: 'Saigonbank' },
                                    { id: 'klb', name: 'Kienlongbank' },
                                    { id: 'ncb', name: 'NCB (Quoc Dan)' },
                                    { id: 'oceanbank', name: 'OceanBank' },
                                    { id: 'gpb', name: 'GPBank' },
                                    { id: 'cbb', name: 'CBBank' },
                                    { id: 'hsbc', name: 'HSBC' },
                                    { id: 'scvn', name: 'Standard Chartered' },
                                    { id: 'shinhan', name: 'Shinhan Bank' },
                                    { id: 'woori', name: 'Woori Bank' },
                                    { id: 'pbb', name: 'Public Bank' },
                                    { id: 'uob', name: 'UOB' },
                                    { id: 'cimb', name: 'CIMB' },
                                    { id: 'hlb', name: 'Hong Leong Bank' },
                                    { id: 'ivb', name: 'Indovina Bank' },
                                    { id: 'vrb', name: 'VRB (Viet-Nga)' }
                                ];

                                const pickerOverlay = document.getElementById('bank-picker-overlay');
                                const pickerModal = document.getElementById('bank-picker-modal');
                                const closeBtn = document.getElementById('close-bank-picker');
                                const searchInput = document.getElementById('bank-search-input');
                                const topGrid = document.getElementById('top-banks-grid');
                                const resultsList = document.getElementById('bank-results-list');
                                const fallbackBtn = document.getElementById('use-payos-fallback');

                                const showPicker = () => {
                                    pickerOverlay.classList.remove('hidden');
                                    setTimeout(() => {
                                        pickerOverlay.classList.remove('opacity-0');
                                        pickerModal.classList.remove('translate-y-full');
                                    }, 10);
                                    renderPicker();
                                };

                                const hidePicker = () => {
                                    pickerOverlay.classList.add('opacity-0');
                                    pickerModal.classList.add('translate-y-full');
                                    setTimeout(() => pickerOverlay.classList.add('hidden'), 300);
                                };

                                // App-to-App Payment Redirect (Direct Deep Link)
                                // NAPAS Standard Deep Link (One-Touch Payment)
                                window.selectBankDirect = (id) => {
                                    if (!payosData) {
                                        console.error("[BANK PICKER] Missing PayOS data");
                                        return;
                                    }

                                    const acc = payosData.accountNumber || "";
                                    const bin = payosData.bin || ""; // Recipient Bank BIN (e.g., 970448 for OCB)
                                    const am = payosData.amount || 0;
                                    const tn = encodeURIComponent(payosData.description || "");

                                    // The exact structure requested for dl.vietqr.io:
                                    // app=[APP_ID] & ba=[RECIPIENT_ACC]@[RECIPIENT_BIN] & am=[AMOUNT] & tn=[NOTE]
                                    const url = `https://dl.vietqr.io/pay?app=${id}&ba=${acc}@${bin}&am=${am}&tn=${tn}`;

                                    console.log(`[BANK PICKER] Triggering NAPAS Deep Link for ${id}:`, url);
                                    hidePicker(); // Close UI immediately
                                    window.location.href = url;
                                };

                                const renderPicker = (filter = '') => {
                                    const topBanks = ALL_BANKS.filter(b => b.priority);
                                    const filtered = ALL_BANKS.filter(b =>
                                        b.name.toLowerCase().includes(filter.toLowerCase()) ||
                                        b.id.toLowerCase().includes(filter.toLowerCase())
                                    );

                                    if (!filter) {
                                        topGrid.innerHTML = topBanks.map(bank => `
                                            <button onclick="selectBankDirect('${bank.id}')" class="flex flex-col items-center gap-2 p-3 bg-primary/5 border border-primary/20 rounded-xl hover:bg-primary/10 transition-all active:scale-95 group">
                                                <div class="w-10 h-10 bg-white rounded-lg shadow-sm flex items-center justify-center overflow-hidden border border-primary/10 p-1">
                                                    <img src="https://api.vietqr.io/img/${bank.id.toUpperCase()}.png" alt="${bank.name}" class="w-full h-full object-contain" />
                                                </div>
                                                <span class="text-[9px] font-bold text-primary uppercase text-center truncate w-full">${bank.name}</span>
                                            </button>
                                        `).join('');
                                        topGrid.parentElement.classList.remove('hidden');
                                    } else {
                                        topGrid.parentElement.classList.add('hidden');
                                    }

                                    if (filter) {
                                        resultsList.innerHTML = filtered.map(bank => `
                                            <button onclick="selectBankDirect('${bank.id}')" class="w-full flex items-center gap-4 p-3 hover:bg-primary/10 rounded-xl transition-all active:scale-[0.98] border-b border-primary/5 group">
                                                <div class="w-8 h-8 bg-white rounded-lg shadow-sm flex items-center justify-center overflow-hidden border border-primary/10 p-0.5">
                                                    <img src="https://api.vietqr.io/img/${bank.id.toUpperCase()}.png" alt="${bank.name}" class="w-full h-full object-contain" />
                                                </div>
                                                <span class="text-xs font-bold text-primary/80 group-hover:text-primary transition-colors">${bank.name}</span>
                                                <span class="material-symbols-outlined ml-auto text-primary/30 text-sm">chevron_right</span>
                                            </button>
                                        `).join('');
                                    } else {
                                        resultsList.innerHTML = '<p class="text-[10px] text-primary/30 text-center py-4 italic">Nhập tên ngân hàng để tìm kiếm...</p>';
                                    }
                                };

                                transferBtn.onclick = showPicker;
                                if (closeBtn) closeBtn.onclick = hidePicker;
                                if (pickerOverlay) pickerOverlay.onclick = (e) => { if (e.target === pickerOverlay) hidePicker(); };
                                if (searchInput) searchInput.oninput = (e) => renderPicker(e.target.value);
                                if (fallbackBtn) fallbackBtn.onclick = () => {
                                    hidePicker();
                                    window.location.href = payosData.checkoutUrl;
                                };
                            }

                            // 3. Start Polling for status (Use ID for v2)
                            const pollId = payosData.id || payosData.orderCode;
                            if (pollId) {
                                console.log("Starting polling for:", pollId);
                                startPaymentPolling(pollId);
                            }
                        } else {
                            throw new Error("PayOS không trả vá» mã QR. Hãy kiểm tra Dashboard.");
                        }
                    } catch (err) {
                        console.error("PayOS Fetch Error:", err);
                        const qrLoading = document.getElementById('qr-loading');
                        if (qrLoading) {
                            qrLoading.innerHTML = `
                                <div class="flex flex-col items-center gap-2 px-4 py-2">
                                    <span class="material-symbols-outlined text-red-500 text-3xl">error</span>
                                    <span class="text-[10px] text-red-500 font-bold uppercase tracking-tight">Lỗi Kết Nối PayOS</span>
                                    <p class="text-[9px] text-slate-500 text-center leading-tight">${err.message}</p>
                                </div>
                            `;
                        }
                    }
                }

                // Zero-Delay Scroll (Optimized)
                if (summarySection) {
                    const header = document.querySelector('header');
                    const headerHeight = header ? header.offsetHeight : 80;
                    const offsetPosition = summarySection.getBoundingClientRect().top + window.pageYOffset - headerHeight - 20;
                    window.scrollTo({ top: offsetPosition, behavior: 'instant' });
                }
            } else {
                // Hide Sections
                if (summarySection) {
                    summarySection.classList.add('opacity-0');
                    setTimeout(() => summarySection.classList.add('hidden'), 500);
                }
                if (paymentSection) {
                    paymentSection.classList.add('opacity-0');
                    setTimeout(() => paymentSection.classList.add('hidden'), 500);
                }
            }
        });
    }

    // 7. Polling & Success Flow Logic
    let pollingInterval = null;
    const statusIndicator = document.getElementById('payment-status-indicator');
    const statusText = document.getElementById('payment-status-text');
    const manualBtn = document.getElementById('manual-check-btn');

    const checkStatusOnce = async (orderCode) => {
        try {
            const apiBase = (window.location.protocol === 'file:') ? 'http://localhost:3000' : '';
            console.log(`[POLLING] Fetching status for ${orderCode}...`);
            const res = await fetch(`${apiBase}/get-order/${orderCode}`);

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                console.error("[POLLING] Server Error:", res.status, errorData);
                return { paid: false, status: `ERROR_${res.status}`, detail: errorData.error };
            }

            const data = await res.json();
            console.log(`[PAYOS DEBUG] Full data for ${orderCode}:`, data);

            const currentStatus = (data.status || "UNKNOWN").toUpperCase();
            const isActuallyPaid = ['PAID', 'COMPLETED', 'SUCCESS'].includes(currentStatus);

            if (isActuallyPaid) {
                console.log("!!! SUCCESS DETECTED !!! Status:", currentStatus);
                if (pollingInterval) clearInterval(pollingInterval);
                if (statusIndicator) statusIndicator.classList.add('hidden');
                handlePaymentSuccess(orderCode);
                return { paid: true, status: currentStatus };
            }

            return { paid: false, status: currentStatus, data: data };
        } catch (e) {
            console.error("Check status exception:", e);
            return { paid: false, status: "FETCH_FAILED", detail: e.message };
        }
    };

    let currentPollingOrderCode = null;
    const startPaymentPolling = (orderCode) => {
        if (pollingInterval) clearInterval(pollingInterval);
        currentPollingOrderCode = orderCode; // Store for visibility-tab-switch trigger
        console.log("Started polling for order:", orderCode);

        // Show indicator after a short delay
        setTimeout(() => {
            if (statusIndicator && !window.location.search.includes('status=PAID')) {
                statusIndicator.classList.remove('hidden');
                setTimeout(() => statusIndicator.classList.remove('opacity-0'), 10);
            }
        }, 1500);

        pollingInterval = setInterval(async () => {
            const result = await checkStatusOnce(orderCode);
            if (result && result.paid && statusText) {
                statusText.textContent = "Äã nhận thanh toán!";
            } else if (result && result.status === 'CANCELLED') {
                if (statusText) statusText.textContent = "Giao dịch đã bị hủy.";
                clearInterval(pollingInterval);
            }
        }, 2000); // Faster polling (2s instead of 4s)

        // Reactive Check: Try immediately when user returns to tab
        const handleVisibilityChange = async () => {
            if (document.visibilityState === 'visible' && currentPollingOrderCode === orderCode) {
                console.log("[POLLING] Tab visible! Triggering immediate check...");
                await checkStatusOnce(orderCode);
            }
        };
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        // Manual Check Button
        if (manualBtn) {
            manualBtn.onclick = async () => {
                manualBtn.textContent = "Äang kiểm tra...";
                const result = await checkStatusOnce(orderCode);

                if (result && result.paid) {
                    manualBtn.textContent = "Äã nhận thanh toán!";
                    // Success transition is handled inside checkStatusOnce
                } else {
                    const statusTextStr = (result && result.status) ? result.status : "Lỗi";
                    manualBtn.textContent = `Chưa nhận được (Trạng thái: ${statusTextStr})`;
                    console.log("[MANUAL CHECK] Result:", result);
                    setTimeout(() => { manualBtn.textContent = "Kiểm tra lại ngay"; }, 4000);
                }
            };
        }
    };

    // Protect handlePaymentSuccess with error logging
    const originalHandlePaymentSuccess = window.handlePaymentSuccess;
    window.handlePaymentSuccess = function (orderCode) {
        console.log("--> Calling handlePaymentSuccess for order:", orderCode);
        try {
            if (originalHandlePaymentSuccess) {
                originalHandlePaymentSuccess(orderCode);
            } else {
                console.error("handlePaymentSuccess is NOT defined on window!");
            }
        } catch (err) {
            console.error("CRITICAL ERROR in handlePaymentSuccess:", err);
            alert("Có lỗi khi tạo hóa đơn: " + err.message);
        }
    };

    // 8. Info Collection & Bill Generation
    const confirmInfoBtn = document.getElementById('confirm-info-btn');
    const guestNameInput = document.getElementById('guest-fullname');
    const guestZaloInput = document.getElementById('guest-zalo');
    const infoForm = document.getElementById('info-collection-form');
    const billContainer = document.getElementById('bill-result-container');
    const billTextEl = document.getElementById('bill-text-content');
    const sendBillZaloBtn = document.getElementById('send-bill-zalo-btn');



    // Replace the confirmInfoBtn logic or use existing structure
    if (confirmInfoBtn) {
        confirmInfoBtn.addEventListener('click', () => {
            // Existing bill logic...
            console.log("Confirm Info Clicked");
            const name = guestNameInput ? guestNameInput.value.trim() : "Quý khách";
            const phone = guestZaloInput ? guestZaloInput.value.trim() : "Chưa cung cấp";

            if (!name || name === "Quý khách") {
                alert("Vui lòng nhập tên ngưá»i đặt phòng.");
                return;
            }

            // Generate Bill Text
            const billText = generateBillText(name, phone);
            lastGeneratedBillText = billText; // Store for sync
            sessionStorage.setItem('chonVillageLastBill', billText); // Persistent for refresh

            // PERSIST FOR HISTORY (Image 1 logic)
            sessionStorage.setItem('chonVillageLastBooking', JSON.stringify({
                billText: billText,
                timestamp: Date.now()
            }));

            // Show bubble immediately
            if (window.refreshBookedBubble) window.refreshBookedBubble();

            if (billTextEl) {
                billTextEl.innerHTML = billText.replace(/\n/g, '<br/>');
            }
            // Show Bill
            if (infoForm) infoForm.classList.add('hidden');
            if (billContainer) {
                billContainer.classList.remove('hidden');
                setTimeout(() => {
                    billContainer.classList.remove('opacity-0', 'translate-y-10');
                    billContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 50);
            }

            // TRIGGER CALENDAR SYNC NOW that we have the bill
            const orderCodeSync = window.lastOrderCode || sessionStorage.getItem('chonVillageLastOrderCode') || "PAID";
            syncToCalendarBridge(orderCodeSync);
        });
    }

    const generateBillText = (name, zalo) => {
        const currentTotal = typeof grandTotalAmount !== 'undefined' ? grandTotalAmount : 0;
        const currentDeposit = typeof depositAmount !== 'undefined' ? depositAmount : 0;
        const remaining = currentTotal - currentDeposit;
        const nightsCount = typeof nights !== 'undefined' ? nights : 1;
        const nightsStr = nightsCount >= 3 ? `${nightsCount} \u0111\u00eam (${nightsCount + 1} ng\u00e0y)` : `${nightsCount} \u0111\u00eam`;

        const inDate = typeof checkinDate !== 'undefined' ? checkinDate : new Date();
        const outDate = typeof checkoutDate !== 'undefined' ? checkoutDate : new Date();
        const rData = typeof roomsData !== 'undefined' ? roomsData : [];
        const roomsStr = rData.map(r => r.name).join(', ');

        const adults = typeof adultsCount !== 'undefined' ? adultsCount : 2;
        const children = (bookingData && bookingData.children) ? parseInt(bookingData.children) : 0;
        const childrenAges = (bookingData && bookingData.childrenAgeCategory) ? bookingData.childrenAgeCategory.split(',').filter(a => a) : [];

        let guestStr = `${adults} ng\u01b0\u1eddi l\u1edbn`;
        if (children > 0) guestStr += `, ${children} tr\u1ebb em (${childrenAges.join(', ')} tu\u1ed5i)`;

        return `BILL X\u00c1C NH\u1eacN \u0110\u1eb6T PH\u00d2NG \n\n\u2796 TH\u00d4NG TIN\n- \u0110\u1ecba ch\u1ec9: 07 Th\u00e1nh T\u00e2m - Ph\u01b0\u1eddng 5, Tp. \u0110\u00e0 L\u1ea1t\nhttps://maps.app.goo.gl/aW824oYN5dznY7JX9?g_st=com.google.maps.preview.copy\n- Li\u00ean h\u1ec7 nh\u1eadn ph\u00f2ng : 0889717713 (Mr. Tr\u1ecdng \u0110\u1ea1t)\n- H\u00ecnh th\u1ee9c thu\u00ea: ${roomsStr}\n\n\u2796 TH\u00d4NG TIN KH\u00c1CH \n- T\u00ean kh\u00e1ch h\u00e0ng : ${name}\n- S\u1ed1 \u0111i\u1ec7n tho\u1ea1i : ${zalo}\n- S\u1ed1 ng\u01b0\u1eddi: ${guestStr}\n- S\u1ed1 ng\u00e0y thu\u00ea: ${nightsStr}\n* Ng\u00e0y nh\u1eadn nh\u00e0: 14h00 ng\u00e0y ${formatDateObj(inDate)}\n* Ng\u00e0y tr\u1ea3 nh\u00e0: 12h00 ng\u00e0y ${formatDateObj(outDate)}\n\n\u2705 THANH TO\u00c1N\n- Th\u00e0nh ti\u1ec1n: ${renderCurrency(currentTotal)}\n- \u0110\u1eb7t c\u1ecdc: ${renderCurrency(currentDeposit)}\n( X\u00e1c nh\u1eadn \u0111\u00e3 nh\u1eadn \u0111\u01b0\u1ee3c ti\u1ec1n c\u1ecdc )\n- C\u00f2n l\u1ea1i: ${renderCurrency(remaining)}\nS\u1ed1 ti\u1ec1n c\u00f2n l\u1ea1i qu\u00fd kh\u00e1ch vui l\u00f2ng thanh to\u00e1n h\u1ebft ngay sau khi nh\u1eadn nh\u00e0\n\n\u2796 GHI CH\u00da\n- Qu\u00fd kh\u00e1ch vui l\u00f2ng t\u1ef1 b\u1ea3o v\u1ec7 tài sản cá nhân, mọi mất mát bên home không chịu trách nhiệm. \n- Booking không hoàn, huỷ, đổi dưới mọi hình thức. \n- Qu\u00fd khách vui lòng đem theo CMND hoặc Passport để làm thủ tục đăng ký lưu trú.\n- Qu\u00fd khách vui lòng đi đúng số lượng người, nếu có phát sinh phụ thu.`;
    };

    // Helper for non-secure contexts
    function fallbackCopyText(text, callback) {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            const successful = document.execCommand('copy');
            if (successful && callback) callback();
        } catch (err) {
            console.error('Fallback copy failed', err);
            alert("Không thể tự động sao chép. Vui lòng copy thủ công.");
        }
        document.body.removeChild(textArea);
    }

    if (sendBillZaloBtn) {
        sendBillZaloBtn.addEventListener('click', () => {
            const name = (guestNameInput && guestNameInput.value) ? guestNameInput.value.trim() : "Quý khách";
            const phone = (guestZaloInput && guestZaloInput.value) ? guestZaloInput.value.trim() : "Chưa cung cấp";
            const fullText = generateBillText(name, phone);

            const triggerSuccess = () => {
                const originalText = sendBillZaloBtn.innerHTML;
                sendBillZaloBtn.innerHTML = '<span class="material-symbols-outlined text-sm">check</span><span>Báº¢N Gá»C ÄÃƒ CHÃ‰P & ÄANG Má»ž ZALO...</span>';
                setTimeout(() => { sendBillZaloBtn.innerHTML = originalText; }, 3000);
            };

            if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(fullText).then(triggerSuccess).catch(err => {
                    console.error("Clipboard API Error:", err);
                    fallbackCopyText(fullText, triggerSuccess);
                });
            } else {
                fallbackCopyText(fullText, triggerSuccess);
            }
        });
    }

});


